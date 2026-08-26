package com.kbstar.kgi.ggreport.web.golden;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.File;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * {@code golden/api/NN_이름.json} 한 건. 형식은 {@code {request, status, body}} 다.
 *
 * <p>⚠️ <b>파일명 순서 = 실행 순서다.</b> 뒤 번호는 앞의 상태 변경을 전제한다
 * (예: 결재 시나리오). 목록을 섞어 돌리면 안 된다 — {@link #loadAll()} 이 이름순으로
 * 정렬해 돌려주는 이유다.
 */
public final class GoldenSnapshot {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final String name;
    private final String method;
    private final String url;
    private final int status;
    private final JsonNode requestBody;
    private final Map<String, String> headers;
    private final JsonNode body;

    private GoldenSnapshot(String name, String method, String url, int status,
                           JsonNode requestBody, Map<String, String> headers, JsonNode body) {
        this.name = name;
        this.method = method;
        this.url = url;
        this.status = status;
        this.requestBody = requestBody;
        this.headers = headers;
        this.body = body;
    }

    public String name()          { return name; }
    /** 대문자로 정규화된 HTTP 메서드(GET/POST/…). */
    public String method()        { return method; }
    public String url()           { return url; }
    public int status()           { return status; }
    /** 요청 본문. 없으면 null. */
    public JsonNode requestBody() { return requestBody; }
    /**
     * 요청 헤더. 없으면 빈 맵.
     *
     * <p>⚠️ <b>결재 시나리오(15~24번)는 {@code X-User-Id} 로 행위자를 정한다</b>
     * (dave 가 임시저장·제출, boss 가 승인). 이 헤더를 안 실으면 요청은 성공하지만
     * <b>다른 사람이 한 것으로 기록돼</b> 응답의 assignee/approver 가 어긋난다 —
     * 원인을 찾기 어려운 종류의 실패다.
     */
    public Map<String, String> headers() { return headers; }
    /** 기대 응답 본문(이미 정규화된 상태로 저장돼 있다). */
    public JsonNode body()        { return body; }

    public static GoldenSnapshot load(Path file) {
        try {
            JsonNode root = MAPPER.readTree(file.toFile());
            JsonNode request = root.path("request");
            if (request.isMissingNode()) {
                throw new IllegalArgumentException(
                        "골든 파일에 request 가 없다: " + file);
            }
            String method = request.path("method").asText("GET");
            String url = request.path("url").asText(null);
            if (url == null || url.isEmpty()) {
                throw new IllegalArgumentException(
                        "골든 파일에 request.url 이 없다: " + file);
            }
            JsonNode reqBody = request.has("body") ? request.get("body") : null;

            Map<String, String> hdrs = new LinkedHashMap<>();
            JsonNode headerNode = request.path("headers");
            if (headerNode.isObject()) {
                Iterator<Map.Entry<String, JsonNode>> it = headerNode.fields();
                while (it.hasNext()) {
                    Map.Entry<String, JsonNode> e = it.next();
                    hdrs.put(e.getKey(), e.getValue().asText());
                }
            }

            String fileName = file.getFileName().toString();
            String name = fileName.endsWith(".json")
                    ? fileName.substring(0, fileName.length() - ".json".length())
                    : fileName;
            return new GoldenSnapshot(
                    name,
                    method.toUpperCase(),
                    url,
                    root.path("status").asInt(),
                    reqBody,
                    Collections.unmodifiableMap(hdrs),
                    root.path("body"));
        } catch (IOException e) {
            throw new UncheckedIOException("골든 파일을 읽지 못했다: " + file, e);
        }
    }

    /** {@code golden/api/} 전체를 <b>파일명 순서</b>로 읽는다. */
    public static List<GoldenSnapshot> loadAll() {
        Path dir = goldenApiDir();
        File[] files = dir.toFile().listFiles(
                (d, n) -> n.endsWith(".json"));
        if (files == null || files.length == 0) {
            throw new IllegalStateException("골든 스냅샷이 없다: " + dir);
        }
        List<Path> paths = new ArrayList<>();
        for (File f : files) {
            paths.add(f.toPath());
        }
        // 파일명 순서가 곧 실행 순서다(클래스 주석 참조).
        Collections.sort(paths);
        List<GoldenSnapshot> out = new ArrayList<>();
        for (Path p : paths) {
            out.add(load(p));
        }
        return out;
    }

    public static Path goldenApiDir() {
        return repoRoot().resolve("golden").resolve("api");
    }

    /**
     * 리포 루트를 찾는다.
     *
     * <p>테스트의 작업 디렉터리는 실행 방식에 따라 다르다 — Maven 은 모듈 폴더,
     * IDE 는 리포 루트일 수 있다. 그래서 고정 상대경로를 쓰지 않고
     * <b>{@code golden/} 이 보일 때까지 위로 올라간다.</b>
     */
    public static Path repoRoot() {
        Path cur = Paths.get(System.getProperty("user.dir")).toAbsolutePath();
        for (Path p = cur; p != null; p = p.getParent()) {
            if (Files.isDirectory(p.resolve("golden").resolve("api"))) {
                return p;
            }
        }
        throw new IllegalStateException(
                "golden/api 를 찾지 못했다. user.dir=" + cur
                        + " — 이 하네스는 리포 안에서 실행되는 것을 전제한다.");
    }
}
