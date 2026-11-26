package com.kbstar.kgi.ggreport.web.docout;

import org.apache.poi.wp.usermodel.HeaderFooterType;
import org.apache.poi.openxml4j.exceptions.InvalidFormatException;
import org.apache.poi.xwpf.usermodel.Document;
import org.apache.poi.xwpf.usermodel.ParagraphAlignment;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFFooter;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFPicture;
import org.apache.xmlbeans.XmlCursor;
import org.apache.xmlbeans.XmlObject;
import org.apache.xmlbeans.impl.xb.xmlschema.SpaceAttribute;
import org.openxmlformats.schemas.drawingml.x2006.main.CTBlipFillProperties;
import org.openxmlformats.schemas.drawingml.x2006.main.CTRelativeRect;
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
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTSpacing;import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTbl;
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
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STLineSpacingRule;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STMerge;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STShd;import org.openxmlformats.schemas.wordprocessingml.x2006.main.STTblLayoutType;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STTblWidth;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STUnderline;
import org.openxmlformats.schemas.officeDocument.x2006.sharedTypes.STVerticalAlignRun;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STVerticalJc;

import javax.xml.namespace.QName;
import java.io.ByteArrayInputStream;
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
    static final int CELL_MAR_LR = 100;
    static final int CELL_MAR_TB = 40;
    private static final String W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    /** render 가 도는 동안만 현재 문서를 든다 — 그림(Picture)이 문서 부품에 등록돼야 해서. 스레드마다 따로, render 끝에 반드시 비운다. */
    private static final ThreadLocal<XWPFDocument> CUR_DOC = new ThreadLocal<XWPFDocument>();
    /** render 가 도는 동안 간격용 문단의 exact 줄 높이(tw) — 없으면(-1) 지금까지와 같은 XML. */
    private static final ThreadLocal<Integer> SPACER_TW = new ThreadLocal<Integer>();

    /** 쪽 여백(twips)과 머리글·바닥글 거리. 기본은 위·아래·좌·우 1134, 머리글·바닥글 709. */
    public static final class PageMargins {
        private final int top;
        private final int bottom;
        private final int left;
        private final int right;
        private final int header;
        private final int footer;

        public PageMargins(int top, int bottom, int left, int right, int header, int footer) {
            if (top < 0 || bottom < 0 || left < 0 || right < 0 || header < 0 || footer < 0
                    || top > 5000 || bottom > 5000 || left > 5000 || right > 5000 || header > 5000 || footer > 5000) {
                throw new IllegalArgumentException("page margins");
            }
            this.top = top;
            this.bottom = bottom;
            this.left = left;
            this.right = right;
            this.header = header;
            this.footer = footer;
        }

        public static PageMargins standard() {
            return new PageMargins(MARGIN, MARGIN, MARGIN, MARGIN, 709, 709);
        }

        public int getTop() {
            return top;
        }

        public int getBottom() {
            return bottom;
        }

        public int getLeft() {
            return left;
        }

        public int getRight() {
            return right;
        }

        public int getHeader() {
            return header;
        }

        public int getFooter() {
            return footer;
        }
    }

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
        return render(doc, footer, null);
    }

    /** @param margins null 이면 모델이 정한 여백, 그것도 없으면 기본(1134 전부, 머리글·바닥글 709). */
    public static byte[] render(DocModel doc, Footer footer, PageMargins margins) {
        PageMargins m = margins != null ? margins : doc.getPageMargins() != null ? doc.getPageMargins() : PageMargins.standard();
        try (XWPFDocument d = new XWPFDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            CUR_DOC.set(d);
            SPACER_TW.set(Integer.valueOf(doc.getSpacerLineTw()));
            final CTBody body = d.getDocument().getBody();
            final CTSectPr sect = page(body, doc.isPageBorder(), m);
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
        } finally {
            CUR_DOC.remove();
            SPACER_TW.remove();
        }
    }

    /** 간격용 문단에 exact 줄 높이를 건다 — 모델이 정했을 때만(없으면 아무것도 하지 않아 XML 이 그대로). */
    private static void spacerLine(CTSpacing sp) {
        Integer tw = SPACER_TW.get();
        if (tw != null && tw.intValue() >= 0) {
            sp.setLine(BigInteger.valueOf(tw.intValue()));
            sp.setLineRule(STLineSpacingRule.EXACT);
        }
    }

    private static CTSectPr page(CTBody body, boolean pageBorder, PageMargins pm) {
        CTSectPr s = body.isSetSectPr() ? body.getSectPr() : body.addNewSectPr();
        CTPageSz sz = s.isSetPgSz() ? s.getPgSz() : s.addNewPgSz();
        sz.setW(BigInteger.valueOf(PAGE_W));
        sz.setH(BigInteger.valueOf(PAGE_H));
        CTPageMar mar = s.isSetPgMar() ? s.getPgMar() : s.addNewPgMar();
        mar.setTop(BigInteger.valueOf(pm.getTop()));
        mar.setBottom(BigInteger.valueOf(pm.getBottom()));
        mar.setLeft(BigInteger.valueOf(pm.getLeft()));
        mar.setRight(BigInteger.valueOf(pm.getRight()));
        mar.setHeader(BigInteger.valueOf(pm.getHeader()));
        mar.setFooter(BigInteger.valueOf(pm.getFooter()));
        mar.setGutter(BigInteger.ZERO);
        if (pageBorder) {
            addPageBorder(s);
        }
        return s;
    }

    /** 쪽 전체 가는 선(0.5pt) 테두리 — 글 영역에서 20pt 바깥. pgMar 바로 뒤(스키마 순서)에 끼운다. 타입 클래스 없이 커서로 쓴다(lite 스키마 의존 회피). */
    private static void addPageBorder(CTSectPr s) {
        XmlCursor c = s.getPgMar().newCursor();
        try {
            c.toEndToken();
            c.toNextToken();   // pgMar 끝 다음
            c.beginElement(new QName(W, "pgBorders"));
            c.insertAttributeWithValue(new QName(W, "offsetFrom"), "text");
            for (String side : new String[]{"top", "left", "bottom", "right"}) {
                c.beginElement(new QName(W, side));
                c.insertAttributeWithValue(new QName(W, "val"), "single");
                c.insertAttributeWithValue(new QName(W, "sz"), "4");
                c.insertAttributeWithValue(new QName(W, "space"), "20");
                c.insertAttributeWithValue(new QName(W, "color"), "000000");
                c.toNextToken();   // 이 변 요소의 끝 다음
            }
        } finally {
            c.dispose();
        }
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
                if (h.getLineTw() >= 0) {
                    sp.setLine(BigInteger.valueOf(h.getLineTw()));
                    sp.setLineRule(STLineSpacingRule.EXACT);
                }
                emitRun(p, h.getText(), h.getSize(), true, false);
            } else if (b instanceof DocModel.Para) {
                emitPara(sink, (DocModel.Para) b, cellAlign);
            } else if (b instanceof DocModel.PageBreak) {
                CTP p = insert(sink, "p", CTP.class);
                Integer stw = SPACER_TW.get();
                if (stw != null && stw.intValue() >= 0) {   // 쪽 나눔 문단이 앞 쪽 끝·다음 쪽 첫머리에서 한 줄 높이를 차지하지 않게
                    CTSpacing psp = p.addNewPPr().addNewSpacing();
                    psp.setBefore(BigInteger.ZERO);
                    psp.setAfter(BigInteger.ZERO);
                    spacerLine(psp);
                }
                CTR r = p.addNewR();
                r.addNewBr().setType(STBrType.PAGE);
            } else if (b instanceof DocModel.Picture) {
                emitPicture(sink, (DocModel.Picture) b);
            } else if (b instanceof DocModel.Table) {
                emitTable(sink, (DocModel.Table) b, widthTw);
            }
            prev = b;
        }
        if (prev == null || prev instanceof DocModel.Table) {
            emitSpacer(sink);   // 마지막 요소는 문단
        }
    }

    /** 그림 한 개를 담은 문단. 아래 문단(캡션)과 같은 쪽에 남게 keepNext. 오류는 내용 없이 같은 문구로만 던진다. */
    private static void emitPicture(Sink sink, DocModel.Picture pic) {
        XWPFDocument d = CUR_DOC.get();
        if (d == null) {
            throw new IllegalStateException("docx build failed");
        }
        CTP p = insert(sink, "p", CTP.class);
        CTPPr pPr = p.addNewPPr();
        pPr.addNewKeepNext();
        CTSpacing sp = pPr.addNewSpacing();
        sp.setBefore(BigInteger.ZERO);
        sp.setAfter(BigInteger.valueOf(40));
        try {
            XWPFRun run = new XWPFParagraph(p, d).createRun();
            XWPFPicture xp = run.addPicture(new ByteArrayInputStream(pic.getData()), Document.PICTURE_TYPE_JPEG, "photo.jpg",
                    pic.getWidthEmu(), pic.getHeightEmu());
            run.getCTR().getDrawingArray(0).getInlineArray(0).getDocPr().setDescr(clean(pic.getAlt()));   // 대체 글
            if (pic.hasCrop()) {
                applyCrop(xp, pic);
            }
        } catch (InvalidFormatException | IOException e) {
            throw new IllegalStateException("docx build failed");
        }
    }

    /** Word 자르기(a:srcRect, 1/1000 %). 원본 JPEG 는 그대로라 Word 에서 '자르기'를 풀어 되돌릴 수 있다. setter 시그니처가 버전마다 달라 속성을 직접 쓴다. */
    private static void applyCrop(XWPFPicture xp, DocModel.Picture pic) {
        CTBlipFillProperties bf = xp.getCTPicture().getBlipFill();
        if (bf == null) {
            throw new IllegalStateException("docx build failed");
        }
        CTRelativeRect rc = bf.isSetSrcRect() ? bf.getSrcRect() : bf.addNewSrcRect();   // 순서(blip → srcRect → stretch)는 스키마가 맞춘다
        XmlCursor c = rc.newCursor();
        try {
            c.setAttributeText(new QName("l"), String.valueOf(pic.getCropL()));
            c.setAttributeText(new QName("t"), String.valueOf(pic.getCropT()));
            c.setAttributeText(new QName("r"), String.valueOf(pic.getCropR()));
            c.setAttributeText(new QName("b"), String.valueOf(pic.getCropB()));
        } finally {
            c.dispose();
        }
    }

    private static void emitSpacer(Sink sink) {
        CTP p = insert(sink, "p", CTP.class);
        CTPPr pPr = p.addNewPPr();
        CTSpacing sp = pPr.addNewSpacing();
        sp.setBefore(BigInteger.ZERO);
        sp.setAfter(BigInteger.ZERO);
        spacerLine(sp);
        pPr.addNewRPr().addNewSz().setVal(BigInteger.valueOf(2));   // 1pt
    }

    private static void emitPara(Sink sink, DocModel.Para para, DocModel.Align cellAlign) {
        CTP p = insert(sink, "p", CTP.class);
        CTPPr pPr = p.addNewPPr();
        CTSpacing sp = pPr.addNewSpacing();
        sp.setBefore(BigInteger.valueOf(para.getSpaceBeforePt() >= 0 ? para.getSpaceBeforePt() * 20L : 0L));
        sp.setAfter(BigInteger.valueOf(para.getSpaceAfterPt() >= 0 ? para.getSpaceAfterPt() * 20L : 40L));
        if (para.getLineTw() >= 0) {
            sp.setLine(BigInteger.valueOf(para.getLineTw()));
            sp.setLineRule(STLineSpacingRule.EXACT);
        }
        DocModel.Align a = para.getAlign() != DocModel.Align.LEFT ? para.getAlign() : cellAlign;
        if (a == DocModel.Align.CENTER) {
            pPr.addNewJc().setVal(STJc.CENTER);
        } else if (a == DocModel.Align.RIGHT) {
            pPr.addNewJc().setVal(STJc.RIGHT);
        }
        String prefix = "";
        boolean squareTab = para.getBullet() == DocModel.Bullet.SQUARE;   // ■ 는 공백 대신 탭 + 1.3em 내어쓰기(디자인 11-25: 둘째 줄이 본문 첫 글자와 같은 위치)
        if (para.getBullet() != DocModel.Bullet.NONE) {
            prefix = para.getBullet() == DocModel.Bullet.CIRCLE_O ? "ㅇ " : squareTab ? "■" : "- ";
            int hanging = squareTab ? (int) Math.round(para.getSize() * 20 * 1.3)
                    : para.getSize() * 20;   // 그 밖: 글자 크기만큼 내어쓰기(글머리 + 공백 폭 근사)
            int left = hanging + para.getLevel() * 260;
            if (squareTab) {
                // Word 자동 탭에 맡기지 않고 본문 시작 위치에 명시. 타입 클래스(lite 스키마) 없이 커서로 pPr 맨 앞(tabs 는 spacing 앞)에 끼운다.
                XmlCursor tc = pPr.newCursor();
                try {
                    tc.toFirstContentToken();
                    tc.beginElement(new QName(W, "tabs"));
                    tc.beginElement(new QName(W, "tab"));
                    tc.insertAttributeWithValue(new QName(W, "val"), "left");
                    tc.insertAttributeWithValue(new QName(W, "pos"), String.valueOf(left));
                } finally {
                    tc.dispose();
                }
            }
            CTInd ind = pPr.addNewInd();
            ind.setLeft(BigInteger.valueOf(left));
            ind.setHanging(BigInteger.valueOf(hanging));
        }
        if (squareTab) {   // '■' run + 탭 run 을 따로 낸다(clean 이 \t 를 공백으로 바꾸므로 w:tab 을 직접)
            emitRun(p, prefix, para.getSize(), false, false);
            CTR tr = p.addNewR();
            fmt(tr, para.getSize(), false, false);
            tr.addNewTab();
            prefix = "";
        }
        boolean first = true;
        for (DocModel.Run r : para.getRuns()) {
            String text = first ? prefix + r.getText() : r.getText();
            first = false;
            emitRun(p, text, para.getSize(), r.isBold(), r.isSuperscript(), r.isUnderline());
        }
        if (para.getRuns().isEmpty() && !prefix.isEmpty()) {
            emitRun(p, prefix, para.getSize(), false, false);
        }
    }

    /** 한 줄바꿈마다 따로 run — CTR 안에서 t 와 br 을 섞으면 순서가 꼬일 수 있다. */
    private static void emitRun(CTP p, String text, int size, boolean bold, boolean superscript) {
        emitRun(p, text, size, bold, superscript, false);
    }

    private static void emitRun(CTP p, String text, int size, boolean bold, boolean superscript, boolean underline) {
        String[] lines = clean(text).split("\n", -1);
        for (int i = 0; i < lines.length; i++) {
            if (i > 0) {
                CTR br = p.addNewR();
                fmt(br, size, bold, superscript, underline);
                br.addNewBr();
            }
            if (lines[i].isEmpty()) {
                continue;
            }
            CTR r = p.addNewR();
            fmt(r, size, bold, superscript, underline);
            CTText t = r.addNewT();
            t.setStringValue(lines[i]);
            t.setSpace(SpaceAttribute.Space.PRESERVE);
        }
    }

    private static void fmt(CTR r, int size, boolean bold, boolean superscript) {
        fmt(r, size, bold, superscript, false);
    }

    private static void fmt(CTR r, int size, boolean bold, boolean superscript, boolean underline) {
        CTRPr pr = r.addNewRPr();
        CTFonts f = pr.addNewRFonts();
        f.setAscii(FONT);
        f.setHAnsi(FONT);
        f.setEastAsia(FONT);
        if (bold) {
            pr.addNewB();
        }
        pr.addNewSz().setVal(BigInteger.valueOf(size * 2L));
        if (underline) {
            pr.addNewU().setVal(STUnderline.SINGLE);
        }
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

    static int[] widths(DocModel.Table t, int total) {
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
        CTBorder[] sides = {bd.addNewTop(), bd.addNewLeft(), bd.addNewBottom(), bd.addNewRight(), bd.addNewInsideH(), bd.addNewInsideV()};
        for (CTBorder side : sides) {
            if (t.isBorderless()) {
                side.setVal(STBorder.NIL);   // 테두리 없는 표(추가만, 기관장 프로필)
            } else {
                border(side);
            }
        }
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
                boolean vCenter = cell.getVAlign() != null ? cell.getVAlign() == DocModel.VAlign.CENTER : cell.isHeader();
                tcPr.addNewVAlign().setVal(vCenter ? STVerticalJc.CENTER : STVerticalJc.TOP);
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
        spacerLine(sp);
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
