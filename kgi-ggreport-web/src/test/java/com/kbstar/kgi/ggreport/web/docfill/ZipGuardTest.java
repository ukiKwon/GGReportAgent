package com.kbstar.kgi.ggreport.web.docfill;

import com.kbstar.kgi.ggreport.web.boarddoc.BoardExcelFixture;
import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** 실제로 풀어 보며 세는 압축 해제 상한과 중복 entry 거부(security S1·S4). */
public class ZipGuardTest {

    private static final long MB = 1024L * 1024;

    /** 0으로 채운 entry 들(압축 후에는 작다). */
    private static byte[] zeros(int count, int sizeEach) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream z = new ZipOutputStream(out)) {
            for (int i = 0; i < count; i++) {
                z.putNextEntry(new ZipEntry("e" + i + ".bin"));
                z.write(new byte[sizeEach]);
                z.closeEntry();
            }
        }
        return out.toByteArray();
    }

    private static String rejected(byte[] zip, long maxEntry, long maxTotal) {
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
        byte[] zip = zeros(1, (int) (2 * MB));
        assertTrue("압축 후에는 작아야 의미가 있다", zip.length < MB);
        assertEquals("TOO_LARGE_UNPACKED", rejected(zip, MB, 10 * MB));
    }

    @Test
    public void 합계가_한도를_넘으면_TOO_LARGE_UNPACKED() throws Exception {
        assertEquals("TOO_LARGE_UNPACKED", rejected(zeros(3, (int) MB), 2 * MB, 2 * MB));
    }

    @Test
    public void 같은_이름_entry는_DUPLICATE_ENTRY() throws Exception {
        byte[] dup = BoardExcelFixture.duplicateEntry(BoardExcelFixture.xlsx(null));
        assertEquals("DUPLICATE_ENTRY", rejected(dup, 20 * MB, 40 * MB));
    }

    @Test
    public void 대소문자만_다른_entry도_DUPLICATE_ENTRY() throws Exception {
        byte[] dup = BoardExcelFixture.withEntry(BoardExcelFixture.xlsx(null), "XL/Workbook.XML", "<x/>".getBytes("UTF-8"));
        assertEquals("DUPLICATE_ENTRY", rejected(dup, 20 * MB, 40 * MB));
    }

    @Test
    public void 앞에_슬래시만_붙은_entry도_DUPLICATE_ENTRY() throws Exception {
        byte[] dup = BoardExcelFixture.withEntry(BoardExcelFixture.xlsx(null), "/xl/workbook.xml", "<x/>".getBytes("UTF-8"));
        assertEquals("DUPLICATE_ENTRY", rejected(dup, 20 * MB, 40 * MB));
    }

    private static final String NS = "xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"";

    private static byte[] zipOf(String name, String xml) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream z = new ZipOutputStream(out)) {
            z.putNextEntry(new ZipEntry(name));
            z.write(xml.getBytes("UTF-8"));
            z.closeEntry();
        }
        return out.toByteArray();
    }

    private static String sheet(int rows, int cellsPerRow) {
        StringBuilder sb = new StringBuilder("<worksheet " + NS + "><sheetData>");
        for (int r = 1; r <= rows; r++) {
            sb.append("<row r=\"").append(r).append("\">");
            for (int c = 0; c < cellsPerRow; c++) {
                sb.append("<c r=\"A").append(r).append("\"><v>1</v></c>");
            }
            sb.append("</row>");
        }
        return sb.append("</sheetData></worksheet>").toString();
    }

    private static String code(byte[] zip, int maxCells, int maxRows, int maxChars) {
        try {
            ZipGuard.check(zip, 20 * MB, 40 * MB, maxCells, maxRows, maxChars);
            fail("거부되어야 한다");
            return null;
        } catch (ZipGuard.Rejected e) {
            return e.code;
        }
    }

    @Test
    public void 칸_수가_한도를_넘으면_TOO_MANY_CELLS_이하는_통과() throws Exception {
        byte[] zip = zipOf("xl/worksheets/Sheet1.XML", sheet(10, 10));   // 100칸, 대소문자 무시
        assertEquals("TOO_MANY_CELLS", code(zip, 99, 1000, 32767));
        ZipGuard.check(zip, 20 * MB, 40 * MB, 100, 1000, 32767);
    }

    @Test
    public void 행_수가_한도를_넘으면_TOO_MANY_CELLS() throws Exception {
        byte[] zip = zipOf("xl/worksheets/sheet1.xml", sheet(10, 1));
        assertEquals("TOO_MANY_CELLS", code(zip, 1000, 9, 32767));
        ZipGuard.check(zip, 20 * MB, 40 * MB, 1000, 10, 32767);
    }

    private static String repeat(char ch, int n) {
        char[] a = new char[n];
        java.util.Arrays.fill(a, ch);
        return new String(a);
    }

    @Test
    public void sharedStrings_문자열이_32767자를_넘으면_CELL_TOO_LONG() throws Exception {
        String ok = "<sst " + NS + "><si><t>" + repeat('가', 32767) + "</t></si></sst>";
        ZipGuard.check(zipOf("xl/sharedStrings.xml", ok), 20 * MB, 40 * MB, 1000, 1000, 32767);
        String longer = "<sst " + NS + "><si><t>" + repeat('가', 32768) + "</t></si></sst>";
        assertEquals("CELL_TOO_LONG", code(zipOf("xl/sharedStrings.xml", longer), 1000, 1000, 32767));
        String runs = "<sst " + NS + "><si><r><t>" + repeat('a', 20000) + "</t></r><r><t>" + repeat('b', 12768)
                + "</t></r></si></sst>";
        assertEquals("CELL_TOO_LONG", code(zipOf("xl/sharedStrings.xml", runs), 1000, 1000, 32767));   // 서식 조각 합산
    }

    @Test
    public void 시트의_inlineStr이_32767자를_넘으면_CELL_TOO_LONG() throws Exception {
        String xml = "<worksheet " + NS + "><sheetData><row r=\"1\"><c r=\"A1\" t=\"inlineStr\"><is><t>"
                + repeat('x', 32768) + "</t></is></c></row></sheetData></worksheet>";
        assertEquals("CELL_TOO_LONG", code(zipOf("xl/worksheets/sheet1.xml", xml), 1000, 1000, 32767));
    }

    @Test
    public void 깨진_시트_xml은_BROKEN() throws Exception {
        assertEquals("BROKEN", code(zipOf("xl/worksheets/sheet1.xml", "<worksheet><row>"), 1000, 1000, 32767));
    }

    private static String code7(byte[] zip, int maxCells, int maxRows, int maxChars, int maxElements) {
        try {
            ZipGuard.check(zip, 20 * MB, 40 * MB, maxCells, maxRows, maxChars, maxElements);
            fail("거부되어야 한다");
            return null;
        } catch (ZipGuard.Rejected e) {
            return e.code;
        }
    }

    /** xlsx 의 시트 entry 이름을 바꾸고 rels·[Content_Types].xml 의 참조도 맞춘다. */
    private static byte[] moveSheet(byte[] zip, String from, String to) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (java.util.zip.ZipInputStream in = new java.util.zip.ZipInputStream(new java.io.ByteArrayInputStream(zip));
             ZipOutputStream z = new ZipOutputStream(out)) {
            ZipEntry e;
            byte[] buf = new byte[8192];
            while ((e = in.getNextEntry()) != null) {
                ByteArrayOutputStream body = new ByteArrayOutputStream();
                int n;
                while ((n = in.read(buf)) > 0) {
                    body.write(buf, 0, n);
                }
                String name = e.getName();
                byte[] data = body.toByteArray();
                if (name.equals(from)) {
                    name = to;
                } else if (name.endsWith(".rels") || name.equals("[Content_Types].xml")) {
                    String s = new String(data, "UTF-8");
                    s = s.replace(from, to).replace(from.substring("xl/".length()), to.substring("xl/".length()));
                    data = s.getBytes("UTF-8");
                }
                z.putNextEntry(new ZipEntry(name));
                z.write(data);
                z.closeEntry();
            }
        }
        return out.toByteArray();
    }

    @Test
    public void 시트를_비표준_경로로_옮겨도_칸_행_초과는_TOO_MANY_CELLS() throws Exception {
        byte[] moved = moveSheet(BoardExcelFixture.xlsx(null), "xl/worksheets/sheet1.xml", "xl/data/s1.xml");
        assertTrue(ZipGuard.check(moved, 20 * MB, 40 * MB).names.contains("xl/data/s1.xml"));
        XlsxBook.Limits ok = new XlsxBook.Limits(20 * MB, 40 * MB, 200000, 200000);
        XlsxBook.open(moved, ok).close();                                   // 옮긴 파일 자체는 정상으로 열린다
        try {
            XlsxBook.open(moved, new XlsxBook.Limits(20 * MB, 40 * MB, 1, 200000));
            fail("칸 초과는 거부되어야 한다");
        } catch (XlsxBook.Rejected e) {
            assertEquals("TOO_MANY_CELLS", e.code);
        }
        try {
            XlsxBook.open(moved, new XlsxBook.Limits(20 * MB, 40 * MB, 200000, 1));
            fail("행 초과는 거부되어야 한다");
        } catch (XlsxBook.Rejected e) {
            assertEquals("TOO_MANY_CELLS", e.code);
        }
        // 가드 자체: 이름이 아니라 내용으로 센다
        assertEquals("TOO_MANY_CELLS", code(zipOf("xl/data/s1.xml", sheet(10, 10)), 99, 1000, 32767));
    }

    @Test
    public void DOCTYPE_이_든_xml_파트는_BROKEN() throws Exception {
        String xml = "<?xml version=\"1.0\"?><!DOCTYPE a [<!ENTITY e \"xxxxxxxxxx\">]><a>&e;</a>";
        assertEquals("BROKEN", code(zipOf("xl/anything/x.dat", xml), 1000, 1000, 32767));
        assertEquals("BROKEN", code(zipOf("xl/worksheets/sheet1.xml", xml), 1000, 1000, 32767));
        String noEntity = "<!DOCTYPE a><a/>";
        assertEquals("BROKEN", code(zipOf("docProps/x.xml", noEntity), 1000, 1000, 32767));
    }

    @Test
    public void si_빈_요소가_많아_요소_총수를_넘으면_TOO_MANY_CELLS() throws Exception {
        StringBuilder sb = new StringBuilder("<sst " + NS + ">");
        for (int i = 0; i < 1000; i++) {
            sb.append("<si/>");
        }
        byte[] zip = zipOf("xl/sharedStrings.xml", sb.append("</sst>").toString());
        assertEquals("TOO_MANY_CELLS", code7(zip, 100000, 100000, 32767, 500));
        assertEquals("TOO_MANY_CELLS", code7(zip, 100000, 100000, 32767, 1000));   // sst + si 1000 = 1001
        ZipGuard.check(zip, 20 * MB, 40 * MB, 100000, 100000, 32767, 1001);
    }

    @Test
    public void rPh_안의_긴_t는_글자_수에서_뺀다() throws Exception {
        String xml = "<sst " + NS + "><si><t>가</t><rPh sb=\"0\" eb=\"1\"><t>" + repeat('x', 40000)
                + "</t></rPh></si></sst>";
        ZipGuard.check(zipOf("xl/sharedStrings.xml", xml), 20 * MB, 40 * MB, 1000, 1000, 32767);
    }

    @Test
    public void 접두사_붙은_si_t도_32767자를_넘으면_CELL_TOO_LONG() throws Exception {
        String xml = "<x:sst xmlns:x=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><x:si><x:t>"
                + repeat('가', 32768) + "</x:t></x:si></x:sst>";
        assertEquals("CELL_TOO_LONG", code(zipOf("xl/sharedStrings.xml", xml), 1000, 1000, 32767));
    }

    @Test
    public void BOM_이_앞에_붙은_xml도_센다() throws Exception {
        String xml = "﻿<sst " + NS + "><si><t>" + repeat('가', 32768) + "</t></si></sst>";
        assertEquals("CELL_TOO_LONG", code(zipOf("xl/sharedStrings.xml", xml), 1000, 1000, 32767));
    }

    @Test
    public void 이름_대소문자가_달라도_sharedStrings는_센다() throws Exception {
        String longer = "<sst " + NS + "><si><t>" + repeat('가', 32768) + "</t></si></sst>";
        assertEquals("CELL_TOO_LONG", code(zipOf("XL/SharedStrings.XML", longer), 1000, 1000, 32767));
    }

    @Test
    public void XML_이_아닌_파트는_훑지_않는다() throws Exception {
        ZipGuard.check(zipOf("xl/media/image1.bin", "\u0001\u0002 not xml <<< &&"), 20 * MB, 40 * MB, 1, 1, 1, 1);
    }

    @Test
    public void 정상_xlsx는_계수_한도_안이면_통과() throws Exception {
        ZipGuard.check(BoardExcelFixture.xlsx(null), 20 * MB, 40 * MB, 200000, 200000, 32767);
    }

    @Test
    public void 정상_xlsx는_통과하고_content_types를_돌려준다() throws Exception {
        ZipGuard.Result r = ZipGuard.check(BoardExcelFixture.xlsx(null), 20 * MB, 40 * MB);
        assertTrue(r.names.contains("[content_types].xml"));
        assertTrue(r.names.contains("xl/workbook.xml"));
        assertNotNull(r.contentTypes);
        assertTrue(r.unpacked > 0);
    }
}
