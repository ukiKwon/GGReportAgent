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
        assertEquals(5, d.getTables().size());
        String[] order = {"A", "B", "C-2", "C-3", "C-4"};
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
        assertEquals(6, c3.getColumns());
        assertEquals(6, c3.getRows().size());
        assertEquals(3, c4.getColumns());
        assertEquals(4, c4.getRows().size());
        assertEquals(2, c4.getNotes().size());
        assertFalse(c4.getRows().get(1).get(2).isMapped());
        assertTrue(c4.getRows().get(1).get(1).isMapped());
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
}
