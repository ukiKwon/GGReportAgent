package com.kbstar.kgi.ggreport.web.boarddoc;

import com.kbstar.kgi.ggreport.web.docfill.XlsxBook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import static com.kbstar.kgi.ggreport.web.boarddoc.BoardStructureFixture.aWithNewRowAt3;
import static com.kbstar.kgi.ggreport.web.boarddoc.BoardStructureFixture.base;
import static com.kbstar.kgi.ggreport.web.boarddoc.BoardStructureFixture.cols;
import static com.kbstar.kgi.ggreport.web.boarddoc.BoardStructureFixture.edit;
import static com.kbstar.kgi.ggreport.web.boarddoc.BoardStructureFixture.rebuild;
import static com.kbstar.kgi.ggreport.web.boarddoc.BoardStructureFixture.rows;
import static com.kbstar.kgi.ggreport.web.boarddoc.BoardStructureFixture.setRowspan;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** 엑셀 채우기·작성 모드는 양식에 남은 연결 칸만 처리한다(없는 key 건너뜀, unlinked_count, derive_sum 부품 제외, 합계 범위의 입력 칸). */
public class BoardStructureFillTest {

    private static Map<String, Object> named(BoardDocSpec.Doc doc) throws Exception {
        Consumer<XSSFWorkbook> withUnit =
                wb -> wb.getSheet(BoardSourceFixture.SHEET).getRow(5).createCell(11).setCellValue("(단위: 백만원)");
        try (XlsxBook b = BoardSourceFixture.open(BoardSourceFixture.book(withUnit))) {
            return BoardExcelFill.fill(b, BoardNamedMapFixture.map(), doc);
        }
    }

    private static Map<String, Object> legacy(BoardDocSpec.Doc doc) throws Exception {
        try (XlsxBook b = XlsxBook.open(BoardExcelFixture.xlsx(null), BoardSourceFixture.LIMITS)) {
            return BoardExcelFill.fill(b, BoardExcelFixture.legacyMap(), doc);
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
        return null;
    }

    private static boolean hasWarning(Map<String, Object> c, String code) {
        for (Map<String, Object> w : list(c.get("warnings"))) {
            if (code.equals(w.get("code"))) {
                return true;
            }
        }
        return false;
    }

    /** 표 A 에서 r2(예비비) 행을 지운 구조(위쪽 병합은 한 칸씩 줄인다). */
    private static BoardDocSpec.Doc withoutR2() {
        BoardDocSpec.Doc b = base();
        BoardDocSpec.Table a = BoardStructureFixture.table(b, "A");
        List<BoardDocSpec.RowEdit> rows = rows(a);
        rows.remove(2);
        setRowspan(rows, "r1", "c0", 3);
        setRowspan(rows, "r1", "c3", 2);
        return rebuild(b, edit("A", cols(a), rows));
    }

    /** 표 A 에서 r1~r3 을 모두 지워 합계(r4)만 남긴 구조. */
    private static BoardDocSpec.Doc totalOnly() {
        BoardDocSpec.Doc b = base();
        BoardDocSpec.Table a = BoardStructureFixture.table(b, "A");
        List<BoardDocSpec.RowEdit> src = rows(a);
        List<BoardDocSpec.CellEdit> r4 = new ArrayList<>(src.get(4).getCells());
        r4.add(0, BoardStructureFixture.cell("c0", "구분", 1, 1, false, false));        // 지운 행이 쥐고 있던 0열 병합 자리를 직접 채운다
        List<BoardDocSpec.RowEdit> rows = new ArrayList<>();
        rows.add(src.get(0));
        rows.add(new BoardDocSpec.RowEdit("r4", r4));
        return rebuild(b, edit("A", cols(a), rows));
    }

    @Test
    public void 없는_key는_건너뛰고_unlinked_count를_알리며_합계는_남은_부품만_합산한다() throws Exception {
        Map<String, Object> full = named(base());
        assertEquals(0, table(full, "A").get("unlinked_count"));
        assertEquals("57.40", cell(full, "A", "r4_c2").get("value"));

        Map<String, Object> out = named(withoutR2());
        assertNull(cell(out, "A", "r2_c2"));                                         // 지운 행의 연결 칸은 평가하지 않는다
        assertEquals("7.10", cell(out, "A", "r1_c2").get("value"));
        assertEquals("35.20", cell(out, "A", "r3_c2").get("value"));
        assertEquals(1, table(out, "A").get("unlinked_count"));
        assertEquals("42.30", cell(out, "A", "r4_c2").get("value"));                 // 7.10 + 35.20, 지운 15.10 은 빠진다
        assertEquals("filled", cell(out, "A", "r4_c2").get("status"));
        assertEquals(Arrays.asList("r1_c2", "r3_c2"), map(cell(out, "A", "r4_c2").get("convert")).get("of"));
        List<Map<String, Object>> sums = list(table(out, "A").get("sums"));
        assertEquals(1, sums.size());
        assertEquals(Arrays.asList("r1_c2", "r3_c2"), sums.get(0).get("of"));
        // summary.total 에 안 센다
        assertEquals((Integer) map(full.get("summary")).get("total") - 1, map(out.get("summary")).get("total"));
        assertEquals(0, table(out, "B").get("unlinked_count"));
    }

    @Test
    public void 합계의_부품이_하나도_안_남으면_manual이다() throws Exception {
        Map<String, Object> out = named(totalOnly());
        assertEquals(3, table(out, "A").get("unlinked_count"));                      // r1_c2, r2_c2, r3_c2 (기관명 r1_c0 은 연결 칸이 아니다)
        assertNull(cell(out, "A", "r1_c2"));
        Map<String, Object> total = cell(out, "A", "r4_c2");
        assertEquals("manual", total.get("status"));
        assertEquals("MANUAL_INPUT", total.get("reason"));
        assertEquals("", total.get("value"));
        assertTrue(list(table(out, "A").get("sums")).isEmpty());
        assertEquals(1, list(table(out, "A").get("cells")).size());                  // 남은 연결 칸은 합계 칸 하나뿐
    }

    @Test
    public void 합계_범위_안의_사용자_입력_칸은_sums_of에_들어가고_경고와_review가_된다() throws Exception {
        BoardDocSpec.Doc b = base();
        BoardDocSpec.Doc d = rebuild(b, edit("A", cols(BoardStructureFixture.table(b, "A")), aWithNewRowAt3()));
        Map<String, Object> full = named(b);
        Map<String, Object> out = named(d);
        Map<String, Object> total = cell(out, "A", "r4_c2");
        assertEquals("57.40", total.get("value"));                                   // 서버는 입력 칸 값을 모르므로 엑셀 부품만의 합
        assertEquals("review", total.get("status"));
        assertTrue(hasWarning(total, "SUM_HAS_MANUAL_PARTS"));
        assertEquals(Arrays.asList("r1_c2", "r2_c2", "r3_c2", "r100_c2"), list(table(out, "A").get("sums")).get(0).get("of"));
        assertNull(cell(out, "A", "r100_c2"));                                       // 입력 칸은 엑셀 칸이 아니다
        assertEquals(map(full.get("summary")).get("total"), map(out.get("summary")).get("total"));
        assertEquals(0, table(out, "A").get("unlinked_count"));
    }

    @Test
    public void 합계_범위_밖의_입력_칸은_영향이_없다() throws Exception {
        // 합계 행(r4) 아래에 새 행(입력 칸)을 두면 합계 범위 밖
        BoardDocSpec.Doc b = base();
        BoardDocSpec.Table a = BoardStructureFixture.table(b, "A");
        List<BoardDocSpec.RowEdit> rows = rows(a);
        setRowspan(rows, "r1", "c0", 4);
        rows.add(new BoardDocSpec.RowEdit(null, new ArrayList<>(Arrays.asList(
                BoardStructureFixture.cell("c0", "참고", 1, 1, false, false),
                BoardStructureFixture.cell("c1", "참고 항목", 1, 1, false, false),
                BoardStructureFixture.cell("c2", "", 1, 1, false, true),
                BoardStructureFixture.cell("c3", "", 1, 1, false, false)))));
        Map<String, Object> out = named(rebuild(b, edit("A", cols(a), rows)));
        Map<String, Object> total = cell(out, "A", "r4_c2");
        assertEquals("filled", total.get("status"));
        assertFalse(hasWarning(total, "SUM_HAS_MANUAL_PARTS"));
        assertEquals(Arrays.asList("r1_c2", "r2_c2", "r3_c2"), list(table(out, "A").get("sums")).get(0).get("of"));
    }

    @Test
    public void 옛_형식_지도도_남은_연결_칸만_읽고_부품이_줄면_합계_검산을_건너뛴다() throws Exception {
        Map<String, Object> out = legacy(withoutR2());
        assertNull(cell(out, "A", "r2_c2"));
        assertEquals(1, table(out, "A").get("unlinked_count"));
        Map<String, Object> total = cell(out, "A", "r4_c2");
        assertFalse(hasWarning(total, "SUM_MISMATCH"));                              // 부품을 지웠으니 엑셀 합계와 달라도 오경고하지 않는다
        assertEquals(Arrays.asList("r1_c2", "r3_c2"), list(table(out, "A").get("sums")).get(0).get("of"));

        BoardDocSpec.Doc b = base();
        BoardDocSpec.Doc d = rebuild(b, edit("A", cols(BoardStructureFixture.table(b, "A")), aWithNewRowAt3()));
        Map<String, Object> out2 = legacy(d);
        Map<String, Object> total2 = cell(out2, "A", "r4_c2");
        assertTrue(hasWarning(total2, "SUM_HAS_MANUAL_PARTS"));
        assertEquals("review", total2.get("status"));
        assertEquals(Arrays.asList("r1_c2", "r2_c2", "r3_c2", "r100_c2"), list(table(out2, "A").get("sums")).get(0).get("of"));
    }
}
