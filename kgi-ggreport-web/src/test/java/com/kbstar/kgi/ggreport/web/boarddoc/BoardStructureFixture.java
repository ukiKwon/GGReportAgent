package com.kbstar.kgi.ggreport.web.boarddoc;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** 구조 편집 시험 도우미: 표를 입력 모델(cols·rows)로 복사하고, 고친 구조로 Doc 을 다시 만든다. */
final class BoardStructureFixture {

    private BoardStructureFixture() {
    }

    static BoardDocSpec.Doc base() {
        return BoardDocSpec.build("x", "n", Arrays.asList(
                new BoardDocSpec.TableEdit("A", null, null, null), new BoardDocSpec.TableEdit("B", null, null, null),
                new BoardDocSpec.TableEdit("C-2", null, null, null), new BoardDocSpec.TableEdit("C-3", null, null, null),
                new BoardDocSpec.TableEdit("C-4", null, null, null), new BoardDocSpec.TableEdit("C-5", null, null, null)),
                false);
    }

    static BoardDocSpec.Table table(BoardDocSpec.Doc d, String ref) {
        for (BoardDocSpec.Table t : d.getTables()) {
            if (ref.equals(t.getId())) {
                return t;
            }
        }
        throw new AssertionError("table not found " + ref);
    }

    static List<BoardDocSpec.ColEdit> cols(BoardDocSpec.Table t) {
        List<BoardDocSpec.ColEdit> out = new ArrayList<>();
        for (String c : t.getColIds()) {
            out.add(new BoardDocSpec.ColEdit(c));
        }
        return out;
    }

    static List<BoardDocSpec.CellEdit> cells(List<BoardDocSpec.Cell> row) {
        List<BoardDocSpec.CellEdit> out = new ArrayList<>();
        for (BoardDocSpec.Cell c : row) {
            out.add(cell(c.getColId(), c));
        }
        return out;
    }

    static BoardDocSpec.CellEdit cell(String col, BoardDocSpec.Cell c) {
        return new BoardDocSpec.CellEdit(col, c.getText(), c.getColspan(), c.getRowspan(), c.isHeader(), c.isInput(), c.getAlign());
    }

    static BoardDocSpec.CellEdit cell(String col, String text, int cs, int rs, boolean header, boolean input) {
        return new BoardDocSpec.CellEdit(col, text, cs, rs, header, input, "left");
    }

    static List<BoardDocSpec.RowEdit> rows(BoardDocSpec.Table t) {
        List<BoardDocSpec.RowEdit> out = new ArrayList<>();
        for (int r = 0; r < t.getRows().size(); r++) {
            out.add(new BoardDocSpec.RowEdit(t.getRowIds().get(r), cells(t.getRows().get(r))));
        }
        return out;
    }

    /** 칸 하나를 같은 속성으로 두되 rowspan 만 바꾼 사본(앵커 key 로 찾는다). */
    static void setRowspan(List<BoardDocSpec.RowEdit> rows, String rowId, String colId, int rs) {
        for (int i = 0; i < rows.size(); i++) {
            if (!rowId.equals(rows.get(i).getId())) {
                continue;
            }
            List<BoardDocSpec.CellEdit> cs = new ArrayList<>(rows.get(i).getCells());
            for (int j = 0; j < cs.size(); j++) {
                BoardDocSpec.CellEdit c = cs.get(j);
                if (colId.equals(c.getCol())) {
                    cs.set(j, new BoardDocSpec.CellEdit(c.getCol(), c.getText(), c.getColspan(), rs, c.getHeader(), c.getInput(), c.getAlign()));
                }
            }
            rows.set(i, new BoardDocSpec.RowEdit(rowId, cs));
            return;
        }
        throw new AssertionError("row not found " + rowId);
    }

    static BoardDocSpec.TableEdit edit(String ref, List<BoardDocSpec.ColEdit> cols, List<BoardDocSpec.RowEdit> rows) {
        return new BoardDocSpec.TableEdit(ref, null, null, null, cols, rows);
    }

    /** base 의 모든 표를 구조 없이 보내되(ref 만) 지정한 표만 새 구조로 바꾼 Doc. base 의 id 카운터를 이어받는다. */
    static BoardDocSpec.Doc rebuild(BoardDocSpec.Doc base, BoardDocSpec.TableEdit... changed) {
        List<BoardDocSpec.TableEdit> edits = new ArrayList<>();
        for (BoardDocSpec.Table t : base.getTables()) {
            BoardDocSpec.TableEdit pick = null;
            for (BoardDocSpec.TableEdit e : changed) {
                if (t.getId().equals(e.getRef())) {
                    pick = e;
                }
            }
            edits.add(pick != null ? pick : new BoardDocSpec.TableEdit(t.getId(), null, null, null));
        }
        return BoardDocSpec.build("x", "n", edits, false, base);
    }

    /** A 표의 행 index 위치(0-기준)에 새 행(id null, 라벨 + 직접 입력 값 칸)을 끼운 구조. 위아래 병합은 rowspan 을 늘려 둔다. */
    static List<BoardDocSpec.RowEdit> aWithNewRowAt3() {
        BoardDocSpec.Table a = table(base(), "A");
        List<BoardDocSpec.RowEdit> rows = rows(a);
        setRowspan(rows, "r1", "c0", 5);
        setRowspan(rows, "r1", "c3", 4);
        rows.add(3, new BoardDocSpec.RowEdit(null, new ArrayList<>(Arrays.asList(
                cell("c1", "추가 항목", 1, 1, false, false), cell("c2", "", 1, 1, false, true)))));
        return rows;
    }
}
