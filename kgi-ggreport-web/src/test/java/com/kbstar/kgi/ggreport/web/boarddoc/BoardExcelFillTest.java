package com.kbstar.kgi.ggreport.web.boarddoc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.docfill.XlsxBook;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** 머리글 별칭·불일치 단계(C1)·표시값 합계·원값(raw) — 가상 엑셀만 쓴다. */
public class BoardExcelFillTest {

    private static final XlsxBook.Limits LIMITS = new XlsxBook.Limits(20L << 20, 40L << 20, 200000);

    private static Map<String, Object> run(BoardExcelMap map, Consumer<XSSFWorkbook> tweak) throws Exception {
        try (XlsxBook b = XlsxBook.open(BoardExcelFixture.xlsx(tweak), LIMITS)) {
            return BoardExcelFill.fill(b, map, BoardDocSpec.find(BoardDocSpec.DEFAULT_ID, false));
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> table(Map<String, Object> out, String ref) {
        for (Map<String, Object> t : (List<Map<String, Object>>) out.get("tables")) {
            if (ref.equals(t.get("ref"))) {
                return t;
            }
        }
        throw new AssertionError("table not found " + ref);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> cell(Map<String, Object> out, String ref, String key) {
        for (Map<String, Object> c : (List<Map<String, Object>>) table(out, ref).get("cells")) {
            if (key.equals(c.get("key"))) {
                return c;
            }
        }
        throw new AssertionError("cell not found " + ref + " " + key);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> source(Map<String, Object> c) {
        return (Map<String, Object>) c.get("source");
    }

    @SuppressWarnings("unchecked")
    private static boolean hasWarning(Map<String, Object> c, String code) {
        for (Map<String, Object> w : (List<Map<String, Object>>) c.get("warnings")) {
            if (code.equals(w.get("code"))) {
                return true;
            }
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> summary(Map<String, Object> out) {
        return (Map<String, Object>) out.get("summary");
    }

    private static final Consumer<XSSFWorkbook> B5_TOTAL2 =
            wb -> wb.getSheet("기부금").getRow(4).getCell(1).setCellValue("총계");

    // ── 별칭 ──

    @Test
    public void 별칭_배열의_어느_하나와_같으면_통과() throws Exception {
        BoardExcelMap m = BoardExcelFixture.mapWithLabel("A", "B5",
                new ObjectMapper().createArrayNode().add("합계").add("총계"));
        Map<String, Object> out = run(m, B5_TOTAL2);
        assertEquals("ok", table(out, "A").get("label_state"));
        assertEquals(false, table(out, "A").get("needs_review"));
        assertEquals(0, summary(out).get("label_mismatch_tables"));
    }

    @Test
    public void 별칭에_없는_값은_주의이고_대표_별칭을_기대값으로_싣는다() throws Exception {
        BoardExcelMap m = BoardExcelFixture.mapWithLabel("A", "B5",
                new ObjectMapper().createArrayNode().add("합계").add("총계"));
        Map<String, Object> out = run(m, wb -> wb.getSheet("기부금").getRow(4).getCell(1).setCellValue("합계표"));
        assertEquals("partial", table(out, "A").get("label_state"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> mm = (List<Map<String, Object>>) table(out, "A").get("label_mismatches");
        assertEquals(1, mm.size());
        assertEquals("B5", mm.get(0).get("cell"));
        assertEquals("합계", mm.get(0).get("expected"));
        assertEquals("합계표", mm.get(0).get("actual"));
    }

    @Test
    public void 공백은_정규화해서_비교한다() throws Exception {
        Map<String, Object> out = run(new BoardExcelMap(),
                wb -> wb.getSheet("기부금").getRow(4).getCell(1).setCellValue("  합계 "));
        assertEquals("ok", table(out, "A").get("label_state"));
    }

    // ── C1 단계 ──

    @Test
    public void 일부만_다르면_값을_채우되_review로_두고_filled에서_뺀다() throws Exception {
        Map<String, Object> out = run(new BoardExcelMap(), B5_TOTAL2);
        Map<String, Object> t = table(out, "A");
        assertEquals("partial", t.get("label_state"));
        assertEquals(true, t.get("needs_review"));
        Map<String, Object> c = cell(out, "A", "r1c2");
        assertEquals("review", c.get("status"));
        assertEquals("500", c.get("value"));
        assertTrue(hasWarning(c, "LABEL_MISMATCH"));
        assertEquals(5, ((List<?>) t.get("cells")).size());
        assertEquals(95 - 5, summary(out).get("filled"));
        assertEquals(5, summary(out).get("review"));
        assertEquals(0, summary(out).get("failed"));
        assertEquals(1, summary(out).get("label_mismatch_tables"));
        assertEquals(java.util.Collections.singletonList("A"), BoardExcelFill.labelMismatchRefs(out));
        assertEquals("ok", table(out, "B").get("label_state"));      // 다른 표는 영향 없음
    }

    @Test
    public void 절반_미만_다르면_partial_절반_이상이면_failed() throws Exception {
        // 표 A 머리글 7칸: 3칸 다름(3*2<7)=partial, 4칸 다름(4*2>=7)=failed
        Map<String, Object> three = run(new BoardExcelMap(), wb -> change(wb, "B2", "B3", "B4"));
        assertEquals("partial", table(three, "A").get("label_state"));
        Map<String, Object> four = run(new BoardExcelMap(), wb -> change(wb, "B2", "B3", "B4", "B5"));
        assertEquals("failed", table(four, "A").get("label_state"));
    }

    private static void change(XSSFWorkbook wb, String... addrs) {
        for (String a : addrs) {
            BoardExcelFixture.cell(wb.getSheet("기부금"), new org.apache.poi.ss.util.CellReference(a)).setCellValue("다름");
        }
    }

    @Test
    public void failed_표는_모든_칸이_빈값_LABEL_MISMATCH이고_합계_검산도_하지_않는다() throws Exception {
        Map<String, Object> out = run(new BoardExcelMap(), wb -> {
            change(wb, "B2", "B3", "B4", "B5");
            wb.getSheet("기부금").getRow(2).getCell(2).setCellValue(400);     // 합계가 달라지는 값
        });
        Map<String, Object> t = table(out, "A");
        assertEquals("failed", t.get("label_state"));
        assertEquals(true, t.get("needs_review"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> cells = (List<Map<String, Object>>) t.get("cells");
        for (Map<String, Object> c : cells) {
            assertEquals("failed", c.get("status"));
            assertEquals("LABEL_MISMATCH", c.get("reason"));
            assertEquals("", c.get("value"));
            assertEquals("", source(c).get("display"));
            assertNull(source(c).get("raw"));
            assertNull(source(c).get("rounded"));
            assertTrue(hasWarning(c, "LABEL_MISMATCH"));
            assertFalse(hasWarning(c, "SUM_MISMATCH"));
        }
        assertEquals(95 - 5, summary(out).get("filled"));
        assertEquals(5, summary(out).get("failed"));
        assertEquals(0, summary(out).get("review"));
    }

    // ── raw·rounded·합계 ──

    @Test
    public void 숫자_칸은_raw와_rounded를_싣는다() throws Exception {
        Map<String, Object> out = run(new BoardExcelMap(),
                wb -> wb.getSheet("기부금").getRow(2).getCell(2).setCellValue(1234.5678919));
        Map<String, Object> c = cell(out, "A", "r2c1");
        assertEquals("1,235", c.get("value"));
        assertEquals("1234.567892", source(c).get("raw"));
        assertEquals(true, source(c).get("rounded"));
        Map<String, Object> whole = cell(out, "A", "r1c2");              // 500 정수
        assertEquals("500", source(whole).get("raw"));
        assertEquals(false, source(whole).get("rounded"));
        assertEquals("900", source(cell(out, "A", "r4c1")).get("raw"));  // 수식 캐시
    }

    @Test
    public void 문자_칸은_raw가_null() throws Exception {
        Map<String, Object> out = run(new BoardExcelMap(), null);
        Map<String, Object> c = cell(out, "A", "r1c0");                  // 기관명 칸(문자열)
        assertEquals("filled", c.get("status"));
        assertNull(source(c).get("raw"));
        assertNull(source(c).get("rounded"));
    }

    @Test
    public void 표시값_합이_표시된_합계와_다르면_SUM_MISMATCH_diff() throws Exception {
        Map<String, Object> out = run(new BoardExcelMap(), wb -> {
            wb.getSheet("기부금").getRow(1).getCell(2).setCellValue(1234.4);   // 표시 1,234
            wb.getSheet("기부금").getRow(2).getCell(2).setCellValue(2345.4);   // 표시 2,345
            wb.getSheet("기부금").getRow(3).getCell(2).setCellValue(0);
            wb.getSheet("기부금").getRow(4).getCell(2).setCellValue(3580);      // 합계 칸(수식 캐시값을 덮어씀)
        });
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> ws = (List<Map<String, Object>>) cell(out, "A", "r4c1").get("warnings");
        Map<String, Object> w = null;
        for (Map<String, Object> x : ws) {
            if ("SUM_MISMATCH".equals(x.get("code"))) {
                w = x;
            }
        }
        assertTrue("SUM_MISMATCH 가 없다", w != null);
        assertEquals("display", w.get("basis"));
        assertEquals("3579", w.get("expected"));
        assertEquals("3580", w.get("actual"));
        assertEquals("1", w.get("diff"));
    }

    @Test
    public void 표시값_합이_맞으면_원래_값이_달라도_경고_없음() throws Exception {
        Map<String, Object> out = run(new BoardExcelMap(), wb -> {
            wb.getSheet("기부금").getRow(1).getCell(2).setCellValue(100.2);    // 표시 100
            wb.getSheet("기부금").getRow(2).getCell(2).setCellValue(200.2);    // 표시 200
            wb.getSheet("기부금").getRow(3).getCell(2).setCellValue(0);
            wb.getSheet("기부금").getRow(4).getCell(2).setCellValue(300);       // 합계 칸(수식 캐시값을 덮어씀)
        });
        assertFalse(hasWarning(cell(out, "A", "r4c1"), "SUM_MISMATCH"));
    }

    // ── C4: ;;; 서식 ──

    @Test
    public void 세미콜론_세개_서식_숫자는_filled이고_HIDDEN_FORMAT_경고와_raw가_있다() throws Exception {
        Map<String, Object> out = run(new BoardExcelMap(), wb -> {
            CellStyle hide = wb.createCellStyle();
            hide.setDataFormat(wb.createDataFormat().getFormat(";;;"));
            wb.getSheet("기부금").getRow(2).getCell(2).setCellValue(1234.5);
            wb.getSheet("기부금").getRow(2).getCell(2).setCellStyle(hide);
        });
        Map<String, Object> c = cell(out, "A", "r2c1");
        assertEquals("filled", c.get("status"));                  // POI 는 ;;; 서식에서도 표시값을 돌려준다
        assertFalse(((String) c.get("value")).isEmpty());
        assertTrue(hasWarning(c, "HIDDEN_FORMAT"));
        assertEquals("1234.5", source(c).get("raw"));
        assertFalse(hasWarning(cell(out, "A", "r1c2"), "HIDDEN_FORMAT"));   // 보통 서식 칸은 경고 없음
    }

    @Test
    public void 숨김_서식_판별은_세미콜론만인_구역만() {
        assertTrue(XlsxBook.hiddenFormat(";;;"));
        assertTrue(XlsxBook.hiddenFormat(";;"));
        assertTrue(XlsxBook.hiddenFormat(";;;@"));
        assertFalse(XlsxBook.hiddenFormat("#,##0"));
        assertFalse(XlsxBook.hiddenFormat("#,##0;;;"));
        assertFalse(XlsxBook.hiddenFormat("; ;;"));
        assertFalse(XlsxBook.hiddenFormat(null));
    }

    // ── shownNum·plain·rawDecimal ──

    @Test
    public void shownNum_쉼표_괄호_삼각형_음수와_단위는_null() {
        assertEquals(new BigDecimal("1234"), BoardExcelFill.shownNum("1,234"));
        assertEquals(new BigDecimal("-1234"), BoardExcelFill.shownNum("(1,234)"));
        assertEquals(new BigDecimal("-5"), BoardExcelFill.shownNum("△5"));
        assertEquals(new BigDecimal("-5"), BoardExcelFill.shownNum("▲5"));
        assertEquals(new BigDecimal("1.5"), BoardExcelFill.shownNum(" 1.5 "));
        assertEquals(new BigDecimal("-7"), BoardExcelFill.shownNum("-7"));
        assertNull(BoardExcelFill.shownNum("12%"));
        assertNull(BoardExcelFill.shownNum("1,234원"));
        assertNull(BoardExcelFill.shownNum("1e5"));
        assertNull(BoardExcelFill.shownNum("(-5)"));
        assertNull(BoardExcelFill.shownNum("12345678901234567890123456789012"));   // 32자리 — 상한 초과
        assertNull(BoardExcelFill.shownNum(""));
        assertNull(BoardExcelFill.shownNum(null));
    }

    @Test
    public void plain은_0과_후행_0을_정리한다() {
        assertEquals("0", BoardExcelFill.plain(new BigDecimal("0.000")));
        assertEquals("0", BoardExcelFill.plain(new BigDecimal("-0.0")));
        assertEquals("3", BoardExcelFill.plain(new BigDecimal("3.0")));
        assertEquals("100", BoardExcelFill.plain(new BigDecimal("1E+2")));
        assertEquals("0.5", BoardExcelFill.plain(new BigDecimal("0.500000")));
    }
}
