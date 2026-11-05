package com.kbstar.kgi.ggreport.web.boarddoc;

import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class BoardDocSpecTest {

    private static BoardDocSpec.Table table(BoardDocSpec.Doc d, String id) {
        for (BoardDocSpec.Table t : d.getTables()) {
            if (id.equals(t.getId())) {
                return t;
            }
        }
        throw new AssertionError("table not found " + id);
    }

    private static int[] sizes(BoardDocSpec.Table t) {
        int[] out = new int[t.getRows().size()];
        for (int i = 0; i < out.length; i++) {
            out[i] = t.getRows().get(i).size();
        }
        return out;
    }

    @Test
    public void 양식_구조와_없는_id() {
        BoardDocSpec.Doc d = BoardDocSpec.find("default_doc", true);
        assertNotNull(d);
        assertEquals(6, d.getTables().size());
        String[] order = {"A", "B", "C-2", "C-3", "C-4", "C-5"};
        for (int i = 0; i < order.length; i++) {
            assertEquals(order[i], d.getTables().get(i).getId());
        }
        assertNull(BoardDocSpec.find("nope", true));
    }

    @Test
    public void 표A_세로_병합과_확정_샘플값() {
        BoardDocSpec.Table a = table(BoardDocSpec.find("default_doc", true), "A");
        assertEquals(4, a.getColumns());
        assertTrue(Arrays.equals(new int[]{4, 4, 2, 2, 3}, sizes(a)));
        BoardDocSpec.Cell inst = a.getRows().get(1).get(0);
        assertEquals("대한민국 기관", inst.getText());
        assertEquals(4, inst.getRowspan());
        assertTrue(inst.isMapped());
        BoardDocSpec.Cell note = a.getRows().get(1).get(3);
        assertEquals(3, note.getRowspan());
        assertFalse(note.isMapped());
        assertEquals("합계", a.getRows().get(4).get(0).getText());
    }

    @Test
    public void 표B_가로2칸_세로2칸_1열은_빈칸() {
        BoardDocSpec.Table b = table(BoardDocSpec.find("default_doc", true), "B");
        assertEquals(9, b.getColumns());
        assertTrue(Arrays.equals(new int[]{8, 9, 8}, sizes(b)));
        assertEquals(2, b.getRows().get(0).get(0).getColspan());
        BoardDocSpec.Cell first = b.getRows().get(1).get(0);
        assertEquals("", first.getText());
        assertEquals(2, first.getRowspan());
        assertFalse(first.isMapped());
        BoardDocSpec.Cell blankMode = table(BoardDocSpec.find("default_doc", false), "B").getRows().get(1).get(0);
        assertEquals("", blankMode.getText());
        assertFalse(blankMode.isMapped());
    }

    @Test
    public void 표C_크기와_고정문구() {
        BoardDocSpec.Doc d = BoardDocSpec.find("default_doc", true);
        BoardDocSpec.Table c2 = table(d, "C-2");
        BoardDocSpec.Table c3 = table(d, "C-3");
        BoardDocSpec.Table c4 = table(d, "C-4");
        assertEquals(7, c2.getColumns());
        assertEquals(9, c2.getRows().size());
        assertEquals(7, c3.getColumns());                  // CATALOG_VER 2: 사업초기 열 추가
        assertEquals(6, c3.getRows().size());
        assertEquals(Arrays.asList("c0", "c6", "c1", "c2", "c3", "c4", "c5"), c3.getColIds());   // 새 열만 c6, 기존 id 는 그대로
        assertEquals("사업초기", c3.getRows().get(0).get(1).getText());
        assertEquals("r0_c6", c3.getRows().get(0).get(1).getKey());
        assertEquals("r1_c6", c3.getRows().get(1).get(1).getKey());
        assertTrue(c3.getRows().get(1).get(1).isMapped());
        assertEquals("r1_c1", c3.getRows().get(1).get(2).getKey());          // 1년차 칸 key 는 밀리지 않았다
        assertEquals("r1_c5", c3.getRows().get(1).get(6).getKey());          // 계
        assertEquals(3, c4.getColumns());
        assertEquals(4, c4.getRows().size());
        assertEquals(2, c4.getNotes().size());
        assertFalse(c4.getRows().get(1).get(2).isMapped());
        assertTrue(c4.getRows().get(1).get(1).isMapped());
    }

    @Test
    public void 표마다_단위가_제목과_분리되어_있고_편집해도_유지된다() {
        BoardDocSpec.Doc d = BoardDocSpec.find("default_doc", true);
        for (String id : new String[]{"A", "B", "C-2", "C-3", "C-5"}) {
            assertEquals("(단위: 억원)", table(d, id).getUnit());
            assertFalse(table(d, id).getTitle().contains("단위"));
        }
        assertEquals("", table(d, "C-4").getUnit());
        BoardDocSpec.Doc e = BoardDocSpec.build("x", "n",
                java.util.Arrays.asList(new BoardDocSpec.TableEdit("A", "바꾼 제목", null, null)), true);
        assertEquals("(단위: 억원)", table(e, "A").getUnit());
        assertEquals("(단위: 억원)", table(BoardDocSpec.withValues(e, null), "A").getUnit());
    }

    @Test
    public void 빈_양식은_매핑_칸이_모두_비고_샘플은_채워진다() {
        for (boolean sample : new boolean[]{true, false}) {
            BoardDocSpec.Doc d = BoardDocSpec.find("default_doc", sample);
            int mapped = 0;
            for (BoardDocSpec.Table t : d.getTables()) {
                for (List<BoardDocSpec.Cell> row : t.getRows()) {
                    for (BoardDocSpec.Cell c : row) {
                        if (c.isMapped()) {
                            mapped++;
                            assertEquals(sample, !c.getText().isEmpty());
                        }
                    }
                }
            }
            assertTrue(mapped > 0);
        }
    }

    @Test(expected = IllegalStateException.class)
    public void 병합_규칙_위반은_만들때_실패한다() {
        BoardDocSpec.Cell a = new BoardDocSpec.Cell("a", 1, 2, false, false, "left");
        BoardDocSpec.Cell x = new BoardDocSpec.Cell("x", 1, 1, false, false, "left");
        List<List<BoardDocSpec.Cell>> rows = new ArrayList<>();
        rows.add(new ArrayList<>(Arrays.asList(a, x)));
        rows.add(new ArrayList<>(Arrays.asList(x, x)));   // 0열이 a 에 덮여 있어 둘째 x 가 격자 밖
        new BoardDocSpec.Table("X", "X", "x", 2, rows);
    }

    @Test
    public void 모든_칸에_주소표가_붙고_규칙과_같으며_표_안에서_유일하다() {
        for (boolean sample : new boolean[] {true, false}) {
            BoardDocSpec.Doc d = BoardDocSpec.find("default_doc", sample);
            for (BoardDocSpec.Table t : d.getTables()) {
                java.util.Set<String> seen = new java.util.HashSet<>();
                for (int r = 0; r < t.getRows().size(); r++) {
                    for (int i = 0; i < t.getRows().get(r).size(); i++) {
                        String key = t.getRows().get(r).get(i).getKey();
                        assertNotNull(t.getId() + " " + r + "," + i, key);
                        assertTrue(key, BoardDocSpec.isValidCellKey(key));
                        BoardDocSpec.Cell cell = t.getRows().get(r).get(i);
                        assertEquals(BoardDocSpec.cellKey(cell.getRowId(), cell.getColId()), key);
                        assertEquals("r" + r, cell.getRowId());                       // 카탈로그 행 id = r{원래 행번호}
                        assertTrue("중복 " + key, seen.add(key));
                    }
                }
                assertEquals("r0_c0", t.getRows().get(0).get(0).getKey());
            }
        }
    }

    private static List<String> keysOf(BoardDocSpec.Table t, int row) {
        List<String> out = new ArrayList<>();
        for (BoardDocSpec.Cell c : t.getRows().get(row)) {
            out.add(c.getKey());
        }
        return out;
    }

    @Test
    public void 카탈로그_칸_key는_행id_열id_병합칸은_앵커_기준() {
        BoardDocSpec.Doc d = BoardDocSpec.find("default_doc", true);
        BoardDocSpec.Table a = table(d, "A");
        assertEquals(Arrays.asList("r0", "r1", "r2", "r3", "r4"), a.getRowIds());
        assertEquals(Arrays.asList("c0", "c1", "c2", "c3"), a.getColIds());
        assertEquals(BoardDocSpec.FIRST_NEW_ID, a.getNextR());
        assertEquals(BoardDocSpec.FIRST_NEW_ID, a.getNextC());
        assertEquals(100, BoardDocSpec.FIRST_NEW_ID);
        assertEquals(2, BoardDocSpec.CATALOG_VER);                   // C-3 사업초기 열 + C-5 추가
        assertEquals(2, BoardDocSpec.FORM_FMT);
        assertEquals(Arrays.asList("r0_c0", "r0_c1", "r0_c2", "r0_c3"), keysOf(a, 0));
        assertEquals(Arrays.asList("r1_c0", "r1_c1", "r1_c2", "r1_c3"), keysOf(a, 1));
        assertEquals(Arrays.asList("r2_c1", "r2_c2"), keysOf(a, 2));       // 0열·3열은 위 칸의 세로 병합에 덮여 있다
        assertEquals(Arrays.asList("r3_c1", "r3_c2"), keysOf(a, 3));
        assertEquals(Arrays.asList("r4_c1", "r4_c2", "r4_c3"), keysOf(a, 4));
        assertTrue(a.getRows().get(1).get(2).isMapped());                  // r1_c2 = 출연금 값 칸(엑셀 연결)
        assertFalse(a.getRows().get(1).get(2).isInput());
        assertEquals("r1", a.getRows().get(1).get(2).getRowId());
        assertEquals("c2", a.getRows().get(1).get(2).getColId());
    }

    @Test
    public void 표B_가로_병합과_세로_병합_칸의_key() {
        BoardDocSpec.Table b = table(BoardDocSpec.find("default_doc", true), "B");
        assertEquals(Arrays.asList("r0_c0", "r0_c2", "r0_c3", "r0_c4", "r0_c5", "r0_c6", "r0_c7", "r0_c8"), keysOf(b, 0));
        assertEquals("r1_c0", keysOf(b, 1).get(0));
        assertEquals(9, keysOf(b, 1).size());
        assertEquals(Arrays.asList("r2_c1", "r2_c2", "r2_c3", "r2_c4", "r2_c5", "r2_c6", "r2_c7", "r2_c8"), keysOf(b, 2));
    }

    @Test
    public void 얼린_v1_번역표는_v1_모양_카탈로그와_칸마다_같고_모르는_것은_null() {
        for (BoardDocSpec.Table t : BoardDocSpec.catalog(false)) {
            if (BoardDocSpec.C5_REF.equals(t.getId())) {                   // C-5 는 v2 에서 생긴 표 — v1 번역표에 없다
                assertNull(BoardLegacyKeys.frozenStarts(1, t.getId()));
                assertNull(BoardDocSpec.legacyToKey(1, t.getId(), "r0c0"));
                continue;
            }
            int[][] starts = BoardLegacyKeys.frozenStarts(1, t.getId());
            assertNotNull(t.getId(), starts);
            assertEquals(t.getRows().size(), starts.length);
            for (int r = 0; r < t.getRows().size(); r++) {
                // v1 모양 = 지금 카탈로그에서 v2 에 새로 생긴 열(C-3 의 c6)을 뺀 것
                List<BoardDocSpec.Cell> v1 = new ArrayList<>();
                for (BoardDocSpec.Cell c : t.getRows().get(r)) {
                    if (!("C-3".equals(t.getId()) && BoardDocSpec.C3_INIT_COL.equals(c.getColId()))) {
                        v1.add(c);
                    }
                }
                assertEquals(v1.size(), starts[r].length);
                for (int i = 0; i < v1.size(); i++) {
                    assertEquals(t.getId() + " r" + r + "c" + i, v1.get(i).getKey(),
                            BoardDocSpec.legacyToKey(1, t.getId(), "r" + r + "c" + i));
                }
                assertNull(BoardDocSpec.legacyToKey(1, t.getId(), "r" + r + "c" + v1.size()));
            }
            assertNull(BoardDocSpec.legacyToKey(1, t.getId(), "r" + t.getRows().size() + "c0"));
        }
        assertEquals("r1_c2", BoardDocSpec.legacyToKey(1, "A", "r1c2"));
        assertEquals("r2_c2", BoardDocSpec.legacyToKey(1, "A", "r2c1"));
        assertEquals("r4_c2", BoardDocSpec.legacyToKey(1, "A", "r4c1"));
        assertNull(BoardDocSpec.legacyToKey(2, "A", "r1c2"));              // 번역표가 없는 버전
        assertNull(BoardDocSpec.legacyToKey(1, "ZZ", "r1c2"));
        assertNull(BoardDocSpec.legacyToKey(1, "A", "r1_c2"));
        assertNull(BoardDocSpec.legacyToKey(1, "A", null));
        assertEquals("r1_c2", BoardDocSpec.resolveKey(1, "A", "r1c2"));    // 옛 모양은 번역
        assertEquals("r1_c2", BoardDocSpec.resolveKey(1, "A", "r1_c2"));   // 새 정규형은 그대로
        assertNull(BoardDocSpec.resolveKey(1, "A", "r01_c2"));
        assertNull(BoardDocSpec.resolveKey(1, "A", "x"));
    }

    @Test
    public void 붙임5_C5_모양과_칸_key() {
        BoardDocSpec.Table c5 = table(BoardDocSpec.find("default_doc", true), "C-5");
        assertEquals("Ⅴ. 세부 수익성 분석표(명목가치)", c5.getTitle());
        assertEquals("(단위: 억원)", c5.getUnit());
        assertEquals(9, c5.getColumns());
        assertEquals(26, c5.getRows().size());                              // 머리 1 + 데이터 25
        assertEquals(Arrays.asList("c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"), c5.getColIds());
        assertEquals(BoardDocSpec.FIRST_NEW_ID, c5.getNextR());
        assertEquals(BoardDocSpec.FIRST_NEW_ID, c5.getNextC());
        assertEquals(Arrays.asList("r0_c0", "r0_c3", "r0_c4", "r0_c5", "r0_c6", "r0_c7", "r0_c8"), keysOf(c5, 0));
        assertEquals(3, c5.getRows().get(0).get(0).getColspan());           // 머리 '구분' 가로 3칸
        assertEquals(Arrays.asList("r1_c0", "r1_c1", "r1_c2", "r1_c3", "r1_c4", "r1_c5", "r1_c6", "r1_c7", "r1_c8"),
                keysOf(c5, 1));
        assertEquals(11, c5.getRows().get(1).get(0).getRowspan());          // 수익
        assertEquals(5, c5.getRows().get(1).get(1).getRowspan());           // 기관수익
        assertEquals(Arrays.asList("r2_c2", "r2_c3", "r2_c4", "r2_c5", "r2_c6", "r2_c7", "r2_c8"), keysOf(c5, 2));
        assertEquals(2, c5.getRows().get(11).get(0).getColspan());          // 총 수익 (구분2~3 병합)
        assertEquals("r11_c1", c5.getRows().get(11).get(0).getKey());
        assertEquals(8, c5.getRows().get(12).get(0).getRowspan());          // 비용
        assertEquals(2, c5.getRows().get(19).get(0).getColspan());          // 총 비용
        for (int r = 20; r <= 25; r++) {
            assertEquals(3, c5.getRows().get(r).get(0).getColspan());       // 예상영업이익 … 법인세 차감후 이익
            assertEquals(7, c5.getRows().get(r).size());
        }
        int mapped = 0;
        for (int r = 0; r < c5.getRows().size(); r++) {
            for (BoardDocSpec.Cell c : c5.getRows().get(r)) {
                if (c.isMapped()) {
                    mapped++;
                    assertTrue(c.getKey(), r >= 1
                            && Arrays.asList("c3", "c4", "c5", "c6", "c7", "c8").contains(c.getColId()));
                }
            }
        }
        assertEquals(150, mapped);                                          // 25행 × 6열
        assertEquals(150, BoardDocSpec.mappedKeys(c5).size());
        assertEquals("법인세(26.4%)", c5.getRows().get(24).get(0).getText());
        assertNull(BoardDocSpec.legacyToKey(2, "C-5", "r1c0"));
    }

    @Test
    public void id_정규형은_r_c_와_0_또는_앞자리0없는_5자리까지만() {
        assertEquals(99999, BoardDocSpec.MAX_ID_NUM);
        for (String ok : new String[]{"r0", "r1", "r99", "r100", "r1000", "r9999", "r10000", "r99999"}) {
            assertTrue(ok, BoardDocSpec.isValidRowId(ok));
            assertTrue(ok, BoardDocSpec.isValidColId("c" + ok.substring(1)));
        }
        for (String bad : new String[]{null, "", "r", "r01", "r00", "r100000", "R1", "c1", "r-1", "r1 ", " r1",
                "r1\n", "r٣", "r1.0", "r1_c2", "rr1", "r+1", "r0x1"}) {
            assertFalse(String.valueOf(bad), BoardDocSpec.isValidRowId(bad));
        }
        for (String bad : new String[]{null, "", "c", "c01", "c100000", "C1", "r1", "c1\n", "c٣", "c1_c2"}) {
            assertFalse(String.valueOf(bad), BoardDocSpec.isValidColId(bad));
        }
        assertTrue(BoardDocSpec.isValidCellKey("r1_c2"));
        assertTrue(BoardDocSpec.isValidCellKey("r99999_c0"));
        assertFalse(BoardDocSpec.isValidCellKey("r100000_c0"));
        assertFalse(BoardDocSpec.isValidCellKey("r1c2"));
        assertFalse(BoardDocSpec.isValidCellKey("r1_c02"));
        assertFalse(BoardDocSpec.isValidCellKey("r1_c2\n"));
        assertFalse(BoardDocSpec.isValidCellKey(null));
    }

    private static List<List<BoardDocSpec.Cell>> grid(int rows, int cols) {
        List<List<BoardDocSpec.Cell>> out = new ArrayList<>();
        for (int r = 0; r < rows; r++) {
            List<BoardDocSpec.Cell> row = new ArrayList<>();
            for (int c = 0; c < cols; c++) {
                row.add(new BoardDocSpec.Cell("x", 1, 1, false, false, "left"));
            }
            out.add(row);
        }
        return out;
    }

    @Test
    public void 명시_id_생성자는_기존_id를_그대로_쓰고_새_id는_카운터_밑으로_검증한다() {
        BoardDocSpec.Table t = new BoardDocSpec.Table("X", "X", "x", 3, Arrays.asList("r0", "r5"),
                Arrays.asList("c0", "c1", "c7"), 100, 101, grid(2, 3));
        assertEquals(Arrays.asList("r0_c0", "r0_c1", "r0_c7"), keysOf(t, 0));
        assertEquals(Arrays.asList("r5_c0", "r5_c1", "r5_c7"), keysOf(t, 1));
        assertEquals(101, t.getNextC());
        for (final Object[] bad : new Object[][]{
                {Arrays.asList("r0", "r0"), Arrays.asList("c0", "c1", "c2"), 100, 100},       // 중복
                {Arrays.asList("r0", "r1"), Arrays.asList("c0", "c1", "x2"), 100, 100},       // 정규형 아님
                {Arrays.asList("r0", "r1"), Arrays.asList("c0", "c1", "c05"), 100, 100},
                {Arrays.asList("r0", "r5"), Arrays.asList("c0", "c1", "c2"), 5, 100},         // 카운터 <= 쓰인 숫자
                {Arrays.asList("r0", "r1"), Arrays.asList("c0", "c1", "c2"), 100, 100001},    // 카운터 상한 초과
                {Arrays.asList("r0"), Arrays.asList("c0", "c1", "c2"), 100, 100},             // 개수 불일치
                {Arrays.asList("r0", "r1"), Arrays.asList("c0", "c1"), 100, 100}}) {
            try {
                @SuppressWarnings("unchecked")
                List<String> rowIds = (List<String>) bad[0];
                @SuppressWarnings("unchecked")
                List<String> colIds = (List<String>) bad[1];
                new BoardDocSpec.Table("X", "X", "x", 3, rowIds, colIds, (Integer) bad[2], (Integer) bad[3], grid(2, 3));
                org.junit.Assert.fail("IllegalStateException 이 나와야 한다");
            } catch (IllegalStateException expected) {
                assertFalse(expected.getMessage(), expected.getMessage().contains("x2"));    // 입력값을 싣지 않는다
            }
        }
    }

    @Test
    public void 값_칸_주소표는_편집_가능_키_집합에_들어_있다() {
        BoardDocSpec.Doc d = BoardDocSpec.find("default_doc", true);
        for (BoardDocSpec.Table t : d.getTables()) {
            java.util.Set<String> editable = BoardDocSpec.editableKeys(t);
            java.util.Set<String> all = new java.util.HashSet<>();
            for (List<BoardDocSpec.Cell> row : t.getRows()) {
                for (BoardDocSpec.Cell c : row) {
                    all.add(c.getKey());
                }
            }
            assertTrue(all.containsAll(editable));
        }
    }
}
