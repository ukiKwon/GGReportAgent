package com.kbstar.kgi.ggreport.web.service;

import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSObject;
import org.apache.pdfbox.io.MemoryUsageSetting;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.apache.pdfbox.text.PDFTextStripper;

import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * 작업함 파일에서 글을 뽑는다(NEXT 106 제안서 점검 1단계). 디스크에 풀지 않고 메모리에서 <b>한 바퀴만</b> 훑는다 —
 * 크기·중복 이름·항목 수·DTD·요소 수 검사와 글 추출이 같은 ZipInputStream 한 바퀴라 검사한 항목과 읽은 항목이 갈라지지 않는다(security S6).
 * 항목을 통째로 메모리에 담지 않고 StAX 로 흘려 읽는다(S3). Error 를 뺀 모든 실패는 결과(NOT_CHECKED/ERROR)로 돌려준다.
 * ⚠️ 동시 실행 제한이 없다 — {@link DocCheckRunner} 를 거쳐서만 부른다. 로그를 남기지 않는다(파일 글이 로그로 새지 않게).
 */
final class TaskDocExtractor {

    static final String DONE = "DONE";
    static final String PARTIAL = "PARTIAL";
    static final String NOT_CHECKED = "NOT_CHECKED";
    static final String ERROR = "ERROR";
    static final String R_BUSY = "BUSY";
    static final String R_ACTIVE = "ACTIVE_CONTENT";

    static final int TEXT_CAP = 3000000;
    static final int MAX_PAGES = 500;
    static final int MAX_LOC_NO = 9999;
    private static final long MB = 1024L * 1024;
    static final long ENTRY_MAX = 30 * MB;            // 작업함 전용 — 사전준비(100MB)보다 낮춤(security S3)
    static final long TOTAL_MAX = 200 * MB;
    static final int MAX_ENTRIES = 2000;
    static final int MAX_XML_ELEMENTS = 10000000;

    private static final byte[] PK = {0x50, 0x4B, 0x03, 0x04};
    private static final byte[] PDF = {0x25, 0x50, 0x44, 0x46, 0x2D};

    private static final Pattern SLIDE = Pattern.compile("ppt/slides/slide(\\d+)\\.xml");
    private static final Pattern NOTE = Pattern.compile("ppt/notesslides/notesslide(\\d+)\\.xml");
    private static final Pattern NOTE_RELS = Pattern.compile("ppt/notesslides/_rels/notesslide(\\d+)\\.xml\\.rels");
    private static final Pattern MASTER = Pattern.compile("ppt/(?:slidemasters|slidelayouts|notesmasters|handoutmasters)/[^/]+\\.xml");
    private static final Pattern META = Pattern.compile("docprops/(?:core|app|custom)\\.xml");
    private static final Pattern OTHER = Pattern.compile("ppt/(?:charts/chart[^/]*|diagrams/(?:data|drawing)[^/]*|comments/[^/]*)\\.xml");
    private static final Pattern REL_SLIDE = Pattern.compile("(?:^|/)slides/slide(\\d+)\\.xml$");

    private TaskDocExtractor() {
    }

    static final class Part {
        final String kind;
        final int no;
        final String text;   // 문단 경계는 '|'

        Part(String kind, int no, String text) {
            this.kind = kind;
            this.no = no;
            this.text = text;
        }
    }

    static final class Extracted {
        final String state;
        final String reason;
        final List<Part> parts;
        final boolean hasImages;
        final boolean hasEmbedded;
        final boolean orderApprox;

        Extracted(String state, String reason, List<Part> parts, boolean hasImages, boolean hasEmbedded, boolean orderApprox) {
            this.state = state;
            this.reason = reason;
            this.parts = parts;
            this.hasImages = hasImages;
            this.hasEmbedded = hasEmbedded;
            this.orderApprox = orderApprox;
        }

        static Extracted none(String reason) {
            return new Extracted(NOT_CHECKED, reason, Collections.<Part>emptyList(), false, false, false);
        }

        static Extracted error() {
            return new Extracted(ERROR, "INTERNAL", Collections.<Part>emptyList(), false, false, false);
        }

        boolean parsed() { return DONE.equals(state) || PARTIAL.equals(state); }
        boolean unsafe() { return R_ACTIVE.equals(reason); }
        boolean inconclusive() { return R_BUSY.equals(reason) || "TIMEOUT".equals(reason) || ERROR.equals(state); }
    }

    static String extOf(String name) {
        int dot = name == null ? -1 : name.lastIndexOf('.');
        return dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    /** 글을 뽑는(자리 제한이 필요한) 형식인가. */
    static boolean parses(String ext) {
        return "pptx".equals(ext) || "pdf".equals(ext);
    }

    /** 절대 던지지 않는다(Error 제외). ext 는 소문자·점 없음. 파싱하지 않는 형식은 data 를 보지 않는다. */
    static Extracted extract(String ext, byte[] data, long deadline) {
        try {
            if ("pptx".equals(ext)) {
                return pptx(data, deadline);
            }
            if ("pdf".equals(ext)) {
                return pdf(data, deadline);
            }
            if ("zip".equals(ext)) {
                return Extracted.none("ARCHIVE");
            }
            if ("png".equals(ext) || "jpg".equals(ext) || "jpeg".equals(ext)) {
                return Extracted.none("IMAGE_ONLY");
            }
            return Extracted.none("FORMAT_UNSUPPORTED");   // ppt(구형) 등
        } catch (Exception e) {   // security S6: catch-all(Error 제외)
            return Extracted.error();
        }
    }

    // ── pptx ─────────────────────────────────────────────────────────────

    private static final class Pptx {
        final List<String[]> texts = new ArrayList<String[]>();          // {부분 이름, 글}
        final List<String> sldRids = new ArrayList<String>();            // presentation.xml sldIdLst 순서
        final Map<String, String> slideRels = new HashMap<String, String>();   // rId → 슬라이드 파일 번호
        final Map<String, String> noteToSlide = new HashMap<String, String>(); // 노트 파일 번호 → 슬라이드 파일 번호
        boolean presentation;
        boolean images;
        boolean embedded;
        boolean macro;
        boolean capped;
        long chars;
        long total;
        long elements;

        Extracted result() {
            Map<Integer, Integer> visible = new HashMap<Integer, Integer>();
            boolean approx = sldRids.isEmpty() || slideRels.isEmpty();
            for (int i = 0; i < sldRids.size(); i++) {
                int file = num(slideRels.get(sldRids.get(i)));
                if (file < 0) {
                    approx = true;
                } else {
                    visible.put(file, i + 1);
                }
            }
            List<Part> parts = new ArrayList<Part>();
            boolean any = false;
            for (String[] t : texts) {
                String kind;
                int no;
                Matcher m;
                if ((m = SLIDE.matcher(t[0])).matches()) {
                    kind = "SLIDE";
                    Integer v = visible.get(num(m.group(1)));
                    if (v != null) {
                        no = v;
                    } else {
                        approx = true;
                        no = num(m.group(1));
                    }
                } else if ((m = NOTE.matcher(t[0])).matches()) {
                    kind = "NOTE";
                    int file = num(noteToSlide.get(m.group(1)));
                    Integer v = file < 0 ? null : visible.get(file);
                    if (v != null) {
                        no = v;
                    } else if (file >= 0) {
                        approx = true;
                        no = file;
                    } else {
                        no = -1;
                    }
                } else if (MASTER.matcher(t[0]).matches()) {
                    kind = "MASTER";
                    no = 0;
                } else if (META.matcher(t[0]).matches()) {
                    kind = "META";
                    no = 0;
                } else {
                    kind = "OTHER";
                    no = 0;
                }
                if (no < 0 || no > MAX_LOC_NO) {   // 번호 넘침·연결 없음(security S12)
                    kind = "OTHER";
                    no = 0;
                }
                parts.add(new Part(kind, no, t[1]));
                if (t[1].replace("|", "").trim().length() > 0) {
                    any = true;
                }
            }
            if (!any) {
                return new Extracted(NOT_CHECKED, "NO_TEXT", Collections.<Part>emptyList(), images, embedded, false);
            }
            return new Extracted(capped ? PARTIAL : DONE, capped ? "TEXT_CAP" : null, parts, images, embedded, approx);
        }
    }

    /** zip 항목 하나만 읽게 하는 덮개 — 읽은 바이트를 세고 상한·마감을 넘으면 끊는다. ZipInputStream 을 닫지 않는다. */
    private static final class Bounded extends InputStream {
        private final InputStream in;
        private final Pptx st;
        private final long deadline;
        private long size;
        String hit;

        Bounded(InputStream in, Pptx st, long deadline) {
            this.in = in;
            this.st = st;
            this.deadline = deadline;
        }

        @Override
        public int read() throws IOException {
            byte[] one = new byte[1];
            int n = read(one, 0, 1);
            return n <= 0 ? -1 : one[0] & 0xFF;
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            if (hit != null) {
                throw new IOException(hit);
            }
            int n = in.read(b, off, len);
            if (n > 0) {
                size += n;
                st.total += n;
                if (size > ENTRY_MAX || st.total > TOTAL_MAX) {
                    hit = "TOO_LARGE";
                } else if (System.nanoTime() > deadline) {
                    hit = "TIMEOUT";
                }
                if (hit != null) {
                    throw new IOException(hit);
                }
            }
            return n;
        }

        void drain() throws IOException {
            byte[] buf = new byte[8192];
            while (read(buf, 0, buf.length) > 0) {
                // 세기만 한다
            }
        }

        @Override
        public void close() {
            // ZipInputStream 은 바깥이 닫는다
        }
    }

    private static Extracted pptx(byte[] d, long deadline) {
        if (d == null || !startsWith(d, PK)) {
            return Extracted.none("FORMAT_MISMATCH");
        }
        XMLInputFactory f = XMLInputFactory.newInstance();
        f.setProperty(XMLInputFactory.SUPPORT_DTD, false);
        f.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
        Pptx st = new Pptx();
        Set<String> names = new HashSet<String>();
        try (ZipInputStream zin = new ZipInputStream(new ByteArrayInputStream(d))) {
            ZipEntry e;
            while ((e = zin.getNextEntry()) != null) {
                if (System.nanoTime() > deadline) {
                    return Extracted.none("TIMEOUT");
                }
                String name = e.getName().replace('\\', '/').toLowerCase(Locale.ROOT);
                while (name.startsWith("/")) {
                    name = name.substring(1);
                }
                if (!names.add(name)) {
                    return Extracted.none("BROKEN");                  // 중복 이름(ZipGuard·CVE-2025-31672 완화와 같은 규칙)
                }
                if (names.size() > MAX_ENTRIES) {
                    return Extracted.none("TOO_LARGE");
                }
                if (name.contains("vbaproject") || name.contains("activex") || name.contains("vbadata")) {
                    return Extracted.none(R_ACTIVE);
                }
                if (name.startsWith("ppt/media/")) {
                    st.images = true;
                }
                if (name.startsWith("ppt/embeddings/")) {
                    st.embedded = true;
                }
                Bounded in = new Bounded(zin, st, deadline);
                try {
                    String bad = part(f, name, in, st);
                    if (bad != null) {
                        return Extracted.none(bad);
                    }
                    in.drain();
                } catch (XMLStreamException | IOException x) {
                    return Extracted.none(in.hit != null ? in.hit : "BROKEN");
                }
                if (st.macro) {
                    return Extracted.none(R_ACTIVE);
                }
            }
        } catch (IOException | IllegalArgumentException x) {   // 깨진 zip·잘못된 이름 인코딩
            return Extracted.none("BROKEN");
        }
        if (names.isEmpty() || !st.presentation) {
            return Extracted.none("FORMAT_MISMATCH");
        }
        return st.result();
    }

    /** 항목 하나 처리. 이상하면 사유 코드, 정상이면 null. 글이 아닌 항목(이미지 등)은 아무것도 하지 않는다(drain 이 센다). */
    private static String part(XMLInputFactory f, String name, InputStream in, Pptx st) throws XMLStreamException {
        Matcher m;
        if ("[content_types].xml".equals(name)) {
            return contentTypes(f, in, st);
        }
        if ("ppt/presentation.xml".equals(name)) {
            st.presentation = true;
            return presentation(f, in, st);
        }
        if ("ppt/_rels/presentation.xml.rels".equals(name)) {
            return rels(f, in, st.slideRels, st);
        }
        if ((m = NOTE_RELS.matcher(name)).matches()) {
            Map<String, String> one = new HashMap<String, String>();
            String bad = rels(f, in, one, st);
            if (bad == null && !one.isEmpty()) {
                st.noteToSlide.put(m.group(1), one.values().iterator().next());
            }
            return bad;
        }
        if (SLIDE.matcher(name).matches() || NOTE.matcher(name).matches() || MASTER.matcher(name).matches()
                || META.matcher(name).matches() || OTHER.matcher(name).matches()) {
            return text(f, name, in, st);
        }
        return null;
    }

    private static String contentTypes(XMLInputFactory f, InputStream in, Pptx st) throws XMLStreamException {
        XMLStreamReader r = f.createXMLStreamReader(in);
        try {
            while (r.hasNext()) {
                int ev = r.next();
                if (ev == XMLStreamConstants.DTD) {
                    return "BROKEN";
                }
                if (ev == XMLStreamConstants.START_ELEMENT) {
                    if (++st.elements > MAX_XML_ELEMENTS) {
                        return "TOO_LARGE";
                    }
                    for (int i = 0; i < r.getAttributeCount(); i++) {
                        if (r.getAttributeValue(i).toLowerCase(Locale.ROOT).contains("macroenabled")) {
                            st.macro = true;
                        }
                    }
                }
            }
            return null;
        } finally {
            r.close();
        }
    }

    private static String presentation(XMLInputFactory f, InputStream in, Pptx st) throws XMLStreamException {
        XMLStreamReader r = f.createXMLStreamReader(in);
        try {
            while (r.hasNext()) {
                int ev = r.next();
                if (ev == XMLStreamConstants.DTD) {
                    return "BROKEN";
                }
                if (ev == XMLStreamConstants.START_ELEMENT) {
                    if (++st.elements > MAX_XML_ELEMENTS) {
                        return "TOO_LARGE";
                    }
                    if ("sldId".equals(r.getLocalName())) {
                        for (int i = 0; i < r.getAttributeCount(); i++) {
                            String ns = r.getAttributeNamespace(i);
                            if ("id".equals(r.getAttributeLocalName(i)) && ns != null && ns.contains("relationships")) {
                                st.sldRids.add(r.getAttributeValue(i));
                            }
                        }
                    }
                }
            }
            return null;
        } finally {
            r.close();
        }
    }

    private static String rels(XMLInputFactory f, InputStream in, Map<String, String> idToSlide, Pptx st)
            throws XMLStreamException {
        XMLStreamReader r = f.createXMLStreamReader(in);
        try {
            while (r.hasNext()) {
                int ev = r.next();
                if (ev == XMLStreamConstants.DTD) {
                    return "BROKEN";
                }
                if (ev == XMLStreamConstants.START_ELEMENT) {
                    if (++st.elements > MAX_XML_ELEMENTS) {
                        return "TOO_LARGE";
                    }
                    if ("Relationship".equals(r.getLocalName())) {
                        String id = r.getAttributeValue(null, "Id");
                        String target = r.getAttributeValue(null, "Target");
                        if (id != null && target != null) {
                            Matcher t = REL_SLIDE.matcher(target.replace('\\', '/').toLowerCase(Locale.ROOT));
                            if (t.find()) {
                                idToSlide.put(id, t.group(1));
                            }
                        }
                    }
                }
            }
            return null;
        } finally {
            r.close();
        }
    }

    private static String text(XMLInputFactory f, String name, InputStream in, Pptx st) throws XMLStreamException {
        boolean meta = META.matcher(name).matches();
        boolean chart = name.startsWith("ppt/charts/");
        boolean comment = name.startsWith("ppt/comments/");
        StringBuilder sb = new StringBuilder();
        int inText = 0;
        XMLStreamReader r = f.createXMLStreamReader(in);
        try {
            while (r.hasNext()) {
                int ev = r.next();
                if (ev == XMLStreamConstants.DTD) {
                    return "BROKEN";
                }
                if (ev == XMLStreamConstants.START_ELEMENT) {
                    if (++st.elements > MAX_XML_ELEMENTS) {
                        return "TOO_LARGE";
                    }
                    if (meta || textElement(r.getLocalName(), chart, comment)) {
                        inText++;
                    }
                } else if (ev == XMLStreamConstants.END_ELEMENT) {
                    String ln = r.getLocalName();
                    if (meta || textElement(ln, chart, comment)) {
                        inText--;
                        if (meta || chart || comment) {
                            sb.append('|');
                        }
                    }
                    if ("p".equals(ln) || "br".equals(ln)) {
                        sb.append('|');                       // 문단·줄 경계 — 공백 제거 뒤 낱말이 이어 붙지 않게
                    }
                } else if ((ev == XMLStreamConstants.CHARACTERS || ev == XMLStreamConstants.CDATA) && inText > 0 && !st.capped) {
                    sb.append(r.getTextCharacters(), r.getTextStart(), r.getTextLength());
                    if (st.chars + sb.length() > TEXT_CAP) {
                        st.capped = true;
                        sb.setLength((int) Math.max(0, TEXT_CAP - st.chars));
                    }
                }
            }
        } finally {
            r.close();
        }
        st.chars += sb.length();
        if (sb.length() > 0) {
            st.texts.add(new String[]{name, sb.toString()});
        }
        return null;
    }

    private static boolean textElement(String ln, boolean chart, boolean comment) {
        return "t".equals(ln) || (chart && "v".equals(ln)) || (comment && "text".equals(ln));
    }

    static int num(String digits) {
        if (digits == null || digits.isEmpty() || digits.length() > 6) {
            return -1;
        }
        try {
            return Integer.parseInt(digits);
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    // ── pdf ──────────────────────────────────────────────────────────────

    private static Extracted pdf(byte[] d, long deadline) throws IOException {
        if (d == null || !startsWith(d, PDF)) {
            return Extracted.none("FORMAT_MISMATCH");
        }
        PDDocument doc;
        try {
            doc = PDDocument.load(new ByteArrayInputStream(d), MemoryUsageSetting.setupTempFileOnly());
        } catch (InvalidPasswordException e) {
            return Extracted.none("ENCRYPTED");
        } catch (IOException e) {
            return Extracted.none("BROKEN");
        }
        try {
            if (doc.isEncrypted()) {
                return Extracted.none("ENCRYPTED");
            }
            String active = pdfActive(doc, d);
            if (active != null) {
                return Extracted.none(active);                // ACTIVE_CONTENT | ATTACHMENT — 글을 뽑지 않는다(팀 결정·S10)
            }
            int pages = doc.getNumberOfPages();
            int last = Math.min(pages, MAX_PAGES);
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setLineSeparator("|");
            stripper.setParagraphEnd("|");
            List<Part> parts = new ArrayList<Part>();
            long chars = 0;
            boolean capped = false;
            boolean any = false;
            for (int p = 1; p <= last; p++) {
                if (Thread.currentThread().isInterrupted() || System.nanoTime() > deadline) {
                    return Extracted.none("TIMEOUT");
                }
                stripper.setStartPage(p);
                stripper.setEndPage(p);
                String t = stripper.getText(doc);
                if (chars + t.length() > TEXT_CAP) {
                    capped = true;
                    break;
                }
                chars += t.length();
                if (t.replace("|", "").trim().length() > 0) {
                    any = true;
                }
                parts.add(new Part("PAGE", p, t));
            }
            if (!any) {
                return Extracted.none("NO_TEXT");             // 스캔 PDF 등
            }
            String reason = capped ? "TEXT_CAP" : pages > MAX_PAGES ? "TOO_MANY_PAGES" : null;
            return new Extracted(reason == null ? DONE : PARTIAL, reason, parts, false, false, false);
        } catch (IOException e) {
            return Extracted.none("BROKEN");
        } finally {
            doc.close();
        }
    }

    /** 스크립트·실행(JavaScript·JS·Launch)이면 ACTIVE_CONTENT, 첨부(EmbeddedFile)만이면 ATTACHMENT, 없으면 null. 원문 바이트와 객체 사전을 둘 다 본다. */
    static String pdfActive(PDDocument doc, byte[] data) {
        boolean script = hasName(data, "/JavaScript") || hasName(data, "/Launch");
        boolean attach = hasName(data, "/EmbeddedFiles") || hasName(data, "/EmbeddedFile");
        if (!script) {
            for (COSObject o : doc.getDocument().getObjects()) {
                COSBase b = o.getObject();
                if (b instanceof COSDictionary) {
                    int k = dictKind((COSDictionary) b, 0);
                    script |= k == 2;
                    attach |= k == 1;
                    if (script) {
                        break;
                    }
                }
            }
        }
        if (!script) {
            int k = dictKind(doc.getDocumentCatalog().getCOSObject(), 0);
            script |= k == 2;
            attach |= k == 1;
        }
        return script ? R_ACTIVE : attach ? "ATTACHMENT" : null;
    }

    /** 0 없음, 1 첨부, 2 스크립트·실행. */
    private static int dictKind(COSDictionary d, int depth) {
        if (d.containsKey(COSName.getPDFName("JavaScript")) || d.containsKey(COSName.getPDFName("JS"))
                || d.containsKey(COSName.getPDFName("Launch"))) {
            return 2;
        }
        String s = d.getNameAsString(COSName.getPDFName("S"));
        if ("JavaScript".equals(s) || "Launch".equals(s)) {
            return 2;
        }
        int out = 0;
        if (d.containsKey(COSName.getPDFName("EmbeddedFile")) || d.containsKey(COSName.getPDFName("EmbeddedFiles"))
                || "EmbeddedFile".equals(d.getNameAsString(COSName.getPDFName("Type")))) {
            out = 1;
        }
        if (depth < 3) {
            for (String k : new String[]{"Names", "OpenAction", "AA"}) {
                COSBase child = d.getDictionaryObject(COSName.getPDFName(k));
                if (child instanceof COSDictionary) {
                    int c = dictKind((COSDictionary) child, depth + 1);
                    if (c == 2) {
                        return 2;
                    }
                    out = Math.max(out, c);
                }
            }
        }
        return out;
    }

    /** 바이트에서 PDF 이름(/X)을 찾는다 — 뒤 글자가 이름 글자가 아니어야 한다. ISO 문자열로 바꾸지 않는다(50MB → 100MB char 방지). */
    static boolean hasName(byte[] d, String token) {
        byte[] t = token.getBytes(StandardCharsets.ISO_8859_1);
        outer:
        for (int i = 0; i + t.length <= d.length; i++) {
            for (int k = 0; k < t.length; k++) {
                if (d[i + k] != t[k]) {
                    continue outer;
                }
            }
            int j = i + t.length;
            if (j >= d.length) {
                return true;
            }
            int c = d[j] & 0xFF;
            boolean nameChar = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
                    || c == '_' || c == '.' || c == '-';
            if (!nameChar) {
                return true;
            }
        }
        return false;
    }

    private static boolean startsWith(byte[] d, byte[] head) {
        if (d.length < head.length) {
            return false;
        }
        for (int i = 0; i < head.length; i++) {
            if (d[i] != head[i]) {
                return false;
            }
        }
        return true;
    }
}
