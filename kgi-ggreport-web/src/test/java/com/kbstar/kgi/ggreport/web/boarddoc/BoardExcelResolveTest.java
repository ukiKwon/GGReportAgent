package com.kbstar.kgi.ggreport.web.boarddoc;

import com.kbstar.kgi.ggreport.web.boarddoc.BoardExcelResolve.Area;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardExcelResolve.Located;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardExcelResolve.RowDef;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardExcelResolve.RowHit;
import com.kbstar.kgi.ggreport.web.docfill.XlsxBook;
import org.apache.poi.ss.usermodel.Sheet;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class BoardExcelResolveTest {

    private static Map<String, String> yearCols() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("init", "사업초기");
        m.put("y1", "1년");
        m.put("y2", "2년");
        m.put("y3", "3년");
        m.put("y4", "4년");
        m.put("tot", "계");          // 5년 열은 정의하지 않는다
        return m;
    }

    private static Area detail(RowDef... defs) {
        return new Area("detail", BoardSourceFixture.SHEET, "2.세부 산출표", "3.투자*",
                Arrays.asList("사업초기", "계"), yearCols(), Arrays.asList(defs));
    }

    private static String raw(XlsxBook b, String sheet, Located l, String row, String col) {
        return b.value(b.sheet(sheet), l.rows.get(row).rows.get(0), l.cols.get(col)).raw;
    }

    private static void assertRow(Located l, String id, int... rows) {
        RowHit h = l.rows.get(id);
        assertNull(id + " error", h.error);
        assertEquals(rows.length, h.rows.size());
        for (int i = 0; i < rows.length; i++) {
            assertEquals(Integer.valueOf(rows[i]), h.rows.get(i));
        }
    }

    // ---- 정상 경로 ----

    @Test
    public void findsRowsByPathTailAndSkipsSummaryDecoy() throws Exception {
        byte[] data = BoardSourceFixture.book(null);
        try (XlsxBook b = BoardSourceFixture.open(data)) {
            Located l = BoardExcelResolve.locate(b, detail(
                    RowDef.of("rev", 1, "총수익(A)"),
                    RowDef.of("pub_rev", 1, "공금예금(a)", "수익"),
                    RowDef.of("pub_profit", 1, "공금예금(a)", "이익"),
                    RowDef.of("inst_sub", 1, "기관수익", "소계"),
                    RowDef.of("rev_sub", 1, "수익", "소계"),
                    RowDef.of("cost", 1, "총비용(B)"),
                    RowDef.of("op", 1, "영업이익(C)")));
            assertTrue(l.ok());
            assertRow(l, "rev", 7);
            assertRow(l, "pub_rev", 8);
            assertRow(l, "pub_profit", 9);
            assertRow(l, "inst_sub", 10);
            assertRow(l, "rev_sub", 14);
            assertRow(l, "cost", 15);
            assertRow(l, "op", 16);                       // '영업이익(C) = (A)-(B)' 수식 꼬리 무시
            assertEquals("710", raw(b, BoardSourceFixture.SHEET, l, "rev", "tot"));
            assertEquals("704", raw(b, BoardSourceFixture.SHEET, l, "rev", "init"));
            assertEquals("1405", raw(b, BoardSourceFixture.SHEET, l, "rev_sub", "y1"));
        }
    }

    @Test
    public void fiveYearColumnIsNeverRead() throws Exception {
        try (XlsxBook b = BoardSourceFixture.open(BoardSourceFixture.book(null))) {
            Located l = BoardExcelResolve.locate(b, detail(RowDef.of("rev", 1, "총수익(A)")));
            assertFalse(l.cols.containsKey("y5"));
            assertEquals(6, l.cols.size());
            for (Integer col : l.cols.values()) {
                assertNotEquals(9, col.intValue());       // J 열 = 5년
                assertNotEquals(String.valueOf(BoardSourceFixture.BIG),
                        b.value(b.sheet(BoardSourceFixture.SHEET), 7, col).raw);
            }
        }
    }

    @Test
    public void columnOrderChangeIsFollowedByName() throws Exception {
        String[] reversed = {"계", "5년", "4년", "3년", "2년", "1년", "사업초기"};
        try (XlsxBook b = BoardSourceFixture.open(BoardSourceFixture.book(reversed, null))) {
            Located l = BoardExcelResolve.locate(b, detail(RowDef.of("rev", 1, "총수익(A)")));
            assertTrue(l.ok());
            assertEquals(Integer.valueOf(4), l.cols.get("tot"));
            assertEquals(Integer.valueOf(10), l.cols.get("init"));
            assertEquals("704", raw(b, BoardSourceFixture.SHEET, l, "rev", "tot"));
            assertEquals("710", raw(b, BoardSourceFixture.SHEET, l, "rev", "init"));
        }
    }

    @Test
    public void duplicateColumnNameFails() throws Exception {
        String[] dup = {"사업초기", "1년", "2년", "3년", "4년", "계", "계"};
        try (XlsxBook b = BoardSourceFixture.open(BoardSourceFixture.book(dup, null))) {
            Located l = BoardExcelResolve.locate(b, detail(RowDef.of("rev", 1, "총수익(A)")));
            assertEquals("COL_AMBIGUOUS", l.error);
            assertEquals("tot", l.ref);
            assertTrue(l.rows.isEmpty());
        }
    }

    @Test
    public void missingColumnFails() throws Exception {
        String[] noTotal = {"사업초기", "1년", "2년", "3년", "4년", "5년", "합"};
        Area a = new Area("detail", BoardSourceFixture.SHEET, "2.세부 산출표", "3.투자*",
                Collections.singletonList("사업초기"), yearCols(), Collections.singletonList(RowDef.of("rev", 1, "총수익(A)")));
        try (XlsxBook b = BoardSourceFixture.open(BoardSourceFixture.book(noTotal, null))) {
            Located l = BoardExcelResolve.locate(b, a);
            assertEquals("COL_NOT_FOUND", l.error);
            assertEquals("tot", l.ref);
        }
    }

    // ---- 행 모호·개수 ----

    @Test
    public void repeatedLabelsAreAmbiguousUntilPathDisambiguates() throws Exception {
        try (XlsxBook b = BoardSourceFixture.open(BoardSourceFixture.book(null))) {
            Located l = BoardExcelResolve.locate(b, detail(
                    RowDef.of("sub_any", 1, "소계"),            // 10, 13, 14
                    RowDef.of("profit_any", 1, "이익"),         // 9, 12
                    RowDef.of("rev_any", 1, "수익"),            // 8, 11
                    RowDef.of("emp_sub", 1, "임직원", "이익"),  // 12 만
                    RowDef.of("none", 1, "없는행")));
            assertEquals("ROW_AMBIGUOUS", l.rows.get("sub_any").error);
            assertEquals(3, l.rows.get("sub_any").found);
            assertTrue(l.rows.get("sub_any").rows.isEmpty());
            assertEquals("ROW_AMBIGUOUS", l.rows.get("profit_any").error);
            assertEquals("ROW_AMBIGUOUS", l.rows.get("rev_any").error);
            assertRow(l, "emp_sub", 12);
            assertEquals("ROW_NOT_FOUND", l.rows.get("none").error);
        }
    }

    @Test
    public void countMustMatchExactly() throws Exception {
        try (XlsxBook b = BoardSourceFixture.open(BoardSourceFixture.book(null))) {
            Located l = BoardExcelResolve.locate(b, detail(
                    RowDef.of("two", 2, "인건비", "본부부서 인건비"),
                    RowDef.of("one", 1, "인건비", "본부부서 인건비"),
                    RowDef.of("four", 4, "인건비", "본부부서 인건비"),
                    RowDef.of("gone", 2, "인건비", "없는행")));
            assertRow(l, "two", 17, 18);
            assertEquals("ROW_AMBIGUOUS", l.rows.get("one").error);
            assertEquals("ROW_COUNT_MISMATCH", l.rows.get("four").error);
            assertEquals(2, l.rows.get("four").found);
            assertEquals("ROW_NOT_FOUND", l.rows.get("gone").error);
        }
    }

    @Test
    public void prefixStarAndAliasInPath() throws Exception {
        try (XlsxBook b = BoardSourceFixture.open(BoardSourceFixture.book(null))) {
            Located l = BoardExcelResolve.locate(b, detail(
                    RowDef.of("star", 1, "기관*", "소계"),
                    RowDef.of("alias", 1, "임직원|직원", "이익"),
                    RowDef.of("nostar", 1, "기관", "소계")));
            assertRow(l, "star", 10);
            assertRow(l, "alias", 12);
            assertEquals("ROW_NOT_FOUND", l.rows.get("nostar").error);     // '기관' ≠ '기관수익'
        }
    }

    @Test
    public void pathLongerThanActualDoesNotMatch() throws Exception {
        try (XlsxBook b = BoardSourceFixture.open(BoardSourceFixture.book(null))) {
            Located l = BoardExcelResolve.locate(b, detail(
                    RowDef.of("long", 1, "합계", "총수익(A)")));
            assertEquals("ROW_NOT_FOUND", l.rows.get("long").error);
        }
    }

    // ---- 구역 ----

    @Test
    public void titleTwiceIsAmbiguousAndMissingIsNotFound() throws Exception {
        byte[] twice = BoardSourceFixture.book(wb -> BoardSourceFixture.text(wb.getSheet(BoardSourceFixture.SHEET), 30, 0, "2. 세부 산출표"));
        try (XlsxBook b = BoardSourceFixture.open(twice)) {
            assertEquals("AREA_AMBIGUOUS", BoardExcelResolve.locate(b, detail(RowDef.of("rev", 1, "총수익(A)"))).error);
        }
        try (XlsxBook b = BoardSourceFixture.open(BoardSourceFixture.book(null))) {
            Area none = new Area("x", BoardSourceFixture.SHEET, "9.없는표", null, Collections.<String>emptyList(),
                    yearCols(), Collections.singletonList(RowDef.of("rev", 1, "총수익(A)")));
            assertEquals("AREA_NOT_FOUND", BoardExcelResolve.locate(b, none).error);
            Area noSheet = new Area("x", "없는시트", "2.세부 산출표", null, Collections.<String>emptyList(),
                    yearCols(), Collections.singletonList(RowDef.of("rev", 1, "총수익(A)")));
            assertEquals("SHEET_MISSING", BoardExcelResolve.locate(b, noSheet).error);
        }
    }

    @Test
    public void headerNotFoundWhenHeaderHasMissing() throws Exception {
        Area a = new Area("detail", BoardSourceFixture.SHEET, "2.세부 산출표", "3.투자*",
                Arrays.asList("사업초기", "없는머리"), yearCols(), Collections.singletonList(RowDef.of("rev", 1, "총수익(A)")));
        try (XlsxBook b = BoardSourceFixture.open(BoardSourceFixture.book(null))) {
            assertEquals("HEADER_NOT_FOUND", BoardExcelResolve.locate(b, a).error);
        }
    }

    @Test
    public void errorsCarryNoUploadedText() throws Exception {
        try (XlsxBook b = BoardSourceFixture.open(BoardSourceFixture.book(null))) {
            Located l = BoardExcelResolve.locate(b, detail(RowDef.of("sub_any", 1, "소계")));
            String all = l.rows.get("sub_any").error + l.rows.get("sub_any").id + l.areaId + l.error + l.ref;
            assertFalse(all.contains("기관수익"));
            assertFalse(all.contains("공금예금"));
        }
    }

    @Test
    public void judgeTableFindsValueRowBelowHeaderWithSpacingAlias() throws Exception {
        Map<String, String> cols = new LinkedHashMap<>();
        cols.put("pb", "회수기간법");
        cols.put("npv", "순현재가치(NPV)");          // 원본 머리는 '순 현재가치(NPV)'
        cols.put("irr", "내부수익률법");
        Area a = new Area("judge", BoardSourceFixture.SHEET, "3-1.판단 기준표", "3-2*",
                Arrays.asList("회수기간법", "순현재가치(NPV)"), cols, Collections.singletonList(RowDef.below("v", 1)));
        try (XlsxBook b = BoardSourceFixture.open(BoardSourceFixture.book(null))) {
            Located l = BoardExcelResolve.locate(b, a);
            assertTrue(l.ok());
            assertEquals(Integer.valueOf(1), l.cols.get("npv"));
            assertRow(l, "v", 23);
            assertEquals("123", raw(b, BoardSourceFixture.SHEET, l, "v", "npv"));
            assertEquals("4", raw(b, BoardSourceFixture.SHEET, l, "v", "pb"));
        }
    }

    @Test
    public void calcTableWithTwoLabelColumns() throws Exception {
        Area a = new Area("calc", BoardSourceFixture.SHEET, "3-2.회수 기간 계산", null,
                Arrays.asList("사업초기", "계"), yearCols(),
                Arrays.asList(RowDef.of("rev_pv", 1, "총수익 현가(A)"), RowDef.of("cost_pv", 1, "총비용 현가(B)")));
        try (XlsxBook b = BoardSourceFixture.open(BoardSourceFixture.book(null))) {
            Located l = BoardExcelResolve.locate(b, a);
            assertTrue(l.ok());
            assertRow(l, "rev_pv", 27);
            assertRow(l, "cost_pv", 28);
            assertEquals(Integer.valueOf(8), l.cols.get("tot"));
            assertEquals("2708", raw(b, BoardSourceFixture.SHEET, l, "rev_pv", "tot"));
            assertEquals("2802", raw(b, BoardSourceFixture.SHEET, l, "cost_pv", "init"));
        }
    }

    // ---- 숨김 ----

    @Test
    public void hiddenRowTitleHeaderAndColumnAreFlagged() throws Exception {
        byte[] data = BoardSourceFixture.book(wb -> {
            Sheet s = wb.getSheet(BoardSourceFixture.SHEET);
            s.getRow(8).setZeroHeight(true);
            s.getRow(5).setZeroHeight(true);
            s.getRow(6).setZeroHeight(true);
            s.setColumnHidden(10, true);
        });
        try (XlsxBook b = BoardSourceFixture.open(data)) {
            Located l = BoardExcelResolve.locate(b, detail(
                    RowDef.of("hidden_row", 1, "공금예금(a)", "수익"),
                    RowDef.of("shown_row", 1, "공금예금(a)", "이익")));
            assertTrue(l.ok());
            assertTrue(l.titleHidden);
            assertTrue(l.headerHidden);
            assertTrue(l.hiddenCols.contains("tot"));
            assertFalse(l.hiddenCols.contains("init"));
            assertTrue(l.rows.get("hidden_row").hidden);
            assertFalse(l.rows.get("shown_row").hidden);
        }
    }

    @Test
    public void nothingHiddenByDefault() throws Exception {
        try (XlsxBook b = BoardSourceFixture.open(BoardSourceFixture.book(null))) {
            Located l = BoardExcelResolve.locate(b, detail(RowDef.of("rev", 1, "총수익(A)")));
            assertFalse(l.titleHidden || l.headerHidden || l.sheetHidden);
            assertTrue(l.hiddenCols.isEmpty());
            assertFalse(l.rows.get("rev").hidden);
        }
    }

    // ---- 병합 ----

    private static Area simpleArea() {
        Map<String, String> cols = new LinkedHashMap<>();
        cols.put("init", "사업초기");
        cols.put("tot", "계");
        return new Area("s", "S", "2.세부 산출표", null, Collections.singletonList("사업초기"), cols,
                Arrays.asList(RowDef.of("b", 1, "나"), RowDef.of("top", 1, "가")));
    }

    @Test
    public void hugeVerticalMergeIsClippedAndInherited() throws Exception {
        try (XlsxBook b = BoardSourceFixture.open(BoardSourceFixture.simple(true, null))) {
            Located l = BoardExcelResolve.locate(b, simpleArea());
            assertTrue(l.ok());
            assertRow(l, "b", 3);
            assertRow(l, "top", 2);
            assertEquals("303", raw(b, "S", l, "b", "tot"));
            // 거대 병합을 상속해도 '수익' 경로가 두 번째 구분 열 앞에 붙는다
            Located l2 = BoardExcelResolve.locate(b, new Area("s", "S", "2.세부 산출표", null,
                    Collections.singletonList("사업초기"), colsOf(),
                    Collections.singletonList(RowDef.of("inh", 1, "수익", "다"))));
            assertRow(l2, "inh", 4);
        }
    }

    private static Map<String, String> colsOf() {
        Map<String, String> cols = new LinkedHashMap<>();
        cols.put("init", "사업초기");
        cols.put("tot", "계");
        return cols;
    }

    @Test
    public void overlappingMergesFailTheArea() throws Exception {
        byte[] data = BoardSourceFixture.simple(false, wb -> {
            Sheet s = wb.getSheet("S");
            BoardSourceFixture.rawMerge(s, "A3:B4");
            BoardSourceFixture.rawMerge(s, "B4:B5");
        });
        try (XlsxBook b = BoardSourceFixture.open(data)) {
            Located l = BoardExcelResolve.locate(b, simpleArea());
            assertEquals("MERGE_OVERLAP", l.error);
            assertTrue(l.rows.isEmpty());
        }
    }

    @Test
    public void mergeCountLimitRejectsOpen() throws Exception {
        byte[] over = BoardSourceFixture.simple(false, wb -> addMerges(wb.getSheet("S"), XlsxBook.MAX_MERGES + 1));
        try {
            BoardSourceFixture.open(over);
            fail("병합 상한 초과는 열기 거부");
        } catch (XlsxBook.Rejected r) {
            assertEquals(422, r.status);
            assertEquals("TOO_MANY_CELLS", r.code);
        }
        byte[] at = BoardSourceFixture.simple(false, wb -> addMerges(wb.getSheet("S"), XlsxBook.MAX_MERGES));
        try (XlsxBook b = BoardSourceFixture.open(at)) {
            assertTrue(BoardExcelResolve.locate(b, simpleArea()).ok());     // 구분 열 밖의 병합은 영향 없음
        }
    }

    private static void addMerges(Sheet s, int n) {
        for (int i = 1; i <= n; i++) {
            BoardSourceFixture.rawMerge(s, "F" + i + ":G" + i);
        }
    }

    @Test
    public void mergedValueCellsAreReadFromTopLeftOnly() throws Exception {
        // 값 칸(계 열) 세로 병합(엑셀처럼 아래 칸은 비움): 좌상단만 값이 있고 위치 해석은 값 칸에 병합 상속을 하지 않는다.
        byte[] data = BoardSourceFixture.simple(false, wb -> {
            Sheet s = wb.getSheet("S");
            s.getRow(3).removeCell(s.getRow(3).getCell(3));
            BoardSourceFixture.merge(s, 2, 3, 3, 3);
        });
        try (XlsxBook b = BoardSourceFixture.open(data)) {
            Located l = BoardExcelResolve.locate(b, simpleArea());
            assertTrue(l.ok());
            assertEquals("203", raw(b, "S", l, "top", "tot"));
            assertEquals("", b.value(b.sheet("S"), 3, l.cols.get("tot")).raw);
        }
    }
}
