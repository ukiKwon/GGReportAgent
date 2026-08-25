package com.kb.uploader.service;

import com.kb.uploader.domain.Institution;
import com.kb.uploader.domain.UploadedFile;
import com.kb.uploader.mapper.InstitutionMapper;
import com.kb.uploader.mapper.UploadedFileMapper;
import org.junit.Before;
import org.junit.Test;

import java.nio.file.Paths;
import java.util.Optional;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class ClassificationServiceTest {

    private InstitutionMapper institutionMapper;
    private UploadedFileMapper fileMapper;
    private FileStorageService storageService;
    private ClassificationService sut;

    @Before
    public void setUp() {
        institutionMapper = mock(InstitutionMapper.class);
        fileMapper = mock(UploadedFileMapper.class);
        storageService = mock(FileStorageService.class);
        sut = new ClassificationService(institutionMapper, fileMapper, storageService);
    }

    @Test
    public void 기관명_매핑_성공시_CLASSIFIED() throws Exception {
        UploadedFile file = new UploadedFile(
            "2024_서울대학교_보고서.pdf",
            "/tmp/unclassified/2024_서울대학교_보고서.pdf",
            "2024", "서울대학교");
        when(institutionMapper.findByName("서울대학교"))
            .thenReturn(Optional.of(new Institution("서울대학교", "대학교")));
        when(storageService.moveToClassified(any(), eq("대학교"), eq("2024"), eq("서울대학교")))
            .thenReturn(Paths.get("/tmp/classified/대학교/2024/서울대학교/2024_서울대학교_보고서.pdf"));

        boolean result = sut.classify(file);

        assertTrue(result);
        assertEquals("CLASSIFIED", file.getStatus());
        assertEquals("대학교", file.getCategory());
        verify(fileMapper).update(file);
    }

    @Test
    public void 기관명_미등록시_UNCLASSIFIED_유지() throws Exception {
        UploadedFile file = new UploadedFile(
            "2024_미지기관_보고서.pdf",
            "/tmp/unclassified/2024_미지기관_보고서.pdf",
            "2024", "미지기관");
        when(institutionMapper.findByName("미지기관")).thenReturn(Optional.empty());

        boolean result = sut.classify(file);

        assertFalse(result);
        assertEquals("UNCLASSIFIED", file.getStatus());
        verify(fileMapper, never()).update(any());
    }
}
