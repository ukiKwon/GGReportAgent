package com.kbstar.kgi.ggreport.web.boarddoc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.Test;
import org.springframework.core.io.ClassPathResource;

import java.io.InputStream;

import static com.kbstar.kgi.ggreport.web.boarddoc.BoardNamedMapFixture.area;
import static com.kbstar.kgi.ggreport.web.boarddoc.BoardNamedMapFixture.cellSpec;
import static com.kbstar.kgi.ggreport.web.boarddoc.BoardNamedMapFixture.line;
import static com.kbstar.kgi.ggreport.web.boarddoc.BoardNamedMapFixture.root;
import static com.kbstar.kgi.ggreport.web.boarddoc.BoardNamedMapFixture.table;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** 이름·구역 형식 지도의 기동 검증(S3) — 어기면 IllegalStateException(기동 실패). */
public class BoardExcelNamedMapTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static void expectInvalid(ObjectNode root) {
        try {
            new BoardExcelMap(root);
            fail("IllegalStateException 이 나와야 한다");
        } catch (IllegalStateException expected) {
            // ok
        }
    }

    @Test
    public void 정상_지도는_이름_형식_표를_읽는다() {
        BoardExcelMap m = BoardNamedMapFixture.map();
        assertEquals(2, m.getMappingVer());
        assertTrue(m.table("C-4").isNamed());
        assertNull(m.table("C-4").getRange());
        assertEquals(3, m.table("C-4").getSpecs().size());
        assertEquals(1, m.table("A").getSums().size());
        assertEquals("r4c1", m.table("A").getSums().get(0).getTotal());
    }

    @Test
    public void covers는_이름_형식이면_그_시트_전체() {
        BoardExcelMap m = BoardNamedMapFixture.map();
        assertTrue(m.covers("수익성분석", 5, 5));
        assertFalse(m.covers("수익성분석", -1, -1));              // 시트 이름 적발은 응답 범위 밖
        assertFalse(m.covers("다른시트", 5, 5));
    }

    @Test
    public void 옛_칸_형식_표와_새_표가_한_파일에_섞일_수_있다() throws Exception {
        ObjectNode legacy;
        try (InputStream in = new ClassPathResource(BoardExcelFixture.LEGACY).getInputStream()) {
            legacy = (ObjectNode) JSON.readTree(in);
        }
        ObjectNode root = root();
        BoardNamedMapFixture.tables(root).set(0, legacy.get("tables").get(0).deepCopy());   // 표 A 만 옛 형식
        BoardExcelMap m = new BoardExcelMap(root);
        assertFalse(m.table("A").isNamed());
        assertEquals("기부금", m.table("A").getSheet());
        assertTrue(m.table("C-4").isNamed());
    }

    @Test
    public void 버전_1에_새_형식은_기동_실패() {
        ObjectNode root = root();
        root.put("mapping_ver", 1);
        expectInvalid(root);
    }

    @Test
    public void 알_수_없는_연산_행_번호_빠진_줄_칸_수_초과는_기동_실패() {
        ObjectNode r = root();
        cellSpec(r, "C-4", 2, 0).put("op", "mystery");
        expectInvalid(r);

        r = root();
        line(r, "C-4", 3).put("row", 9);
        expectInvalid(r);

        r = root();
        ((ArrayNode) table(r, "A").get("lines")).remove(2);                    // r3 줄이 빠짐
        expectInvalid(r);

        r = root();
        ((ArrayNode) line(r, "A", 2).get("cells")).add(cellSpec(r, "A", 2, 0).deepCopy());   // 칸 수 초과
        expectInvalid(r);
    }

    @Test
    public void 없는_구역_행_열_id_참조는_기동_실패() {
        ObjectNode r = root();
        ((ArrayNode) cellSpec(r, "C-4", 2, 0).get("parts")).removeAll().add("nope.value");
        expectInvalid(r);

        r = root();
        ((ArrayNode) cellSpec(r, "C-4", 2, 0).get("parts")).removeAll().add("judge.nope");
        expectInvalid(r);

        r = root();
        cellSpec(r, "C-4", 2, 0).put("col", "nope");
        expectInvalid(r);
    }

    @Test
    public void eok에_단위가_백만원이_아닌_구역은_기동_실패() {
        ObjectNode r = root();
        area(r, "judge").put("unit", "천원");
        expectInvalid(r);                                                       // C-4 r2 가 eok
    }

    @Test
    public void derive가_자기_자신이나_eok가_아닌_칸을_참조하면_기동_실패() {
        ObjectNode r = root();
        ((ArrayNode) cellSpec(r, "A", 4, 0).get("of")).removeAll().add("r4c1").add("r1c2");
        expectInvalid(r);

        r = root();
        ((ArrayNode) cellSpec(r, "A", 4, 0).get("of")).removeAll().add("r1c0").add("r1c2");   // r1c0 = manual
        expectInvalid(r);
    }

    @Test
    public void 구역_9개는_기동_실패() {
        ObjectNode r = root();
        for (int i = 0; i < 7; i++) {
            ((ObjectNode) r.get("areas")).set("extra" + i, area(r, "judge").deepCopy());
        }
        expectInvalid(r);
    }

    @Test
    public void 구역_8개는_통과하고_잘못된_id는_기동_실패() {
        ObjectNode ok = root();
        for (int i = 0; i < 6; i++) {
            ((ObjectNode) ok.get("areas")).set("extra" + i, area(ok, "judge").deepCopy());
        }
        new BoardExcelMap(ok);                                                  // 정확히 8개

        ObjectNode bad = root();
        ((ObjectNode) bad.get("areas")).set("Bad-Id", area(bad, "judge").deepCopy());
        expectInvalid(bad);
    }

    @Test
    public void 제목_라벨이_공백뿐이면_기동_실패() {
        ObjectNode r = root();
        area(r, "detail").put("title", "   ");
        expectInvalid(r);
    }

    @Test
    public void below가_11이면_기동_실패() {
        ObjectNode r = root();
        ((ObjectNode) area(r, "judge").get("rows")).set("value", JSON.createObjectNode().put("below", 11));
        expectInvalid(r);
    }

    @Test
    public void parts가_5개면_기동_실패() {
        ObjectNode r = root();
        ArrayNode parts = (ArrayNode) cellSpec(r, "A", 2, 0).get("parts");
        for (int i = 0; i < 4; i++) {
            parts.add("detail.rev");
        }
        expectInvalid(r);
    }

    @Test
    public void 카탈로그_버전이_다르면_기동_실패() {
        ObjectNode r = root();
        r.put("catalog_ver", 9);
        expectInvalid(r);
    }

    @Test
    public void 새_표에_옛_키를_병기하면_기동_실패() {
        ObjectNode r = root();
        table(r, "C-4").put("range", "A1:B2");
        expectInvalid(r);
    }

    // ── 허용 키 밖(오타)은 기동 실패 — 검증이 조용히 꺼지지 않게 ──

    @Test
    public void 구역의_알_수_없는_키는_기동_실패() {
        ObjectNode r = root();
        area(r, "detail").put("unit_in_titel", true);                           // 오타
        expectInvalid(r);
    }

    @Test
    public void 줄과_칸_규칙의_알_수_없는_키는_기동_실패() {
        ObjectNode r = root();
        line(r, "C-4", 1).put("colz", "x");
        expectInvalid(r);

        r = root();
        cellSpec(r, "C-4", 2, 0).put("part", "x");
        expectInvalid(r);

        r = root();
        ((ObjectNode) area(r, "judge").get("rows").get("value")).put("beelow", 1);
        expectInvalid(r);
    }

    @Test
    public void 표의_알_수_없는_키는_기동_실패() {
        ObjectNode r = root();
        table(r, "C-4").put("sheet", "수익성분석");
        expectInvalid(r);
    }

    @Test
    public void 실제_지도_v2는_표_5개_95칸을_읽는다() {
        BoardExcelMap m = new BoardExcelMap();
        assertEquals(2, m.getMappingVer());
        assertEquals(5, m.tables().size());
        int n = 0;
        for (BoardExcelMap.TableMap t : m.tables()) {
            assertTrue(t.isNamed());
            n += t.getSpecs().size();
        }
        assertEquals(95, n);                                                    // 카탈로그 매핑 칸(S5 전이라 C-3 에 사업초기 열 없음)
        assertEquals("tot", m.table("C-3").getSpecs().get("r5c5").main.get(0).col);
    }
}
