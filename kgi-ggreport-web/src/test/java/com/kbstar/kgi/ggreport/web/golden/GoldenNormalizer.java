package com.kbstar.kgi.ggreport.web.golden;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;

import java.util.Iterator;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 골든 파일과 실제 응답을 비교하기 전에 **실행마다 달라지는 값**을 지운다.
 *
 * <p>규칙은 {@code golden/capture.py} 의 {@code _normalize} 와 1:1이어야 한다 —
 * 한쪽만 바뀌면 비교가 통째로 무의미해진다. 그래서 규칙을 여기 다시 적지 않고
 * <b>같은 정규식 문자열</b>을 그대로 옮겼다. capture.py 를 고치면 이 파일도 고치고,
 * {@code GoldenNormalizerTest} 로 회귀를 잡는다.
 *
 * <p>대상은 <b>문자열 값</b>뿐이다. 객체의 <b>키는 건드리지 않는다</b> — capture.py 도
 * {@code {k: _normalize(v)}} 로 값만 훑는다. 문자열 "안에" 박힌 타임스탬프도 치환된다
 * (예: 쪽지 본문에 시각이 들어간 경우).
 */
public final class GoldenNormalizer {

    /** ISO 타임스탬프(초 이상 정밀도). capture.py 의 TS_RE 와 동일. */
    private static final Pattern TS = Pattern.compile(
            "\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:?\\d{2})?");

    /**
     * 백엔드가 {@code secrets.token_hex(4)} 로 만드는 랜덤 식별자.
     * capture.py 의 RANDOM_ID_RE 와 동일 — 접두사만 남긴다.
     */
    private static final Pattern RANDOM_ID = Pattern.compile(
            "\\b(bc|task|ntf|msg|chat|new)-[0-9a-f]{8}\\b");

    private GoldenNormalizer() {
    }

    /**
     * @param workDir  실행마다 달라지는 임시 작업 디렉터리 (없으면 null)
     * @param repoRoot 리포지토리 루트 절대경로 (PC마다 다름, 없으면 null)
     */
    public static JsonNode normalize(JsonNode node, String workDir, String repoRoot) {
        if (node == null || node.isNull()) {
            return node;
        }
        if (node.isObject()) {
            ObjectNode src = (ObjectNode) node;
            ObjectNode out = src.objectNode();
            Iterator<Map.Entry<String, JsonNode>> it = src.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                // 키는 그대로 둔다 — capture.py 와 같다.
                out.set(e.getKey(), normalize(e.getValue(), workDir, repoRoot));
            }
            return out;
        }
        if (node.isArray()) {
            ArrayNode src = (ArrayNode) node;
            ArrayNode out = src.arrayNode();
            for (JsonNode child : src) {
                out.add(normalize(child, workDir, repoRoot));
            }
            return out;
        }
        if (node.isTextual()) {
            return TextNode.valueOf(normalizeText(node.textValue(), workDir, repoRoot));
        }
        // 숫자·불리언은 그대로. 날짜만 있는 값(YYYY-MM-DD)과 정수 id 도 치환하지 않는다 —
        // 시드·시나리오 순서가 고정이라 결정적이다(golden/README.md).
        return node;
    }

    /** 문자열 하나에 대한 정규화. 적용 순서도 capture.py 와 같아야 한다. */
    public static String normalizeText(String value, String workDir, String repoRoot) {
        if (value == null) {
            return null;
        }
        String s = TS.matcher(value).replaceAll("<TS>");
        s = RANDOM_ID.matcher(s).replaceAll("$1-<ID>");
        s = replacePath(s, workDir, "<WORK>");
        s = replacePath(s, repoRoot, "<REPO>");
        return s;
    }

    /**
     * 경로 치환. 원본 표기와 슬래시 표기를 모두 지운다 — Windows 에서 같은 경로가
     * {@code C:\x} 와 {@code C:/x} 두 모양으로 섞여 나오기 때문이다(capture.py 와 같다).
     */
    private static String replacePath(String s, String path, String token) {
        if (path == null || path.isEmpty()) {
            return s;
        }
        String replaced = s.replace(path, token);
        String slashed = path.replace('\\', '/');
        if (!slashed.equals(path)) {
            replaced = replaced.replace(slashed, token);
        }
        return replaced;
    }

    /** 정규식 치환에 쓰인 그룹 참조가 리터럴로 새지 않게 하는 헬퍼(테스트에서 사용). */
    static String quoteReplacement(String s) {
        return Matcher.quoteReplacement(s);
    }
}
