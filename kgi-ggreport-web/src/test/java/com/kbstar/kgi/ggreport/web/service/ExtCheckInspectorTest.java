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
        assertOnly(run(new byte[]{(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0, 0, 0, 0, 0}, "hwp"), "UNSUPPORTED_FORMAT");
        assertOnly(run(new byte[]{(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0, 0, 0, 0, 0}, "hwpx"), "UNSUPPORTED_FORMAT");
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
}
