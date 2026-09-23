package com.kb.uploader.service;

import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.springframework.mock.web.MockMultipartFile;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.junit.Assert.*;

public class FileStorageServiceTest {

    @Rule
    public TemporaryFolder tempFolder = new TemporaryFolder();

    private FileStorageService sut;

    @Before
    public void setUp() {
        String root = tempFolder.getRoot().getAbsolutePath();
        sut = new FileStorageService(root, root + "/userdata",
                root + "/out-json", root + "/out-md");
    }

    @Test
    public void unclassified_저장_파일생성() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
            "file", "2024_서울대_보고서.pdf", "application/pdf", "내용".getBytes());

        Path saved = sut.saveToUnclassified(file, "2024_서울대_보고서.pdf");

        assertTrue(Files.exists(saved));
        assertTrue(saved.toString().contains("unclassified"));
    }

    @Test
    public void 중복파일명_타임스탬프_suffix_추가() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
            "file", "2024_서울대_보고서.pdf", "application/pdf", "내용".getBytes());

        Path first  = sut.saveToUnclassified(file, "2024_서울대_보고서.pdf");
        Path second = sut.saveToUnclassified(file, "2024_서울대_보고서.pdf");

        assertNotEquals(first.getFileName().toString(),
                        second.getFileName().toString());
    }

    @Test
    public void classified_이동_경로생성() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
            "file", "test.pdf", "application/pdf", "내용".getBytes());
        Path source = sut.saveToUnclassified(file, "test.pdf");

        Path moved = sut.moveToClassified(source, "대학교", "2024", "서울대학교");

        assertTrue(Files.exists(moved));
        assertTrue(moved.toString().contains("대학교"));
        assertTrue(moved.toString().contains("2024"));
        assertTrue(moved.toString().contains("서울대학교"));
        assertFalse(Files.exists(source));
    }

    // ── 2026-09-23 파싱 전환으로 추가된 API ──

    @Test
    public void 원본은_userdata에_보관한다() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
            "file", "제안서.pptx", "application/octet-stream", "내용".getBytes());

        Path saved = sut.saveOriginal(file, "제안서.pptx");

        assertTrue(Files.exists(saved));
        assertTrue(saved.toString().contains("userdata"));
    }

    @Test
    public void 산출물_중복이름은_숫자를_붙인다() throws Exception {
        Path dir = sut.getProposalJsonDir();

        Path first  = sut.writeOutput(dir, "out.json", "{}".getBytes());
        Path second = sut.writeOutput(dir, "out.json", "{}".getBytes());

        assertEquals("out.json", first.getFileName().toString());
        assertEquals("out_2.json", second.getFileName().toString());
    }

    @Test
    public void 파일명에서_경로구분자를_떼어낸다() {
        assertEquals("보고서.pdf", FileStorageService.safeFileName("C:/temp/보고서.pdf"));
        assertEquals("보고서.pdf", FileStorageService.safeFileName("../../보고서.pdf"));
        assertEquals("unnamed", FileStorageService.safeFileName(null));
    }
}
