package com.kbstar.kgi.ggreport.web.docout;

import org.apache.poi.wp.usermodel.HeaderFooterType;
import org.apache.poi.xwpf.usermodel.ParagraphAlignment;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFFooter;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.xmlbeans.XmlCursor;
import org.apache.xmlbeans.XmlObject;
import org.apache.xmlbeans.impl.xb.xmlschema.SpaceAttribute;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTBody;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTBorder;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTFonts;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTInd;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTP;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTPPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTPageMar;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTPageSz;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTR;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTRPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTRow;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTSectPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTShd;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTSimpleField;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTSpacing;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTbl;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTblBorders;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTblCellMar;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTblGrid;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTblPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTblWidth;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTc;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTcPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTText;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTrPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STBorder;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STBrType;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STJc;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STMerge;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STShd;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STTblLayoutType;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STTblWidth;
import org.openxmlformats.schemas.officeDocument.x2006.sharedTypes.STVerticalAlignRun;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STVerticalJc;

import javax.xml.namespace.QName;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigInteger;
import java.util.List;

/**
 * DocModel → .docx(NEXT 100 S0). A4·맑은 고딕(eastAsia 포함). 글자는 {@code setStringValue} 만 쓴다 — 하이퍼링크·필드에 사용자 값을 넣지 않는다
 * (필드는 바닥글의 쪽 번호 PAGE 하나뿐, 고정 값).
 *
 * <p>표 속 표: 문서·칸의 끝(문서는 sectPr 앞)에 커서로 문단·표를 <b>순서대로</b> 끼운다 — addNewP/addNewTbl 은 같은 종류 뒤에 붙어 순서가 꼬일 수 있다.
 * 칸의 마지막 요소는 반드시 문단이어야 해서(없으면 Word 손상 경고) 표로 끝나는 칸에는 1pt 빈 문단을 붙이고, 겉 표끼리 붙지 않게 사이에도 붙인다.
 * 겉 표에는 {@code cantSplit} 을 걸지 않는다({@link DocModel.Table#isRowsCantSplit()} 가 false). 음영 HATCH = thinDiagStripe.
 */
public final class DocxKit {

    public static final String FONT = "맑은 고딕";
    static final int PAGE_W = 11906;
    static final int PAGE_H = 16838;
    static final int MARGIN = 1134;
    public static final int BODY_W = PAGE_W - 2 * MARGIN;
    private static final int CELL_MAR_LR = 100;
    private static final int CELL_MAR_TB = 40;
    private static final String W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

    /** 바닥글 — 가운데 쪽 번호(PAGE 필드) 하나와 고정 문구. null 이면 바닥글 없음. */
    public static final class Footer {
        private final String text;
        private final boolean pageNumber;

        public Footer(String text, boolean pageNumber) {
            this.text = text == null ? "" : text;
            this.pageNumber = pageNumber;
        }

        public static Footer pageNumberOnly() {
            return new Footer("", true);
        }
    }

    private DocxKit() {
    }

    /** 끼워 넣을 자리 — 호출마다 새 커서를 준다(쓰고 나면 dispose). */
    private interface Sink {
        XmlCursor open();
    }

    public static byte[] render(DocModel doc, Footer footer) {
        try (XWPFDocument d = new XWPFDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            final CTBody body = d.getDocument().getBody();
            final CTSectPr sect = page(body);
            Sink bodySink = new Sink() {
                @Override
                public XmlCursor open() {
                    return sect.newCursor();   // sectPr 시작 앞
                }
            };
            emitBlocks(bodySink, doc.getBlocks(), BODY_W, DocModel.Align.LEFT);
            if (footer != null) {
                addFooter(d, footer);
            }
            d.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("docx build failed");
        }
    }

    private static CTSectPr page(CTBody body) {
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
        return s;
    }

    // ── 블록 ────────────────────────────────────────────────────────────

    private static void emitBlocks(Sink sink, List<DocModel.Block> blocks, int widthTw, DocModel.Align cellAlign) {
        DocModel.Block prev = null;
        for (DocModel.Block b : blocks) {
            if (b instanceof DocModel.Table && prev instanceof DocModel.Table) {
                emitSpacer(sink);   // 붙은 표를 Word 가 합치지 않게
            }
            if (b instanceof DocModel.Heading) {
                DocModel.Heading h = (DocModel.Heading) b;
                CTP p = insert(sink, "p", CTP.class);
                CTPPr pPr = p.addNewPPr();
                pPr.addNewKeepNext();
                CTSpacing sp = pPr.addNewSpacing();
                sp.setBefore(BigInteger.ZERO);
                sp.setAfter(BigInteger.valueOf(120));
                emitRun(p, h.getText(), h.getSize(), true, false);
            } else if (b instanceof DocModel.Para) {
                emitPara(sink, (DocModel.Para) b, cellAlign);
            } else if (b instanceof DocModel.PageBreak) {
                CTP p = insert(sink, "p", CTP.class);
                CTR r = p.addNewR();
                r.addNewBr().setType(STBrType.PAGE);
            } else if (b instanceof DocModel.Table) {
                emitTable(sink, (DocModel.Table) b, widthTw);
            }
            prev = b;
        }
        if (prev == null || prev instanceof DocModel.Table) {
            emitSpacer(sink);   // 마지막 요소는 문단
        }
    }

    private static void emitSpacer(Sink sink) {
        CTP p = insert(sink, "p", CTP.class);
        CTPPr pPr = p.addNewPPr();
        CTSpacing sp = pPr.addNewSpacing();
        sp.setBefore(BigInteger.ZERO);
        sp.setAfter(BigInteger.ZERO);
        pPr.addNewRPr().addNewSz().setVal(BigInteger.valueOf(2));   // 1pt
    }

    private static void emitPara(Sink sink, DocModel.Para para, DocModel.Align cellAlign) {
        CTP p = insert(sink, "p", CTP.class);
        CTPPr pPr = p.addNewPPr();
        CTSpacing sp = pPr.addNewSpacing();
        sp.setBefore(BigInteger.ZERO);
        sp.setAfter(BigInteger.valueOf(40));
        DocModel.Align a = para.getAlign() != DocModel.Align.LEFT ? para.getAlign() : cellAlign;
        if (a == DocModel.Align.CENTER) {
            pPr.addNewJc().setVal(STJc.CENTER);
        } else if (a == DocModel.Align.RIGHT) {
            pPr.addNewJc().setVal(STJc.RIGHT);
        }
        String prefix = "";
        if (para.getBullet() != DocModel.Bullet.NONE) {
            prefix = para.getBullet() == DocModel.Bullet.CIRCLE_O ? "ㅇ " : "- ";
            int hanging = para.getSize() * 20;   // 글자 크기만큼 내어쓰기(글머리 + 공백 폭 근사)
            CTInd ind = pPr.addNewInd();
            ind.setLeft(BigInteger.valueOf(hanging + para.getLevel() * 260L));
            ind.setHanging(BigInteger.valueOf(hanging));
        }
        boolean first = true;
        for (DocModel.Run r : para.getRuns()) {
            String text = first ? prefix + r.getText() : r.getText();
            first = false;
            emitRun(p, text, para.getSize(), r.isBold(), r.isSuperscript());
        }
        if (para.getRuns().isEmpty() && !prefix.isEmpty()) {
            emitRun(p, prefix, para.getSize(), false, false);
        }
    }

    /** 한 줄바꿈마다 따로 run — CTR 안에서 t 와 br 을 섞으면 순서가 꼬일 수 있다. */
    private static void emitRun(CTP p, String text, int size, boolean bold, boolean superscript) {
        String[] lines = clean(text).split("\n", -1);
        for (int i = 0; i < lines.length; i++) {
            if (i > 0) {
                CTR br = p.addNewR();
                fmt(br, size, bold, superscript);
                br.addNewBr();
            }
            if (lines[i].isEmpty()) {
                continue;
            }
            CTR r = p.addNewR();
            fmt(r, size, bold, superscript);
            CTText t = r.addNewT();
            t.setStringValue(lines[i]);
            t.setSpace(SpaceAttribute.Space.PRESERVE);
        }
    }

    private static void fmt(CTR r, int size, boolean bold, boolean superscript) {
        CTRPr pr = r.addNewRPr();
        CTFonts f = pr.addNewRFonts();
        f.setAscii(FONT);
        f.setHAnsi(FONT);
        f.setEastAsia(FONT);
        if (bold) {
            pr.addNewB();
        }
        pr.addNewSz().setVal(BigInteger.valueOf(size * 2L));
        if (superscript) {
            pr.addNewVertAlign().setVal(STVerticalAlignRun.SUPERSCRIPT);
        }
    }

    /** 글자 순서를 바꾸는 양방향 제어 문자(LRM·RLM·ALM·LRE~RLO·LRI~PDI) — 문서 본문에 두지 않는다. */
    private static boolean isBidiControl(char c) {
        return c == 0x200E || c == 0x200F || c == 0x061C || (c >= 0x202A && c <= 0x202E) || (c >= 0x2066 && c <= 0x2069);
    }

    /** XML 에 못 쓰는 제어 문자·짝 없는 서로게이트·양방향 제어 문자를 뺀다. 줄바꿈(\n)만 남기고 \r·\t 는 공백/삭제. */
    static String clean(String s) {
        if (s == null) {
            return "";
        }
        StringBuilder b = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\n') {
                b.append(c);
            } else if (c == '\t') {
                b.append(' ');
            } else if (c < 0x20 || isBidiControl(c)) {
                continue;
            } else if (Character.isHighSurrogate(c)) {
                if (i + 1 < s.length() && Character.isLowSurrogate(s.charAt(i + 1))) {
                    b.append(c).append(s.charAt(++i));
                }
            } else if (Character.isLowSurrogate(c) || c == 0xFFFE || c == 0xFFFF) {
                continue;
            } else {
                b.append(c);
            }
        }
        return b.toString();
    }

    // ── 표 ──────────────────────────────────────────────────────────────

    private static int[] widths(DocModel.Table t, int total) {
        int n = t.getColumns();
        double[] pct = t.getColWidthsPct();
        double sum = 0;
        for (int i = 0; i < n; i++) {
            sum += pct == null ? 1 : pct[i];
        }
        int[] out = new int[n];
        int used = 0;
        for (int i = 0; i < n - 1; i++) {
            out[i] = (int) Math.round(total * (pct == null ? 1 : pct[i]) / sum);
            used += out[i];
        }
        out[n - 1] = total - used;
        return out;
    }

    private static void border(CTBorder b) {
        b.setVal(STBorder.SINGLE);
        b.setSz(BigInteger.valueOf(4));
        b.setSpace(BigInteger.ZERO);
        b.setColor("000000");
    }

    private static void emitTable(Sink sink, DocModel.Table t, int widthTw) {
        int[][] start = t.layout();
        int rowsN = t.getRows().size();
        int cols = t.getColumns();
        // kind: 0 없음, 1 시작칸, 2 세로 이어짐, 3 가로로 가려짐
        int[][] kind = new int[rowsN][cols];
        DocModel.Cell[][] owner = new DocModel.Cell[rowsN][cols];
        for (int r = 0; r < rowsN; r++) {
            List<DocModel.Cell> row = t.getRows().get(r);
            for (int i = 0; i < row.size(); i++) {
                DocModel.Cell cell = row.get(i);
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
        int[] gw = widths(t, widthTw);

        CTTbl tbl = insert(sink, "tbl", CTTbl.class);
        CTTblPr pr = tbl.addNewTblPr();
        CTTblWidth tw = pr.addNewTblW();
        tw.setType(STTblWidth.DXA);
        tw.setW(BigInteger.valueOf(widthTw));
        CTTblBorders bd = pr.addNewTblBorders();
        border(bd.addNewTop());
        border(bd.addNewLeft());
        border(bd.addNewBottom());
        border(bd.addNewRight());
        border(bd.addNewInsideH());
        border(bd.addNewInsideV());
        pr.addNewTblLayout().setType(STTblLayoutType.FIXED);
        CTTblCellMar mar = pr.addNewTblCellMar();
        for (CTTblWidth side : new CTTblWidth[]{mar.addNewTop(), mar.addNewLeft(), mar.addNewBottom(), mar.addNewRight()}) {
            side.setType(STTblWidth.DXA);
        }
        mar.getTop().setW(BigInteger.valueOf(CELL_MAR_TB));
        mar.getBottom().setW(BigInteger.valueOf(CELL_MAR_TB));
        mar.getLeft().setW(BigInteger.valueOf(CELL_MAR_LR));
        mar.getRight().setW(BigInteger.valueOf(CELL_MAR_LR));
        CTTblGrid grid = tbl.addNewTblGrid();
        for (int c = 0; c < cols; c++) {
            grid.addNewGridCol().setW(BigInteger.valueOf(gw[c]));
        }

        for (int r = 0; r < rowsN; r++) {
            CTRow tr = tbl.addNewTr();
            boolean head = r < t.getHeaderRows();
            if (t.isRowsCantSplit() || head) {
                CTTrPr trPr = tr.addNewTrPr();
                trPr.addNewCantSplit();
                if (head) {
                    trPr.addNewTblHeader();
                }
            }
            for (int c = 0; c < cols; c++) {
                if (kind[r][c] == 0 || kind[r][c] == 3) {
                    continue;
                }
                DocModel.Cell cell = owner[r][c];
                int span = 0;
                for (int k = c; k < c + cell.getColspan(); k++) {
                    span += gw[k];
                }
                final CTTc tc = tr.addNewTc();
                CTTcPr tcPr = tc.addNewTcPr();
                CTTblWidth tcW = tcPr.addNewTcW();
                tcW.setType(STTblWidth.DXA);
                tcW.setW(BigInteger.valueOf(span));
                if (cell.getColspan() > 1) {
                    tcPr.addNewGridSpan().setVal(BigInteger.valueOf(cell.getColspan()));
                }
                if (cell.getRowspan() > 1) {
                    if (kind[r][c] == 1) {
                        tcPr.addNewVMerge().setVal(STMerge.RESTART);
                    } else {
                        tcPr.addNewVMerge();   // 이어짐(val 없음)
                    }
                }
                if (cell.getShade() != DocModel.Shade.NONE) {
                    CTShd shd = tcPr.addNewShd();
                    if (cell.getShade() == DocModel.Shade.HATCH) {
                        shd.setVal(STShd.THIN_DIAG_STRIPE);
                        shd.setColor("808080");
                        shd.setFill("FFFFFF");
                    } else {
                        shd.setVal(STShd.CLEAR);
                        shd.setColor("auto");
                        shd.setFill("F2F2F2");
                    }
                }
                tcPr.addNewVAlign().setVal(cell.isHeader() ? STVerticalJc.CENTER : STVerticalJc.TOP);
                if (kind[r][c] == 1) {
                    Sink cellSink = new Sink() {
                        @Override
                        public XmlCursor open() {
                            XmlCursor cur = tc.newCursor();
                            cur.toEndToken();
                            return cur;
                        }
                    };
                    emitBlocks(cellSink, cell.getBlocks(), span - 2 * CELL_MAR_LR, cell.getAlign());
                } else {
                    emptyParaIn(tc);   // 세로 병합에 가려진 칸 — 빈 문단 하나
                }
            }
        }
    }

    private static void emptyParaIn(CTTc tc) {
        CTP p = tc.addNewP();
        CTPPr pPr = p.addNewPPr();
        CTSpacing sp = pPr.addNewSpacing();
        sp.setBefore(BigInteger.ZERO);
        sp.setAfter(BigInteger.ZERO);
        pPr.addNewRPr().addNewSz().setVal(BigInteger.valueOf(2));
    }

    // ── 바닥글 ──────────────────────────────────────────────────────────

    private static void addFooter(XWPFDocument d, Footer footer) {
        XWPFFooter f = d.createFooter(HeaderFooterType.DEFAULT);
        XWPFParagraph p = f.getParagraphs().isEmpty() ? f.createParagraph() : f.getParagraphs().get(0);
        p.setAlignment(ParagraphAlignment.CENTER);
        final CTP ctp = p.getCTP();
        if (!footer.text.isEmpty()) {
            emitRun(ctp, footer.text + (footer.pageNumber ? "  " : ""), 9, false, false);
        }
        if (footer.pageNumber) {
            XmlCursor cur = ctp.newCursor();
            CTSimpleField fld;
            try {
                cur.toEndToken();
                cur.beginElement(new QName(W, "fldSimple"));
                cur.toParent();
                fld = (CTSimpleField) cur.getObject();
            } finally {
                cur.dispose();
            }
            fld.setInstr(" PAGE ");
            CTR r = fld.addNewR();
            fmt(r, 9, false, false);
            r.addNewT().setStringValue("1");
        }
    }

    // ── 끼워 넣기 ───────────────────────────────────────────────────────

    /** 자리({@code sink})에 w:{@code local} 요소를 끼우고 형식 있는 객체로 돌려준다(POI 의 insertNewParagraph 와 같은 방식). */
    private static <T extends XmlObject> T insert(Sink sink, String local, Class<T> type) {
        XmlCursor cur = sink.open();
        try {
            cur.beginElement(new QName(W, local));
            cur.toParent();
            return type.cast(cur.getObject());
        } finally {
            cur.dispose();
        }
    }
}
