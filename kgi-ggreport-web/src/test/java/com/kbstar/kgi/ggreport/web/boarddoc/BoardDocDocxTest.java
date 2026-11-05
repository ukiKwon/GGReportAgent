package com.kbstar.kgi.ggreport.web.boarddoc;

import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.junit.Test;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STMerge;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class BoardDocDocxTest {

    private static XWPFDocument read(boolean sample) throws Exception {
        byte[] bytes = BoardDocDocx.build(BoardDocSpec.find("default_doc", sample));
        return new XWPFDocument(new ByteArrayInputStream(bytes));
    }

    private static STMerge.Enum restartOrNull(XWPFTableCell c) {
        return c.getCTTc().getTcPr().getVMerge().getVal();
    }

    private static boolean isContinue(XWPFTableCell c) {
        return c.getCTTc().isSetTcPr() && c.getCTTc().getTcPr().getVMerge() != null
                && c.getCTTc().getTcPr().getVMerge().getVal() == null;
    }

    @Test
    public void 표A_세로_병합이_vMerge로_반영된다() throws Exception {
        XWPFDocument d = read(true);
        try {
            assertEquals(6, d.getTables().size());
            XWPFTable a = d.getTables().get(0);
            XWPFTableCell inst = a.getRow(1).getCell(0);
            assertEquals("대한민국 기관", inst.getText());
            assertEquals(STMerge.RESTART, restartOrNull(inst));
            for (int r = 2; r <= 4; r++) {
                assertTrue("row " + r, isContinue(a.getRow(r).getCell(0)));
            }
            assertEquals(STMerge.RESTART, restartOrNull(a.getRow(1).getCell(3)));   // 비고 2~4행 병합
            assertTrue(isContinue(a.getRow(2).getCell(3)));
            assertTrue(isContinue(a.getRow(3).getCell(3)));
            assertEquals("합계", a.getRow(4).getCell(1).getText());
        } finally {
            d.close();
        }
    }

    @Test
    public void 표B_가로2칸_gridSpan과_세로_병합() throws Exception {
        XWPFDocument d = read(true);
        try {
            XWPFTable b = d.getTables().get(1);
            assertEquals(8, b.getRow(0).getTableCells().size());          // 가려진 tc 는 제거됨
            assertEquals(2, b.getRow(0).getCell(0).getCTTc().getTcPr().getGridSpan().getVal().intValue());
            assertEquals(9, b.getRow(1).getTableCells().size());
            assertEquals(STMerge.RESTART, restartOrNull(b.getRow(1).getCell(0)));
            assertEquals("", b.getRow(1).getCell(0).getText());            // 확정: 1열 빈 칸
            assertEquals("명목가치", b.getRow(1).getCell(1).getText());
            assertEquals(9, b.getRow(2).getTableCells().size());
            assertTrue(isContinue(b.getRow(2).getCell(0)));
            assertEquals("현재가치", b.getRow(2).getCell(1).getText());
        } finally {
            d.close();
        }
    }

    @Test
    public void 표C5_9열_머리_가로3칸과_세로_병합() throws Exception {
        XWPFDocument d = read(true);
        try {
            XWPFTable t = d.getTables().get(5);
            assertEquals(26, t.getRows().size());
            assertEquals(7, t.getRow(0).getTableCells().size());          // 구분(3칸 병합) + 6열
            assertEquals(3, t.getRow(0).getCell(0).getCTTc().getTcPr().getGridSpan().getVal().intValue());
            assertEquals(9, t.getRow(1).getTableCells().size());
            assertEquals("수익", t.getRow(1).getCell(0).getText());
            assertEquals(STMerge.RESTART, restartOrNull(t.getRow(1).getCell(0)));
            assertTrue(isContinue(t.getRow(11).getCell(0)));              // 수익 세로 11행의 마지막
            assertEquals(8, t.getRow(11).getTableCells().size());         // 이어짐 칸 1 + 총 수익(구분2~3 병합) 1 + 값 6
            assertEquals(2, t.getRow(11).getCell(1).getCTTc().getTcPr().getGridSpan().getVal().intValue());
            assertEquals("비용", t.getRow(12).getCell(0).getText());
            assertEquals(7, t.getRow(20).getTableCells().size());         // 예상영업이익: 구분1~3 병합
            assertEquals(3, t.getRow(20).getCell(0).getCTTc().getTcPr().getGridSpan().getVal().intValue());
        } finally {
            d.close();
        }
    }

    @Test
    public void 한글_글꼴이_eastAsia까지_지정된다() throws Exception {
        XWPFDocument d = read(true);
        try {
            XWPFRun run = d.getTables().get(0).getRow(0).getCell(0).getParagraphs().get(0).getRuns().get(0);
            assertEquals("기관명", run.getText(0));
            assertEquals(BoardDocDocx.FONT, run.getFontFamily(XWPFRun.FontCharRange.eastAsia));
            assertEquals(BoardDocDocx.FONT, run.getFontFamily(XWPFRun.FontCharRange.ascii));
        } finally {
            d.close();
        }
    }

    @Test
    public void 쪽_나눔이_없고_문서_이름이_맨_위_제목이며_빈_양식() throws Exception {
        XWPFDocument d = read(false);
        try {
            for (XWPFParagraph p : d.getParagraphs()) {
                assertFalse("쪽 나눔이 없어야 한다", p.isPageBreak());
            }
            assertEquals(BoardDocSpec.DEFAULT_NAME, d.getParagraphs().get(0).getText());
            assertEquals(6, d.getTables().size());
            assertEquals("", d.getTables().get(0).getRow(1).getCell(0).getText());   // 매핑 칸 비어 있음
            assertEquals("출연금", d.getTables().get(0).getRow(1).getCell(1).getText());   // 고정 라벨은 유지
        } finally {
            d.close();
        }
    }

    private static XWPFDocument readWith(boolean sample, boolean notice) throws Exception {
        return new XWPFDocument(new ByteArrayInputStream(BoardDocDocx.build(BoardDocSpec.find("default_doc", sample), notice)));
    }

    @Test
    public void A4_세로와_여백_1134가_sectPr에_들어간다() throws Exception {
        XWPFDocument d = read(true);
        try {
            String xml = d.getDocument().getBody().getSectPr().xmlText();
            assertTrue(xml, xml.contains("w:w=\"11906\"") && xml.contains("w:h=\"16838\""));
            for (String side : new String[]{"top", "bottom", "left", "right"}) {
                assertTrue(xml, xml.contains("w:" + side + "=\"1134\""));
            }
        } finally {
            d.close();
        }
    }

    private static int[] grid(XWPFTable t) {
        org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTblGrid g = t.getCTTbl().getTblGrid();
        int[] w = new int[g.sizeOfGridColArray()];
        for (int i = 0; i < w.length; i++) {
            w[i] = Integer.parseInt(String.valueOf(g.getGridColArray(i).getW()));
        }
        return w;
    }

    private static int sum(int[] a) {
        int s = 0;
        for (int x : a) {
            s += x;
        }
        return s;
    }

    @Test
    public void 표는_고정_레이아웃이고_gridCol_비율과_행_속성이_맞다() throws Exception {
        XWPFDocument d = read(true);
        try {
            double[][] want = {{22, 34, 18, 26}, {6, 12, 11.7, 11.7, 11.7, 11.7, 11.7, 11.7, 11.7},
                    {28, 12, 12, 12, 12, 12, 12}, {28, 12, 12, 12, 12, 12, 12}, {32, 16, 52},
                    {10, 12, 22, 9, 9, 9, 9, 9, 11}};
            for (int i = 0; i < 6; i++) {
                XWPFTable t = d.getTables().get(i);
                int[] w = grid(t);
                assertEquals("표 " + i, want[i].length, w.length);
                assertEquals(9638, sum(w));
                for (int c = 0; c < w.length - 1; c++) {
                    assertEquals(9638 * want[i][c] / 100.0, w[c], 1.0);
                }
                String pr = t.getCTTbl().getTblPr().xmlText();
                assertTrue(pr, pr.contains("w:tblLayout") && pr.contains("fixed"));
                assertTrue(pr, pr.contains("w:tblCellMar") && pr.contains("w:w=\"60\""));
                for (int r = 0; r < t.getRows().size(); r++) {
                    String tr = t.getRow(r).getCtRow().getTrPr().xmlText();
                    assertTrue(tr, tr.contains("w:cantSplit"));
                    assertEquals("머리행 반복 r" + r, r == 0, tr.contains("w:tblHeader"));
                }
            }
            // 머리칸 음영
            String shd = d.getTables().get(0).getRow(0).getCell(0).getCTTc().getTcPr().xmlText();
            assertTrue(shd, shd.contains("F2F2F2") && !shd.contains("D9E2F3"));
        } finally {
            d.close();
        }
    }

    @Test
    public void 단위_문단은_제목_아래_표_위에_9pt_오른쪽_keepNext() throws Exception {
        XWPFDocument d = read(true);
        try {
            int units = 0;
            java.util.List<XWPFParagraph> ps = d.getParagraphs();
            for (int i = 0; i < ps.size(); i++) {
                XWPFParagraph p = ps.get(i);
                if ("(단위: 억원)".equals(p.getText())) {
                    units++;
                    assertEquals(org.apache.poi.xwpf.usermodel.ParagraphAlignment.RIGHT, p.getAlignment());
                    assertTrue(p.getCTP().getPPr().isSetKeepNext());
                    assertEquals(9.0, p.getRuns().get(0).getFontSizeAsDouble(), 0.01);
                    assertTrue("표 제목 keepNext", ps.get(i - 1).getCTP().getPPr().isSetKeepNext());
                }
            }
            assertEquals(5, units);   // A, B, C-2, C-3, C-5 (C-4 는 단위 없음)
        } finally {
            d.close();
        }
    }

    @Test
    public void 샘플_안내문구는_요청할_때만_제목_바로_아래에_들어간다() throws Exception {
        XWPFDocument d = readWith(true, true);
        try {
            XWPFParagraph n = d.getParagraphs().get(1);
            assertEquals("샘플 — 표의 수치는 가상 예시입니다.", n.getText());
            assertEquals("595959", n.getRuns().get(0).getColor());
            assertEquals(9.0, n.getRuns().get(0).getFontSizeAsDouble(), 0.01);
            assertEquals(120, n.getSpacingAfter());
        } finally {
            d.close();
        }
        XWPFDocument none = readWith(true, false);
        try {
            assertFalse("샘플 — 표의 수치는 가상 예시입니다.".equals(none.getParagraphs().get(1).getText()));
        } finally {
            none.close();
        }
    }

    @Test
    public void 열_수가_다른_표는_균등_분배로_폴백한다() {
        int[] w = BoardDocDocx.gridWidths("A", 3);
        assertEquals(3, w.length);
        assertEquals(9638, sum(w));
        assertEquals(3213, w[0]);
        int[] unknown = BoardDocDocx.gridWidths("ZZ", 2);
        assertEquals(4819, unknown[0]);
        assertEquals(4819, unknown[1]);
    }

    @Test
    public void 눈으로_확인할_샘플을_target에_쓴다() throws Exception {
        File dir = new File("target/boarddoc-samples");
        assertTrue(dir.isDirectory() || dir.mkdirs());
        for (boolean sample : new boolean[]{true, false}) {
            FileOutputStream o = new FileOutputStream(new File(dir, sample ? "default_doc_샘플.docx" : "default_doc_빈양식.docx"));
            try {
                o.write(BoardDocDocx.build(BoardDocSpec.find("default_doc", sample), sample));
            } finally {
                o.close();
            }
        }
    }
}
