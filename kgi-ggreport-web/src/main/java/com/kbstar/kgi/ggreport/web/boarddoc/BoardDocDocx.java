package com.kbstar.kgi.ggreport.web.boarddoc;

import org.apache.poi.xwpf.usermodel.ParagraphAlignment;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTBody;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTPageMar;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTPageSz;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTSectPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTblCellMar;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTblGrid;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTblPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTblWidth;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTcPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTrPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STMerge;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STTblLayoutType;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STTblWidth;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigInteger;
import java.util.List;

/** BoardDocSpec → .docx. 병합은 gridSpan / vMerge 로 쓴다. 글꼴은 한글(eastAsia)까지 지정한다. */
public final class BoardDocDocx {

    public static final String FONT = "맑은 고딕";

    public static final String SAMPLE_NOTICE = "샘플 — 표의 수치는 가상 예시입니다.";
    /** A4 세로, 여백 상하좌우 1134 twips(2cm) → 본문 폭 9638. */
    static final int PAGE_W = 11906;
    static final int PAGE_H = 16838;
    static final int MARGIN = 1134;
    static final int BODY_W = PAGE_W - 2 * MARGIN;

    private BoardDocDocx() {
    }

    /** 안내 문구 없는 기본 출력(작성 모드 draft-docx 등). */
    public static byte[] build(BoardDocSpec.Doc doc) {
        return build(doc, false);
    }

    /** sampleNotice=true 면 문서 제목 바로 아래에 가상 예시 안내 문구를 넣는다(보기 모드 샘플 전용). */
    public static byte[] build(BoardDocSpec.Doc doc, boolean sampleNotice) {
        try (XWPFDocument d = new XWPFDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            page(d);
            run(d.createParagraph(), doc.getName(), 14, true);          // 문서 이름이 맨 위 제목
            if (sampleNotice) {
                XWPFParagraph np = d.createParagraph();
                np.setSpacingAfter(120);                                  // 6pt
                run(np, SAMPLE_NOTICE, 9, false).setColor("595959");
            }
            for (BoardDocSpec.Table t : doc.getTables()) {
                XWPFParagraph tp = d.createParagraph();
                keepNext(tp);
                if (isCompact(t.getId())) {
                    tp.setPageBreak(true);                                // pageBreakBefore: 항상 새 쪽에서 시작
                }
                run(tp, t.getTitle(), 11, true);
                if (!t.getUnit().isEmpty()) {
                    XWPFParagraph up = d.createParagraph();
                    keepNext(up);
                    up.setAlignment(ParagraphAlignment.RIGHT);
                    run(up, t.getUnit(), 9, false);
                }
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

    /** 행이 많아 한 쪽에 맞춰야 하는 표(C-5, 26행): 새 쪽 시작 + 8pt + 문단 간격 0. 다른 표는 그대로다. */
    static boolean isCompact(String id) {
        return BoardDocSpec.C5_REF.equals(id);
    }

    static final int COMPACT_PT = 8;
    static final int CELL_PT = 9;

    /** POI 5.2.3 의 setKeepNext 는 pPr 가 없으면 NPE 라 먼저 만든다. */
    private static void keepNext(XWPFParagraph p) {
        if (!p.getCTP().isSetPPr()) {
            p.getCTP().addNewPPr();
        }
        p.setKeepNext(true);
    }

    private static void page(XWPFDocument d) {
        CTBody body = d.getDocument().getBody();
        CTSectPr s = body.isSetSectPr() ? body.getSectPr() : body.addNewSectPr();
        CTPageSz sz = s.isSetPgSz() ? s.getPgSz() : s.addNewPgSz();
        sz.setW(BigInteger.valueOf(PAGE_W));
        sz.setH(BigInteger.valueOf(PAGE_H));
        CTPageMar mar = s.isSetPgMar() ? s.getPgMar() : s.addNewPgMar();
        mar.setTop(BigInteger.valueOf(MARGIN));
        mar.setBottom(BigInteger.valueOf(MARGIN));
        mar.setLeft(BigInteger.valueOf(MARGIN));
        mar.setRight(BigInteger.valueOf(MARGIN));
        mar.setHeader(BigInteger.valueOf(709));
        mar.setFooter(BigInteger.valueOf(709));
        mar.setGutter(BigInteger.ZERO);
    }

    /** 표별 열 너비 비율(%). 열 수가 다르거나 모르는 표는 null → 균등 분배. */
    private static double[] pct(String id, int cols) {
        double[] p = null;
        if ("A".equals(id)) {
            p = new double[]{22, 34, 18, 26};
        } else if ("B".equals(id)) {
            p = new double[]{6, 12, 11.7, 11.7, 11.7, 11.7, 11.7, 11.7, 11.7};
        } else if ("C-2".equals(id)) {
            p = new double[]{28, 12, 12, 12, 12, 12, 12};
        } else if ("C-3".equals(id)) {
            p = new double[]{28, 12, 12, 12, 12, 12, 12};          // 구분 + 사업초기·1~4년차·계 (7열)
        } else if ("C-4".equals(id)) {
            p = new double[]{32, 16, 52};
        } else if ("C-5".equals(id)) {
            p = new double[]{10, 12, 22, 9, 9, 9, 9, 9, 11};       // 구분1~3 + 사업초기·1~4년차·계 (9열, 합 100)
        }
        return p != null && p.length == cols ? p : null;
    }

    /** gridCol 너비(twips). 합이 항상 BODY_W 가 되도록 마지막 열이 나머지를 받는다. */
    static int[] gridWidths(String id, int cols) {
        double[] p = pct(id, cols);
        int[] w = new int[cols];
        int used = 0;
        for (int c = 0; c < cols - 1; c++) {
            w[c] = (int) Math.round(BODY_W * (p == null ? 100.0 / cols : p[c]) / 100.0);
            used += w[c];
        }
        w[cols - 1] = BODY_W - used;
        return w;
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

        boolean compact = isCompact(t.getId());
        int cellPt = compact ? COMPACT_PT : CELL_PT;
        XWPFTable x = d.createTable(rowsN, cols);
        CTTblPr pr = x.getCTTbl().getTblPr() != null ? x.getCTTbl().getTblPr() : x.getCTTbl().addNewTblPr();
        CTTblWidth w = pr.isSetTblW() ? pr.getTblW() : pr.addNewTblW();
        w.setType(STTblWidth.DXA);
        w.setW(BigInteger.valueOf(BODY_W));
        (pr.isSetTblLayout() ? pr.getTblLayout() : pr.addNewTblLayout()).setType(STTblLayoutType.FIXED);
        CTTblCellMar mar = pr.isSetTblCellMar() ? pr.getTblCellMar() : pr.addNewTblCellMar();
        for (CTTblWidth side : new CTTblWidth[]{mar.isSetLeft() ? mar.getLeft() : mar.addNewLeft(),
                mar.isSetRight() ? mar.getRight() : mar.addNewRight()}) {
            side.setType(STTblWidth.DXA);
            side.setW(BigInteger.valueOf(60));
        }
        int[] gw = gridWidths(t.getId(), cols);
        CTTblGrid grid = x.getCTTbl().getTblGrid() != null ? x.getCTTbl().getTblGrid() : x.getCTTbl().addNewTblGrid();
        while (grid.sizeOfGridColArray() > 0) {
            grid.removeGridCol(0);
        }
        for (int c = 0; c < cols; c++) {
            grid.addNewGridCol().setW(BigInteger.valueOf(gw[c]));
        }
        for (int r = 0; r < rowsN; r++) {
            XWPFTableRow row = x.getRow(r);
            CTTrPr trPr = row.getCtRow().isSetTrPr() ? row.getCtRow().getTrPr() : row.getCtRow().addNewTrPr();
            trPr.addNewCantSplit();
            if (r == 0) {
                trPr.addNewTblHeader();
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
                int span = 0;
                for (int k = c; k < c + cell.getColspan(); k++) {
                    span += gw[k];
                }
                CTTblWidth tcW = tcPr.isSetTcW() ? tcPr.getTcW() : tcPr.addNewTcW();
                tcW.setType(STTblWidth.DXA);
                tcW.setW(BigInteger.valueOf(span));
                tc.setVerticalAlignment(XWPFTableCell.XWPFVertAlign.CENTER);
                if (kind[r][c] == 1) {
                    if (cell.getRowspan() > 1) {
                        tcPr.addNewVMerge().setVal(STMerge.RESTART);
                    }
                    if (cell.isHeader()) {
                        tc.setColor("F2F2F2");
                    }
                    XWPFParagraph p = tc.getParagraphs().get(0);
                    p.setAlignment(align(cell.getAlign()));
                    if (compact) {
                        compactPara(p);
                    }
                    if (!cell.getText().isEmpty()) {
                        run(p, cell.getText(), cellPt, cell.isHeader());
                    }
                } else {
                    tcPr.addNewVMerge();                         // 이어짐(val 없음)
                    if (compact) {
                        compactPara(tc.getParagraphs().get(0));  // 빈 문단 기호 크기가 행 높이를 키우지 않게
                    }
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

    /** 간격 앞뒤 0, 줄간격 single, 문단 기호(빈 칸 높이)도 8pt. */
    private static void compactPara(XWPFParagraph p) {
        p.setSpacingBefore(0);
        p.setSpacingAfter(0);
        p.setSpacingBetween(1.0, org.apache.poi.xwpf.usermodel.LineSpacingRule.AUTO);
        if (!p.getCTP().isSetPPr()) {
            p.getCTP().addNewPPr();
        }
        p.getCTP().getPPr().addNewRPr().addNewSz().setVal(BigInteger.valueOf(COMPACT_PT * 2L));
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
