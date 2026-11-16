package com.kb.uploader.parse;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.*;

/** NEXT 39 2단계: RFP 의 .hwpx 도 열기 전에 ZipGuard 를 거친다. */
public class RfpExtractorHwpxGuardTest {
    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private static byte[] hwpx() throws Exception {
        return ZipFixtures.addEntry(ZipFixtures.zip("mimetype", "application/hwp+zip".getBytes(StandardCharsets.UTF_8)),
                "Contents/section0.xml", "<a/>".getBytes(StandardCharsets.UTF_8));
    }

    private void assertGuardRejected(byte[] data, String code) throws Exception {
        Path p = tmp.newFile("r_" + System.nanoTime() + ".hwpx").toPath();
        Files.write(p, data);
        try {
            new RfpExtractor().extractHwpx(p);
            fail("거부되어야 한다");
        } catch (IOException e) {
            assertEquals("ZIP 거부: " + code, e.getMessage());
            assertFalse(e.getMessage().contains(p.toString()));
        }
    }

    @Test
    public void 중복_entry_hwpx는_거부() throws Exception {
        assertGuardRejected(ZipFixtures.duplicateEntry(hwpx(), "Contents/section0.xml"), "DUPLICATE_ENTRY");
    }

    @Test
    public void 목차_불일치_hwpx는_거부() throws Exception {
        assertGuardRejected(ZipFixtures.hideAfterFirst(hwpx()), "BROKEN");
    }

    @Test
    public void DOCTYPE_hwpx는_거부() throws Exception {
        assertGuardRejected(ZipFixtures.zip("Contents/section0.xml",
                "<!DOCTYPE a [<!ENTITY e \"x\">]><a>&e;</a>".getBytes(StandardCharsets.UTF_8)), "BROKEN");
    }

    @Test
    public void 가드를_통과한_파일은_ZIP_거부_메시지가_아니다() throws Exception {
        Path p = tmp.newFile("ok.hwpx").toPath();
        Files.write(p, hwpx());
        try {
            new RfpExtractor().extractHwpx(p);   // 최소 구조라 hwpxlib 에서 다른 이유로 실패하거나 빈 결과일 수 있다
        } catch (Exception e) {
            assertFalse(String.valueOf(e.getMessage()).startsWith("ZIP 거부"));
        }
    }
}
