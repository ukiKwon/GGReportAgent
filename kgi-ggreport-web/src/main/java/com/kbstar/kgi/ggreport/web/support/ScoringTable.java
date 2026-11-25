package com.kbstar.kgi.ggreport.web.support;

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
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * 공고문·제안요청서(RFP)에서 '선정 평가표'(평가항목·배점 표)를 <b>글자 그대로</b> 옮겨 온다(사용자 결정 2026-11-25 — LLM 없이).
 *
 * <ul>
 *   <li><b>HWPX</b> — 파일 안에 표 구조(hp:tbl › hp:tr › hp:tc)가 그대로 있다. 머리 줄에 '배점'이 든 첫 표를 행·칸 그대로 옮긴다
 *       ({@link Result#kind} = {@code TABLE}). 칸 안의 문단은 줄바꿈으로 잇는다.</li>
 *   <li><b>PDF</b> — 글자 층을 읽는다(pdfbox). '배점'이 든 줄부터 그 쪽 끝까지를 줄 단위로 옮긴다({@code LINES} — 칸 구분은 없다).
 *       글자 층이 없는 스캔 PDF 는 읽지 못한다(이 서버에는 그림 글자 인식기가 없다).</li>
 * </ul>
 *
 * <p>값을 고치거나 해석하지 않는다 — 합계 검산용으로 '계' 줄의 숫자만 {@link Result#total} 에 따로 싣는다. 못 찾으면 {@code null}.
 * 입력은 올리기 검사(PrepAttachInspector — ZipGuard·쪽 수·시간 상한)를 지난 보관 파일이다. 여기서도 읽는 양에 상한을 둔다.</p>
 */
public final class ScoringTable {

    static final int MAX_ROWS = 200;
    static final int MAX_COLS = 12;
    static final int MAX_CELL = 2000;
    static final int MAX_LINES = 120;
    static final int MAX_PDF_PAGES = 200;
    private static final int SECTION_MAX = 60 * 1024 * 1024;
    private static final String KEY = "배점";
    private static final Pattern NUM = Pattern.compile("(\\d{1,4})");

    private ScoringTable() {
    }

    /** 옮겨 온 표. kind TABLE = 행·칸 그대로, LINES = 줄마다 한 칸. page 는 PDF 쪽 번호(1부터, HWPX 는 0). */
    public static final class Result {
        private final String kind;
        private final List<List<String>> rows;
        private final Integer total;
        private final int page;

        Result(String kind, List<List<String>> rows, Integer total, int page) {
            this.kind = kind;
            this.rows = rows;
            this.total = total;
            this.page = page;
        }

        public String getKind() { return kind; }
        public List<List<String>> getRows() { return rows; }
        public Integer getTotal() { return total; }
        public int getPage() { return page; }
    }

    /** 파싱 시간 상한(초) — 넘기면 그 파일은 건너뛴다. 일꾼은 2개뿐이라 한꺼번에 몰려도 서버 일꾼을 다 쓰지 않는다. */
    static final int TIMEOUT_SECONDS = 15;
    private static final java.util.concurrent.ExecutorService POOL = java.util.concurrent.Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "scoring-table");
        t.setDaemon(true);
        return t;
    });

    /** 시간 상한 안에서 읽은 결과. timedOut 이면 result 는 뜻이 없다. */
    public static final class Timed {
        private final Result result;
        private final boolean timedOut;

        Timed(Result result, boolean timedOut) {
            this.result = result;
            this.timedOut = timedOut;
        }

        public Result getResult() { return result; }
        public boolean isTimedOut() { return timedOut; }
    }

    /** {@link #extract} 를 시간 상한({@link #TIMEOUT_SECONDS}) 안에서 돌린다. 넘기면 작업을 끊고 timedOut. */
    public static Timed extractTimed(String ext, byte[] data) {
        java.util.concurrent.Future<Result> f = POOL.submit(() -> extract(ext, data));
        try {
            return new Timed(f.get(TIMEOUT_SECONDS, java.util.concurrent.TimeUnit.SECONDS), false);
        } catch (java.util.concurrent.TimeoutException e) {
            f.cancel(true);
            return new Timed(null, true);
        } catch (java.util.concurrent.ExecutionException e) {
            return new Timed(null, false);   // 읽기 실패 — 표 없음으로 본다
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            f.cancel(true);
            return new Timed(null, true);
        }
    }

    /** 확장자(ext: hwpx·pdf)에 맞는 방법으로 읽는다. 그 밖의 형식·못 찾음·읽기 실패는 null. */
    public static Result extract(String ext, byte[] data) {
        String e = ext == null ? "" : ext.toLowerCase(Locale.ROOT);
        try {
            if ("hwpx".equals(e)) {
                return fromHwpx(data);
            }
            if ("pdf".equals(e)) {
                return fromPdf(data);
            }
        } catch (IOException | XMLStreamException | RuntimeException ex) {
            return null;   // 깨진 파일 — 못 읽음으로 본다(원인은 싣지 않는다)
        }
        return null;
    }

    static String squeeze(String s) {
        return s == null ? "" : s.replaceAll("[\\s\\u00a0\\u3000]+", "");
    }

    // ── HWPX ────────────────────────────────────────────────────────────

    static Result fromHwpx(byte[] data) throws IOException, XMLStreamException {
        XMLInputFactory f = XMLInputFactory.newInstance();
        f.setProperty(XMLInputFactory.SUPPORT_DTD, false);
        f.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
        byte[] buf = new byte[8192];
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(data))) {
            ZipEntry e;
            while ((e = in.getNextEntry()) != null) {
                String n = e.getName().replace('\\', '/').toLowerCase(Locale.ROOT);
                if (!n.startsWith("contents/section") || !n.endsWith(".xml")) {
                    continue;
                }
                ByteArrayOutputStream xml = new ByteArrayOutputStream();
                int r;
                while ((r = in.read(buf)) > 0) {
                    if (xml.size() + r > SECTION_MAX) {
                        return null;
                    }
                    xml.write(buf, 0, r);
                }
                List<List<String>> t = firstScoringTable(f, xml.toByteArray());
                if (t != null) {
                    return new Result("TABLE", t, totalOf(t), 0);
                }
            }
        }
        return null;
    }

    /** 구역 XML 에서 머리 두 줄 안에 '배점' 칸이 있는 첫 바깥 표. 표 안의 표는 그 칸의 글자로 합친다. */
    private static List<List<String>> firstScoringTable(XMLInputFactory f, byte[] xml) throws XMLStreamException {
        XMLStreamReader r = f.createXMLStreamReader(new ByteArrayInputStream(xml));
        try {
            int depth = 0;                       // 표 중첩 깊이
            List<List<String>> rows = null;
            List<String> row = null;
            StringBuilder cell = null;
            boolean inText = false;
            while (r.hasNext()) {
                int ev = r.next();
                if (ev == XMLStreamConstants.START_ELEMENT) {
                    String name = r.getLocalName();
                    if ("tbl".equals(name)) {
                        depth++;
                        if (depth == 1) {
                            rows = new ArrayList<>();
                        }
                    } else if (depth == 1 && "tr".equals(name)) {
                        row = new ArrayList<>();
                    } else if (depth == 1 && "tc".equals(name)) {
                        cell = new StringBuilder();
                    } else if (depth >= 1 && "t".equals(name)) {
                        inText = true;
                    }
                } else if ((ev == XMLStreamConstants.CHARACTERS || ev == XMLStreamConstants.CDATA) && inText && cell != null) {
                    if (cell.length() < MAX_CELL) {
                        cell.append(r.getText());
                    }
                } else if (ev == XMLStreamConstants.END_ELEMENT) {
                    String name = r.getLocalName();
                    if ("t".equals(name)) {
                        inText = false;
                    } else if ("p".equals(name) && cell != null && cell.length() > 0 && cell.charAt(cell.length() - 1) != '\n') {
                        cell.append('\n');       // 칸 안의 문단 경계
                    } else if (depth == 1 && "tc".equals(name) && row != null && cell != null) {
                        if (row.size() < MAX_COLS) {
                            row.add(cell.toString().trim());
                        }
                        cell = null;
                    } else if (depth == 1 && "tr".equals(name) && rows != null && row != null) {
                        if (rows.size() < MAX_ROWS) {
                            rows.add(row);
                        }
                        row = null;
                    } else if ("tbl".equals(name)) {
                        depth--;
                        if (depth == 0) {
                            if (rows != null && isScoring(rows)) {
                                return rows;
                            }
                            rows = null;
                        }
                    }
                }
            }
            return null;
        } finally {
            r.close();
        }
    }

    private static boolean isScoring(List<List<String>> rows) {
        if (rows.size() < 3) {
            return false;
        }
        for (int i = 0; i < Math.min(2, rows.size()); i++) {
            for (String c : rows.get(i)) {
                String s = squeeze(c);
                if (s.length() <= 12 && s.contains(KEY)) {   // 머리 칸('배점'·'배점(점)') — 본문 문장 속의 '배점'은 아니다
                    return true;
                }
            }
        }
        return false;
    }

    /** '계'·'합계'·'총점' 줄의 첫 숫자. 없으면 null. */
    static Integer totalOf(List<List<String>> rows) {
        for (List<String> row : rows) {
            boolean sum = false;
            for (String c : row) {
                String s = squeeze(c);
                if ("계".equals(s) || "합계".equals(s) || "총점".equals(s) || "총계".equals(s)) {
                    sum = true;
                }
            }
            if (!sum) {
                continue;
            }
            for (String c : row) {
                Matcher m = NUM.matcher(squeeze(c));
                if (m.matches()) {
                    return Integer.valueOf(m.group(1));
                }
            }
        }
        return null;
    }

    // ── PDF ─────────────────────────────────────────────────────────────

    static Result fromPdf(byte[] data) throws IOException {
        try (PDDocument doc = PDDocument.load(new ByteArrayInputStream(data), MemoryUsageSetting.setupTempFileOnly())) {
            PDFTextStripper st = new PDFTextStripper();
            st.setSortByPosition(true);
            int pages = Math.min(doc.getNumberOfPages(), MAX_PDF_PAGES);
            for (int p = 1; p <= pages; p++) {
                st.setStartPage(p);
                st.setEndPage(p);
                String[] lines = st.getText(doc).split("\\r?\\n");
                int at = -1;
                for (int i = 0; i < lines.length; i++) {
                    String s = squeeze(lines[i]);
                    if (s.contains(KEY) && s.length() <= 40 && (s.contains("항목") || s.contains("평가"))) {   // 표 머리 줄
                        at = i;
                        break;
                    }
                }
                if (at < 0) {
                    continue;
                }
                List<List<String>> rows = new ArrayList<>();
                for (int i = at; i < lines.length && rows.size() < MAX_LINES; i++) {
                    String t = lines[i].trim();
                    if (t.isEmpty()) {
                        continue;
                    }
                    List<String> one = new ArrayList<>();
                    one.add(t.length() > MAX_CELL ? t.substring(0, MAX_CELL) : t);
                    rows.add(one);
                }
                if (rows.size() >= 3) {
                    return new Result("LINES", rows, null, p);
                }
            }
        }
        return null;
    }
}
