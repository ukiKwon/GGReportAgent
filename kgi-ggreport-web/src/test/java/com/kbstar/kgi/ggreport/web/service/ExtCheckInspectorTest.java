package com.kbstar.kgi.ggreport.web.service;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static com.kbstar.kgi.ggreport.web.service.ExtCheckFixtures.*;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class ExtCheckInspectorTest {

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private ExtCheckInspector.Outcome run(byte[] data, String ext) throws IOException {
        Path f = tmp.newFile().toPath();
        Files.write(f, data);
        return ExtCheckInspector.inspect(f, ext);
    }

    private static boolean has(ExtCheckInspector.Outcome o, String reason, String locatorPrefix) {
        for (ExtCheckInspector.Hit h : o.hits) {
            if (h.reason.equals(reason) && (locatorPrefix == null || h.locator.startsWith(locatorPrefix))) {
                return true;
            }
        }
        return false;
    }

    private static void assertOnly(ExtCheckInspector.Outcome o, String reason) {
        List<String> got = new ArrayList<String>();
        for (ExtCheckInspector.Hit h : o.hits) {
            got.add(h.reason);
        }
        assertTrue(got.toString(), got.size() == 1 && got.get(0).equals(reason));
    }

    // ── PDF ──
    @Test public void 깨끗한_PDF는_통과한다() throws Exception {
        ExtCheckInspector.Outcome o = run(pdf(PLAIN), "pdf");
        assertTrue(o.hits.toString(), o.hits.isEmpty());
        assertEquals("pdf", o.ext);
    }

    @Test public void 본문의_휴대폰은_PII_MOBILE이고_값은_결과에_없다() throws Exception {
        ExtCheckInspector.Outcome o = run(pdf("Contact " + PHONE + " please"), "pdf");
        assertTrue(has(o, "PII_MOBILE", "body"));
        assertTrue(!o.hits.toString().contains("5678"));
    }

    @Test public void 문서정보_주석_책갈피의_휴대폰도_걸린다() throws Exception {
        assertTrue(has(run(pdfAuthor(PHONE), "pdf"), "PII_MOBILE", "meta"));
        assertTrue(has(run(pdfAnnot("call " + PHONE), "pdf"), "PII_MOBILE", "annot"));
        assertTrue(has(run(pdfBookmark("call " + PHONE), "pdf"), "PII_MOBILE", "bookmark"));
    }

    @Test public void 국번_뒤를_전부_가린_유선은_통과하고_일부만_가리면_걸린다() throws Exception {
        assertTrue(run(pdf("Office 02-****-**** open"), "pdf").hits.isEmpty());
        assertTrue(has(run(pdf("Office 02-1234-**** open"), "pdf"), "PII_LANDLINE", "body"));
    }

    @Test public void 스크립트_PDF는_SCRIPT() throws Exception {
        assertOnly(run(pdfJs(), "pdf"), "SCRIPT");
    }

    @Test public void 증분_저장_PDF는_INCREMENTAL() throws Exception {
        assertOnly(run(pdfIncremental(), "pdf"), "INCREMENTAL");
    }

    @Test public void 암호_PDF는_ENCRYPTED() throws Exception {
        assertOnly(run(pdfEncrypted(), "pdf"), "ENCRYPTED");
    }

    @Test(timeout = 60000)
    public void 쪽수_201은_PAGES_LIMIT() throws Exception {
        assertOnly(run(pdfPages(201), "pdf"), "PAGES_LIMIT");
    }

    @Test public void 이미지만_있는_PDF는_IMAGE_ONLY() throws Exception {
        assertOnly(run(pdfImageOnly(), "pdf"), "IMAGE_ONLY");
    }

    @Test public void 손상_PDF와_확장자_불일치와_HWP() throws Exception {
        assertOnly(run("%PDF-1.4 garbage".getBytes("US-ASCII"), "pdf"), "PARSE_FAILED");
        assertOnly(run("plain text".getBytes("US-ASCII"), "pdf"), "FORMAT_MISMATCH");
        assertOnly(run(pdf(PLAIN), "hwpx"), "FORMAT_MISMATCH");
        assertOnly(run(new byte[]{(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0, 0, 0, 0, 0}, "hwp"), "PARSE_FAILED");      // 머리말만 OLE, 본체 손상
        assertOnly(run(new byte[]{(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0, 0, 0, 0, 0}, "hwpx"), "FORMAT_MISMATCH"); // OLE 를 hwpx 로 속임
        assertOnly(run(pdf(PLAIN), "hwp"), "FORMAT_MISMATCH");
    }

    // ── HWPX ──
    @Test public void 깨끗한_HWPX는_통과한다() throws Exception {
        ExtCheckInspector.Outcome o = run(hwpx(LONG_BODY).bytes(), "hwpx");
        assertTrue(o.hits.toString(), o.hits.isEmpty());
        assertEquals("hwpx", o.ext);
    }

    @Test public void HWPX_본문_속성값_미리보기의_번호() throws Exception {
        assertTrue(has(run(hwpx("call " + PHONE + " " + LONG_BODY).bytes(), "hwpx"), "PII_MOBILE", "body"));
        assertTrue(has(run(hwpx(LONG_BODY).add("Contents/section1.xml", "<sec><p memo=\"" + PHONE + "\"/></sec>").bytes(), "hwpx"),
                "PII_MOBILE", "body"));
        assertTrue(has(run(hwpx(LONG_BODY).add("Preview/PrvText.txt", "mail hong@x.kr").bytes(), "hwpx"), "PII_EMAIL", "preview"));
        assertTrue(has(run(hwpx(LONG_BODY).add("Contents/header.xml", "<h><!-- " + PHONE + " --></h>").bytes(), "hwpx"),
                "PII_MOBILE", "meta"));
    }

    @Test public void DOCTYPE과_외부_엔티티는_XXE_REJECTED() throws Exception {
        byte[] z = hwpx(LONG_BODY).add("Contents/section1.xml",
                "<!DOCTYPE a [<!ENTITY x SYSTEM \"file:///c:/windows/win.ini\">]><sec>&x;</sec>").bytes();
        assertOnly(run(z, "hwpx"), "XXE_REJECTED");
    }

    @Test public void zip_폭탄은_ZIP_LIMIT() throws Exception {
        byte[] z = hwpx(LONG_BODY).addBytes("BinData/zero.png", new byte[5 * 1024 * 1024]).bytes();
        assertOnly(run(z, "hwpx"), "ZIP_LIMIT");
    }

    @Test public void 스크립트_중첩_비이미지_BinData_이상한_이름() throws Exception {
        assertOnly(run(hwpx(LONG_BODY).add("Scripts/x.js", "a").bytes(), "hwpx"), "SCRIPT");
        assertOnly(run(hwpx(LONG_BODY).addBytes("BinData/a.ole", new byte[]{1, 2, 3}).bytes(), "hwpx"), "EMBEDDED");
        assertOnly(run(hwpx(LONG_BODY).addBytes("Contents/x.dat", new byte[]{0x50, 0x4B, 0x03, 0x04, 0}).bytes(), "hwpx"), "EMBEDDED");
        assertOnly(run(hwpx(LONG_BODY).add("../evil.xml", "<a/>").bytes(), "hwpx"), "FORMAT_MISMATCH");
    }

    @Test public void mimetype가_없거나_다르면_FORMAT_MISMATCH() throws Exception {
        byte[] noMime = new Zip().add("version.xml", "<v/>").add("Contents/section0.xml", "<sec><p><t>x</t></p></sec>").bytes();
        assertOnly(run(noMime, "hwpx"), "FORMAT_MISMATCH");
        byte[] wrong = new Zip().add("mimetype", "application/zip").add("Contents/section0.xml", "<sec/>").bytes();
        assertOnly(run(wrong, "hwpx"), "FORMAT_MISMATCH");
    }

    @Test public void 하6_Form_안_이미지와_인라인_이미지도_IMAGE_ONLY() throws Exception {
        assertOnly(run(pdfFormImage(), "pdf"), "IMAGE_ONLY");
        assertOnly(run(pdfInlineImage(), "pdf"), "IMAGE_ONLY");
    }

    @Test public void 하6_링크_주석의_URI도_검사한다() throws Exception {
        assertTrue(has(run(pdfLinkUri("mailto:hong@x.kr"), "pdf"), "PII_EMAIL", "annot"));
        assertTrue(has(run(pdfLinkUri("tel:010-1234-5678"), "pdf"), "PII_MOBILE", "annot"));
        assertTrue(run(pdfLinkUri("https://example.org/notice"), "pdf").hits.isEmpty());
    }

    @Test public void 하7_허용_밖_HWPX_항목은_UNSUPPORTED_ENTRY() throws Exception {
        assertOnly(run(hwpx(LONG_BODY).add("Contents/x.json", "{}").bytes(), "hwpx"), "UNSUPPORTED_ENTRY");
        assertOnly(run(hwpx(LONG_BODY).add("Contents/x.csv", "a,b").bytes(), "hwpx"), "UNSUPPORTED_ENTRY");
        assertOnly(run(hwpx(LONG_BODY).add("noext", "a").bytes(), "hwpx"), "UNSUPPORTED_ENTRY");
        assertOnly(run(hwpx(LONG_BODY).addBytes("Contents/a.png", new byte[]{(byte) 0x89, 'P'}).bytes(), "hwpx"), "UNSUPPORTED_ENTRY");
        assertTrue(run(hwpx(LONG_BODY).addBytes("Preview/PrvImage.png", new byte[]{(byte) 0x89, 'P'}).bytes(), "hwpx").hits.isEmpty());
        assertTrue(run(hwpx(LONG_BODY).addBytes("BinData/image1.bmp", new byte[]{'B', 'M', 0}).bytes(), "hwpx").hits.isEmpty());
    }

    @Test public void Scripts_예외는_이름과_바이트가_모두_같아야_한다() throws Exception {
        // 한컴 기본 빈 틀과 이름이 같아도 내용이 다르면(1바이트라도) SCRIPT, 이름이 다르면 SCRIPT
        assertOnly(run(hwpx(LONG_BODY).addBytes("Scripts/headerScripts.js", new byte[]{'a', 0}).bytes(), "hwpx"), "SCRIPT");
        assertOnly(run(hwpx(LONG_BODY).addBytes("Scripts/sourceScripts.js", new byte[]{'a', 0}).bytes(), "hwpx"), "SCRIPT");
        assertOnly(run(hwpx(LONG_BODY).addBytes("Scripts/other.js", new byte[]{'a', 0}).bytes(), "hwpx"), "SCRIPT");
        assertOnly(run(hwpx(LONG_BODY).addBytes("scripts/headerScripts.js", new byte[]{'a', 0}).bytes(), "hwpx"), "SCRIPT");
    }

    /** 실물 공고 HWPX에서 꺼낸 한컴 기본 빈 틀(src/test/resources/extcheck, 2026-11-17)은 이름·바이트가 같으면 통과, 1바이트 바꾸면 SCRIPT. */
    @Test public void 한컴_기본_빈_틀_Scripts는_통과한다() throws Exception {
        byte[] head = stub("hancom_headerScripts.js"), src = stub("hancom_sourceScripts.js");
        assertTrue(run(hwpx(LONG_BODY).addBytes("Scripts/headerScripts.js", head).addBytes("Scripts/sourceScripts.js", src).bytes(), "hwpx").hits.isEmpty());
        byte[] changed = head.clone();
        changed[0] ^= 1;
        assertOnly(run(hwpx(LONG_BODY).addBytes("Scripts/headerScripts.js", changed).bytes(), "hwpx"), "SCRIPT");
        assertOnly(run(hwpx(LONG_BODY).addBytes("Scripts/sourceScripts.js", head).bytes(), "hwpx"), "SCRIPT");   // 이름과 내용이 엇갈림
    }

    private static byte[] stub(String name) throws java.io.IOException {
        try (java.io.InputStream in = ExtCheckInspectorTest.class.getResourceAsStream("/extcheck/" + name)) {
            assertTrue(name, in != null);
            java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[1024];
            for (int n; (n = in.read(buf)) > 0; ) bo.write(buf, 0, n);
            return bo.toByteArray();
        }
    }

    @Test public void 실물_공고_HWPX는_구조_거부_없이_통과한다() throws Exception {
        Path real = java.nio.file.Paths.get("../collector/tests/fixtures/eminwon/sunchang_32708.hwpx");
        org.junit.Assume.assumeTrue(Files.isRegularFile(real));
        ExtCheckInspector.Outcome o = run(Files.readAllBytes(real), "hwpx");
        for (ExtCheckInspector.Hit h : o.hits) {   // 본문 안의 번호 같은 내용 hit 은 있을 수 있다 — 구조 사유만 막는다
            assertTrue(h.toString(), h.reason.startsWith("PII_") || "IMAGE_ONLY".equals(h.reason));
        }
    }

    @Test public void 이미지만_있는_HWPX는_IMAGE_ONLY() throws Exception {
        byte[] z = hwpx("short").addBytes("BinData/a.png", new byte[]{(byte) 0x89, 'P', 'N', 'G'}).bytes();
        assertOnly(run(z, "hwpx"), "IMAGE_ONLY");
    }

    // ── HWP ──
    /** 합성 HWP(OLE) 만들기 — FileHeader 속성 비트·스트림 이름·크기 경로 시험용. hwplib 가 읽는 유효 문서는 아니다. */
    private static final class Hwp {
        final org.apache.poi.poifs.filesystem.POIFSFileSystem fs = new org.apache.poi.poifs.filesystem.POIFSFileSystem();
        final java.util.Map<String, org.apache.poi.poifs.filesystem.DirectoryEntry> dirs = new java.util.HashMap<>();
        final boolean compressed;

        Hwp(int props) throws IOException {
            compressed = (props & 1) != 0;
            byte[] h = new byte[256];
            byte[] sig = "HWP Document File".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
            System.arraycopy(sig, 0, h, 0, sig.length);
            h[36] = (byte) props;
            h[37] = (byte) (props >> 8);
            h[38] = (byte) (props >> 16);
            h[39] = (byte) (props >> 24);
            add(null, "FileHeader", h);
        }

        Hwp add(String dir, String name, byte[] data) throws IOException {
            java.io.ByteArrayInputStream in = new java.io.ByteArrayInputStream(data);
            if (dir == null) {
                fs.createDocument(in, name);
            } else {
                org.apache.poi.poifs.filesystem.DirectoryEntry d = dirs.get(dir);
                if (d == null) {
                    d = fs.createDirectory(dir);
                    dirs.put(dir, d);
                }
                d.createDocument(name, in);
            }
            return this;
        }

        Hwp stream(String dir, String name, byte[] data) throws IOException {
            return add(dir, name, compressed ? deflateRaw(data) : data);
        }

        /** DocInfo + BodyText/Section0(본문 text). */
        Hwp base(String text) throws IOException {
            return stream(null, "DocInfo", rec(0x10, new byte[]{0, 0})).stream("BodyText", "Section0", paraText(text));
        }

        byte[] bytes() throws IOException {
            java.io.ByteArrayOutputStream o = new java.io.ByteArrayOutputStream();
            fs.writeFilesystem(o);
            fs.close();
            return o.toByteArray();
        }
    }

    private static byte[] deflateRaw(byte[] in) {
        java.util.zip.Deflater d = new java.util.zip.Deflater(java.util.zip.Deflater.DEFAULT_COMPRESSION, true);
        d.setInput(in);
        d.finish();
        java.io.ByteArrayOutputStream o = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        while (!d.finished()) {
            o.write(buf, 0, d.deflate(buf));
        }
        d.end();
        return o.toByteArray();
    }

    private static byte[] rec(int tag, byte[] payload) {
        long h = tag | ((long) payload.length << 20);        // 시험 payload 는 0xFFF 미만
        byte[] r = new byte[4 + payload.length];
        r[0] = (byte) h;
        r[1] = (byte) (h >> 8);
        r[2] = (byte) (h >> 16);
        r[3] = (byte) (h >> 24);
        System.arraycopy(payload, 0, r, 4, payload.length);
        return r;
    }

    private static byte[] paraText(String s) {
        return rec(0x43, s.getBytes(java.nio.charset.StandardCharsets.UTF_16LE));
    }

    private static byte[] hwpBase(int props, String body) throws IOException {
        return new Hwp(props).base(body).bytes();
    }

    @Test public void 합성_HWP_본문_미리보기_요약정보_연결문서의_번호() throws Exception {
        assertTrue(has(run(hwpBase(1, "call " + PHONE + " " + LONG_BODY), "hwp"), "PII_MOBILE", "body"));
        assertTrue(has(run(hwpBase(0, "call " + PHONE + " " + LONG_BODY), "hwp"), "PII_MOBILE", "body"));   // 비압축
        assertTrue(has(run(new Hwp(1).base(LONG_BODY).add(null, "PrvText",
                "mail hong@x.kr".getBytes(java.nio.charset.StandardCharsets.UTF_16LE)).bytes(), "hwp"), "PII_EMAIL", "preview"));
        assertTrue(has(run(new Hwp(1).base(LONG_BODY).add(null, "\u0005HwpSummaryInformation",
                ("author " + PHONE).getBytes(java.nio.charset.StandardCharsets.UTF_16LE)).bytes(), "hwp"), "PII_MOBILE", "meta"));
        assertTrue(has(run(new Hwp(1).base(LONG_BODY).add("DocOptions", "_LinkDoc",
                ("c:\\" + PHONE).getBytes(java.nio.charset.StandardCharsets.UTF_16LE)).bytes(), "hwp"), "PII_MOBILE", "meta"));
        assertTrue(!run(hwpBase(1, "call " + PHONE), "hwp").hits.toString().contains("5678"));
    }

    @Test public void 합성_HWP_속성_비트별_거부() throws Exception {
        int[][] cases = {{1, 0}, {2, 0}, {4, 0}, {8, 0}, {10, 0}, {13, 0}, {3, 1}, {5, 2}, {6, 2}, {7, 2}, {9, 2}, {14, 2}};
        String[] reasons = {"ENCRYPTED", "SCRIPT", "HISTORY"};
        for (int[] c : cases) {
            assertOnly(run(hwpBase(1 | (1 << c[0]), LONG_BODY), "hwp"), reasons[c[1]]);
        }
    }

    @Test public void 합성_HWP_크기_상한과_손상() throws Exception {
        byte[] big = new byte[60 * 1024 * 1024];
        assertOnly(run(new Hwp(1).stream(null, "DocInfo", rec(0x10, new byte[]{0})).stream("BodyText", "Section0", big).bytes(), "hwp"), "ZIP_LIMIT");
        assertOnly(run(new Hwp(0).stream(null, "DocInfo", rec(0x10, new byte[]{0})).stream("BodyText", "Section0", big).bytes(), "hwp"), "ZIP_LIMIT");
        assertOnly(run(new Hwp(1).add(null, "DocInfo", new byte[]{1, 2, 3, 4, 5}).stream("BodyText", "Section0", paraText(LONG_BODY)).bytes(), "hwp"),
                "PARSE_FAILED");                                                   // 압축 표시인데 deflate 가 아님
        assertOnly(run(new Hwp(0).add(null, "x", new byte[]{1}).bytes(), "hwp"), "UNSUPPORTED_ENTRY");
    }

    @Test public void 합성_HWP_구조_거부() throws Exception {
        assertOnly(run(new Hwp(1).base(LONG_BODY).add("Scripts", "DefaultJScript", new byte[]{1, 2}).bytes(), "hwp"), "SCRIPT");
        assertOnly(run(new Hwp(1).base(LONG_BODY).add("BinData", "BIN0001.OLE", new byte[]{1, 2, 3}).bytes(), "hwp"), "EMBEDDED");
        assertOnly(run(new Hwp(1).base(LONG_BODY).add("BinData", "BIN0002.png", new byte[]{0x50, 0x4B, 3, 4, 0}).bytes(), "hwp"), "EMBEDDED");
        assertOnly(run(new Hwp(1).base(LONG_BODY).add(null, "DocHistory", new byte[]{1}).bytes(), "hwp"), "HISTORY");
        assertOnly(run(new Hwp(1).base(LONG_BODY).add(null, "ViewText", new byte[]{1}).bytes(), "hwp"), "ENCRYPTED");
        assertOnly(run(new Hwp(1).stream(null, "DocInfo", rec(0x10, new byte[]{0})).bytes(), "hwp"), "FORMAT_MISMATCH");   // 구역 없음
    }

    @Test public void 합성_HWP_이미지만_있으면_IMAGE_ONLY() throws Exception {
        byte[] png = new byte[]{(byte) 0x89, 'P', 'N', 'G'};
        assertOnly(run(new Hwp(1).base("short").stream("BinData", "BIN0001.png", png).bytes(), "hwp"), "IMAGE_ONLY");
        assertOnly(run(new Hwp(1).base("short").add("BinData", "BIN0001.png", png).bytes(), "hwp"), "IMAGE_ONLY");    // 비압축 그림
        assertOnly(run(new Hwp(1).base("short").add("BinData", "BIN0002.gif", new byte[]{'G', 'I', 'F', '8'}).bytes(), "hwp"), "IMAGE_ONLY");
        assertOnly(run(new Hwp(1).base("short").add("BinData", "BIN0003.wmf", new byte[]{(byte) 0xD7, (byte) 0xCD, (byte) 0xC6, (byte) 0x9A}).bytes(), "hwp"), "IMAGE_ONLY");
    }

    /** 한컴 기본 빈 틀 Scripts 의 허용은 이름과 원본 바이트 sha256 이 모두 맞을 때만 — 실물 스트림은 저장소에 없어 맞지 않는 값이 막히는지만 본다. */
    @Test public void 합성_HWP_Scripts_이름만_같고_내용이_다르면_SCRIPT() throws Exception {
        assertOnly(run(new Hwp(1).base(LONG_BODY).add("Scripts", "JScriptVersion", new byte[]{1}).bytes(), "hwp"), "SCRIPT");
        assertOnly(run(new Hwp(1).base(LONG_BODY).add("Scripts", "Other", new byte[]{1}).bytes(), "hwp"), "SCRIPT");
    }

    /**
     * hwplib 쓰기 API 로 만든 문서는 hwplib 자체의 Scripts 틀을 넣는다 — 한컴 기본 틀 해시(실물 164건)와 달라 SCRIPT 로 제외되는 것이 맞다
     * (허용 목록은 실물 한컴 틀만, main 11-17). hwplib 본문 추출 경로는 -Dextcheck.realDir 실물 회귀(실물 289건, 구조 거부 0)로 확인한다.
     */
    @Test public void hwplib로_만든_HWP는_한컴_틀이_아니라_SCRIPT() throws Exception {
        ExtCheckInspector.Outcome o = run(blankHwp(LONG_BODY), "hwp");
        assertOnly(o, "SCRIPT");
        assertEquals("hwp", o.ext);
    }

    private byte[] blankHwp(String text) throws Exception {
        kr.dogfoot.hwplib.object.HWPFile h = kr.dogfoot.hwplib.tool.blankfilemaker.BlankFileMaker.make();
        h.getBodyText().getSectionList().get(0).getParagraph(0).getText().addString(text);
        Path f = tmp.newFile().toPath();
        kr.dogfoot.hwplib.writer.HWPWriter.toFile(h, f.toString());
        return Files.readAllBytes(f);
    }

    /**
     * 실물 회귀 — -Dextcheck.realDir=<폴더> 가 있을 때만. 그 아래 *.hwp·*.hwpx 를 모두 검사해 사유 코드별 건수만 출력한다(파일명·값은 출력하지 않는다).
     * 예: mvn -q -o test -Dtest=ExtCheckInspectorTest#실물_폴더_회귀 -Dextcheck.realDir=data/collector/.../files
     */
    @Test(timeout = 1800000)
    public void 실물_폴더_회귀() throws Exception {
        String dir = System.getProperty("extcheck.realDir");
        org.junit.Assume.assumeTrue(dir != null && !dir.isEmpty());
        Path root = java.nio.file.Paths.get(dir);
        org.junit.Assume.assumeTrue(Files.isDirectory(root));
        java.util.Map<String, Integer> counts = new java.util.TreeMap<String, Integer>();
        int files = 0;
        try (java.util.stream.Stream<Path> st = Files.walk(root)) {
            for (Path p : (Iterable<Path>) st::iterator) {
                String low = p.getFileName().toString().toLowerCase(java.util.Locale.ROOT);
                boolean hwp = low.endsWith(".hwp");
                if (!Files.isRegularFile(p) || !(hwp || low.endsWith(".hwpx"))) {
                    continue;
                }
                files++;
                ExtCheckInspector.Outcome o = ExtCheckInspector.inspect(p, hwp ? "hwp" : "hwpx");
                if (o.hits.isEmpty()) {
                    counts.merge("PASS", 1, Integer::sum);
                }
                java.util.Set<String> seen = new java.util.TreeSet<String>();
                for (ExtCheckInspector.Hit h : o.hits) {
                    seen.add((hwp ? "hwp:" : "hwpx:") + h.reason + "@" + h.locator.replaceAll(":p[0-9]+", ""));
                }
                for (String k : seen) {
                    counts.merge(k, 1, Integer::sum);
                }
            }
        }
        System.out.println("[extcheck.realDir] files=" + files + " counts=" + counts);
    }
}
