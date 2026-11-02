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

    @Test
    public void 정상_xlsx는_통과하고_content_types를_돌려준다() throws Exception {
        ZipGuard.Result r = ZipGuard.check(BoardExcelFixture.xlsx(null), 20 * MB, 40 * MB);
        assertTrue(r.names.contains("[content_types].xml"));
        assertTrue(r.names.contains("xl/workbook.xml"));
        assertNotNull(r.contentTypes);
        assertTrue(r.unpacked > 0);
    }
}
