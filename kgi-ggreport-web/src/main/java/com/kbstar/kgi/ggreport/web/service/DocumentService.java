package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.dto.DocumentResponse;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 원문 열람 — 지식 탭이 검색 결과의 <b>파일 전체</b>를 보여주기 위한 창구.
 * Python {@code server/routers/documents.py} + {@code agent/retrieval/parsers.py}.
 *
 * <p>검색은 200자 스니펫만 준다. 그런데 지식 탭의 목적은 "제안서에 인용할 근거를
 * 눈으로 확인하는 것"이라, 출처 경로만 알고 열 수 없으면 반쪽이다.
 *
 * <p><b>경로 탈출을 반드시 막는다.</b> 클라이언트가 준 문자열로 파일을 읽는
 * 엔드포인트라, 가드가 없으면 {@code ../../} 하나로 리포 바깥(설정 파일·키)이
 * 읽힌다. 두 겹으로 막는다: ① 첫 조각이 <b>허용된 루트 이름</b>이어야 하고,
 * ② 최종 절대경로가 그 루트 <b>안쪽</b>이어야 한다.
 */
@Service
public class DocumentService {

    /** 아주 큰 파일을 통째로 실어 보내면 브라우저가 멈춘다. 잘랐다는 사실은 응답에 알린다. */
    static final int MAX_CHARS = 200_000;

    private final AppProperties properties;

    public DocumentService(AppProperties properties) {
        this.properties = properties;
    }

    public DocumentResponse read(String storedPath) {
        File target = resolve(storedPath, allowedRoots());
        if (!target.isFile()) {
            throw ApiException.notFound("파일이 없습니다: " + storedPath);
        }
        String text = parse(target);
        if (text == null) {
            throw ApiException.unsupportedMediaType(
                    "이 형식은 본문을 읽을 수 없습니다: " + target.getName());
        }
        boolean truncated = text.length() > MAX_CHARS;
        return new DocumentResponse(storedPath, target.getName(),
                truncated ? text.substring(0, MAX_CHARS) : text, truncated, text.length());
    }

    /**
     * {@code {저장 경로의 첫 조각: 실제 디렉터리}}.
     *
     * <p>색인기가 청크 경로를 {@code {루트 폴더명}/{상대경로}} 로 저장하므로 되짚을
     * 때도 폴더명이 열쇠가 된다. 데모는 아카이브 루트가 달라 첫 조각도 달라진다 —
     * 그래서 상수로 박지 않고 <b>실제 설정에서 만든다.</b>
     */
    Map<String, String> allowedRoots() {
        Map<String, String> roots = new LinkedHashMap<>();
        roots.put(baseName(properties.getCorpusRoot()), properties.getCorpusRoot());
        roots.put(baseName(properties.getArchiveRoot()), properties.getArchiveRoot());
        return roots;
    }

    private static String baseName(String path) {
        return new File(path).getAbsoluteFile().getName();
    }

    /** 저장 경로 → 실제 파일. 벗어나면 400. */
    File resolve(String storedPath, Map<String, String> roots) {
        String[] parts = storedPath.replace('\\', '/').split("/");
        if (parts.length < 2 || !roots.containsKey(parts[0])) {
            throw ApiException.badRequest("열람이 허용되지 않은 위치입니다: " + storedPath);
        }
        File rootDir = new File(roots.get(parts[0])).getAbsoluteFile();
        File target = rootDir;
        for (int i = 1; i < parts.length; i++) {
            target = new File(target, parts[i]);
        }
        // `..` 가 섞이면 이어붙인 뒤에도 형태는 멀쩡해 보인다 — 정규화한 다음 비교해야 한다.
        String rootPath = normalize(rootDir);
        String targetPath = normalize(target);
        if (!targetPath.equals(rootPath) && !targetPath.startsWith(rootPath + File.separator)) {
            throw ApiException.badRequest("열람이 허용되지 않은 위치입니다: " + storedPath);
        }
        return new File(targetPath);
    }

    private static String normalize(File file) {
        try {
            return file.getCanonicalPath();
        } catch (IOException e) {
            return file.getAbsoluteFile().toPath().normalize().toString();
        }
    }

    /**
     * 확장자별 본문 추출. 지원하지 않으면 null(호출부가 415 로 바꾼다).
     *
     * <p>⚠️ <b>{@code .pptx} 는 아직 없다.</b> Python 은 슬라이드 도형·표에서 글자를
     * 뽑아 주는데, 그 출력 모양(도형 순서·표 셀 구분자)이 골든
     * {@code artifacts/pptx_slides.json} 과 대조되는 지점이라 <b>구현계획 Task 3.1
     * (파서 이관)에서 함께</b> 옮긴다. 그때까지 {@code .pptx} 열람은 415 다 —
     * Python 과 다른 유일한 지점이고, 단계 2 골든에는 걸리지 않는다.
     */
    String parse(File file) {
        String name = file.getName().toLowerCase();
        if (name.endsWith(".txt")) {
            return readText(file);
        }
        if (name.endsWith(".json")) {
            return parseJson(file);
        }
        return null;
    }

    /**
     * UTF-8 텍스트. 디코딩 실패는 조용히 null — 인코딩 검증은 반입 쪽 몫이다.
     *
     * <p>⚠️ <b>개행을 반드시 {@code \n} 으로 편다.</b> Python 의
     * {@code Path.read_text()} 는 텍스트 모드라 <b>universal newlines</b> 변환이
     * 일어나 {@code \r\n} 이 {@code \n} 으로 바뀐 채 응답에 실린다. 실측(2026-08-27):
     * {@code corpus/institutions/dobong/spec/00_인덱스.txt} 는 디스크에서 CRLF 44개인데
     * 골든 {@code 06} 의 본문에는 CR 이 <b>0개</b>이고 {@code chars} 도 변환 뒤 길이
     * (1229)다. 바이트를 그대로 읽으면 <b>코퍼스의 모든 .txt 가 골든과 어긋난다.</b>
     */
    static String readText(File file) {
        String raw = decodeUtf8(file);
        if (raw == null) {
            return null;
        }
        // universal newlines: \r\n → \n, 남은 홑 \r 도 \n.
        return raw.replace("\r\n", "\n").replace('\r', '\n');
    }

    /** 엄격한 UTF-8 디코딩. 깨진 바이트가 있으면 null(대체문자로 뭉개지 않는다). */
    private static String decodeUtf8(File file) {
        try {
            byte[] bytes = Files.readAllBytes(file.toPath());
            CharsetDecoder decoder = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT);
            CharBuffer decoded = decoder.decode(ByteBuffer.wrap(bytes));
            return decoded.toString();
        } catch (CharacterCodingException e) {
            return null;
        } catch (IOException e) {
            return null;
        }
    }

    /**
     * 구조화 산출물({@code rfp_scoring.json}·{@code coverage_map.json})을 검색 가능한
     * 줄로 편다.
     *
     * <p>원문 JSON 을 그대로 넣지 않는 이유: {@code {"criteria": [{"name":} 같은 문법
     * 부스러기가 본문에 섞이면 스니펫이 읽히지 않고 매치도 지저분해진다. 키는
     * <b>라벨</b>로 붙이고 값만 남긴다.
     */
    private static String parseJson(File file) {
        String raw = readText(file);
        if (raw == null) {
            return null;
        }
        JsonNode root;
        try {
            root = new com.fasterxml.jackson.databind.ObjectMapper().readTree(raw);
        } catch (IOException e) {
            return null;
        }
        List<String> lines = new ArrayList<>();
        walk(root, "", lines);
        return lines.isEmpty() ? null : String.join("\n\n", lines);
    }

    private static void walk(JsonNode node, String label, List<String> lines) {
        if (node.isObject()) {
            for (Iterator<Map.Entry<String, JsonNode>> it = node.fields(); it.hasNext(); ) {
                Map.Entry<String, JsonNode> e = it.next();
                walk(e.getValue(), (label + " " + e.getKey()).trim(), lines);
            }
        } else if (node.isArray()) {
            for (JsonNode item : node) {
                walk(item, label, lines);
            }
        } else if (!node.isNull() && !"".equals(node.asText())) {
            lines.add(label.isEmpty() ? node.asText() : label + ": " + node.asText());
        }
    }
}
