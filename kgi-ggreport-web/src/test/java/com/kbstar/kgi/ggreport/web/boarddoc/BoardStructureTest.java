package com.kbstar.kgi.ggreport.web.boarddoc;

import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.Test;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STMerge;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.kbstar.kgi.ggreport.web.boarddoc.BoardStructureFixture.aWithNewRowAt3;
import static com.kbstar.kgi.ggreport.web.boarddoc.BoardStructureFixture.base;
import static com.kbstar.kgi.ggreport.web.boarddoc.BoardStructureFixture.cell;
import static com.kbstar.kgi.ggreport.web.boarddoc.BoardStructureFixture.cols;
import static com.kbstar.kgi.ggreport.web.boarddoc.BoardStructureFixture.edit;
import static com.kbstar.kgi.ggreport.web.boarddoc.BoardStructureFixture.rebuild;
import static com.kbstar.kgi.ggreport.web.boarddoc.BoardStructureFixture.rows;
import static com.kbstar.kgi.ggreport.web.boarddoc.BoardStructureFixture.setRowspan;
import static com.kbstar.kgi.ggreport.web.boarddoc.BoardStructureFixture.table;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** 양식 구조 편집(행·열 삽입/삭제, 구분 열 쪼개기)의 서버 규칙 — 입력 모델 → Doc 단위 시험. */
public class BoardStructureTest {

    private static void expectBad(BoardDocSpec.Doc base, BoardDocSpec.TableEdit e, String messagePart) {
        try {
            rebuild(base, e);
            fail("EditException 이 나와야 한다: " + messagePart);
        } catch (BoardDocSpec.EditException ex) {
            assertTrue(ex.getMessage(), ex.getMessage().contains(messagePart));
        }
    }

    private static void expectStructBad(BoardDocSpec.Doc base, BoardDocSpec.TableEdit e) {
        expectBad(base, e, BoardDocSpec.BAD_STRUCT);
    }

    // ── 행 ──

    @Test
    public void 행_삽입은_r100_키_r100_c2_삭제_후_재추가는_r101() {
        BoardDocSpec.Doc b = base();
        BoardDocSpec.Table a0 = table(b, "A");
        BoardDocSpec.Doc d1 = rebuild(b, edit("A", cols(a0), aWithNewRowAt3()));
        BoardDocSpec.Table a1 = table(d1, "A");
        assertEquals(Arrays.asList("r0", "r1", "r2", "r100", "r3", "r4"), a1.getRowIds());
        assertEquals(101, a1.getNextR());
        assertEquals("r100_c1", a1.getRows().get(3).get(0).getKey());
        assertEquals("r100_c2", a1.getRows().get(3).get(1).getKey());
        assertTrue(a1.getRows().get(3).get(1).isInput());
        assertFalse(a1.getRows().get(3).get(1).isMapped());
        assertEquals("추가 항목", a1.getRows().get(3).get(0).getText());
        assertEquals(5, a1.getRows().get(1).get(0).getRowspan());
        assertTrue(a1.getRows().get(1).get(2).isMapped());                     // 기존 연결 칸은 그대로(r1_c2)
        assertEquals("r1_c2", a1.getRows().get(1).get(2).getKey());

        // 지운다: 병합을 되돌리고 r100 행을 뺀다 → 카운터는 그대로 101
        List<BoardDocSpec.RowEdit> rows = rows(a1);
        rows.remove(3);
        setRowspan(rows, "r1", "c0", 4);
        setRowspan(rows, "r1", "c3", 3);
        BoardDocSpec.Doc d2 = rebuild(d1, edit("A", cols(a1), rows));
        assertEquals(Arrays.asList("r0", "r1", "r2", "r3", "r4"), table(d2, "A").getRowIds());
        assertEquals(101, table(d2, "A").getNextR());

        // 지운 id(r100)를 다시 쓰려는 시도는 거부, 새 행(null)은 r101
        List<BoardDocSpec.RowEdit> again = rows(table(d2, "A"));
        setRowspan(again, "r1", "c0", 5);
        setRowspan(again, "r1", "c3", 4);
        List<BoardDocSpec.RowEdit> reuse = new ArrayList<>(again);
        reuse.add(3, new BoardDocSpec.RowEdit("r100", new ArrayList<>(Arrays.asList(
                cell("c1", "x", 1, 1, false, false), cell("c2", "", 1, 1, false, true)))));
        expectStructBad(d2, edit("A", cols(table(d2, "A")), reuse));
        again.add(3, new BoardDocSpec.RowEdit(null, new ArrayList<>(Arrays.asList(
                cell("c1", "다시", 1, 1, false, false), cell("c2", "", 1, 1, false, true)))));
        BoardDocSpec.Doc d3 = rebuild(d2, edit("A", cols(table(d2, "A")), again));
        assertEquals(Arrays.asList("r0", "r1", "r2", "r101", "r3", "r4"), table(d3, "A").getRowIds());
        assertEquals(102, table(d3, "A").getNextR());
    }

    @Test
    public void 열_삽입은_임시_n1을_c100으로_바꾼다() {
        BoardDocSpec.Doc b = base();
        BoardDocSpec.Table c4 = table(b, "C-4");
        List<BoardDocSpec.ColEdit> cols = cols(c4);
        cols.add(1, new BoardDocSpec.ColEdit("n1"));
        List<BoardDocSpec.RowEdit> rows = new ArrayList<>();
        for (BoardDocSpec.RowEdit r : rows(c4)) {
            List<BoardDocSpec.CellEdit> cs = new ArrayList<>(r.getCells());
            cs.add(1, cell("n1", "", 1, 1, false, false));
            rows.add(new BoardDocSpec.RowEdit(r.getId(), cs));
        }
        BoardDocSpec.Doc d = rebuild(b, edit("C-4", cols, rows));
        BoardDocSpec.Table t = table(d, "C-4");
        assertEquals(Arrays.asList("c0", "c100", "c1", "c2"), t.getColIds());
        assertEquals(4, t.getColumns());
        assertEquals(101, t.getNextC());
        assertEquals("r1_c100", t.getRows().get(1).get(1).getKey());
        assertEquals("r1_c1", t.getRows().get(1).get(2).getKey());             // 기존 칸 key 는 밀리지 않는다
        assertTrue(t.getRows().get(1).get(2).isMapped());                      // 연결 유지
        assertFalse(t.getRows().get(1).get(1).isMapped());                     // 새 열은 연결 없음
        // 임시 id 중복·정규형 아닌 id 는 거부
        List<BoardDocSpec.ColEdit> dup = cols(c4);
        dup.add(1, new BoardDocSpec.ColEdit("n1"));
        dup.add(2, new BoardDocSpec.ColEdit("n1"));
        expectStructBad(b, edit("C-4", dup, rows));
    }

    // ── 구분 열 쪼개기 ──

    /** 표 A: 새 열 n1 을 c1(구분) 뒤에 넣고 머리 '구분'을 가로 2칸으로, 아래 행마다 라벨 칸 하나를 더한다. */
    private static BoardDocSpec.TableEdit splitEdit(BoardDocSpec.Table a) {
        List<BoardDocSpec.ColEdit> cols = cols(a);
        cols.add(2, new BoardDocSpec.ColEdit("n1"));
        List<BoardDocSpec.RowEdit> rows = new ArrayList<>();
        for (BoardDocSpec.RowEdit r : rows(a)) {
            List<BoardDocSpec.CellEdit> cs = new ArrayList<>();
            for (BoardDocSpec.CellEdit c : r.getCells()) {
                boolean head = "r0".equals(r.getId()) && "c1".equals(c.getCol());
                cs.add(head ? new BoardDocSpec.CellEdit(c.getCol(), c.getText(), 2, c.getRowspan(), c.getHeader(), c.getInput(),
                        c.getAlign()) : c);
                if ("c1".equals(c.getCol()) && !"r0".equals(r.getId())) {
                    cs.add(cell("n1", "세부", 1, 1, false, false));
                }
            }
            rows.add(new BoardDocSpec.RowEdit(r.getId(), cs));
        }
        return edit("A", cols, rows);
    }

    @Test
    public void 구분_2열_쪼개기는_200이고_docx에_gridSpan_vMerge가_나온다() throws Exception {
        BoardDocSpec.Doc b = base();
        BoardDocSpec.Doc d = rebuild(b, splitEdit(table(b, "A")));
        BoardDocSpec.Table a = table(d, "A");
        assertEquals(Arrays.asList("c0", "c1", "c100", "c2", "c3"), a.getColIds());
        assertEquals(5, a.getColumns());
        assertEquals(2, a.getRows().get(0).get(1).getColspan());
        assertEquals("r0_c1", a.getRows().get(0).get(1).getKey());
        assertEquals("r1_c100", a.getRows().get(1).get(2).getKey());
        assertTrue(a.getRows().get(1).get(3).isMapped());                       // 출연금 값 칸(r1_c2) 연결 유지
        assertEquals("r1_c2", a.getRows().get(1).get(3).getKey());

        XWPFDocument x = new XWPFDocument(new ByteArrayInputStream(BoardDocDocx.build(d)));
        try {
            org.apache.poi.xwpf.usermodel.XWPFTable t = x.getTables().get(0);
            assertEquals(2, t.getRow(0).getCell(1).getCTTc().getTcPr().getGridSpan().getVal().intValue());
            assertEquals(STMerge.RESTART, t.getRow(1).getCell(0).getCTTc().getTcPr().getVMerge().getVal());
            assertEquals(5, t.getCTTbl().getTblGrid().sizeOfGridColArray());
            int sum = 0;
            for (int i = 0; i < 5; i++) {
                sum += Integer.parseInt(String.valueOf(t.getCTTbl().getTblGrid().getGridColArray(i).getW()));
            }
            assertEquals(BoardDocDocx.BODY_W, sum);
        } finally {
            x.close();
        }
    }

    @Test
    public void 칸_부족_겹침_열_순서_뒤바뀜_칸_열_불일치는_고정_문구로_거부() {
        BoardDocSpec.Doc b = base();
        BoardDocSpec.Table a = table(b, "A");
        // 칸 부족: r2 행의 새 칸을 뺀다
        BoardDocSpec.TableEdit ok = splitEdit(a);
        List<BoardDocSpec.RowEdit> missing = new ArrayList<>(ok.getRows());
        List<BoardDocSpec.CellEdit> r2 = new ArrayList<>(missing.get(2).getCells());
        r2.remove(1);
        missing.set(2, new BoardDocSpec.RowEdit("r2", r2));
        expectStructBad(b, edit("A", ok.getCols(), missing));
        // 겹침/초과: 머리 '구분'을 3칸으로
        List<BoardDocSpec.RowEdit> wide = new ArrayList<>(ok.getRows());
        List<BoardDocSpec.CellEdit> h = new ArrayList<>(wide.get(0).getCells());
        BoardDocSpec.CellEdit c1 = h.get(1);
        h.set(1, new BoardDocSpec.CellEdit(c1.getCol(), c1.getText(), 3, 1, true, false, c1.getAlign()));
        wide.set(0, new BoardDocSpec.RowEdit("r0", h));
        expectStructBad(b, edit("A", ok.getCols(), wide));
        // 칸이 말한 열 ≠ 실제 격자 위치
        List<BoardDocSpec.RowEdit> lie = new ArrayList<>(ok.getRows());
        List<BoardDocSpec.CellEdit> r3 = new ArrayList<>(lie.get(3).getCells());
        BoardDocSpec.CellEdit lab = r3.get(0);
        r3.set(0, new BoardDocSpec.CellEdit("c2", lab.getText(), 1, 1, false, false, lab.getAlign()));
        lie.set(3, new BoardDocSpec.RowEdit("r3", r3));
        expectStructBad(b, edit("A", ok.getCols(), lie));
        // 기본 양식 열의 상대 순서를 바꾸면 거부(고정 문구, 입력 되돌려 싣지 않음)
        List<BoardDocSpec.ColEdit> swapped = new ArrayList<>(ok.getCols());
        BoardDocSpec.ColEdit tmp = swapped.get(0);
        swapped.set(0, swapped.get(1));
        swapped.set(1, tmp);
        expectBad(b, edit("A", swapped, ok.getRows()), "순서는 바꿀 수 없습니다");
        List<BoardDocSpec.RowEdit> swappedRows = new ArrayList<>(rows(a));
        BoardDocSpec.RowEdit t1 = swappedRows.get(1);
        swappedRows.set(1, swappedRows.get(2));
        swappedRows.set(2, t1);
        expectBad(b, edit("A", cols(a), swappedRows), "순서는 바꿀 수 없습니다");
    }

    // ── 위조 id · 상한 · 속성 ──

    @Test
    public void 위조_id는_모두_거부된다() {
        BoardDocSpec.Doc b = base();
        BoardDocSpec.Table a = table(b, "A");
        for (String forged : new String[]{"r02", "x1", "r1", "r4", "r150", "r99999", "R3", "", "r3 "}) {
            List<BoardDocSpec.RowEdit> rows = rows(a);
            rows.set(2, new BoardDocSpec.RowEdit(forged, rows.get(2).getCells()));
            expectStructBad(b, edit("A", cols(a), rows));
        }
        // 열 id: 위조·중복·base 에 없는 c9999 (칸의 col 도 같은 id 로 맞춰 id 위조만 남긴다)
        for (String forged : new String[]{"c03", "c9999", "c1", "x3", "c100"}) {
            List<BoardDocSpec.ColEdit> cs = cols(a);
            cs.set(3, new BoardDocSpec.ColEdit(forged));
            List<BoardDocSpec.RowEdit> rows = new ArrayList<>();
            for (BoardDocSpec.RowEdit r : rows(a)) {
                List<BoardDocSpec.CellEdit> cells = new ArrayList<>();
                for (BoardDocSpec.CellEdit c : r.getCells()) {
                    cells.add("c3".equals(c.getCol()) ? new BoardDocSpec.CellEdit(forged, c.getText(), c.getColspan(), c.getRowspan(),
                            c.getHeader(), c.getInput(), c.getAlign()) : c);
                }
                rows.add(new BoardDocSpec.RowEdit(r.getId(), cells));
            }
            expectStructBad(b, edit("A", cs, rows));
        }
        // 표 간 이동: A 에만 있는 행 id(r4)를 B 에 쓴다
        BoardDocSpec.Table bt = table(b, "B");
        List<BoardDocSpec.RowEdit> brows = rows(bt);
        brows.set(2, new BoardDocSpec.RowEdit("r4", brows.get(2).getCells()));
        expectStructBad(b, edit("B", cols(bt), brows));
        // 같은 행 id 중복
        List<BoardDocSpec.RowEdit> dup = rows(a);
        dup.set(3, new BoardDocSpec.RowEdit("r2", dup.get(3).getCells()));
        expectStructBad(b, edit("A", cols(a), dup));
        // cols 만·rows 만 보내기
        expectStructBad(b, new BoardDocSpec.TableEdit("A", null, null, null, cols(a), null));
        expectStructBad(b, new BoardDocSpec.TableEdit("A", null, null, null, null, rows(a)));
    }

    private static List<BoardDocSpec.RowEdit> oneRowPerCell(int rowsN, int colsN) {
        List<BoardDocSpec.RowEdit> rows = new ArrayList<>();
        for (int r = 0; r < rowsN; r++) {
            List<BoardDocSpec.CellEdit> cs = new ArrayList<>();
            for (int c = 0; c < colsN; c++) {
                cs.add(cell("c" + c, "", 1, 1, false, false));
            }
            rows.add(new BoardDocSpec.RowEdit(null, cs));
        }
        return rows;
    }

    @Test
    public void 상한_위반은_행41_열13_표칸301_문구101_제어문자_모두_거부() {
        BoardDocSpec.Doc b = base();
        BoardDocSpec.Table c4 = table(b, "C-4");
        expectBad(b, edit("C-4", cols(c4), oneRowPerCell(41, 3)), "행은 1개 이상 40개");
        List<BoardDocSpec.ColEdit> thirteen = new ArrayList<>();
        for (int i = 0; i < 13; i++) {
            thirteen.add(new BoardDocSpec.ColEdit(i < 3 ? "c" + i : "n" + (i - 2)));
        }
        expectBad(b, edit("C-4", thirteen, oneRowPerCell(1, 13)), "열은 1개 이상 12개");
        // 표 칸 301: 12열 × 25행 = 300 은 통과(새 id 만으로), 26행(312)은 거부 — 큰 배열을 만들기 전에 거부한다
        List<BoardDocSpec.ColEdit> twelve = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            twelve.add(new BoardDocSpec.ColEdit("n" + (i + 1)));
        }
        List<BoardDocSpec.RowEdit> r26 = new ArrayList<>();
        for (int r = 0; r < 26; r++) {
            List<BoardDocSpec.CellEdit> cs = new ArrayList<>();
            for (int c = 0; c < 12; c++) {
                cs.add(cell("n" + (c + 1), "", 1, 1, false, false));
            }
            r26.add(new BoardDocSpec.RowEdit(null, cs));
        }
        expectBad(b, edit("C-4", twelve, r26), "표 하나에 넣을 수 있는 칸은 300개");
        // 문구 101자·제어문자·서식 문자
        List<BoardDocSpec.RowEdit> longText = rows(c4);
        List<BoardDocSpec.CellEdit> first = new ArrayList<>(longText.get(0).getCells());
        BoardDocSpec.CellEdit f0 = first.get(0);
        for (String bad : new String[]{rep("가", 101), "a\u0007b", "a\nb", "a‮b"}) {
            first.set(0, new BoardDocSpec.CellEdit(f0.getCol(), bad, 1, 1, true, false, "center"));
            longText.set(0, new BoardDocSpec.RowEdit("r0", first));
            expectBad(b, edit("C-4", cols(c4), longText), bad.length() > 50 ? "100자" : "쓸 수 없는 문자");
        }
        // 병합 범위 · 속성
        for (int[] bad : new int[][]{{0, 1}, {1, 0}, {99, 1}, {1, 99}, {-1, 1}, {Integer.MAX_VALUE, 1}}) {
            List<BoardDocSpec.RowEdit> rows = rows(c4);
            List<BoardDocSpec.CellEdit> cs = new ArrayList<>(rows.get(1).getCells());
            BoardDocSpec.CellEdit c = cs.get(2);
            cs.set(2, new BoardDocSpec.CellEdit(c.getCol(), c.getText(), bad[0], bad[1], false, false, "left"));
            rows.set(1, new BoardDocSpec.RowEdit("r1", cs));
            expectStructBad(b, edit("C-4", cols(c4), rows));
        }
        for (Object[] bad : new Object[][]{{"justify", false, false}, {"left", true, true}, {"LEFT", false, false}}) {
            List<BoardDocSpec.RowEdit> rows = rows(c4);
            List<BoardDocSpec.CellEdit> cs = new ArrayList<>(rows.get(1).getCells());
            BoardDocSpec.CellEdit c = cs.get(2);
            cs.set(2, new BoardDocSpec.CellEdit(c.getCol(), c.getText(), 1, 1, (Boolean) bad[1], (Boolean) bad[2], (String) bad[0]));
            rows.set(1, new BoardDocSpec.RowEdit("r1", cs));
            expectStructBad(b, edit("C-4", cols(c4), rows));
        }
    }

    private static String rep(String s, int n) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < n; i++) {
            b.append(s);
        }
        return b.toString();
    }

    /** 12열 × 25행 = 300칸이 꽉 찬 구조(기존 열·행 id 를 유지하고 새 것을 덧붙인다). */
    private static BoardDocSpec.TableEdit full300(BoardDocSpec.Table t) {
        List<BoardDocSpec.ColEdit> cs = cols(t);
        for (int i = 1; cs.size() < 12; i++) {
            cs.add(new BoardDocSpec.ColEdit("n" + i));
        }
        List<BoardDocSpec.RowEdit> rows = new ArrayList<>();
        for (int r = 0; r < 25; r++) {
            List<BoardDocSpec.CellEdit> cells = new ArrayList<>();
            for (BoardDocSpec.ColEdit c : cs) {
                cells.add(cell(c.getId(), "", 1, 1, false, false));
            }
            rows.add(new BoardDocSpec.RowEdit(r < t.getRows().size() ? t.getRowIds().get(r) : null, cells));
        }
        return edit(t.getId(), cs, rows);
    }

    @Test
    public void 양식_전체_칸_상한은_800이다() {
        BoardDocSpec.Doc b = base();
        BoardDocSpec.Doc ok = rebuild(b, full300(table(b, "C-2")));                          // 한 표 300칸은 통과
        assertEquals(300, countAnchors(table(ok, "C-2")));
        try {
            rebuild(b, full300(table(b, "C-2")), full300(table(b, "C-3")));                // 300 + 300 + 나머지 표 > 800
            fail("EditException 이 나와야 한다");
        } catch (BoardDocSpec.EditException e) {
            assertTrue(e.getMessage(), e.getMessage().contains("양식 전체에 넣을 수 있는 칸은 800개"));
        }
    }

    private static int countAnchors(BoardDocSpec.Table t) {
        int n = 0;
        for (List<BoardDocSpec.Cell> r : t.getRows()) {
            n += r.size();
        }
        return n;
    }

    // ── 연결 · 입력 칸 · 직렬화 ──

    @Test
    public void 연결_칸_위치의_일반_칸은_연결_유지_머리글_입력으로_바꾸면_연결이_풀린다() {
        BoardDocSpec.Doc b = base();
        BoardDocSpec.Table c4 = table(b, "C-4");
        assertTrue(c4.getRows().get(1).get(1).isMapped());
        for (boolean[] flags : new boolean[][]{{false, false}, {true, false}, {false, true}}) {
            List<BoardDocSpec.RowEdit> rows = rows(c4);
            List<BoardDocSpec.CellEdit> cs = new ArrayList<>(rows.get(1).getCells());
            BoardDocSpec.CellEdit c = cs.get(1);
            cs.set(1, new BoardDocSpec.CellEdit(c.getCol(), "내용", 1, 1, flags[0], flags[1], "center"));
            rows.set(1, new BoardDocSpec.RowEdit("r1", cs));
            BoardDocSpec.Doc d = rebuild(b, edit("C-4", cols(c4), rows));
            BoardDocSpec.Cell cell = table(d, "C-4").getRows().get(1).get(1);
            assertEquals(!flags[0] && !flags[1], cell.isMapped());
            assertEquals(flags[0], cell.isHeader());
            assertEquals(flags[1], cell.isInput());
            assertEquals("r1_c1", cell.getKey());
            assertEquals(cell.isMapped() ? "" : "내용", cell.getText());                      // 연결 칸 문구는 보낸 값이 아니라 샘플/빈칸
        }
    }

    @Test
    public void 직렬화_왕복_구조와_빠진_표_카운터가_보존된다() {
        BoardDocSpec.Doc b = base();
        BoardDocSpec.Doc d1 = rebuild(b, edit("A", cols(table(b, "A")), aWithNewRowAt3()));
        String json = BoardFormJson.toJson(d1);
        assertTrue(json.contains("\"id\":\"r100\""));
        assertTrue(json.contains("\"next_r\":101"));
        assertFalse(json.contains("\"cells\":{"));
        BoardDocSpec.Doc back = BoardDocSpec.build("x", "n", BoardFormJson.parse(json), false);
        assertEquals(json, BoardFormJson.toJson(back));
        assertEquals(Arrays.asList("r0", "r1", "r2", "r100", "r3", "r4"), table(back, "A").getRowIds());
        assertTrue(table(back, "A").getRows().get(3).get(1).isInput());

        // 표 A 를 양식에서 뺀다 → 카운터는 kept 로 남고, 다시 넣어도 r100 을 재사용하지 않는다(다시 넣은 표는 카탈로그 구조)
        List<BoardDocSpec.TableEdit> noA = new ArrayList<>();
        for (BoardDocSpec.Table t : d1.getTables()) {
            if (!"A".equals(t.getId())) {
                noA.add(new BoardDocSpec.TableEdit(t.getId(), null, null, null));
            }
        }
        BoardDocSpec.Doc d2 = BoardDocSpec.build("x", "n", noA, false, d1);
        assertEquals(101, d2.getKept().get("A")[0]);
        String json2 = BoardFormJson.toJson(d2);
        assertTrue(json2, json2.contains("\"kept\":[{\"ref\":\"A\",\"next_r\":101,\"next_c\":100}]"));
        BoardDocSpec.Doc back2 = BoardDocSpec.build("x", "n", BoardFormJson.parse(json2), false);
        assertEquals(json2, BoardFormJson.toJson(back2));
        List<BoardDocSpec.TableEdit> withA = new ArrayList<>();
        withA.add(new BoardDocSpec.TableEdit("A", null, null, null));
        for (BoardDocSpec.Table t : back2.getTables()) {
            withA.add(new BoardDocSpec.TableEdit(t.getId(), null, null, null));
        }
        BoardDocSpec.Doc d3 = BoardDocSpec.build("x", "n", withA, false, back2);
        assertEquals(Arrays.asList("r0", "r1", "r2", "r3", "r4"), table(d3, "A").getRowIds());   // 카탈로그 구조로 돌아온다
        assertEquals(101, table(d3, "A").getNextR());                                           // 카운터는 유지
        assertFalse(d3.getKept().containsKey("A"));
    }

    @Test
    public void withValues는_직접_입력_칸을_받고_머리글_라벨_칸은_거부한다() {
        BoardDocSpec.Doc b = base();
        BoardDocSpec.Doc d1 = rebuild(b, edit("A", cols(table(b, "A")), aWithNewRowAt3()));
        Map<String, Map<String, String>> v = new LinkedHashMap<>();
        Map<String, String> cells = new LinkedHashMap<>();
        cells.put("r100_c2", " 12.5 ");
        cells.put("r1_c2", "500");
        v.put("A", cells);
        BoardDocSpec.Table a = table(BoardDocSpec.withValues(d1, v), "A");
        assertEquals("12.5", a.getRows().get(3).get(1).getText());
        assertEquals("500", a.getRows().get(1).get(2).getText());
        assertEquals("추가 항목", a.getRows().get(3).get(0).getText());                          // 라벨은 그대로
        assertEquals("", table(BoardDocSpec.withValues(d1, null), "A").getRows().get(3).get(1).getText());   // 안 보낸 입력 칸은 빈칸
        for (String key : new String[]{"r100_c1", "r0_c0", "r2_c1"}) {
            Map<String, Map<String, String>> bad = new LinkedHashMap<>();
            Map<String, String> one = new LinkedHashMap<>();
            one.put(key, "x");
            bad.put("A", one);
            try {
                BoardDocSpec.withValues(d1, bad);
                fail("머리글·라벨 key 는 거부해야 한다: " + key);
            } catch (BoardDocSpec.EditException e) {
                assertTrue(e.getMessage(), e.getMessage().contains("값을 넣을 수 없는 칸"));
            }
        }
    }

    // ── docx 열 너비 ──

    @Test
    public void docx_열_너비는_안_건드린_표는_현재와_같고_고친_표는_합이_본문폭_최소_5퍼센트() {
        BoardDocSpec.Doc b = base();
        for (BoardDocSpec.Table t : b.getTables()) {
            assertTrue(t.getId(), Arrays.equals(BoardDocDocx.gridWidths(t.getId(), t.getColumns()), BoardDocDocx.gridWidths(t)));
        }
        assertEquals(6, b.getTables().size());
        BoardDocSpec.Doc d = rebuild(b, splitEdit(table(b, "A")));
        int[] w = BoardDocDocx.gridWidths(table(d, "A"));
        assertEquals(5, w.length);
        int sum = 0;
        for (int x : w) {
            sum += x;
            assertTrue(String.valueOf(x), x >= BoardDocDocx.BODY_W * 5 / 100 - 1);
        }
        assertEquals(BoardDocDocx.BODY_W, sum);
        // 행만 고친 표는 그대로
        BoardDocSpec.Doc rowsOnly = rebuild(b, edit("A", cols(table(b, "A")), aWithNewRowAt3()));
        assertTrue(Arrays.equals(BoardDocDocx.gridWidths("A", 4), BoardDocDocx.gridWidths(table(rowsOnly, "A"))));
        // 열을 여럿 넣어도 12열 이하면 모두 5% 이상
        BoardDocSpec.Table c4 = table(b, "C-4");
        List<BoardDocSpec.ColEdit> cs = cols(c4);
        List<BoardDocSpec.RowEdit> rows = new ArrayList<>();
        for (int i = 1; i <= 9; i++) {
            cs.add(new BoardDocSpec.ColEdit("n" + i));
        }
        for (BoardDocSpec.RowEdit r : rows(c4)) {
            List<BoardDocSpec.CellEdit> cells = new ArrayList<>(r.getCells());
            for (int i = 1; i <= 9; i++) {
                cells.add(cell("n" + i, "", 1, 1, false, false));
            }
            rows.add(new BoardDocSpec.RowEdit(r.getId(), cells));
        }
        int[] wide = BoardDocDocx.gridWidths(table(rebuild(b, edit("C-4", cs, rows)), "C-4"));
        int s2 = 0;
        for (int x : wide) {
            s2 += x;
            assertTrue(x >= BoardDocDocx.BODY_W * 5 / 100 - 1);
        }
        assertEquals(BoardDocDocx.BODY_W, s2);
    }
}
