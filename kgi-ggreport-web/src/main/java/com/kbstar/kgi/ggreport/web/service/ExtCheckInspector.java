package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.support.Pii;
import kr.dogfoot.hwplib.object.HWPFile;
import kr.dogfoot.hwplib.reader.HWPReader;
import kr.dogfoot.hwplib.tool.textextractor.TextExtractMethod;
import kr.dogfoot.hwplib.tool.textextractor.TextExtractor;
import org.apache.pdfbox.contentstream.PDContentStream;
import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSObject;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.io.MemoryUsageSetting;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.poifs.filesystem.DirectoryNode;
import org.apache.poi.poifs.filesystem.DocumentEntry;
import org.apache.poi.poifs.filesystem.DocumentInputStream;
import org.apache.poi.poifs.filesystem.Entry;
import org.apache.poi.poifs.filesystem.POIFSFileSystem;

import javax.xml.XMLConstants;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Deque;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.zip.DataFormatException;
import java.util.zip.Inflater;
import java.util.zip.ZipEntry;
import java.util.zip.ZipException;
import java.util.zip.ZipFile;

/**
 * 외부 확인 반입 첨부 1개의 안전망 판정(NEXT 90 2단계) — PDF(pdfbox 2.0.29)·HWPX(zip+StAX)·HWP(OLE — POIFS로 구조·크기·속성 비트를 먼저 보고 통과한 파일만 hwplib로 본문을 한 번 더 읽는다).
 *
 * <p>결과는 제외 사유 코드·위치 코드·건수뿐이다 — 값(전화번호·이메일·파일명·문서 내용)은 어디에도 담지 않는다.
 * 검사는 서버 임시 폴더의 <b>사본</b> 위에서 하고(TOCTOU 제거), 파일당 20초 마감을 데몬 스레드 2개 풀에서 지킨다.
 */
final class ExtCheckInspector {

    // ── 조정 상수(기획이 정하면 여기만 고친다) ──
    static final int MAX_PDF_PAGES = 200;
    static final int PDF_MIN_CHARS_PER_PAGE = 30;       // 이미지가 있고 쪽당 비공백 글자가 이 값 미만이면 IMAGE_ONLY
    static final int HWPX_MIN_BODY_CHARS = 100;         // 이미지가 있고 본문 비공백 글자가 이 값 미만이면 IMAGE_ONLY
    static final int MAX_TEXT_CHARS = 2000000;
    static final int ZIP_MAX_ENTRIES = 500;
    static final long MB = 1024L * 1024L;
    static final long ZIP_ENTRY_MAX = 50 * MB;
    static final long ZIP_TOTAL_MAX = 100 * MB;
    static final long ZIP_RATIO = 100;                  // 압축 해제 합계 ≤ max(1 MiB, 100 × 파일 크기). 헤더 값은 믿지 않고 읽으며 센다.
    static final long FILE_SECONDS = 20;
    static final int MAX_HITS = 20;
    private static final int MAX_GRAPH_NODES = 500000;
    private static final int MAX_OUTLINE_ITEMS = 10000;
    private static final int MAX_FORM_DEPTH = 8;
    private static final int MAX_CONTENT_TOKENS = 5000000;

    // ── HWP(5.0, OLE) ──
    private static final int HWP_HEADER_LEN = 256;
    private static final int HWP_PROPS_OFFSET = 36;         // FileHeader: 서명 32B + 버전 4B 뒤 속성 4B(리틀엔디안)
    private static final int HWPTAG_PARA_TEXT = 0x43;       // HWPTAG_BEGIN(0x10) + 51
    private static final long HWP_SMALL_MAX = MB;           // PrvText·요약정보·_LinkDoc·Scripts 읽기 상한
    /**
     * FileHeader 속성 비트(한글문서파일형식 5.0 "파일 인식 정보" 표 기준, 비트 번호는 오른쪽 0부터).
     * 0 압축 / 1 암호 설정 / 2 배포용 문서 / 3 스크립트 저장 / 4 DRM 보안 / 5 XMLTemplate 스토리지 있음 / 6 문서 이력 관리 /
     * 7 전자서명 정보 있음 / 8 공인인증서 암호화 / 9 전자서명 예비 저장 / 10 공인인증서 DRM / 11 CCL / 12 모바일 최적화 /
     * 13 개인정보 보안 문서 / 14 변경 추적 / 15 공공누리(KOGL) / 16 비디오 컨트롤 / 17 차례 필드 컨트롤.
     * [확신 낮음] 9·10·13·14 — 기억 기반이라 규격 PDF로 확인해야 한다. 틀려도 "더 많이 거부"하는 쪽이라 안전 방향이다.
     * 11·12·15·16·17 은 본문 유출과 무관해 거부하지 않는다.
     */
    private static final int[] HWP_BITS_ENCRYPTED = {1, 2, 4, 8, 10, 13};
    private static final int[] HWP_BITS_SCRIPT = {3};
    private static final int[] HWP_BITS_HISTORY = {5, 6, 7, 9, 14};
    /** 한컴 기본 빈 틀, 실물 공고 HWP 164건 확인 2026-11-17 — Scripts/ 아래 스트림 이름 → 허용 원본 바이트(압축 상태 그대로) sha256. 그 밖은 SCRIPT. */
    private static final Map<String, Set<String>> HWP_SCRIPT_SHA256;

    static {
        Map<String, Set<String>> m = new HashMap<String, Set<String>>();
        m.put("DefaultJScript", set(
                "1aa01fb10197cfd3ef4406d62e34b98717d4793e9e756c9e0cf32a1c055612c9",
                "1b4833c1d5a47fcf6cc76e769cf6b12b27401152387d99dfd313469881bcf590",
                "63bd6cef5092b8a28754c36955fdc9e753fa6b7d5fe4a323d20609d31e7c5dc0",
                "ca3dbfbdb97cc1c2a17bf7ffe2b30550df025c081ee2412d0fcde150212af337"));
        m.put("JScriptVersion", set(
                "1322438fbe7c693f50ae634db95d80567379557dea3a970e75d06e63a0e16b55",
                "adf376246e26101841c763bfb6052a4af4673461e021742bc8fd13ecb62be36f"));
        HWP_SCRIPT_SHA256 = Collections.unmodifiableMap(m);
    }

    /** 한컴 기본 빈 틀(UTF-16LE, 실물 공고 6건 확인 2026-11-17) — Scripts/ 아래라도 이름과 원본 바이트 sha256 이 모두 같으면 허용한다(그 밖의 Scripts/ 는 SCRIPT). */
    private static final String HWPX_HEADER_SCRIPTS = "Scripts/headerScripts.js";
    private static final String HWPX_HEADER_SCRIPTS_SHA256 = "f23abe459e32a899af2081e05752afe193fb00489405be94799b3658b7d5688f";
    private static final String HWPX_SOURCE_SCRIPTS = "Scripts/sourceScripts.js";
    private static final String HWPX_SOURCE_SCRIPTS_SHA256 = "b183762f7dbf29e929380375746fa20260925f89cbfa284a29cf7ab611b8f77a";

    private static final Set<String> XML_EXT = set("xml", "hpf", "rdf");
    private static final Set<String> IMAGE_EXT = set("png", "jpg", "jpeg", "gif", "bmp", "tif", "tiff", "wmf", "emf");   // HWPX·HWP 공유(gif·wmf·emf 이미 포함)
    /** 문단·칸 경계 — 번호가 칸을 건너 이어 붙지 않게 줄바꿈을 넣는다. */
    private static final Set<String> BREAKS = set("p", "tc", "tr", "para", "paragraph", "row", "c", "br", "si", "is");
    private static final Set<String> ACTION_ALWAYS = set("JavaScript", "Launch");
    private static final Set<String> ACTION_AUTO = set("URI", "SubmitForm", "ImportData", "GoToR", "GoToE");

    private static final ExecutorService POOL = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "ext-check-inspect");
        t.setDaemon(true);
        return t;
    });

    private ExtCheckInspector() {
    }

    // ── 결과 ──────────────────────────────────────────────────────────

    static final class Hit {
        final String reason;
        final String locator;
        int count;

        Hit(String reason, String locator, int count) {
            this.reason = reason;
            this.locator = locator;
            this.count = count;
        }

        @Override
        public String toString() {
            return reason + "@" + locator + "x" + count;   // 값 없음
        }
    }

    static final class Outcome {
        final String ext;          // 매직 넘버로 정한 저장 확장자(pdf|hwpx|hwp). 모르면 null
        final List<Hit> hits;      // 비어 있으면 통과

        Outcome(String ext, List<Hit> hits) {
            this.ext = ext;
            this.hits = hits;
        }
    }

    private static final class Hits {
        private final Map<String, Hit> map = new LinkedHashMap<String, Hit>();

        void add(String reason, String locator, int count) {
            String key = reason + "|" + locator;
            Hit h = map.get(key);
            if (h != null) {
                h.count += count;
            } else if (map.size() < MAX_HITS) {
                map.put(key, new Hit(reason, locator, count));
            }
        }

        List<Hit> list() {
            return new ArrayList<Hit>(map.values());
        }
    }

    private static final class Reject extends RuntimeException {
        private static final long serialVersionUID = 1L;
        final String reason;
        final String locator;
        final int count;

        Reject(String reason, String locator, int count) {
            super(reason, null, false, false);
            this.reason = reason;
            this.locator = locator;
            this.count = count;
        }
    }

    private static final class TimeoutSignal extends RuntimeException {
        private static final long serialVersionUID = 1L;

        TimeoutSignal() {
            super("deadline", null, false, false);
        }
    }

    // ── 진입점 ────────────────────────────────────────────────────────

    /** 경로 이름에서 확장자(소문자). 형식 검사가 이미 pdf|hwp|hwpx 로 제한했다. */
    static String extOf(String path) {
        int dot = path.lastIndexOf('.');
        return dot < 0 ? "" : path.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    /** @param file 서버 임시 사본 @param declaredExt manifest 경로의 확장자 */
    static Outcome inspect(Path file, String declaredExt) {
        String kind;
        try {
            kind = sniff(file);
        } catch (IOException e) {
            return one(null, "PARSE_FAILED", "file");
        }
        final boolean hwp = "hwp".equals(declaredExt);
        final boolean pdf = "pdf".equals(declaredExt);
        final String want = pdf ? "pdf" : (hwp ? "ole" : "zip");
        if (!want.equals(kind)) {
            return one(null, "FORMAT_MISMATCH", "file");          // 확장자와 머리말이 다르다(OLE 를 pdf/hwpx 로 속인 경우 포함)
        }
        final String fmt = pdf ? "pdf" : (hwp ? "hwp" : "hwpx");
        final long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(FILE_SECONDS);
        Future<List<Hit>> f = POOL.submit(() -> run(file, fmt, deadline));
        List<Hit> hits;
        try {
            hits = f.get(FILE_SECONDS + 5, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            f.cancel(true);
            hits = single("TIMEOUT", "file", 1);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            f.cancel(true);
            hits = single("TIMEOUT", "file", 1);
        } catch (ExecutionException e) {
            hits = single("PARSE_FAILED", "file", 1);
        }
        return new Outcome(fmt, hits);
    }

    /** Pii 종류 → 제외 사유 코드. */
    static String reasonOf(String kind) {
        if ("휴대폰".equals(kind)) {
            return "PII_MOBILE";
        }
        if ("유선전화".equals(kind)) {
            return "PII_LANDLINE";
        }
        if ("이메일".equals(kind)) {
            return "PII_EMAIL";
        }
        return "PII_ID";
    }

    private static List<Hit> run(Path file, String fmt, long deadline) {
        try {
            if ("pdf".equals(fmt)) {
                return inspectPdf(file, deadline);
            }
            return "hwp".equals(fmt) ? inspectHwp(file, deadline) : inspectHwpx(file, deadline);
        } catch (Reject r) {
            return single(r.reason, r.locator, r.count);
        } catch (Pii.ScanTimeoutException | TimeoutSignal t) {
            return single("TIMEOUT", "file", 1);
        } catch (IOException | RuntimeException e) {
            return single("PARSE_FAILED", "file", 1);
        }
    }

    private static String sniff(Path file) throws IOException {
        byte[] head = new byte[8];
        int n = 0;
        try (InputStream in = Files.newInputStream(file)) {
            int r;
            while (n < head.length && (r = in.read(head, n, head.length - n)) > 0) {
                n += r;
            }
        }
        if (n >= 5 && head[0] == 0x25 && head[1] == 0x50 && head[2] == 0x44 && head[3] == 0x46 && head[4] == 0x2D) {
            return "pdf";
        }
        if (n >= 4 && head[0] == 0x50 && head[1] == 0x4B && head[2] == 0x03 && head[3] == 0x04) {
            return "zip";
        }
        if (n >= 4 && (head[0] & 0xFF) == 0xD0 && (head[1] & 0xFF) == 0xCF && head[2] == 0x11 && (head[3] & 0xFF) == 0xE0) {
            return "ole";
        }
        return "other";
    }

    // ── PDF ───────────────────────────────────────────────────────────

    private static List<Hit> inspectPdf(Path file, long deadline) throws IOException {
        byte[] raw = Files.readAllBytes(file);
        if (count(raw, "startxref") >= 2) {
            throw new Reject("INCREMENTAL", "xref", 1);                 // 증분 저장은 이전 판의 객체가 남는다
        }
        PDDocument doc;
        try {
            doc = PDDocument.load(file.toFile(), MemoryUsageSetting.setupMixed(8 * MB));
        } catch (InvalidPasswordException e) {
            throw new Reject("ENCRYPTED", "file", 1);
        }
        try {
            if (doc.isEncrypted()) {
                throw new Reject("ENCRYPTED", "file", 1);
            }
            int pages = doc.getNumberOfPages();
            if (pages > MAX_PDF_PAGES) {
                throw new Reject("PAGES_LIMIT", "file", pages);
            }
            if (doc.getDocument().getTrailer().containsKey(COSName.PREV)) {
                throw new Reject("INCREMENTAL", "xref", 1);
            }
            Reject active = findActive(doc);
            if (active != null) {
                throw active;
            }
            Hits hits = new Hits();
            long chars = 0;
            long nonSpace = 0;
            PDFTextStripper st = new PDFTextStripper();
            for (int p = 1; p <= pages; p++) {
                checkTime(deadline);
                st.setStartPage(p);
                st.setEndPage(p);
                String t = st.getText(doc);
                chars += t.length();
                if (chars > MAX_TEXT_CHARS) {
                    throw new Reject("TEXT_LIMIT", "body", 1);
                }
                nonSpace += nonSpace(t);
                scanText(hits, t, "body:p" + p, deadline);
            }
            // 문서 정보 전 항목(이름·값)
            PDDocumentInformation info = doc.getDocumentInformation();
            if (info != null) {
                StringBuilder sb = new StringBuilder();
                COSDictionary d = info.getCOSObject();
                for (COSName k : new ArrayList<COSName>(d.keySet())) {
                    sb.append(k.getName()).append('\n');
                    String v = str(d.getDictionaryObject(k));
                    if (v != null) {
                        sb.append(v).append('\n');
                    }
                }
                scanText(hits, sb.toString(), "meta", deadline);
            }
            // XMP
            PDMetadata md = doc.getDocumentCatalog().getMetadata();
            if (md != null) {
                try (InputStream in = md.exportXMPMetadata()) {
                    byte[] xmp = readLimited(in, (int) MB);
                    if (xmp == null) {
                        throw new Reject("TEXT_LIMIT", "xmp", 1);
                    }
                    scanText(hits, new String(xmp, StandardCharsets.UTF_8), "xmp", deadline);
                }
            }
            // 주석 · 양식 · 책갈피 · 이미지 수
            int images = 0;
            Set<COSBase> seenForms = Collections.newSetFromMap(new IdentityHashMap<COSBase, Boolean>());
            for (int p = 0; p < pages; p++) {
                checkTime(deadline);
                PDPage page = doc.getPage(p);
                for (PDAnnotation a : page.getAnnotations()) {
                    COSDictionary ad = a.getCOSObject();
                    scanText(hits, join(ad, "Contents", "T", "Subj", "RC"), "annot", deadline);
                    COSBase act = ad.getDictionaryObject(COSName.A);          // 링크 동작의 URI(mailto:·tel: 포함) — 하-6
                    if (act instanceof COSDictionary) {
                        scanText(hits, str(((COSDictionary) act).getDictionaryObject(COSName.URI)), "annot", deadline);
                    }
                }
                images += countImages(page.getResources(), page, seenForms, 0, deadline);
            }
            PDAcroForm form = doc.getDocumentCatalog().getAcroForm();
            if (form != null) {
                for (PDField f : form.getFieldTree()) {
                    checkTime(deadline);
                    scanText(hits, join(f.getCOSObject(), "V", "DV", "TU", "T"), "form", deadline);
                }
            }
            PDDocumentOutline outline = doc.getDocumentCatalog().getDocumentOutline();
            if (outline != null) {
                StringBuilder sb = new StringBuilder();
                int[] budget = {MAX_OUTLINE_ITEMS};
                outlineText(outline.children(), sb, budget, 0);
                scanText(hits, sb.toString(), "bookmark", deadline);
            }
            if (images > 0 && pages > 0 && nonSpace < (long) PDF_MIN_CHARS_PER_PAGE * pages) {
                hits.add("IMAGE_ONLY", "body", images);
            }
            return hits.list();
        } finally {
            doc.close();
        }
    }

    /** 이미지 수 — 직접 XObject 이미지, Form XObject 안의 이미지(깊이 8·같은 폼은 한 번), 내용 스트림의 인라인 이미지(BI). 하-6 */
    private static int countImages(PDResources res, PDContentStream cs, Set<COSBase> seenForms, int depth, long deadline)
            throws IOException {
        int n = countInline(cs, deadline);
        if (res == null || depth >= MAX_FORM_DEPTH) {
            return n;
        }
        COSBase xo = res.getCOSObject().getDictionaryObject(COSName.XOBJECT);
        if (!(xo instanceof COSDictionary)) {
            return n;
        }
        COSDictionary xd = (COSDictionary) xo;
        for (COSName k : new ArrayList<COSName>(xd.keySet())) {
            checkTime(deadline);
            COSBase v = xd.getDictionaryObject(k);
            if (!(v instanceof COSStream)) {
                continue;
            }
            COSStream s = (COSStream) v;
            COSName sub = s.getCOSName(COSName.SUBTYPE);
            if (COSName.IMAGE.equals(sub)) {
                n++;
            } else if (COSName.FORM.equals(sub) && seenForms.add(s)) {
                PDFormXObject form = new PDFormXObject(s);
                n += countImages(form.getResources(), form, seenForms, depth + 1, deadline);
            }
        }
        return n;
    }

    private static int countInline(PDContentStream cs, long deadline) throws IOException {
        int n = 0;
        int tokens = 0;
        PDFStreamParser parser = new PDFStreamParser(cs);
        Object t;
        while ((t = parser.parseNextToken()) != null) {
            if ((++tokens & 0xFFF) == 0) {
                checkTime(deadline);
                if (tokens > MAX_CONTENT_TOKENS) {
                    throw new Reject("PARSE_FAILED", "content", 1);
                }
            }
            if (t instanceof Operator && "BI".equals(((Operator) t).getName())) {
                n++;
            }
        }
        return n;
    }

    private static void outlineText(Iterable<PDOutlineItem> items, StringBuilder sb, int[] budget, int depth) {
        if (depth > 20) {
            return;
        }
        for (PDOutlineItem it : items) {
            if (budget[0]-- <= 0) {
                return;
            }
            String t = it.getTitle();
            if (t != null) {
                sb.append(t).append('\n');
            }
            if (it.hasChildren()) {
                outlineText(it.children(), sb, budget, depth + 1);
            }
        }
    }

    /**
     * 카탈로그·트레일러에서 닿는 모든 객체를 훑어 능동 내용을 찾는다(압축된 객체 스트림 안도 COSObject 가 풀어 준다).
     * 거부: JS·JavaScript·XFA, EmbeddedFiles·EF·RichMedia·3D·FileAttachment, Launch·JavaScript 동작.
     * /OpenAction·/AA 아래에서는 URI·SubmitForm·ImportData·GoToR·GoToE 도 거부한다(링크 주석의 URI 는 허용 — 사용자가 눌러야 열린다).
     */
    private static Reject findActive(PDDocument doc) {
        Set<COSBase> plain = Collections.newSetFromMap(new IdentityHashMap<COSBase, Boolean>());
        Set<COSBase> auto = Collections.newSetFromMap(new IdentityHashMap<COSBase, Boolean>());
        Deque<Object[]> stack = new ArrayDeque<Object[]>();
        stack.push(new Object[]{doc.getDocument().getTrailer(), Boolean.FALSE});
        int nodes = 0;
        while (!stack.isEmpty()) {
            if (++nodes > MAX_GRAPH_NODES) {
                return new Reject("PARSE_FAILED", "graph", 1);
            }
            Object[] e = stack.pop();
            COSBase b = (COSBase) e[0];
            boolean isAuto = ((Boolean) e[1]).booleanValue();
            if (b instanceof COSObject) {
                b = ((COSObject) b).getObject();
            }
            if (b == null || !(isAuto ? auto : plain).add(b)) {
                continue;
            }
            if (b instanceof COSArray) {
                COSArray arr = (COSArray) b;
                for (int i = 0; i < arr.size(); i++) {
                    stack.push(new Object[]{arr.get(i), Boolean.valueOf(isAuto)});
                }
            } else if (b instanceof COSDictionary) {
                COSDictionary d = (COSDictionary) b;
                Reject r = checkDict(d, isAuto);
                if (r != null) {
                    return r;
                }
                for (COSName k : new ArrayList<COSName>(d.keySet())) {
                    String key = k.getName();
                    if ("Parent".equals(key)) {
                        continue;
                    }
                    boolean childAuto = isAuto || "OpenAction".equals(key) || "AA".equals(key);
                    stack.push(new Object[]{d.getItem(k), Boolean.valueOf(childAuto)});
                }
            }
        }
        return null;
    }

    private static Reject checkDict(COSDictionary d, boolean auto) {
        if (d.containsKey("JS") || d.containsKey("JavaScript") || d.containsKey("XFA")) {
            return new Reject("SCRIPT", "active", 1);
        }
        if (d.containsKey("EmbeddedFiles") || d.containsKey("EF") || d.containsKey("RichMediaContent")) {
            return new Reject("EMBEDDED", "active", 1);
        }
        if ("EmbeddedFile".equals(d.getNameAsString("Type"))) {
            return new Reject("EMBEDDED", "active", 1);
        }
        String sub = d.getNameAsString("Subtype");
        if ("FileAttachment".equals(sub) || "RichMedia".equals(sub) || "3D".equals(sub)) {
            return new Reject("EMBEDDED", "active", 1);
        }
        String s = d.getNameAsString("S");
        if (s != null && (ACTION_ALWAYS.contains(s) || (auto && ACTION_AUTO.contains(s)))) {
            return new Reject("SCRIPT", "active", 1);
        }
        return null;
    }

    // ── HWPX ──────────────────────────────────────────────────────────

    private static List<Hit> inspectHwpx(Path file, long deadline) throws IOException {
        long ratioCap = Math.max(MB, ZIP_RATIO * Files.size(file));
        Hits hits = new Hits();
        try (ZipFile zf = new ZipFile(file.toFile())) {
            if (zf.size() > ZIP_MAX_ENTRIES) {
                throw new Reject("ZIP_LIMIT", "entries", zf.size());
            }
            long[] total = {0};
            long[] chars = {0};
            long[] body = {0};
            boolean mimeOk = false;
            int images = 0;
            Enumeration<? extends ZipEntry> en = zf.entries();
            while (en.hasMoreElements()) {
                checkTime(deadline);
                ZipEntry e = en.nextElement();
                String name = e.getName();
                if (!safeEntryName(name)) {
                    throw new Reject("FORMAT_MISMATCH", "entry", 1);
                }
                if (e.isDirectory()) {
                    continue;
                }
                String low = name.toLowerCase(Locale.ROOT);
                String scriptSha = null;
                if (low.startsWith("scripts/")) {
                    if (HWPX_HEADER_SCRIPTS.equals(name)) {
                        scriptSha = HWPX_HEADER_SCRIPTS_SHA256;
                    } else if (HWPX_SOURCE_SCRIPTS.equals(name)) {
                        scriptSha = HWPX_SOURCE_SCRIPTS_SHA256;
                    } else {
                        throw new Reject("SCRIPT", "entry", 1);
                    }
                }
                String ext = extOf(low);
                boolean isText = XML_EXT.contains(ext) || "txt".equals(ext);
                boolean isMime = "mimetype".equals(low);
                boolean isManifest = "meta-inf/manifest.xml".equals(low);
                Drained d;
                try (InputStream in = zf.getInputStream(e)) {
                    d = drain(in, isText || isMime || scriptSha != null, total, ratioCap, deadline);
                } catch (ZipException ze) {
                    String m = ze.getMessage();
                    throw new Reject(m != null && m.toLowerCase(Locale.ROOT).contains("encrypt") ? "ENCRYPTED" : "PARSE_FAILED", "entry", 1);
                }
                if (d.nested) {
                    throw new Reject("EMBEDDED", "entry", 1);          // 중첩 zip·OLE·실행 파일
                }
                if (scriptSha != null) {
                    if (!scriptSha.equals(sha256Hex(d.data))) {
                        throw new Reject("SCRIPT", "entry", 1);        // 한컴 기본 빈 틀과 바이트가 다르면 스크립트로 본다
                    }
                    continue;                                          // 검사 대상 아님, 보관 유지
                }
                if (low.startsWith("bindata/")) {
                    if (!IMAGE_EXT.contains(ext)) {
                        throw new Reject("EMBEDDED", "entry", 1);
                    }
                    images++;
                    continue;
                }
                if (isMime) {
                    if (!"application/hwp+zip".equals(new String(d.data, StandardCharsets.UTF_8).trim())) {
                        throw new Reject("FORMAT_MISMATCH", "mimetype", 1);
                    }
                    mimeOk = true;
                    continue;
                }
                if (isManifest && containsAscii(d.data, "encryption-data")) {
                    throw new Reject("ENCRYPTED", "entry", 1);
                }
                if (isText) {
                    scanEntry(low, ext, d.data, hits, chars, body, deadline);
                } else if (low.startsWith("preview/") && IMAGE_EXT.contains(ext)) {
                    // 미리보기 그림(Preview/PrvImage.png)은 허용한다. 이미지 수에는 넣지 않는다.
                } else {
                    throw new Reject("UNSUPPORTED_ENTRY", "entry", 1);   // 허용 목록(xml·hpf·rdf·txt·mimetype·BinData 이미지·Preview 그림) 밖
                }
            }
            if (!mimeOk) {
                throw new Reject("FORMAT_MISMATCH", "mimetype", 1);
            }
            if (images > 0 && body[0] < HWPX_MIN_BODY_CHARS) {
                hits.add("IMAGE_ONLY", "body", images);
            }
            return hits.list();
        }
    }

    private static void scanEntry(String low, String ext, byte[] data, Hits hits, long[] chars, long[] body, long deadline) {
        String loc = low.startsWith("contents/section") ? "body" : ("txt".equals(ext) ? "preview" : "meta");
        if ("txt".equals(ext)) {
            String s = decodeText(data);
            addChars(chars, s.length());
            scanText(hits, s, loc, deadline);
            return;
        }
        if (containsAscii(data, "<!doctype") || containsAscii(data, "<!entity")) {
            throw new Reject("XXE_REJECTED", "entry", 1);
        }
        StringBuilder text = new StringBuilder();
        StringBuilder attrs = new StringBuilder();
        XMLStreamReader r = null;
        try {
            r = factory().createXMLStreamReader(new ByteArrayInputStream(data));
            while (r.hasNext()) {
                int ev = r.next();
                if (ev == XMLStreamConstants.CHARACTERS || ev == XMLStreamConstants.CDATA) {
                    text.append(r.getText());
                } else if (ev == XMLStreamConstants.COMMENT) {
                    attrs.append(r.getText()).append('\n');
                } else if (ev == XMLStreamConstants.PROCESSING_INSTRUCTION) {
                    attrs.append(r.getPIData()).append('\n');
                } else if (ev == XMLStreamConstants.START_ELEMENT) {
                    for (int i = 0; i < r.getAttributeCount(); i++) {
                        attrs.append(r.getAttributeValue(i)).append('\n');
                    }
                } else if (ev == XMLStreamConstants.END_ELEMENT) {
                    if (BREAKS.contains(r.getLocalName())) {
                        text.append('\n');
                    }
                } else if (ev == XMLStreamConstants.DTD || ev == XMLStreamConstants.ENTITY_REFERENCE) {
                    throw new Reject("XXE_REJECTED", "entry", 1);
                }
                if (text.length() + attrs.length() > MAX_TEXT_CHARS) {
                    throw new Reject("TEXT_LIMIT", loc, 1);
                }
            }
        } catch (XMLStreamException x) {
            throw new Reject("PARSE_FAILED", "entry", 1);
        } finally {
            if (r != null) {
                try {
                    r.close();
                } catch (XMLStreamException ignore) {
                    // 닫기 실패는 판정에 영향 없음
                }
            }
        }
        addChars(chars, text.length() + attrs.length());
        if ("body".equals(loc)) {
            body[0] += nonSpace(text.toString());
        }
        scanText(hits, text.toString(), loc, deadline);
        scanText(hits, attrs.toString(), loc, deadline);
    }

    private static XMLInputFactory factory() {
        XMLInputFactory f = XMLInputFactory.newInstance();
        f.setProperty(XMLInputFactory.SUPPORT_DTD, false);
        f.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
        try {
            f.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        } catch (IllegalArgumentException ignore) {
            // 구현체가 모르는 속성이면 DOCTYPE 사전 차단이 막는다
        }
        return f;
    }

    private static final class Drained {
        byte[] data;
        boolean nested;
    }

    private static Drained drain(InputStream in, boolean keep, long[] total, long ratioCap, long deadline) throws IOException {
        ByteArrayOutputStream bo = keep ? new ByteArrayOutputStream() : null;
        byte[] buf = new byte[16384];
        byte[] head = new byte[4];
        int hl = 0;
        long n = 0;
        int r;
        while ((r = in.read(buf)) != -1) {
            n += r;
            total[0] += r;
            if (n > ZIP_ENTRY_MAX || total[0] > ZIP_TOTAL_MAX || total[0] > ratioCap) {
                throw new Reject("ZIP_LIMIT", "entry", 1);
            }
            if (hl < 4) {
                int c = Math.min(4 - hl, r);
                System.arraycopy(buf, 0, head, hl, c);
                hl += c;
            }
            if (bo != null) {
                bo.write(buf, 0, r);
            }
            checkTime(deadline);
        }
        Drained d = new Drained();
        d.data = bo == null ? null : bo.toByteArray();
        d.nested = (hl >= 4 && head[0] == 0x50 && head[1] == 0x4B && head[2] == 0x03 && head[3] == 0x04)
                || (hl >= 4 && (head[0] & 0xFF) == 0xD0 && (head[1] & 0xFF) == 0xCF && head[2] == 0x11 && (head[3] & 0xFF) == 0xE0)
                || (hl >= 2 && head[0] == 0x4D && head[1] == 0x5A);
        return d;
    }

    private static String sha256Hex(byte[] data) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(data);
            StringBuilder sb = new StringBuilder();
            for (byte b : h) {
                sb.append(String.format("%02x", b & 0xFF));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static boolean safeEntryName(String n) {
        return !n.isEmpty() && n.length() <= 260 && !n.contains("..") && !n.startsWith("/")
                && n.indexOf('\\') < 0 && n.indexOf(':') < 0;
    }

    private static String decodeText(byte[] d) {
        Charset cs = StandardCharsets.UTF_8;
        int off = 0;
        if (d.length >= 2 && (d[0] & 0xFF) == 0xFF && (d[1] & 0xFF) == 0xFE) {
            cs = StandardCharsets.UTF_16LE;
            off = 2;
        } else if (d.length >= 2 && (d[0] & 0xFF) == 0xFE && (d[1] & 0xFF) == 0xFF) {
            cs = StandardCharsets.UTF_16BE;
            off = 2;
        } else if (d.length >= 3 && (d[0] & 0xFF) == 0xEF && (d[1] & 0xFF) == 0xBB && (d[2] & 0xFF) == 0xBF) {
            off = 3;
        }
        return new String(d, off, d.length - off, cs).replace("\u0000", "");
    }

    // ── HWP (OLE) ─────────────────────────────────────────────────────

    private static List<Hit> inspectHwp(Path file, long deadline) throws IOException {
        long ratioCap = Math.max(MB, ZIP_RATIO * Files.size(file));
        Hits hits = new Hits();
        long[] total = {0};
        long[] chars = {0};
        long[] body = {0};
        int[] visited = {0};
        int images = 0;
        int sections = 0;
        boolean docInfo = false;
        try (POIFSFileSystem fs = new POIFSFileSystem(file.toFile(), true)) {
            DirectoryNode root = fs.getRoot();
            // 1) FileHeader — 크기·서명·속성 비트
            if (!root.hasEntry("FileHeader") || !root.getEntry("FileHeader").isDocumentEntry()
                    || ((DocumentEntry) root.getEntry("FileHeader")).getSize() != HWP_HEADER_LEN) {
                throw new Reject("FORMAT_MISMATCH", "header", 1);
            }
            byte[] head = readDoc(root, root.getEntry("FileHeader"), HWP_HEADER_LEN, deadline);
            if (head.length != HWP_HEADER_LEN
                    || !"HWP Document File".equals(new String(head, 0, 17, StandardCharsets.US_ASCII))) {
                throw new Reject("FORMAT_MISMATCH", "header", 1);
            }
            int props = (head[HWP_PROPS_OFFSET] & 0xFF) | ((head[HWP_PROPS_OFFSET + 1] & 0xFF) << 8)
                    | ((head[HWP_PROPS_OFFSET + 2] & 0xFF) << 16) | ((head[HWP_PROPS_OFFSET + 3] & 0xFF) << 24);
            if (anyBit(props, HWP_BITS_ENCRYPTED)) {
                throw new Reject("ENCRYPTED", "file", 1);
            }
            if (anyBit(props, HWP_BITS_SCRIPT)) {
                throw new Reject("SCRIPT", "file", 1);
            }
            if (anyBit(props, HWP_BITS_HISTORY)) {
                throw new Reject("HISTORY", "file", 1);
            }
            boolean compressed = (props & 1) != 0;

            // 2) 스트림 순회 — 이름 허용 목록, 크기를 세며 읽기
            Iterator<Entry> it = root.getEntries();
            while (it.hasNext()) {
                checkTime(deadline);
                Entry e = it.next();
                String n = e.getName();
                countEntry(visited);
                if (e.isDirectoryEntry()) {
                    DirectoryNode d = (DirectoryNode) e;
                    if ("BodyText".equals(n)) {
                        Iterator<Entry> si = d.getEntries();
                        while (si.hasNext()) {
                            Entry s = si.next();
                            countEntry(visited);
                            if (!s.isDocumentEntry() || !s.getName().matches("Section[0-9]{1,4}")) {
                                throw new Reject("UNSUPPORTED_ENTRY", "entry", 1);
                            }
                            byte[] raw = readDoc(d, s, ZIP_ENTRY_MAX, deadline);
                            byte[] sec = unpackText(raw, compressed, total, ratioCap, deadline);
                            StringBuilder t = new StringBuilder();
                            sectionText(sec, t, deadline);
                            addChars(chars, t.length());
                            body[0] += nonSpace(t.toString());
                            scanText(hits, t.toString(), "body", deadline);
                            sections++;
                        }
                    } else if ("BinData".equals(n)) {
                        Iterator<Entry> bi = d.getEntries();
                        while (bi.hasNext()) {
                            Entry b = bi.next();
                            countEntry(visited);
                            String ext = extOf(b.getName().toLowerCase(Locale.ROOT));
                            if (!b.isDocumentEntry() || !IMAGE_EXT.contains(ext)) {
                                throw new Reject("EMBEDDED", "entry", 1);          // OLE 개체·기타 첨부물
                            }
                            byte[] raw = readDoc(d, b, ZIP_ENTRY_MAX, deadline);
                            byte[] data = inflateCounted(raw, total, ratioCap, deadline);
                            if (data == null) {                                    // 압축 안 된 그림 — 원본 크기를 센다
                                data = raw;
                                addTotal(total, raw.length, ratioCap);
                            }
                            if (looksNested(data)) {
                                throw new Reject("EMBEDDED", "entry", 1);
                            }
                            images++;
                        }
                    } else if ("DocOptions".equals(n)) {
                        Iterator<Entry> oi = d.getEntries();
                        while (oi.hasNext()) {
                            Entry o = oi.next();
                            countEntry(visited);
                            if ("DrmLicense".equals(o.getName())) {
                                throw new Reject("ENCRYPTED", "entry", 1);
                            }
                            if (!o.isDocumentEntry() || !"_LinkDoc".equals(o.getName())) {
                                throw new Reject("UNSUPPORTED_ENTRY", "entry", 1);
                            }
                            // 연결 문서 경로(파일마다 다름) — 내용은 UTF-16LE 로 보고 번호·이메일을 검사한다
                            String s = new String(readDoc(d, o, HWP_SMALL_MAX, deadline), StandardCharsets.UTF_16LE).replace("\u0000", "");
                            addChars(chars, s.length());
                            scanText(hits, s, "meta", deadline);
                        }
                    } else if ("Scripts".equals(n)) {
                        Iterator<Entry> ci = d.getEntries();
                        while (ci.hasNext()) {
                            Entry c = ci.next();
                            countEntry(visited);
                            Set<String> ok = HWP_SCRIPT_SHA256.get(c.getName());
                            if (ok == null || !c.isDocumentEntry()
                                    || !ok.contains(sha256Hex(readDoc(d, c, HWP_SMALL_MAX, deadline)))) {
                                throw new Reject("SCRIPT", "entry", 1);          // 한컴 기본 빈 틀과 바이트가 다르면 스크립트로 본다
                            }
                        }
                    } else if ("XMLTemplate".equals(n)) {
                        throw new Reject("HISTORY", "entry", 1);
                    } else {
                        throw new Reject("UNSUPPORTED_ENTRY", "entry", 1);
                    }
                } else if ("DocInfo".equals(n)) {
                    unpackText(readDoc(root, e, ZIP_ENTRY_MAX, deadline), compressed, total, ratioCap, deadline);
                    docInfo = true;
                } else if ("PrvText".equals(n)) {
                    String s = new String(readDoc(root, e, HWP_SMALL_MAX, deadline), StandardCharsets.UTF_16LE).replace("\u0000", "");
                    addChars(chars, s.length());
                    scanText(hits, s, "preview", deadline);
                } else if ("\u0005HwpSummaryInformation".equals(n)) {
                    String s = asciiView(readDoc(root, e, HWP_SMALL_MAX, deadline));
                    addChars(chars, s.length());
                    scanText(hits, s, "meta", deadline);
                } else if ("PrvImage".equals(n) || "FileHeader".equals(n)) {
                    // 미리보기 그림·머리말은 이미 봤다. 내용은 읽지 않는다.
                } else if ("DocHistory".equals(n)) {
                    throw new Reject("HISTORY", "entry", 1);
                } else if ("ViewText".equals(n)) {
                    throw new Reject("ENCRYPTED", "entry", 1);
                } else {
                    throw new Reject("UNSUPPORTED_ENTRY", "entry", 1);
                }
            }
        }
        if (sections == 0 || !docInfo) {
            throw new Reject("FORMAT_MISMATCH", "entry", 1);
        }
        if (images > 0 && body[0] < HWPX_MIN_BODY_CHARS) {
            hits.add("IMAGE_ONLY", "body", images);
        }
        if (!hits.list().isEmpty()) {
            return hits.list();                          // 이미 제외 — hwplib 는 부르지 않는다
        }
        // 3) 통과한 파일만 hwplib 로 한 번 더(구조 확인 + 컨트롤 안 글자). 못 읽으면 PARSE_FAILED.
        String text;
        try {
            HWPFile hwp = HWPReader.fromFile(file.toAbsolutePath().toString());
            text = TextExtractor.extract(hwp, TextExtractMethod.InsertControlTextBetweenParagraphText);
        } catch (Exception | StackOverflowError e) {
            throw new Reject("PARSE_FAILED", "file", 1);
        }
        checkTime(deadline);
        if (text != null) {
            addChars(chars, text.length());
            scanText(hits, text, "body", deadline);
        }
        return hits.list();
    }

    private static boolean anyBit(int props, int[] bits) {
        for (int b : bits) {
            if ((props & (1 << b)) != 0) {
                return true;
            }
        }
        return false;
    }

    private static void countEntry(int[] visited) {
        if (++visited[0] > ZIP_MAX_ENTRIES) {
            throw new Reject("ZIP_LIMIT", "entries", visited[0]);
        }
    }

    private static void addTotal(long[] total, long n, long ratioCap) {
        total[0] += n;
        if (total[0] > ZIP_TOTAL_MAX || total[0] > ratioCap) {
            throw new Reject("ZIP_LIMIT", "entry", 1);
        }
    }

    /** OLE 문서 스트림을 limit 바이트까지만 읽는다(헤더 크기값은 믿지 않고 읽으며 센다). */
    private static byte[] readDoc(DirectoryNode dir, Entry e, long limit, long deadline) throws IOException {
        if (!e.isDocumentEntry()) {
            throw new Reject("UNSUPPORTED_ENTRY", "entry", 1);
        }
        if (((DocumentEntry) e).getSize() > limit) {
            throw new Reject(limit == HWP_SMALL_MAX ? "TEXT_LIMIT" : "ZIP_LIMIT", "entry", 1);
        }
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        long n = 0;
        try (DocumentInputStream in = dir.createDocumentInputStream(e)) {
            int r;
            while ((r = in.read(buf)) != -1) {
                n += r;
                if (n > limit) {
                    throw new Reject(limit == HWP_SMALL_MAX ? "TEXT_LIMIT" : "ZIP_LIMIT", "entry", 1);
                }
                bo.write(buf, 0, r);
                checkTime(deadline);
            }
        }
        return bo.toByteArray();
    }

    /** 본문류 스트림 — 압축이면 raw deflate 로 풀며 센다(풀리지 않으면 PARSE_FAILED), 아니면 원본 크기를 센다. */
    private static byte[] unpackText(byte[] raw, boolean compressed, long[] total, long ratioCap, long deadline) {
        if (!compressed) {
            addTotal(total, raw.length, ratioCap);
            return raw;
        }
        byte[] out = inflateCounted(raw, total, ratioCap, deadline);
        if (out == null) {
            throw new Reject("PARSE_FAILED", "entry", 1);
        }
        return out;
    }

    /** raw deflate 해제. 스트림당 50 MiB·합계 100 MiB·비율 상한을 넘으면 ZIP_LIMIT. 형식 오류·미완결이면 null. */
    private static byte[] inflateCounted(byte[] raw, long[] total, long ratioCap, long deadline) {
        Inflater inf = new Inflater(true);
        try {
            inf.setInput(raw);
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            long n = 0;
            while (!inf.finished()) {
                int r = inf.inflate(buf);
                if (r == 0) {
                    break;                                   // 입력 부족·사전 필요 — 더 못 푼다
                }
                n += r;
                total[0] += r;
                if (n > ZIP_ENTRY_MAX || total[0] > ZIP_TOTAL_MAX || total[0] > ratioCap) {
                    throw new Reject("ZIP_LIMIT", "entry", 1);
                }
                bo.write(buf, 0, r);
                checkTime(deadline);
            }
            return inf.finished() ? bo.toByteArray() : null;
        } catch (DataFormatException e) {
            return null;
        } finally {
            inf.end();
        }
    }

    /**
     * BodyText 구역에서 PARA_TEXT(0x43) 레코드의 글자만 뽑는다. 레코드 머리 = 32비트(태그 10·수준 10·크기 12, 크기 0xFFF 면 뒤 4바이트가 크기).
     * 글자는 UTF-16LE. 제어 문자 중 확장·인라인 컨트롤(1~9, 11~12, 14~23)은 뒤 14바이트(WCHAR 7개)가 붙어 있어 건너뛴다.
     * [확신 낮음] 컨트롤별 길이 분류 — 틀려도 PII 검사는 글자 단위라 영향이 작고, IMAGE_ONLY 글자 수만 조금 달라진다.
     */
    private static void sectionText(byte[] s, StringBuilder out, long deadline) {
        int p = 0;
        int recs = 0;
        while (p + 4 <= s.length) {
            long h = (s[p] & 0xFFL) | ((s[p + 1] & 0xFFL) << 8) | ((s[p + 2] & 0xFFL) << 16) | ((s[p + 3] & 0xFFL) << 24);
            p += 4;
            int tag = (int) (h & 0x3FF);
            long size = h >>> 20;
            if (size == 0xFFF) {
                if (p + 4 > s.length) {
                    throw new Reject("PARSE_FAILED", "entry", 1);
                }
                size = (s[p] & 0xFFL) | ((s[p + 1] & 0xFFL) << 8) | ((s[p + 2] & 0xFFL) << 16) | ((s[p + 3] & 0xFFL) << 24);
                p += 4;
            }
            if (size > s.length - p) {
                throw new Reject("PARSE_FAILED", "entry", 1);
            }
            if (tag == HWPTAG_PARA_TEXT) {
                int end = p + (int) size;
                for (int i = p; i + 1 < end; ) {
                    int c = (s[i] & 0xFF) | ((s[i + 1] & 0xFF) << 8);
                    i += 2;
                    if (c >= 32) {
                        out.append((char) c);
                    } else if (c == 10 || c == 13) {
                        out.append('\n');
                    } else if ((c >= 1 && c <= 9) || c == 11 || c == 12 || (c >= 14 && c <= 23)) {
                        i += 14;
                    }
                }
                out.append('\n');
                if (out.length() > MAX_TEXT_CHARS) {
                    throw new Reject("TEXT_LIMIT", "body", 1);
                }
            }
            p += (int) size;
            if ((++recs & 0xFFF) == 0) {
                checkTime(deadline);
            }
        }
    }

    /** 요약정보 속성값은 UTF-16LE 또는 ANSI — 인쇄 가능한 ASCII 만 남기고 NUL 은 지워 두 방식 모두의 번호·이메일을 잡는다. */
    private static String asciiView(byte[] d) {
        StringBuilder sb = new StringBuilder(d.length);
        for (byte b : d) {
            int c = b & 0xFF;
            if (c == 0) {
                continue;
            }
            sb.append(c >= 0x20 && c < 0x7F ? (char) c : ' ');
        }
        return sb.toString();
    }

    private static boolean looksNested(byte[] d) {
        return d.length >= 4 && ((d[0] == 0x50 && d[1] == 0x4B && d[2] == 0x03 && d[3] == 0x04)
                || ((d[0] & 0xFF) == 0xD0 && (d[1] & 0xFF) == 0xCF && d[2] == 0x11 && (d[3] & 0xFF) == 0xE0)
                || (d[0] == 0x4D && d[1] == 0x5A));
    }

    // ── 공통 도우미 ───────────────────────────────────────────────────

    private static void scanText(Hits hits, String text, String locator, long deadline) {
        if (text == null || text.isEmpty()) {
            return;
        }
        for (Pii.Finding f : Pii.scanExternalDeep(text, deadline)) {
            hits.add(reasonOf(f.getKind()), locator, 1);
        }
    }

    private static void checkTime(long deadline) {
        if (Thread.currentThread().isInterrupted() || System.nanoTime() - deadline > 0) {
            throw new TimeoutSignal();
        }
    }

    private static void addChars(long[] chars, int n) {
        chars[0] += n;
        if (chars[0] > MAX_TEXT_CHARS) {
            throw new Reject("TEXT_LIMIT", "entry", 1);
        }
    }

    private static long nonSpace(String s) {
        long c = 0;
        for (int i = 0; i < s.length(); i++) {
            if (!Character.isWhitespace(s.charAt(i))) {
                c++;
            }
        }
        return c;
    }

    private static String join(COSDictionary d, String... keys) {
        StringBuilder sb = new StringBuilder();
        for (String k : keys) {
            String v = str(d.getDictionaryObject(k));
            if (v != null) {
                sb.append(v).append('\n');
            }
        }
        return sb.toString();
    }

    private static String str(COSBase b) {
        if (b instanceof COSObject) {
            b = ((COSObject) b).getObject();
        }
        if (b instanceof COSString) {
            return ((COSString) b).getString();
        }
        if (b instanceof COSName) {
            return ((COSName) b).getName();
        }
        if (b instanceof COSStream) {
            try {
                return ((COSStream) b).toTextString();
            } catch (RuntimeException e) {
                return null;
            }
        }
        if (b instanceof COSArray) {
            StringBuilder sb = new StringBuilder();
            COSArray a = (COSArray) b;
            for (int i = 0; i < a.size(); i++) {
                String s = str(a.get(i));
                if (s != null) {
                    sb.append(s).append('\n');
                }
            }
            return sb.toString();
        }
        return null;
    }

    private static byte[] readLimited(InputStream in, int max) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int r;
        long n = 0;
        while ((r = in.read(buf)) != -1) {
            n += r;
            if (n > max) {
                return null;
            }
            out.write(buf, 0, r);
        }
        return out.toByteArray();
    }

    private static int count(byte[] data, String ascii) {
        byte[] p = ascii.getBytes(StandardCharsets.US_ASCII);
        int c = 0;
        outer:
        for (int i = 0; i + p.length <= data.length; i++) {
            for (int j = 0; j < p.length; j++) {
                if (data[i + j] != p[j]) {
                    continue outer;
                }
            }
            c++;
            i += p.length - 1;
        }
        return c;
    }

    /** 대소문자를 무시하고 NUL 바이트는 건너뛴다(UTF-16 로 쓴 DOCTYPE 도 잡는다). pat 은 소문자 ASCII. */
    private static boolean containsAscii(byte[] d, String pat) {
        int m = 0;
        for (byte b : d) {
            if (b == 0) {
                continue;
            }
            char c = (char) (b & 0xFF);
            if (c >= 'A' && c <= 'Z') {
                c += 32;
            }
            if (c == pat.charAt(m)) {
                m++;
                if (m == pat.length()) {
                    return true;
                }
            } else {
                m = c == pat.charAt(0) ? 1 : 0;
            }
        }
        return false;
    }

    private static Outcome one(String ext, String reason, String locator) {
        return new Outcome(ext, single(reason, locator, 1));
    }

    private static List<Hit> single(String reason, String locator, int count) {
        List<Hit> l = new ArrayList<Hit>();
        l.add(new Hit(reason, locator, count));
        return l;
    }

    private static Set<String> set(String... v) {
        return Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(v)));
    }
}
