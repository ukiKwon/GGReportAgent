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
