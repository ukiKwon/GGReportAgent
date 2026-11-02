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
}
