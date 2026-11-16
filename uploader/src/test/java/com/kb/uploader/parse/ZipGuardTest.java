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
