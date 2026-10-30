package com.kbstar.kgi.ggreport.web.boarddoc;

import org.apache.poi.xwpf.usermodel.ParagraphAlignment;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTblGrid;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTblPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTblWidth;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTcPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STMerge;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STTblWidth;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigInteger;
import java.util.List;

/** BoardDocSpec → .docx. 병합은 gridSpan / vMerge 로 쓴다. 글꼴은 한글(eastAsia)까지 지정한다. */
public final class BoardDocDocx {

    public static final String FONT = "맑은 고딕";

    private BoardDocDocx() {
    }

    public static byte[] build(BoardDocSpec.Doc doc) {
        try (XWPFDocument d = new XWPFDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            run(d.createParagraph(), doc.getName(), 14, true);          // 문서 이름이 맨 위 제목
            for (BoardDocSpec.Table t : doc.getTables()) {
                run(d.createParagraph(), t.getTitle(), 11, true);
                fill(d, t);
                if (t.getNotes().isEmpty()) {
                    d.createParagraph();                                  // 표 사이 빈 문단(Word 가 연속 표를 합치지 않게)
                }
                for (String note : t.getNotes()) {
                    run(d.createParagraph(), note, 9, false);
                }
            }
            d.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("docx build failed");
        }
    }

    private static void fill(XWPFDocument d, BoardDocSpec.Table t) {
        int rowsN = t.getRows().size();
        int cols = t.getColumns();
        int[][] start = BoardDocSpec.layout(t);
        // kind: 0 없음, 1 시작칸, 2 세로 이어짐, 3 가로로 가려짐
        int[][] kind = new int[rowsN][cols];
        BoardDocSpec.Cell[][] owner = new BoardDocSpec.Cell[rowsN][cols];
        for (int r = 0; r < rowsN; r++) {
            List<BoardDocSpec.Cell> row = t.getRows().get(r);
            for (int i = 0; i < row.size(); i++) {
                BoardDocSpec.Cell cell = row.get(i);
                for (int dr = 0; dr < cell.getRowspan(); dr++) {
                    for (int dc = 0; dc < cell.getColspan(); dc++) {
                        int rr = r + dr;
                        int cc = start[r][i] + dc;
                        owner[rr][cc] = cell;
                        kind[rr][cc] = (dr == 0 && dc == 0) ? 1 : (dc == 0 ? 2 : 3);
                    }
                }
            }
        }

        XWPFTable x = d.createTable(rowsN, cols);
        CTTblPr pr = x.getCTTbl().getTblPr() != null ? x.getCTTbl().getTblPr() : x.getCTTbl().addNewTblPr();
        CTTblWidth w = pr.isSetTblW() ? pr.getTblW() : pr.addNewTblW();
        w.setType(STTblWidth.PCT);
        w.setW(BigInteger.valueOf(5000));                       // 100%
        CTTblGrid grid = x.getCTTbl().getTblGrid() != null ? x.getCTTbl().getTblGrid() : x.getCTTbl().addNewTblGrid();
        if (grid.sizeOfGridColArray() == 0) {
            for (int c = 0; c < cols; c++) {
                grid.addNewGridCol().setW(BigInteger.valueOf(9000 / cols));
            }
        }
        x.setInsideHBorder(XWPFTable.XWPFBorderType.SINGLE, 1, 0, "000000");
        x.setInsideVBorder(XWPFTable.XWPFBorderType.SINGLE, 1, 0, "000000");
        x.setTopBorder(XWPFTable.XWPFBorderType.SINGLE, 1, 0, "000000");
        x.setBottomBorder(XWPFTable.XWPFBorderType.SINGLE, 1, 0, "000000");
        x.setLeftBorder(XWPFTable.XWPFBorderType.SINGLE, 1, 0, "000000");
        x.setRightBorder(XWPFTable.XWPFBorderType.SINGLE, 1, 0, "000000");

        for (int r = 0; r < rowsN; r++) {
            for (int c = 0; c < cols; c++) {
                if (kind[r][c] == 0 || kind[r][c] == 3) {
                    continue;
                }
                BoardDocSpec.Cell cell = owner[r][c];
                XWPFTableCell tc = x.getRow(r).getCell(c);
                CTTcPr tcPr = tc.getCTTc().isSetTcPr() ? tc.getCTTc().getTcPr() : tc.getCTTc().addNewTcPr();
                if (cell.getColspan() > 1) {
                    tcPr.addNewGridSpan().setVal(BigInteger.valueOf(cell.getColspan()));
                }
                tc.setVerticalAlignment(XWPFTableCell.XWPFVertAlign.CENTER);
                if (kind[r][c] == 1) {
                    if (cell.getRowspan() > 1) {
                        tcPr.addNewVMerge().setVal(STMerge.RESTART);
                    }
                    if (cell.isHeader()) {
                        tc.setColor("D9E2F3");
                    }
                    XWPFParagraph p = tc.getParagraphs().get(0);
                    p.setAlignment(align(cell.getAlign()));
                    if (!cell.getText().isEmpty()) {
                        run(p, cell.getText(), 9, cell.isHeader());
                    }
                } else {
                    tcPr.addNewVMerge();                         // 이어짐(val 없음)
                }
            }
        }
        // 가로로 가려진 칸의 tc 제거. 뒤에서부터 지워야 인덱스가 밀리지 않는다.
        for (int r = 0; r < rowsN; r++) {
            for (int c = cols - 1; c >= 0; c--) {
                if (kind[r][c] == 3) {
                    x.getRow(r).getCtRow().removeTc(c);
                }
            }
        }
    }

    private static ParagraphAlignment align(String a) {
        if ("center".equals(a)) {
            return ParagraphAlignment.CENTER;
        }
        return "right".equals(a) ? ParagraphAlignment.RIGHT : ParagraphAlignment.LEFT;
    }

    private static XWPFRun run(XWPFParagraph p, String text, int size, boolean bold) {
        XWPFRun r = p.createRun();
        r.setText(text);
        r.setFontSize(size);
        r.setBold(bold);
        r.setFontFamily(FONT);                                               // ascii/hAnsi
        r.setFontFamily(FONT, XWPFRun.FontCharRange.eastAsia);               // 한글
        return r;
    }
}
