package com.kbstar.kgi.ggreport.web.docfill;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;

/**
 * OOXML(zip)을 POI 로 열기 전에 실제로 풀어 보며 검사한다. 헤더의 크기 필드는 믿지 않고 읽은 바이트를 센다.
 * 중복 entry 이름(대소문자·앞 '/' 무시)은 거부한다 — CVE-2025-31672 완화(POI 5.2.3 은 중복을 막지 않는다).
 * POI 의 OPCPackage.open(InputStream) 도 로컬 헤더를 순서대로 읽으므로 같은 entry 집합을 본다.
 */
public final class ZipGuard {

    public static final int MAX_ENTRIES = 2000;

    private ZipGuard() {
    }

    public static final class Result {
        public final Set<String> names;      // 소문자로 정규화
        public final byte[] contentTypes;    // [Content_Types].xml, 없으면 null
        public final long unpacked;

        Result(Set<String> names, byte[] contentTypes, long unpacked) {
            this.names = names;
            this.contentTypes = contentTypes;
            this.unpacked = unpacked;
        }
    }

    /** code: TOO_LARGE_UNPACKED | DUPLICATE_ENTRY | TOO_MANY_CELLS | CELL_TOO_LONG | BROKEN. 메시지·스택 없음. */
    public static final class Rejected extends Exception {
        public final String code;

        Rejected(String code) {
            super(code, null, false, false);
            this.code = code;
        }
    }

    /** 칸·행·글자 수 계수 없이 바이트 상한만 검사한다(계수 한도는 무제한). */
    public static Result check(byte[] zip, long maxEntry, long maxTotal) throws Rejected {
        return check(zip, maxEntry, maxTotal, Integer.MAX_VALUE, Integer.MAX_VALUE, Integer.MAX_VALUE);
    }

    /**
     * 바이트 상한에 더해, POI 로 열기 전에 시트 xml·sharedStrings.xml 을 StAX 로 훑어 칸(&lt;c&gt;) 수 &gt; maxCells,
     * 행(&lt;row&gt;) 수 &gt; maxRows 이면 TOO_MANY_CELLS, 문자열(&lt;si&gt;/&lt;is&gt;) 하나의 글자 수 &gt; maxCellChars 이면
     * CELL_TOO_LONG 으로 거부한다. 칸·행 수는 통합문서 전체 합계다. DTD·외부 엔티티는 끈다.
     */
    public static Result check(byte[] zip, long maxEntry, long maxTotal, int maxCells, int maxRows, int maxCellChars)
            throws Rejected {
        return check(zip, maxEntry, maxTotal, maxCells, maxRows, maxCellChars, Integer.MAX_VALUE);
    }

    /**
     * 위 검사에 더해, 계수 대상은 경로 이름이 아니라 내용으로 고른다 — 앞부분(BOM·공백 허용)이 '&lt;' 로 시작하는 파트는
     * 모두 StAX 로 훑는다(DOCTYPE 이 나오면 BROKEN). 모든 XML 파트의 시작 요소 총수가 maxXmlElements 를 넘으면
     * TOO_MANY_CELLS.
     */
    public static Result check(byte[] zip, long maxEntry, long maxTotal, int maxCells, int maxRows, int maxCellChars,
                               int maxXmlElements) throws Rejected {
        return check(zip, maxEntry, maxTotal, maxCells, maxRows, maxCellChars, maxXmlElements, false);
    }

    /**
     * lenientNonXml=true(hwpx 전용)이면, 이름이 .xml/.hpf/.rels/.xsd/.rdf 로 끝나지 않는 항목이 '&lt;' 로 시작해도
     * XML 파싱 실패(예: Preview/PrvText.txt 의 미리보기 글)는 거절하지 않고 건너뛴다. DOCTYPE·ENTITY 가 든 것,
     * 요소 수 상한 초과 등 Rejected 로 던져지는 것은 그대로 거절한다. false 면 위 메서드와 같다.
     */
    public static Result check(byte[] zip, long maxEntry, long maxTotal, int maxCells, int maxRows, int maxCellChars,
                               int maxXmlElements, boolean lenientNonXml) throws Rejected {
        Set<String> names = new LinkedHashSet<>();
        byte[] ct = null;
        long total = 0;
        long[] counts = new long[3];   // [0]=칸, [1]=행, [2]=시작 요소 총수
        byte[] buf = new byte[8192];
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zip))) {
            ZipEntry e;
            while ((e = in.getNextEntry()) != null) {
                String name = e.getName().replace('\\', '/').toLowerCase(Locale.ROOT);
                while (name.startsWith("/")) {
                    name = name.substring(1);
                }
                if (!names.add(name)) {
                    throw new Rejected("DUPLICATE_ENTRY");
                }
                if (names.size() > MAX_ENTRIES) {
                    throw new Rejected("TOO_LARGE_UNPACKED");
                }
                boolean isCt = "[content_types].xml".equals(name);
                ByteArrayOutputStream kept = null;
                boolean scan = false;
                long size = 0;
                int n;
                int filled = 0;
                while ((n = in.read(buf, filled, buf.length - filled)) > 0) {
                    size += n;
                    total += n;
                    if (size > maxEntry || total > maxTotal) {
                        throw new Rejected("TOO_LARGE_UNPACKED");
                    }
                    if (kept == null) {
                        filled += n;
                        if (filled < SNIFF && filled < buf.length) {
                            continue;                            // 앞부분이 모일 때까지
                        }
                        scan = looksXml(buf, filled);
                        kept = scan || isCt ? new ByteArrayOutputStream() : NONE;
                        if (kept != NONE) {
                            kept.write(buf, 0, filled);
                        }
                        filled = 0;
                    } else if (kept != NONE) {
                        kept.write(buf, 0, n);
                    }
                }
                if (kept == null && filled > 0) {                // 아주 짧은 entry
                    scan = looksXml(buf, filled);
                    if (scan || isCt) {
                        kept = new ByteArrayOutputStream();
                        kept.write(buf, 0, filled);
                    }
                }
                if (scan) {
                    // 지킬 조건 — 서버가 XML로 해석하는 항목 이름 ⊂ 엄격 검사 이름. 이름이 .xml이 아닌 항목을 XML로 읽는
                    // 코드를 새로 만들면 이 완화를 다시 본다(security 11-27).
                    boolean lenient = lenientNonXml && !strictXmlName(name);
                    countXml(kept.toByteArray(), counts, maxCells, maxRows, maxCellChars, maxXmlElements, lenient);
                }
                if (isCt && kept != null && kept != NONE) {
                    ct = kept.toByteArray();
                }
            }
        } catch (IOException | IllegalArgumentException ex) {   // 깨진 zip·잘못된 이름 인코딩
            throw new Rejected("BROKEN");
        }
        if (names.isEmpty()) {
            throw new Rejected("BROKEN");
        }
        return new Result(names, ct, total);
    }

    private static final int SNIFF = 64;
    private static final ByteArrayOutputStream NONE = new ByteArrayOutputStream();   // 보관하지 않음 표시(쓰지 않는다)

    /** 앞부분(UTF-8/UTF-16 BOM·공백·UTF-16 의 0 바이트 건너뜀)의 첫 글자가 '&lt;' 이면 XML 로 본다. */
    static boolean looksXml(byte[] b, int len) {
        int i = 0;
        if (len >= 3 && (b[0] & 0xFF) == 0xEF && (b[1] & 0xFF) == 0xBB && (b[2] & 0xFF) == 0xBF) {
            i = 3;
        } else if (len >= 2 && (((b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xFE)
                || ((b[0] & 0xFF) == 0xFE && (b[1] & 0xFF) == 0xFF))) {
            i = 2;
        }
        for (; i < len; i++) {
            int c = b[i] & 0xFF;
            if (c == 0 || c == ' ' || c == '\t' || c == '\r' || c == '\n') {
                continue;
            }
            return c == '<';
        }
        return false;
    }

    private static final String[] STRICT_SUFFIX = {".xml", ".hpf", ".rels", ".xsd", ".rdf"};

    /** 정규화(소문자)된 항목 이름이 XML 로 엄격히 검사할 이름인가. */
    private static boolean strictXmlName(String name) {
        for (String s : STRICT_SUFFIX) {
            if (name.endsWith(s)) {
                return true;
            }
        }
        return false;
    }

    /** 파싱이 DTD 이벤트에 이르기 전에 실패해도 DOCTYPE·ENTITY 선언은 놓치지 않게 원문(0 바이트 제외)에서 찾는다. */
    private static boolean hasDtdMarker(byte[] xml) {
        StringBuilder sb = new StringBuilder(xml.length);
        for (byte b : xml) {
            if (b != 0) {
                sb.append((char) (b & 0xFF));
            }
        }
        String s = sb.toString().toLowerCase(Locale.ROOT);
        return s.contains("<!doctype") || s.contains("<!entity");
    }

    /** 한 xml 을 훑어 누적 칸·행·요소 수와 문자열 하나의 글자 수를 한도와 비교한다. DOCTYPE·파싱 실패는 BROKEN. */
    private static void countXml(byte[] xml, long[] counts, int maxCells, int maxRows, int maxCellChars,
                                 int maxXmlElements, boolean lenient) throws Rejected {
        XMLInputFactory f = XMLInputFactory.newInstance();
        f.setProperty(XMLInputFactory.SUPPORT_DTD, false);
        f.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
        XMLStreamReader r = null;
        try {
            r = f.createXMLStreamReader(new ByteArrayInputStream(xml));
            boolean inStr = false;
            boolean inPhonetic = false;
            long len = 0;
            while (r.hasNext()) {
                int ev = r.next();
                if (ev == XMLStreamConstants.DTD) {
                    throw new Rejected("BROKEN");
                }
                if (ev == XMLStreamConstants.START_ELEMENT) {
                    if (++counts[2] > maxXmlElements) {
                        throw new Rejected("TOO_MANY_CELLS");
                    }
                    String n = r.getLocalName();
                    if ("c".equals(n)) {
                        if (++counts[0] > maxCells) {
                            throw new Rejected("TOO_MANY_CELLS");
                        }
                    } else if ("row".equals(n)) {
                        if (++counts[1] > maxRows) {
                            throw new Rejected("TOO_MANY_CELLS");
                        }
                    } else if ("si".equals(n) || "is".equals(n)) {
                        inStr = true;
                        inPhonetic = false;
                        len = 0;
                    } else if ("rPh".equals(n)) {
                        inPhonetic = true;
                    } else if ("t".equals(n) && inStr && !inPhonetic) {
                        len += r.getElementText().length();     // END_ELEMENT(t)까지 소비
                        if (len > maxCellChars) {
                            throw new Rejected("CELL_TOO_LONG");
                        }
                    }
                } else if (ev == XMLStreamConstants.END_ELEMENT) {
                    String n = r.getLocalName();
                    if ("si".equals(n) || "is".equals(n)) {
                        inStr = false;
                    } else if ("rPh".equals(n)) {
                        inPhonetic = false;
                    }
                }
            }
        } catch (XMLStreamException | RuntimeException ex) {
            // Rejected(DOCTYPE·요소 수 상한 등)는 여기 잡히지 않고 그대로 전파된다(checked, 위 두 타입의 하위가 아님).
            if (!lenient || hasDtdMarker(xml)) {
                throw new Rejected("BROKEN");
            }
            // lenient: XML 이 아닌 글(미리보기 텍스트 등) — 건너뜀
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
}
