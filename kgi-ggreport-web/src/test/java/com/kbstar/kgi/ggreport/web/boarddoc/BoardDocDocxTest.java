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
            assertEquals(5, d.getTables().size());
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
            assertEquals(5, d.getTables().size());
            assertEquals("", d.getTables().get(0).getRow(1).getCell(0).getText());   // 매핑 칸 비어 있음
            assertEquals("출연금", d.getTables().get(0).getRow(1).getCell(1).getText());   // 고정 라벨은 유지
        } finally {
            d.close();
        }
    }

    @Test
    public void 눈으로_확인할_샘플을_target에_쓴다() throws Exception {
        File dir = new File("target/boarddoc-samples");
        assertTrue(dir.isDirectory() || dir.mkdirs());
        for (boolean sample : new boolean[]{true, false}) {
            FileOutputStream o = new FileOutputStream(new File(dir, sample ? "default_doc_샘플.docx" : "default_doc_빈양식.docx"));
            try {
                o.write(BoardDocDocx.build(BoardDocSpec.find("default_doc", sample)));
            } finally {
                o.close();
            }
        }
    }
}
