package com.kb.uploader.parse;

import java.io.ByteArrayInputStream;
import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.io.SequenceInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipInputStream;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;

/**
 * 출처: kgi-ggreport-web {@code docfill/ZipGuard}(2026-11-16 NEXT 39 이식). uploader 는 web 을 import 하지 않으므로
 * 복사본이다. web 쪽 규칙(한도·코드)을 바꾸면 이쪽도 같이 본다. 달라진 점: InputStream·Path 입력, 용도별 한도 메서드,
 * 중앙 목차 대조, XML 스트리밍 계수(NEXT 39 2단계).
 *
 * OOXML(zip)을 POI 로 열기 전에 실제로 풀어 보며 검사한다. 헤더의 크기 필드는 믿지 않고 읽은 바이트를 센다.
 * 중복 entry 이름(대소문자·앞 '/' 무시)은 거부한다 — CVE-2025-31672 완화(POI 5.2.3 은 중복을 막지 않는다).
 * 스트림 검사는 로컬 헤더만 본다. 파일(Path) 입력은 열기 쪽(ZipFile·POI·HWPXReader)이 읽는 중앙 목차도 따로 읽어
 * entry 이름 집합·개수·실제 해제 크기가 스트림 결과와 다르면 BROKEN 으로 거부한다(가짜 서명 뒤 숨김 방어).
 * byte[] 입력은 InputStream 으로 여는 호출부(InstitutionService)용이라 스트림 검사만 한다.
 * XML 파트는 메모리에 모으지 않고 크기를 세는 스트림을 StAX 에 바로 넘긴다.
 * 파일 입력의 목차 대조는 열기 쪽과 같은 zip 구현으로 한다: POI 로 여는 xlsx·pptx 는 commons-compress ZipFile
 * (POI 5.2.3 ZipSecureFile 의 부모 — javap 확인, checkOoxmlFile), HWPX 는 java.util.zip.ZipFile
 * (hwpxlib 1.0.9 HWPXReader·FileContentService 가 쓰는 구현 — javap 확인, checkUploadFile). NEXT 86 ⑥.
 */
public final class ZipGuard {

    public static final int MAX_ENTRIES = 2000;
    public static final long MB = 1024L * 1024;

    /** 업로드 파일(제안서 pptx·엑셀·hwpx) — web PrepAttachInspector 의 한도와 같다. */
    public static Result checkUploadFile(Path file) throws Rejected {
        return check(file, 100 * MB, 200 * MB, 5000000, 1100000, Integer.MAX_VALUE, 30000000, false);
    }

    /** POI 로 여는 파일(xlsx·pptx)용. 한도는 checkUploadFile 과 같고, 목차를 POI 와 같은 commons-compress 로 대조한다. */
    public static Result checkOoxmlFile(Path file) throws Rejected {
        return check(file, 100 * MB, 200 * MB, 5000000, 1100000, Integer.MAX_VALUE, 30000000, true);
    }

    /** 기관 목록 xlsx(작은 파일) — web ZipGuardTest 의 정상 xlsx 통과 값. */
    public static Result checkSmallXlsx(byte[] xlsx) throws Rejected {
        return check(xlsx, 20 * MB, 40 * MB, 200000, 200000, 32767);
    }

    /** 첫 4바이트가 zip 로컬 헤더(PK\3\4)인가. ppt·xls(OLE)·hwp 는 false. 읽기 실패도 false. */
    public static boolean isZip(Path file) {
        try (InputStream in = Files.newInputStream(file)) {
            byte[] h = new byte[4];
            int n = 0;
            int r;
            while (n < 4 && (r = in.read(h, n, 4 - n)) > 0) {
                n += r;
            }
            return n == 4 && h[0] == 0x50 && h[1] == 0x4B && h[2] == 3 && h[3] == 4;
        } catch (IOException e) {
            return false;
        }
    }

    /** 첫 4바이트가 OLE2 서명(D0 CF 11 E0)인가. 읽기 실패는 false. */
    static boolean isOle(Path file) {
        try (InputStream in = Files.newInputStream(file)) {
            byte[] h = new byte[4];
            int n = 0;
            int r;
            while (n < 4 && (r = in.read(h, n, 4 - n)) > 0) {
                n += r;
            }
            return n == 4 && (h[0] & 0xFF) == 0xD0 && (h[1] & 0xFF) == 0xCF && h[2] == 0x11 && (h[3] & 0xFF) == 0xE0;
        } catch (IOException e) {
            return false;
        }
    }

    /**
     * 암호화 OOXML(OLE 안의 EncryptedPackage/EncryptionInfo)을 거부한다(NEXT 86, 사용자 11-16: 암호 문서 없음 → 분석 거부).
     * 이런 파일은 PK 로 시작하지 않아 zip 검사를 건너뛰고, POI 가 기본 키로 복호화하면 해제된 zip 은 검사를 받지 않는다.
     * 일반 xls/ppt(OLE)는 통과한다. 사유는 코드(ENCRYPTED)만 쓴다.
     */
    public static void rejectEncryptedOoxml(Path file) throws Rejected {
        if (!isOle(file)) {
            return;
        }
        try (org.apache.poi.poifs.filesystem.POIFSFileSystem fs =
                     new org.apache.poi.poifs.filesystem.POIFSFileSystem(file.toFile(), true)) {
            org.apache.poi.poifs.filesystem.DirectoryNode root = fs.getRoot();
            for (String n : root.getEntryNames()) {      // 대소문자 무시(POI 가 이름을 느슨하게 찾을 경우 대비, security 11-16 N1)
                if ("EncryptedPackage".equalsIgnoreCase(n) || "EncryptionInfo".equalsIgnoreCase(n)) {
                    throw new Rejected("ENCRYPTED");
                }
            }
        } catch (IOException | RuntimeException ex) {
            throw new Rejected("BROKEN");
        }
    }

    /** 파일을 스트림으로 읽으며 검사하고(통째로 메모리에 올리지 않는다), 중앙 목차와 대조한다. */
    public static Result check(Path file, long maxEntry, long maxTotal, int maxCells, int maxRows,
                               int maxCellChars, int maxXmlElements) throws Rejected {
        return check(file, maxEntry, maxTotal, maxCells, maxRows, maxCellChars, maxXmlElements, false);
    }

    /** commons=true 면 목차를 commons-compress 로, false 면 java.util.zip 으로 읽는다. */
    public static Result check(Path file, long maxEntry, long maxTotal, int maxCells, int maxRows,
                               int maxCellChars, int maxXmlElements, boolean commons) throws Rejected {
        Result r;
        try (InputStream in = Files.newInputStream(file)) {
            r = scan(in, maxEntry, maxTotal, maxCells, maxRows, maxCellChars, maxXmlElements);
        } catch (IOException e) {
            throw new Rejected("BROKEN");
        }
        verifyDirectory(file, commons, r, maxEntry, maxTotal, maxCells, maxRows, maxCellChars, maxXmlElements);
        return r;
    }

    /**
     * 열기 쪽이 읽는 중앙 목차를 java.util.zip.ZipFile 로 읽어 스트림 검사 결과와 대조한다.
     * 이름 집합·개수가 다르거나 entry 별 실제 해제 크기가 다르면 BROKEN. 목차의 크기 필드는 쓰지 않고 실제로 읽어 센다.
     * 내용 검사(DOCTYPE·칸·행·요소·글자 수)도 목차 쪽 바이트로 다시 한다 — 같은 이름·같은 크기로 내용만 바꿔 숨긴
     * entry 를 여는 쪽이 읽는 경우 방어(security 11-16 N1).
     */
    private static void verifyDirectory(Path file, boolean commons, Result stream, long maxEntry, long maxTotal,
                                        int maxCells, int maxRows, int maxCellChars, int maxXmlElements)
            throws Rejected {
        Set<String> seen = new HashSet<>();
        long[] total = new long[1];
        long[] counts = new long[3];
        byte[] buf = new byte[8192];
        try (Dir dir = commons ? new CommonsDir(file) : new JdkDir(file)) {
            for (int i = 0; i < dir.count(); i++) {
                if (seen.size() >= MAX_ENTRIES) {
                    throw new Rejected("TOO_LARGE_UNPACKED");
                }
                String name = normalize(dir.name(i));
                if (!seen.add(name)) {
                    throw new Rejected("DUPLICATE_ENTRY");
                }
                Long expected = stream.sizes.get(name);
                if (expected == null) {
                    throw new Rejected("BROKEN");           // 목차에만 있는 entry = 가짜 서명 뒤 숨김
                }
                try (InputStream is = dir.open(i)) {
                    Meter m = new Meter(is, maxEntry, maxTotal, total);
                    int filled = 0;
                    int r;
                    while (filled < SNIFF && (r = m.read(buf, filled, SNIFF - filled)) > 0) {
                        filled += r;
                    }
                    if (looksXml(buf, filled)) {
                        InputStream xml = new SequenceInputStream(new ByteArrayInputStream(buf, 0, filled), m);
                        countXml(xml, m, counts, maxCells, maxRows, maxCellChars, maxXmlElements);
                    }
                    while (m.read(buf, 0, buf.length) > 0) {
                        // 나머지를 읽어 센다
                    }
                    if (m.size != expected.longValue()) {
                        throw new Rejected("BROKEN");
                    }
                }
            }
        } catch (Over ex) {
            throw new Rejected("TOO_LARGE_UNPACKED");
        } catch (IOException | IllegalArgumentException ex) {   // ZipException 포함
            throw new Rejected("BROKEN");
        }
        if (seen.size() != stream.sizes.size()) {
            throw new Rejected("BROKEN");                       // 스트림에만 있는 entry
        }
    }

    /** 중앙 목차 열거 추상화. 열기 쪽 구현(JDK/commons-compress)에 맞춰 같은 구현으로 읽는다. */
    private interface Dir extends Closeable {
        int count();

        String name(int i);

        InputStream open(int i) throws IOException;
    }

    private static final class JdkDir implements Dir {
        private final ZipFile zf;
        private final List<ZipEntry> entries = new ArrayList<>();

        JdkDir(Path file) throws IOException {
            zf = new ZipFile(file.toFile());
            Enumeration<? extends ZipEntry> en = zf.entries();
            while (en.hasMoreElements()) {
                entries.add(en.nextElement());
            }
        }

        public int count() {
            return entries.size();
        }

        public String name(int i) {
            return entries.get(i).getName();
        }

        public InputStream open(int i) throws IOException {
            return zf.getInputStream(entries.get(i));
        }

        public void close() throws IOException {
            zf.close();
        }
    }

    private static final class CommonsDir implements Dir {
        private final org.apache.commons.compress.archivers.zip.ZipFile zf;
        private final List<org.apache.commons.compress.archivers.zip.ZipArchiveEntry> entries = new ArrayList<>();

        CommonsDir(Path file) throws IOException {
            zf = new org.apache.commons.compress.archivers.zip.ZipFile(file.toFile());
            Enumeration<org.apache.commons.compress.archivers.zip.ZipArchiveEntry> en = zf.getEntries();
            while (en.hasMoreElements()) {
                entries.add(en.nextElement());
            }
        }

        public int count() {
            return entries.size();
        }

        public String name(int i) {
            return entries.get(i).getName();
        }

        public InputStream open(int i) throws IOException {
            return zf.getInputStream(entries.get(i));
        }

        public void close() throws IOException {
            zf.close();
        }
    }

    private static String normalize(String raw) {
        String name = raw.replace('\\', '/').toLowerCase(Locale.ROOT);
        while (name.startsWith("/")) {
            name = name.substring(1);
        }
        return name;
    }

    private ZipGuard() {
    }

    public static final class Result {
        public final Set<String> names;      // 소문자로 정규화
        public final long unpacked;
        final Map<String, Long> sizes;       // 이름 → 스트림으로 실제 센 해제 크기

        Result(Map<String, Long> sizes, long unpacked) {
            this.sizes = sizes;
            this.names = Collections.unmodifiableSet(sizes.keySet());
            this.unpacked = unpacked;
        }
    }

    /** code: TOO_LARGE_UNPACKED | DUPLICATE_ENTRY | TOO_MANY_CELLS | CELL_TOO_LONG | BROKEN | ENCRYPTED. 메시지·스택 없음. */
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
        return scan(new ByteArrayInputStream(zip), maxEntry, maxTotal, maxCells, maxRows, maxCellChars,
                maxXmlElements);
    }

    private static Result scan(InputStream src, long maxEntry, long maxTotal, int maxCells, int maxRows,
                               int maxCellChars, int maxXmlElements) throws Rejected {
        Map<String, Long> sizes = new LinkedHashMap<>();
        long[] counts = new long[3];   // [0]=칸, [1]=행, [2]=시작 요소 총수
        long[] total = new long[1];
        byte[] buf = new byte[8192];
        try (ZipInputStream in = new ZipInputStream(src)) {
            ZipEntry e;
            while ((e = in.getNextEntry()) != null) {
                String name = normalize(e.getName());
                if (sizes.containsKey(name)) {
                    throw new Rejected("DUPLICATE_ENTRY");
                }
                if (sizes.size() >= MAX_ENTRIES) {
                    throw new Rejected("TOO_LARGE_UNPACKED");
                }
                Meter m = new Meter(in, maxEntry, maxTotal, total);
                int filled = 0;
                int r;
                while (filled < SNIFF && (r = m.read(buf, filled, SNIFF - filled)) > 0) {
                    filled += r;                                  // 앞부분만 먼저 읽어 XML 인지 본다
                }
                if (looksXml(buf, filled)) {
                    InputStream xml = new SequenceInputStream(new ByteArrayInputStream(buf, 0, filled), m);
                    countXml(xml, m, counts, maxCells, maxRows, maxCellChars, maxXmlElements);
                }
                while (m.read(buf, 0, buf.length) > 0) {
                    // StAX 가 끝까지 안 읽은 나머지·비 XML entry 를 읽어 센다
                }
                sizes.put(name, m.size);
            }
        } catch (Over ex) {
            throw new Rejected("TOO_LARGE_UNPACKED");
        } catch (IOException | IllegalArgumentException ex) {   // 깨진 zip·잘못된 이름 인코딩
            throw new Rejected("BROKEN");
        }
        if (sizes.isEmpty()) {
            throw new Rejected("BROKEN");
        }
        return new Result(sizes, total[0]);
    }

    private static final int SNIFF = 64;

    /** 한도 초과 신호(Meter 가 던진다). */
    private static final class Over extends IOException {
        Over() {
            super("over");
        }
    }

    /** entry 하나를 읽으며 entry·전체 해제 바이트를 센다. close 는 아무것도 안 한다(ZipInputStream 을 닫지 않는다). */
    private static final class Meter extends InputStream {
        private final InputStream in;
        private final long maxEntry;
        private final long maxTotal;
        private final long[] total;
        long size;
        boolean over;

        Meter(InputStream in, long maxEntry, long maxTotal, long[] total) {
            this.in = in;
            this.maxEntry = maxEntry;
            this.maxTotal = maxTotal;
            this.total = total;
        }

        @Override
        public int read() throws IOException {
            byte[] one = new byte[1];
            int n = read(one, 0, 1);
            return n < 0 ? -1 : (one[0] & 0xFF);
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            int n = in.read(b, off, len);
            if (n > 0) {
                size += n;
                total[0] += n;
                if (size > maxEntry || total[0] > maxTotal) {
                    over = true;
                    throw new Over();
                }
            }
            return n;
        }

        @Override
        public void close() {
            // 닫지 않는다
        }
    }

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

    /** 한 xml 을 스트림으로 훑어 누적 칸·행·요소 수와 문자열 하나의 글자 수를 한도와 비교한다. DOCTYPE·파싱 실패는 BROKEN. */
    private static void countXml(InputStream xml, Meter meter, long[] counts, int maxCells, int maxRows,
                                 int maxCellChars, int maxXmlElements) throws Rejected {
        XMLInputFactory f = XMLInputFactory.newInstance();
        f.setProperty(XMLInputFactory.SUPPORT_DTD, false);
        f.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
        XMLStreamReader r = null;
        try {
            r = f.createXMLStreamReader(xml);
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
                        // getElementText() 는 문자열 전체를 만들므로 쓰지 않고, 글자 수만 청크별로 센다.
                        while (r.hasNext()) {
                            int tev = r.next();
                            if (tev == XMLStreamConstants.CHARACTERS || tev == XMLStreamConstants.CDATA
                                    || tev == XMLStreamConstants.SPACE) {
                                len += r.getTextLength();
                                if (len > maxCellChars) {
                                    throw new Rejected("CELL_TOO_LONG");
                                }
                            } else if (tev == XMLStreamConstants.END_ELEMENT) {
                                break;
                            } else if (tev == XMLStreamConstants.START_ELEMENT || tev == XMLStreamConstants.DTD) {
                                throw new Rejected("BROKEN");
                            }
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
            if (meter.over) {                       // Meter 의 한도 초과가 파서 예외로 감싸졌을 수 있다
                throw new Rejected("TOO_LARGE_UNPACKED");
            }
            throw new Rejected("BROKEN");
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
