package com.kbstar.kgi.ggreport.web.boarddoc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.Test;
import org.springframework.core.io.ClassPathResource;

import java.io.InputStream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** excel-map.json 기동 검증 — 카탈로그 매핑 칸 집합과 정확히 일치·범위 안. */
public class BoardExcelMapTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static ObjectNode raw() throws Exception {
        try (InputStream in = new ClassPathResource(BoardExcelMap.RESOURCE).getInputStream()) {
            return (ObjectNode) JSON.readTree(in);
        }
    }

    /** ref 표의 cells 객체(C-4 는 cells 로 적혀 있다). */
    private static ObjectNode cellsOf(ObjectNode root, String ref) {
        for (com.fasterxml.jackson.databind.JsonNode t : root.get("tables")) {
            if (ref.equals(t.get("ref").asText())) {
                return (ObjectNode) t.get("cells");
            }
        }
        throw new AssertionError("table not found " + ref);
    }

    private static void expectInvalid(ObjectNode root) {
        try {
            new BoardExcelMap(root);
            fail("IllegalStateException 이 나와야 한다");
        } catch (IllegalStateException expected) {
            // ok
        }
    }

    @Test
    public void 실제_지도는_표_5개_매핑_칸_95개() {
        BoardExcelMap m = new BoardExcelMap();
        assertEquals(1, m.getMappingVer());
        assertEquals(5, m.tables().size());
        int n = 0;
        for (BoardExcelMap.TableMap t : m.tables()) {
            n += t.getCells().size();
        }
        assertEquals(95, n);
        assertEquals("C3", m.table("A").getCells().get("r2c1").formatAsString());
    }

    @Test
    public void covers는_시트_이름_대소문자를_무시한다() throws Exception {
        BoardExcelMap m = BoardExcelFixture.mapWithSheet("A", "Donation");
        assertTrue(m.covers("donation", 2, 2));                  // C3
        assertTrue(m.covers("DONATION", 2, 2));
        assertFalse(m.covers("donation", 10, 2));                // 범위 밖
        assertFalse(m.covers("donation", -1, -1));               // 시트 이름 적발
    }

    @Test
    public void 매핑_칸_하나를_빼면_기동_실패() throws Exception {
        ObjectNode root = raw();
        cellsOf(root, "C-4").remove("r1c1");
        expectInvalid(root);
    }

    @Test
    public void 범위_밖_칸이면_기동_실패() throws Exception {
        ObjectNode root = raw();
        cellsOf(root, "C-4").put("r1c1", "Z99");
        expectInvalid(root);
    }

    // ── 머리글 별칭(C5 포함) ──

    private static ObjectNode tableOf(ObjectNode root, String ref) {
        for (com.fasterxml.jackson.databind.JsonNode t : root.get("tables")) {
            if (ref.equals(t.get("ref").asText())) {
                return (ObjectNode) t;
            }
        }
        throw new AssertionError("table not found " + ref);
    }

    private static void expectLabelInvalid(com.fasterxml.jackson.databind.JsonNode value) {
        try {
            BoardExcelFixture.mapWithLabel("A", "B5", value);
            fail("IllegalStateException 이 나와야 한다: " + value);
        } catch (IllegalStateException expected) {
            // ok
        } catch (java.io.IOException e) {
            throw new AssertionError(e);
        }
    }

    @Test
    public void 라벨은_문자열_하나도_배열도_읽는다() throws Exception {
        BoardExcelMap one = BoardExcelFixture.mapWithLabel("A", "B5", JSON.getNodeFactory().textNode("합계"));
        assertEquals(java.util.Collections.singletonList("합계"), one.table("A").getLabels().get("B5"));
        com.fasterxml.jackson.databind.node.ArrayNode arr = JSON.createArrayNode().add("합계").add("총계");
        BoardExcelMap many = BoardExcelFixture.mapWithLabel("A", "B5", arr);
        assertEquals(java.util.Arrays.asList("합계", "총계"), many.table("A").getLabels().get("B5"));
        assertEquals("기관명", new BoardExcelMap().table("A").getLabels().get("A1").get(0));
    }

    @Test
    public void 잘못된_별칭은_기동_실패() throws Exception {
        expectLabelInvalid(JSON.createArrayNode());                                    // 빈 배열
        expectLabelInvalid(JSON.getNodeFactory().textNode("   "));                     // 공백만(norm 뒤 빔, C5)
        expectLabelInvalid(JSON.createArrayNode().add("합계").add("  "));              // 배열 안 빈 별칭
        expectLabelInvalid(JSON.getNodeFactory().numberNode(5));                       // 비문자열
        expectLabelInvalid(JSON.createArrayNode().add("합계").add(5));                  // 배열 안 비문자열
        expectLabelInvalid(JSON.createArrayNode().add("합계").addNull());
        com.fasterxml.jackson.databind.node.ArrayNode eleven = JSON.createArrayNode();
        for (int i = 0; i < 11; i++) {
            eleven.add("별칭" + i);
        }
        expectLabelInvalid(eleven);                                                    // 11개
        StringBuilder s = new StringBuilder();
        for (int i = 0; i < 101; i++) {
            s.append('가');
        }
        expectLabelInvalid(JSON.getNodeFactory().textNode(s.toString()));              // 101자
    }

    @Test
    public void 라벨이_하나도_없는_표는_기동_실패() throws Exception {
        ObjectNode root = raw();
        tableOf(root, "C-4").set("labels", JSON.createObjectNode());
        expectInvalid(root);
        root = raw();
        tableOf(root, "C-4").remove("labels");
        expectInvalid(root);
    }
}
