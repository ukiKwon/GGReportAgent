package com.kb.uploader.parse;

import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.*;

/** NEXT 39: web docfill/ZipGuard 이식본. */
public class ZipGuardTest {
    private static final long MB = 1024L * 1024;
    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private static byte[] smallXlsx() throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            wb.createSheet("s").createRow(0).createCell(0).setCellValue("가");
            ByteArrayOutputStream o = new ByteArrayOutputStream();
            wb.write(o);
            return o.toByteArray();
        }
    }

    private static String code(byte[] zip, long maxEntry, long maxTotal) {
        try {
            ZipGuard.check(zip, maxEntry, maxTotal);
            fail("거부되어야 한다");
            return null;
        } catch (ZipGuard.Rejected e) {
            return e.code;
        }
    }

    @Test
    public void entry_하나가_한도를_넘으면_TOO_LARGE_UNPACKED() throws Exception {
        byte[] z = ZipFixtures.zeros("a.bin", (int) (2 * MB));
        assertTrue(z.length < MB);
        assertEquals("TOO_LARGE_UNPACKED", code(z, MB, 10 * MB));
    }

    @Test
    public void 같은_이름_entry는_DUPLICATE_ENTRY() throws Exception {
        byte[] dup = ZipFixtures.duplicateEntry(smallXlsx(), "xl/workbook.xml");
        assertEquals("DUPLICATE_ENTRY", code(dup, 20 * MB, 40 * MB));
    }

    @Test
    public void 대소문자만_다른_entry도_DUPLICATE_ENTRY() throws Exception {
        byte[] dup = ZipFixtures.addEntry(smallXlsx(), "XL/Workbook.XML", "<x/>".getBytes(StandardCharsets.UTF_8));
        assertEquals("DUPLICATE_ENTRY", code(dup, 20 * MB, 40 * MB));
    }

    @Test
    public void 정상_xlsx는_통과() throws Exception {
        assertTrue(ZipGuard.checkSmallXlsx(smallXlsx()).names.contains("xl/workbook.xml"));
    }

    @Test
    public void DOCTYPE_파트는_BROKEN() throws Exception {
        byte[] z = ZipFixtures.zip("Contents/section0.xml",
                "<!DOCTYPE a [<!ENTITY e \"x\">]><a>&e;</a>".getBytes(StandardCharsets.UTF_8));
        try {
            ZipGuard.check(z, 20 * MB, 40 * MB, Integer.MAX_VALUE, Integer.MAX_VALUE, Integer.MAX_VALUE, 30000000);
            fail("거부되어야 한다");
        } catch (ZipGuard.Rejected e) {
            assertEquals("BROKEN", e.code);
        }
    }

    private static byte[] hiddenBomb() throws Exception {
        byte[] two = ZipFixtures.addEntry(ZipFixtures.zip("a.txt", "hi".getBytes(StandardCharsets.UTF_8)),
                "b.bin", new byte[(int) (3 * MB)]);
        return ZipFixtures.hideAfterFirst(two);
    }

    @Test
    public void 목차에만_있는_숨은_entry는_스트림_검사를_통과해도_파일_검사는_BROKEN() throws Exception {
        byte[] z = hiddenBomb();
        assertEquals(1, ZipGuard.check(z, MB, 10 * MB).names.size());   // 스트림만으로는 우회된다(방어가 필요한 이유)
        Path f = tmp.newFile("h.hwpx").toPath();
        Files.write(f, z);
        try {
            ZipGuard.check(f, MB, 10 * MB, Integer.MAX_VALUE, Integer.MAX_VALUE, Integer.MAX_VALUE, Integer.MAX_VALUE);
            fail("거부되어야 한다");
        } catch (ZipGuard.Rejected e) {
            assertEquals("BROKEN", e.code);
        }
        try {
            ZipGuard.checkUploadFile(f);        // 3MB 는 한도 안이어도 이름 집합 불일치로 거부
            fail("거부되어야 한다");
        } catch (ZipGuard.Rejected e) {
            assertEquals("BROKEN", e.code);
        }
    }

    @Test
    public void 같은_이름_같은_크기로_내용만_바꿔_숨긴_DOCTYPE도_BROKEN() throws Exception {
        String evil = "<!DOCTYPE a [<!ENTITY e \"x\">]><a>&e;</a>";
        StringBuilder good = new StringBuilder("<a>");
        while (good.length() < evil.length() - 4) {
            good.append('x');
        }
        good.append("</a>");
        assertEquals(evil.length(), good.length());
        byte[] z = ZipFixtures.swapHidden(
                ZipFixtures.zip("Contents/section0.xml", good.toString().getBytes(StandardCharsets.UTF_8)),
                ZipFixtures.zip("Contents/section0.xml", evil.getBytes(StandardCharsets.UTF_8)));
        assertEquals(1, ZipGuard.check(z, MB, 10 * MB).names.size());   // 스트림만으로는 정상 내용만 보인다
        Path f = tmp.newFile("swap.hwpx").toPath();
        Files.write(f, z);
        try (java.util.zip.ZipFile zf = new java.util.zip.ZipFile(f.toFile())) {   // 여는 쪽은 숨은 내용을 읽는다(픽스처 확인)
            java.util.zip.ZipEntry en = zf.entries().nextElement();
            byte[] body = new byte[evil.length()];
            try (java.io.DataInputStream in = new java.io.DataInputStream(zf.getInputStream(en))) {
                in.readFully(body);
            }
            assertEquals(evil, new String(body, StandardCharsets.UTF_8));
        }
        try {
            ZipGuard.checkUploadFile(f);
            fail("거부되어야 한다");
        } catch (ZipGuard.Rejected e) {
            assertEquals("BROKEN", e.code);
        }
    }

    @Test
    public void commons_경로도_숨김_중복_내용바꿔치기를_거부하고_정상은_통과() throws Exception {
        Path hid = tmp.newFile("hid.xlsx").toPath();
        Files.write(hid, hiddenBomb());
        assertEquals("BROKEN", fileCode(hid));
        Path dup = tmp.newFile("dup.xlsx").toPath();
        Files.write(dup, ZipFixtures.duplicateEntry(smallXlsx(), "xl/workbook.xml"));
        assertEquals("DUPLICATE_ENTRY", fileCode(dup));
        String evil = "<!DOCTYPE a [<!ENTITY e \"x\">]><a>&e;</a>";
        StringBuilder good = new StringBuilder("<a>");
        while (good.length() < evil.length() - 4) {
            good.append('x');
        }
        good.append("</a>");
        Path sw = tmp.newFile("sw.xlsx").toPath();
        Files.write(sw, ZipFixtures.swapHidden(
                ZipFixtures.zip("xl/a.xml", good.toString().getBytes(StandardCharsets.UTF_8)),
                ZipFixtures.zip("xl/a.xml", evil.getBytes(StandardCharsets.UTF_8))));
        assertEquals("BROKEN", fileCode(sw));
        Path ok = tmp.newFile("ok.xlsx").toPath();
        Files.write(ok, smallXlsx());
        assertTrue(ZipGuard.checkOoxmlFile(ok).names.contains("xl/workbook.xml"));
    }

    @Test
    public void 암호화_ooxml은_ENCRYPTED_일반_xls는_통과_손상_ole은_BROKEN() throws Exception {
        Path enc = tmp.newFile("enc.xlsx").toPath();
        Files.write(enc, ZipFixtures.encryptedOoxml(ZipFixtures.zip("a.txt", new byte[]{'x'})));
        try {
            ZipGuard.rejectEncryptedOoxml(enc);
            fail("거부되어야 한다");
        } catch (ZipGuard.Rejected e) {
            assertEquals("ENCRYPTED", e.code);
        }
        Path xls = tmp.newFile("plain.xls").toPath();
        try (org.apache.poi.hssf.usermodel.HSSFWorkbook wb = new org.apache.poi.hssf.usermodel.HSSFWorkbook();
             java.io.OutputStream os = Files.newOutputStream(xls)) {
            wb.createSheet("s");
            wb.write(os);
        }
        assertTrue(ZipGuard.isOle(xls));
        ZipGuard.rejectEncryptedOoxml(xls);              // 예외 없음
        Path z = tmp.newFile("p.xlsx").toPath();
        Files.write(z, ZipFixtures.zip("a.txt", new byte[]{'x'}));
        ZipGuard.rejectEncryptedOoxml(z);                // zip 은 대상 아님
        Path bad = tmp.newFile("bad.xls").toPath();
        Files.write(bad, new byte[]{(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0, 1, 2, 3});
        try {
            ZipGuard.rejectEncryptedOoxml(bad);
            fail("거부되어야 한다");
        } catch (ZipGuard.Rejected e) {
            assertEquals("BROKEN", e.code);
        }
    }

    private static String fileCode(Path f) {
        try {
            ZipGuard.checkOoxmlFile(f);
            fail("거부되어야 한다");
            return null;
        } catch (ZipGuard.Rejected e) {
            return e.code;
        }
    }

    @Test
    public void 정상_xlsx_pptx_hwpx_파일은_통과() throws Exception {
        Path x = tmp.newFile("n.xlsx").toPath();
        Files.write(x, smallXlsx());
        assertTrue(ZipGuard.checkUploadFile(x).names.contains("xl/workbook.xml"));
        Path p = tmp.newFile("n.pptx").toPath();
        try (org.apache.poi.xslf.usermodel.XMLSlideShow s = new org.apache.poi.xslf.usermodel.XMLSlideShow()) {
            s.createSlide();
            ByteArrayOutputStream o = new ByteArrayOutputStream();
            s.write(o);
            Files.write(p, o.toByteArray());
        }
        assertFalse(ZipGuard.checkUploadFile(p).names.isEmpty());
        Path h = tmp.newFile("n.hwpx").toPath();
        Files.write(h, ZipFixtures.addEntry(ZipFixtures.zip("mimetype", "application/hwp+zip".getBytes(StandardCharsets.UTF_8)),
                "Contents/section0.xml", "<a><t>가</t></a>".getBytes(StandardCharsets.UTF_8)));
        assertTrue(ZipGuard.checkUploadFile(h).names.contains("contents/section0.xml"));
    }

    @Test
    public void 큰_t_글자수는_스트리밍으로_세어_CELL_TOO_LONG() throws Exception {
        StringBuilder sb = new StringBuilder("<sst><si><t>");
        for (int i = 0; i < 100; i++) {
            sb.append("가나다라마바사아자차");   // 1000자
        }
        sb.append("</t></si></sst>");
        byte[] z = ZipFixtures.zip("xl/sharedStrings.xml", sb.toString().getBytes(StandardCharsets.UTF_8));
        try {
            ZipGuard.check(z, 20 * MB, 40 * MB, Integer.MAX_VALUE, Integer.MAX_VALUE, 500);
            fail("거부되어야 한다");
        } catch (ZipGuard.Rejected e) {
            assertEquals("CELL_TOO_LONG", e.code);
        }
    }

    @Test
    public void XML_파트의_엔트리_한도_초과는_TOO_LARGE_UNPACKED() throws Exception {
        byte[] big = new byte[(int) (2 * MB)];
        java.util.Arrays.fill(big, (byte) ' ');
        byte[] xml = ("<a/>" + new String(big, StandardCharsets.UTF_8)).getBytes(StandardCharsets.UTF_8);
        assertEquals("TOO_LARGE_UNPACKED", code(ZipFixtures.zip("x.xml", xml), MB, 10 * MB));
    }

    @Test
    public void 파일_입력도_같게_거부하고_isZip은_PK만_true() throws Exception {
        Path dup = tmp.newFile("d.xlsx").toPath();
        Files.write(dup, ZipFixtures.duplicateEntry(smallXlsx(), "xl/workbook.xml"));
        try {
            ZipGuard.checkUploadFile(dup);
            fail("거부되어야 한다");
        } catch (ZipGuard.Rejected e) {
            assertEquals("DUPLICATE_ENTRY", e.code);
        }
        assertTrue(ZipGuard.isZip(dup));
        Path ole = tmp.newFile("o.xls").toPath();
        Files.write(ole, new byte[]{(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0, 0, 0});
        assertFalse(ZipGuard.isZip(ole));
        assertFalse(ZipGuard.isZip(tmp.getRoot().toPath().resolve("none")));
    }
}
