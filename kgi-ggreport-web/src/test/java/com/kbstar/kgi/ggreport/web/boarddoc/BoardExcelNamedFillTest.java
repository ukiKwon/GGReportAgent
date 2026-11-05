package com.kbstar.kgi.ggreport.web.boarddoc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.docfill.XlsxBook;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.Test;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 이름·구역 형식 채우기(S4) — {@link BoardSourceFixture} 가상 시트와 {@link BoardNamedMapFixture} 지도. 칸 값 = 행*100+열,
 * 세부 산출표 총수익(A) 행(r7)의 계 열(10) = 710 → 7.10 억원. 5년 열(9)은 큰 수(읽히면 시험 실패).
 */
public class BoardExcelNamedFillTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static Map<String, Object> run(Consumer<XSSFWorkbook> tweak) throws Exception {
        return run(BoardNamedMapFixture.map(), tweak);
    }

    /** 제목 행(r5) L6 에 "(단위: 백만원)" 을 기본으로 넣고 tweak 을 적용한다. */
    private static Map<String, Object> run(BoardExcelMap map, Consumer<XSSFWorkbook> tweak) throws Exception {
        Consumer<XSSFWorkbook> withUnit = wb -> {
            wb.getSheet(BoardSourceFixture.SHEET).getRow(5).createCell(11).setCellValue("(단위: 백만원)");
            if (tweak != null) {
                tweak.accept(wb);
            }
        };
        try (XlsxBook b = BoardSourceFixture.open(BoardSourceFixture.book(withUnit))) {
            return BoardExcelFill.fill(b, map, BoardDocSpec.find(BoardDocSpec.DEFAULT_ID, false));
        }
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Object o) {
        return (List<Map<String, Object>>) o;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object o) {
        return (Map<String, Object>) o;
    }

    private static Map<String, Object> table(Map<String, Object> out, String ref) {
        for (Map<String, Object> t : list(out.get("tables"))) {
            if (ref.equals(t.get("ref"))) {
                return t;
            }
        }
        throw new AssertionError("table not found " + ref);
    }

    private static Map<String, Object> cell(Map<String, Object> out, String ref, String key) {
        for (Map<String, Object> c : list(table(out, ref).get("cells"))) {
            if (key.equals(c.get("key"))) {
                return c;
            }
        }
        throw new AssertionError("cell not found " + ref + " " + key);
    }

    private static Map<String, Object> source(Map<String, Object> out, String ref) {
        for (Map<String, Object> s : list(out.get("sources"))) {
            if (ref.equals(s.get("ref"))) {
                return s;
            }
        }
        throw new AssertionError("source not found " + ref);
    }

    private static boolean hasWarning(Map<String, Object> c, String code) {
        for (Map<String, Object> w : list(c.get("warnings"))) {
            if (code.equals(w.get("code"))) {
                return true;
            }
        }
        return false;
    }

    private static Sheet sheet(XSSFWorkbook wb) {
        return wb.getSheet(BoardSourceFixture.SHEET);
    }

    // ── 값·환산 ──

    @Test
    public void A_출연금은_계_열_710을_억원으로() throws Exception {
        Map<String, Object> out = run(null);
        Map<String, Object> c = cell(out, "A", "r1c2");
        assertEquals("7.10", c.get("value"));
        assertEquals("filled", c.get("status"));
        assertNull(c.get("reason"));
        assertEquals(1, c.get("part_count"));
        assertEquals("710", map(c.get("convert")).get("sum"));
        assertEquals("7.10", map(c.get("convert")).get("result"));
        assertEquals("K8", map(c.get("source")).get("cell"));
        assertEquals("15.10", cell(out, "A", "r2c1").get("value"));      // 총비용(B) 행 1510
    }

    @Test
    public void A_전산은_두_행을_합산한다() throws Exception {
        Map<String, Object> c = cell(run(null), "A", "r3c1");
        assertEquals("35.20", c.get("value"));                             // 1710 + 1810
        assertEquals(2, c.get("part_count"));
        assertEquals("K18", list(c.get("parts")).get(0).get("cell"));
        assertEquals("K19", list(c.get("parts")).get(1).get("cell"));
    }

    @Test
    public void A_합계는_표시값의_합이고_관계를_싣는다() throws Exception {
        Map<String, Object> out = run(null);
        assertEquals("57.40", cell(out, "A", "r4c1").get("value"));
        List<Map<String, Object>> sums = list(table(out, "A").get("sums"));
        assertEquals(1, sums.size());
        assertEquals("r4c1", sums.get(0).get("total"));
        assertEquals(Arrays.asList("r1c2", "r2c1", "r3c1"), sums.get(0).get("of"));
    }

    @Test
    public void 기관명은_직접_입력_칸이다() throws Exception {
        Map<String, Object> out = run(null);
        Map<String, Object> c = cell(out, "A", "r1c0");
        assertEquals("manual", c.get("status"));
        assertEquals("MANUAL_INPUT", c.get("reason"));
        assertEquals("", c.get("value"));
        assertEquals(1, map(out.get("summary")).get("manual"));
    }

    @Test
    public void B_괄호_병기는_값_두_개를_따로_준다() throws Exception {
        Map<String, Object> c = cell(run(null), "B", "r1c5");
        assertEquals("7.10 (15.10)", c.get("value"));
        assertEquals("7.10", c.get("main_value"));
        assertEquals("15.10", c.get("sub_value"));
    }

    @Test
    public void B_합산_칸은_부품_둘을_더한_뒤_환산한다() throws Exception {
        Map<String, Object> c = cell(run(null), "B", "r2c1");
        assertEquals("22.20", c.get("value"));
        assertEquals(2, c.get("part_count"));
        assertEquals("2220", map(c.get("convert")).get("sum"));
    }

    @Test
    public void 합산한_뒤_100으로_한_번만_나눈다() throws Exception {
        Map<String, Object> out = run(wb -> {
            sheet(wb).getRow(17).getCell(10).setCellValue(0.4);
            sheet(wb).getRow(18).getCell(10).setCellValue(0.1);
        });
        assertEquals("0.01", cell(out, "A", "r3c1").get("value"));         // 개별 반올림이면 0.00
    }

    @Test
    public void C4_판단_값() throws Exception {
        Map<String, Object> out = run(null);
        assertEquals("4", cell(out, "C-4", "r1c1").get("value"));
        assertEquals("1.23", cell(out, "C-4", "r2c1").get("value"));
        assertEquals("7", cell(out, "C-4", "r3c1").get("value"));
    }

    @Test
    public void 지도가_쓰지_않는_5년_열의_값은_응답에_없다() throws Exception {
        String json = JSON.writeValueAsString(run(null));
        assertFalse(json.contains(String.valueOf(BoardSourceFixture.BIG)));
    }

    // ── 빈 칸·오류 ──

    @Test
    public void 부품_칸이_비면_failed이고_합계도_failed() throws Exception {
        Map<String, Object> out = run(wb -> {
            Row r = sheet(wb).getRow(7);
            r.removeCell(r.getCell(10));
        });
        Map<String, Object> c = cell(out, "A", "r1c2");
        assertEquals("failed", c.get("status"));
        assertEquals("PART_EMPTY", c.get("reason"));
        assertEquals("", c.get("value"));
        Map<String, Object> sum = cell(out, "A", "r4c1");
        assertEquals("failed", sum.get("status"));
        assertEquals("PART_FAILED", sum.get("reason"));                   // 0 으로 치지 않는다
    }

    @Test
    public void 캐시값이_없는_수식은_failed() throws Exception {
        Map<String, Object> out = run(wb -> {
            org.apache.poi.ss.usermodel.Cell cell = sheet(wb).getRow(7).getCell(10);
            cell.setCellFormula("1+1");
            ((org.apache.poi.xssf.usermodel.XSSFCell) cell).getCTCell().unsetV();   // 이전 캐시 값이 남으면 값이 있는 것으로 읽힌다
        });
        Map<String, Object> c = cell(out, "A", "r1c2");
        assertEquals("failed", c.get("status"));
        assertEquals("NO_CACHED_VALUE", c.get("reason"));
    }

    // ── 위치 찾기 실패 ──

    @Test
    @SuppressWarnings("unchecked")
    public void 행_라벨이_달라지면_그_칸만_ROW_NOT_FOUND_업로드_글자는_싣지_않는다() throws Exception {
        Map<String, Object> out = run(wb -> sheet(wb).getRow(7).getCell(0).setCellValue("총수익(Z)"));
        Map<String, Object> c = cell(out, "A", "r1c2");
        assertEquals("failed", c.get("status"));
        assertEquals("ROW_NOT_FOUND", c.get("reason"));
        Map<String, Object> t = table(out, "A");
        assertEquals("partial", t.get("label_state"));
        assertEquals(true, t.get("needs_review"));
        Map<String, Object> first = list(t.get("lookup_errors")).get(0);
        assertEquals("detail", first.get("area"));
        assertEquals("rev", first.get("row_id"));
        assertEquals("ROW_NOT_FOUND", first.get("code"));
        assertFalse(JSON.writeValueAsString(out).contains("총수익(Z)"));
        assertEquals("filled", cell(out, "A", "r2c1").get("status"));      // 다른 칸은 그대로
    }

    @Test
    public void 같은_라벨이_두_행이면_ROW_AMBIGUOUS() throws Exception {
        Map<String, Object> out = run(wb -> sheet(wb).getRow(15).getCell(0).setCellValue("총수익(A)"));
        assertEquals("ROW_AMBIGUOUS", cell(out, "A", "r1c2").get("reason"));
    }

    @Test
    public void 구역_제목이_달라지면_그_구역을_쓰는_표_전체가_failed() throws Exception {
        Map<String, Object> out = run(wb -> sheet(wb).getRow(5).getCell(0).setCellValue("2.세부 산출서"));
        assertEquals("AREA_NOT_FOUND", cell(out, "A", "r1c2").get("reason"));
        assertEquals("failed", table(out, "A").get("label_state"));
        assertEquals("failed", table(out, "B").get("label_state"));
        assertEquals("ok", table(out, "C-4").get("label_state"));
        assertEquals("filled", cell(out, "C-4", "r2c1").get("status"));
    }

    @Test
    public void 시트가_없으면_구조_오류() throws Exception {
        try (XlsxBook b = BoardSourceFixture.open(BoardSourceFixture.book(wb -> wb.setSheetName(0, "다른시트")))) {
            List<Map<String, Object>> reasons =
                    BoardExcelFill.structure(b, BoardNamedMapFixture.map(), Arrays.asList("A", "C-4"));
            assertEquals(2, reasons.size());
            assertEquals("SHEET_MISSING", reasons.get(0).get("code"));
            assertEquals("A", reasons.get(0).get("ref"));
        }
    }

    // ── 단위·숨김 ──

    @Test
    public void 제목_행의_단위가_다르면_review와_UNIT_MISMATCH() throws Exception {
        Map<String, Object> out = run(wb -> sheet(wb).getRow(5).getCell(11).setCellValue("(단위:천원)"));
        Map<String, Object> c = cell(out, "A", "r1c2");
        assertEquals("review", c.get("status"));
        assertTrue(hasWarning(c, "UNIT_MISMATCH"));
        assertEquals("filled", cell(out, "C-4", "r2c1").get("status"));    // 다른 구역은 영향 없음
    }

    @Test
    public void 제목_행에_단위가_없으면_UNIT_UNKNOWN_경고만() throws Exception {
        Map<String, Object> out = run(wb -> {
            Row r = sheet(wb).getRow(5);
            r.removeCell(r.getCell(11));
        });
        Map<String, Object> c = cell(out, "A", "r1c2");
        assertEquals("filled", c.get("status"));
        assertTrue(hasWarning(c, "UNIT_UNKNOWN"));
    }

    @Test
    public void 숨은_행은_경고만_하고_값은_채운다() throws Exception {
        Map<String, Object> out = run(wb -> sheet(wb).getRow(7).setZeroHeight(true));
        Map<String, Object> c = cell(out, "A", "r1c2");
        assertEquals("filled", c.get("status"));
        assertEquals("7.10", c.get("value"));
        assertTrue(hasWarning(c, "HIDDEN_ROW"));
    }

    @Test
    public void 가정으로_둔_단위는_assumptions에_싣는다() throws Exception {
        Map<String, Object> out = run(null);
        List<Map<String, Object>> a = list(out.get("assumptions"));
        assertEquals(1, a.size());                                        // judge 만 unit_assumed:true, detail 은 확정
        assertEquals("UNIT_ASSUMED", a.get(0).get("code"));
        assertEquals("judge", a.get(0).get("area"));
    }

    // ── 원본 격자 ──

    @Test
    public void 출처_격자는_A열부터_싣고_omitted가_false() throws Exception {
        Map<String, Object> out = run(null);
        for (String ref : new String[]{"A", "B", "C-4"}) {
            Map<String, Object> s = source(out, ref);
            assertEquals(false, s.get("omitted"));
            assertEquals("A", ((List<?>) s.get("cols")).get(0));
        }
        List<?> unmapped = (List<?>) out.get("unmapped_tables");
        assertTrue(unmapped.contains("C-2"));
        assertTrue(unmapped.contains("C-3"));
    }

    @Test
    public void 출처_격자는_지도가_쓰지_않는_열과_숨은_행의_값을_가린다() throws Exception {
        Map<String, Object> out = run(null);
        List<?> rows = (List<?>) source(out, "A").get("rows");
        List<?> second = (List<?>) rows.get(1);                            // r8 — 구분 열 글자는 보인다
        assertEquals("수익", second.get(0));
        assertEquals("", second.get(4));                                   // 사업초기 열(안 씀)은 가림
        assertEquals("710", ((List<?>) rows.get(0)).get(10));              // 쓴 칸(계 열)은 보인다

        Map<String, Object> hidden = run(wb -> sheet(wb).getRow(8).setZeroHeight(true));
        List<?> hiddenRow = (List<?>) ((List<?>) source(hidden, "A").get("rows")).get(1);
        for (Object v : hiddenRow) {
            assertEquals("", v);                                           // 쓰지 않은 숨은 행은 통째로 가림
        }
    }

    // ── 개인정보 검사(소수 원값 오탐) ──

    @Test
    public void 소수_원값의_소수부는_휴대폰으로_보지_않는다() throws Exception {
        byte[] data = BoardSourceFixture.book(wb -> {
            CellStyle st = wb.createCellStyle();
            st.setDataFormat(wb.createDataFormat().getFormat("0.00"));
            Cell c = sheet(wb).getRow(2).getCell(1);
            c.setCellValue(0.01012345678);                                 // 원값 소수부가 010-1234-5678 모양, 표시값은 0.01
            c.setCellStyle(st);
        });
        try (XlsxBook b = BoardSourceFixture.open(data)) {
            assertTrue(b.scanPii().isEmpty());
        }
    }
}
