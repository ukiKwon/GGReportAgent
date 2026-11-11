package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.docfill.ZipGuard;
import com.kbstar.kgi.ggreport.web.support.Pii;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSObject;
import org.apache.pdfbox.io.MemoryUsageSetting;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;

import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * 사전준비 첨부 내용 검사(NEXT 71, security D2·D3·D5) — 저장하기 전에 파일 하나를 열어 본다. 순서: 확장자 허용 목록 → 매직 바이트 →
 * (OOXML·hwpx) ZipGuard + 매크로·ActiveX 거부 + 확장자와 구조 일치 / (pdf) pdfbox 를 임시 파일 모드·쪽 수·시간 상한 안에서 열어
 * /JavaScript·/Launch·/EmbeddedFile 거부 → 텍스트 추출 → {@link Pii#scanLoose}(전각 숫자·우회 구분자 정규화 포함).
 *
 * <p>차단은 <b>주민등록번호·외국인등록번호·카드번호</b>뿐이다(사용자 결정 2026-11-10). 이메일·휴대폰은 경고로 저장하고 종류·건수만 센다.
 * 텍스트가 안 나오는 파일(스캔 PDF 등)은 {@code checked=false} 로 돌려 저장 쪽이 PII_STATE=UNCHECKED 로 남기게 한다.
 * 오류 문구에는 값·파일 이름·내부 사정을 싣지 않는다(종류·건수만).
 */
final class PrepAttachInspector {

    /** 허용 확장자(소문자). HWP(구형)·xlsm·docm·xls·doc·zip 등은 없다. */
    static final Set<String> EXTS = Collections.unmodifiableSet(new HashSet<String>(
            Arrays.asList("xlsx", "docx", "pdf", "hwpx")));

    /** 이 종류가 나오면 저장하지 않는다. 그 밖(이메일·휴대폰)은 경고 후 저장. */
    private static final Set<String> BLOCK_KINDS = Collections.unmodifiableSet(new HashSet<String>(
            Arrays.asList("주민등록번호", "외국인등록번호", "카드번호")));

    private static final long MB = 1024L * 1024;
    private static final long ENTRY_MAX = 100 * MB;          // 압축 해제 entry 하나
    private static final long TOTAL_MAX = 200 * MB;          // 압축 해제 합계(D4)
    private static final int MAX_CELLS = 5000000;
    private static final int MAX_ROWS = 1100000;
    private static final int MAX_ELEMENTS = 30000000;
    private static final int TEXT_CAP = 8000000;             // 이만큼 넘는 글자는 검사하지 않고 UNCHECKED
    private static final int MAX_PAGES = 500;
    private static final long PDF_SECONDS = 20;

    private static final byte[] PK = {0x50, 0x4B, 0x03, 0x04};
    private static final byte[] PDF = {0x25, 0x50, 0x44, 0x46, 0x2D};                       // %PDF-
    private static final byte[] OLE = {(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0};       // HWP(구형)·옛 오피스

    /** 칸·문단 경계 — 숫자가 칸을 건너 이어 붙지 않게 공백이 아닌 구분자로 넣는다. */
    private static final Set<String> BREAKS = Collections.unmodifiableSet(new HashSet<String>(
            Arrays.asList("si", "is", "p", "tr", "tc", "row", "c", "br", "para", "paragraph")));

    /** 원문 바이트 검사 — 짧은 "/JS" 는 압축된 바이트열에서 우연히 걸려 큰 PDF 를 오탐하므로 뺐다(객체 사전 검사가 /JS 를 본다). */
    private static final Pattern PDF_ACTIVE = Pattern.compile(
            "/(?:JavaScript|Launch|EmbeddedFiles?)(?![A-Za-z0-9_.\\-])");
    private static final String[] PDF_ACTIVE_KEYS = {"JavaScript", "JS", "Launch", "EmbeddedFile", "EmbeddedFiles"};

    private static final ExecutorService PDF_POOL = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "prep-attach-pdf");
        t.setDaemon(true);
        return t;
    });

    private PrepAttachInspector() {
    }

    /** 검사 결과 — 저장 쪽이 쓴다. warnings 는 종류→건수(이메일·휴대폰). */
    static final class Result {
        final boolean checked;
        final Map<String, Integer> warnings;

        Result(boolean checked, Map<String, Integer> warnings) {
            this.checked = checked;
            this.warnings = warnings;
        }
    }

    // ── 확장자·이름 ──────────────────────────────────────────────────────

    /** 마지막 점 뒤(소문자). 없으면 빈 문자열. */
    static String extOf(String name) {
        int dot = name.lastIndexOf('.');
        return dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    /** 허용 확장자가 아니면 400 UNSUPPORTED_FORMAT. HWP 는 안내 문구를 따로 준다. */
    static void requireAllowedExt(String ext) {
        if (EXTS.contains(ext)) {
            return;
        }
        if ("hwp".equals(ext)) {
            throw coded(400, "UNSUPPORTED_FORMAT", "HWP 파일은 올릴 수 없습니다. HWPX·PDF·xlsx·docx로 저장해 올려 주세요.");
        }
        throw coded(400, "UNSUPPORTED_FORMAT", "올릴 수 없는 형식입니다. 가능한 형식: xlsx, docx, pdf, hwpx.");
    }

    /** 파일 이름에 차단 대상 개인정보가 있으면 422. (이름은 DB 에 남는다.) */
    static void rejectBlockedText(String text) {
        Map<String, Integer> blocked = new LinkedHashMap<>();
        for (Pii.Finding f : Pii.scanLoose(text)) {
            if (BLOCK_KINDS.contains(f.getKind())) {
                count(blocked, f.getKind());
            }
        }
        if (!blocked.isEmpty()) {
            throw piiBlocked(blocked);
        }
    }

    // ── 매직 바이트 ──────────────────────────────────────────────────────

    /** 확장자와 맞는 머리말인가. HWP/OLE 머리말은 확장자와 상관없이 400. */
    static void checkMagic(String ext, byte[] data) {
        if (startsWith(data, OLE)) {
            throw coded(400, "UNSUPPORTED_FORMAT", "HWP·구형 오피스 파일은 올릴 수 없습니다. HWPX·PDF·xlsx·docx로 저장해 올려 주세요.");
        }
        boolean ok = "pdf".equals(ext) ? startsWith(data, PDF) : startsWith(data, PK);
        if (!ok) {
            throw coded(400, "FORMAT_MISMATCH", "파일 내용이 확장자와 맞지 않습니다.");
        }
    }

    // ── 내용 검사 ────────────────────────────────────────────────────────

    /** 매직 바이트를 통과한 파일을 연다. 거부 사유는 ApiException(400/422). */
    static Result inspect(String ext, byte[] data) {
        if ("pdf".equals(ext)) {
            return inspectPdf(data);
        }
        return inspectZip(ext, data);
    }

    private static Result inspectZip(String ext, byte[] data) {
        ZipGuard.Result z;
        try {
            z = ZipGuard.check(data, ENTRY_MAX, TOTAL_MAX, MAX_CELLS, MAX_ROWS, Integer.MAX_VALUE, MAX_ELEMENTS);
        } catch (ZipGuard.Rejected e) {
            throw coded(400, "FILE_REJECTED", "파일 구조가 안전하지 않거나 열 수 없어 올릴 수 없습니다.");
        }
        for (String n : z.names) {
            if (n.contains("vbaproject") || n.contains("activex") || n.contains("vbadata")) {
                throw coded(400, "ACTIVE_CONTENT", "매크로·ActiveX가 들어 있는 파일은 올릴 수 없습니다.");
            }
        }
        if (z.contentTypes != null
                && new String(z.contentTypes, StandardCharsets.UTF_8).toLowerCase(Locale.ROOT).contains("macroenabled")) {
            throw coded(400, "ACTIVE_CONTENT", "매크로가 들어 있는 형식(xlsm·docm 등)은 올릴 수 없습니다.");
        }
        boolean shape;
        if ("xlsx".equals(ext)) {
            shape = z.names.contains("xl/workbook.xml");
        } else if ("docx".equals(ext)) {
            shape = z.names.contains("word/document.xml");
        } else {   // hwpx
            shape = z.names.contains("mimetype") || z.names.contains("contents/content.hpf");
        }
        if (!shape) {
            throw coded(400, "FORMAT_MISMATCH", "파일 내용이 확장자와 맞지 않습니다.");
        }
        StringBuilder text = zipText(data);
        boolean truncated = text.length() > TEXT_CAP;
        return classify(text.toString(), truncated);
    }

    private static Result inspectPdf(byte[] data) {
        Callable<Result> task = () -> pdfTask(data);
        Future<Result> f = PDF_POOL.submit(task);
        try {
            return f.get(PDF_SECONDS, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            f.cancel(true);
            throw coded(400, "FILE_REJECTED", "PDF를 검사하는 데 시간이 너무 오래 걸려 올릴 수 없습니다.");
        } catch (ExecutionException e) {
            Throwable c = e.getCause();
            if (c instanceof ApiException) {
                throw (ApiException) c;
            }
            throw coded(400, "FILE_REJECTED", "PDF를 열 수 없습니다(손상·암호화되었거나 지원하지 않는 구조).");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            f.cancel(true);
            throw coded(400, "FILE_REJECTED", "PDF 검사가 중단되었습니다. 다시 시도해 주세요.");
        }
    }

    private static Result pdfTask(byte[] data) throws IOException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(PDF_SECONDS);
        try (PDDocument doc = PDDocument.load(new ByteArrayInputStream(data), MemoryUsageSetting.setupTempFileOnly())) {
            if (doc.isEncrypted()) {
                throw coded(400, "FILE_REJECTED", "암호가 걸린 PDF는 올릴 수 없습니다.");
            }
            int pages = doc.getNumberOfPages();
            if (pages > MAX_PAGES) {
                throw coded(400, "FILE_REJECTED", "PDF 쪽 수가 너무 많습니다(" + MAX_PAGES + "쪽 이하).");
            }
            rejectPdfActive(doc, data);
            PDFTextStripper stripper = new PDFTextStripper();
            StringBuilder text = new StringBuilder();
            for (int p = 1; p <= pages && text.length() <= TEXT_CAP; p++) {
                if (Thread.currentThread().isInterrupted() || System.nanoTime() > deadline) {
                    throw coded(400, "FILE_REJECTED", "PDF를 검사하는 데 시간이 너무 오래 걸려 올릴 수 없습니다.");
                }
                stripper.setStartPage(p);
                stripper.setEndPage(p);
                text.append(stripper.getText(doc)).append('\n');
            }
            return classify(text.toString(), text.length() > TEXT_CAP);
        }
    }

    /** /JavaScript·/JS·/Launch·/EmbeddedFile — 원문 바이트와 객체 사전을 둘 다 본다(이름은 압축·16진 표기로 가릴 수 있다). */
    private static void rejectPdfActive(PDDocument doc, byte[] data) {
        boolean hit = PDF_ACTIVE.matcher(new String(data, StandardCharsets.ISO_8859_1)).find();
        if (!hit) {
            for (COSObject o : doc.getDocument().getObjects()) {
                COSBase b = o.getObject();
                if (b instanceof COSDictionary && activeDict((COSDictionary) b, 0)) {
                    hit = true;
                    break;
                }
            }
        }
        if (!hit) {
            hit = activeDict(doc.getDocumentCatalog().getCOSObject(), 0);
        }
        if (hit) {
            throw coded(400, "ACTIVE_CONTENT", "스크립트·실행·첨부 파일이 들어 있는 PDF는 올릴 수 없습니다.");
        }
    }

    private static boolean activeDict(COSDictionary d, int depth) {
        for (String k : PDF_ACTIVE_KEYS) {
            if (d.containsKey(COSName.getPDFName(k))) {
                return true;
            }
        }
        String s = d.getNameAsString(COSName.getPDFName("S"));
        if ("JavaScript".equals(s) || "Launch".equals(s)) {
            return true;
        }
        if ("EmbeddedFile".equals(d.getNameAsString(COSName.getPDFName("Type")))) {
            return true;
        }
        if (depth < 3) {   // 카탈로그의 이름 트리·열 때 동작·추가 동작은 한 단계씩 더 본다
            for (String k : new String[]{"Names", "OpenAction", "AA"}) {
                COSBase child = d.getDictionaryObject(COSName.getPDFName(k));
                if (child instanceof COSDictionary && activeDict((COSDictionary) child, depth + 1)) {
                    return true;
                }
            }
        }
        return false;
    }

    // ── 텍스트 추출·개인정보 ─────────────────────────────────────────────

    /** zip 안 XML 부분의 글자를 이어 붙인다(스타일·테마 등 제외). ZipGuard 를 이미 통과해 크기는 안전하다. */
    private static StringBuilder zipText(byte[] data) {
        StringBuilder sb = new StringBuilder();
        XMLInputFactory f = XMLInputFactory.newInstance();
        f.setProperty(XMLInputFactory.SUPPORT_DTD, false);
        f.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
        byte[] buf = new byte[8192];
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(data))) {
            ZipEntry e;
            while ((e = in.getNextEntry()) != null && sb.length() <= TEXT_CAP) {
                String n = e.getName().replace('\\', '/').toLowerCase(Locale.ROOT);
                if (!n.endsWith(".xml") || skipPart(n)) {
                    continue;
                }
                ByteArrayOutputStream xml = new ByteArrayOutputStream();
                int r;
                while ((r = in.read(buf)) > 0) {
                    xml.write(buf, 0, r);
                }
                appendXmlText(f, xml.toByteArray(), sb);
            }
        } catch (IOException | IllegalArgumentException ex) {
            // 깨진 zip 은 ZipGuard 가 이미 거른다 — 여기서는 읽은 데까지만 쓴다
        }
        return sb;
    }

    private static boolean skipPart(String n) {
        return n.contains("[content_types]") || n.contains("theme") || n.contains("styles") || n.contains("fonttable")
                || n.contains("settings") || n.contains("numbering");
    }

    private static void appendXmlText(XMLInputFactory f, byte[] xml, StringBuilder sb) {
        XMLStreamReader r = null;
        try {
            r = f.createXMLStreamReader(new ByteArrayInputStream(xml));
            while (r.hasNext() && sb.length() <= TEXT_CAP) {
                int ev = r.next();
                if (ev == XMLStreamConstants.CHARACTERS || ev == XMLStreamConstants.CDATA) {
                    sb.append(r.getText());
                } else if (ev == XMLStreamConstants.END_ELEMENT && BREAKS.contains(r.getLocalName())) {
                    sb.append('|');
                }
            }
        } catch (XMLStreamException | RuntimeException ex) {
            // 이 부분만 건너뛴다(ZipGuard 가 이미 형식을 확인했다)
        } finally {
            if (r != null) {
                try {
                    r.close();
                } catch (XMLStreamException ignore) {
                    // 닫기 실패는 판정에 영향 없음
                }
            }
        }
    }

    private static Result classify(String text, boolean truncated) {
        Map<String, Integer> blocked = new LinkedHashMap<>();
        Map<String, Integer> warn = new LinkedHashMap<>();
        for (Pii.Finding f : Pii.scanLoose(text)) {
            count(BLOCK_KINDS.contains(f.getKind()) ? blocked : warn, f.getKind());
        }
        if (!blocked.isEmpty()) {
            throw piiBlocked(blocked);
        }
        return new Result(!truncated && !text.trim().isEmpty(), warn);
    }

    // ── 도우미 ───────────────────────────────────────────────────────────

    /** "이메일 2, 휴대폰 1" — 종류·건수만. 100자(PII_NOTE 칸)를 넘으면 자른다. 없으면 null. */
    static String note(Map<String, Integer> warnings) {
        if (warnings.isEmpty()) {
            return null;
        }
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, Integer> e : warnings.entrySet()) {
            sb.append(sb.length() == 0 ? "" : ", ").append(e.getKey()).append(' ').append(e.getValue());
        }
        return sb.length() > 100 ? sb.substring(0, 100) : sb.toString();
    }

    static List<Map<String, Object>> warningList(Map<String, Integer> warnings) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map.Entry<String, Integer> e : warnings.entrySet()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("kind", e.getKey());
            m.put("count", e.getValue());
            out.add(m);
        }
        return out;
    }

    private static void count(Map<String, Integer> m, String kind) {
        Integer c = m.get(kind);
        m.put(kind, c == null ? 1 : c + 1);
    }

    private static boolean startsWith(byte[] data, byte[] head) {
        if (data.length < head.length) {
            return false;
        }
        for (int i = 0; i < head.length; i++) {
            if (data[i] != head[i]) {
                return false;
            }
        }
        return true;
    }

    private static ApiException piiBlocked(Map<String, Integer> blocked) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("code", "PII_BLOCKED");
        d.put("message", "주민등록번호·외국인등록번호·카드번호로 보이는 값이 있어 올리지 않았습니다. 해당 값을 지운 파일을 올려 주세요.");
        d.put("kinds", warningList(blocked));   // 종류·건수만 — 값은 싣지 않는다
        return ApiException.withDetail(422, d);
    }

    private static ApiException coded(int status, String code, String message) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("code", code);
        d.put("message", message);
        return ApiException.withDetail(status, d);
    }
}
