package com.kbstar.kgi.ggreport.web.golden;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * 정규화 규칙이 {@code golden/capture.py} 와 어긋나지 않는지 고정한다.
 *
 * <p>여기가 깨지면 골든 비교 전체가 무의미해진다 — 실제 응답만 정규화되고 골든 파일은
 * 캡처 시점 규칙으로 저장돼 있으므로, 두 규칙이 갈리면 <b>정상인 응답도 계속 실패한다.</b>
 */
public class GoldenNormalizerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    public void ISO_타임스탬프를_지운다() {
        assertEquals("<TS>", n("2026-08-26T14:30:00"));
        assertEquals("<TS>", n("2026-08-26T14:30:00.123456"));
        assertEquals("<TS>", n("2026-08-26T14:30:00Z"));
        assertEquals("<TS>", n("2026-08-26T14:30:00+09:00"));
        assertEquals("<TS>", n("2026-08-26T14:30:00+0900"));
        // 공백 구분자도 capture.py 의 [T ] 에 걸린다.
        assertEquals("<TS>", n("2026-08-26 14:30:00"));
    }

    @Test
    public void 날짜만_있는_값은_남긴다() {
        // golden/README.md — 시드·시나리오가 고정이라 날짜는 결정적이다.
        assertEquals("2026-08-26", n("2026-08-26"));
    }

    @Test
    public void 랜덤_식별자를_접두사만_남기고_지운다() {
        assertEquals("bc-<ID>", n("bc-1a2b3c4d"));
        assertEquals("task-<ID>", n("task-deadbeef"));
        assertEquals("ntf-<ID>", n("ntf-00112233"));
        assertEquals("msg-<ID>", n("msg-aabbccdd"));
        assertEquals("chat-<ID>", n("chat-01234567"));
        assertEquals("new-<ID>", n("new-89abcdef"));
    }

    @Test
    public void 식별자가_아닌_것은_건드리지_않는다() {
        // 접두사가 다르다.
        assertEquals("run-1a2b3c4d", n("run-1a2b3c4d"));
        // hex 8자리가 아니다.
        assertEquals("bc-1a2b3c", n("bc-1a2b3c"));
        // hex 가 아니다.
        assertEquals("bc-zzzzzzzz", n("bc-zzzzzzzz"));
    }

    @Test
    public void 문자열_안에_박힌_값도_지운다() {
        assertEquals(
                "작업 task-<ID> 이 <TS> 에 제출됨",
                n("작업 task-1a2b3c4d 이 2026-08-26T14:30:00 에 제출됨"));
    }

    @Test
    public void 경로는_두_표기_모두_지운다() {
        String repo = "C:\\github\\GGReportAgent";
        assertEquals("<REPO>/corpus",
                GoldenNormalizer.normalizeText("C:\\github\\GGReportAgent/corpus", null, repo));
        assertEquals("<REPO>/corpus",
                GoldenNormalizer.normalizeText("C:/github/GGReportAgent/corpus", null, repo));
    }

    @Test
    public void 객체_키는_건드리지_않는다() throws Exception {
        // capture.py 도 값만 훑는다. 키가 우연히 규칙에 걸려도 바뀌면 안 된다.
        JsonNode in = MAPPER.readTree("{\"bc-1a2b3c4d\": \"bc-1a2b3c4d\"}");
        JsonNode out = GoldenNormalizer.normalize(in, null, null);
        assertTrue("키가 바뀌었다: " + out, out.has("bc-1a2b3c4d"));
        assertEquals("bc-<ID>", out.get("bc-1a2b3c4d").textValue());
    }

    @Test
    public void 숫자와_불리언과_null_은_그대로다() throws Exception {
        JsonNode in = MAPPER.readTree("{\"a\":1,\"b\":1.5,\"c\":true,\"d\":null}");
        assertEquals(in, GoldenNormalizer.normalize(in, null, null));
    }

    @Test
    public void 중첩_구조를_끝까지_훑는다() throws Exception {
        JsonNode in = MAPPER.readTree(
                "{\"items\":[{\"id\":\"task-11223344\",\"at\":\"2026-08-26T00:00:00\"}]}");
        JsonNode out = GoldenNormalizer.normalize(in, null, null);
        JsonNode item = out.get("items").get(0);
        assertEquals("task-<ID>", item.get("id").textValue());
        assertEquals("<TS>", item.get("at").textValue());
    }

    @Test
    public void 이미_정규화된_골든_파일은_다시_돌려도_그대로다() {
        // 멱등성. 골든 파일에는 이미 <TS>/<ID> 가 박혀 있으므로, 하네스가 실수로
        // 골든 쪽을 한 번 더 정규화해도 값이 변하면 안 된다.
        for (GoldenSnapshot s : GoldenSnapshot.loadAll()) {
            JsonNode again = GoldenNormalizer.normalize(s.body(), null, null);
            assertEquals("두 번 정규화하니 달라졌다: " + s.name(), s.body(), again);
        }
    }

    private static String n(String s) {
        return GoldenNormalizer.normalizeText(s, null, null);
    }
}
