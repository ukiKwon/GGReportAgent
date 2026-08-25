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
        sut = new FileStorageService(tempFolder.getRoot().getAbsolutePath());
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
}
