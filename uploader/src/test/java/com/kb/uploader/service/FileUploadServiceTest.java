package com.kb.uploader.service;

import com.kb.uploader.domain.UploadedFile;
import com.kb.uploader.dto.ParsedFileName;
import com.kb.uploader.dto.UploadResultItem;
import com.kb.uploader.mapper.UploadedFileMapper;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

@RunWith(MockitoJUnitRunner.class)
public class FileUploadServiceTest {

    @Mock private FileParserService fileParserService;
    @Mock private FileStorageService fileStorageService;
    @Mock private ClassificationService classificationService;
    @Mock private UploadedFileMapper uploadedFileMapper;
    @InjectMocks private FileUploadService fileUploadService;

    @Test
    public void upload_파싱성공_분류성공() throws Exception {
        // given
        MockMultipartFile file = new MockMultipartFile("file", "2024_서울시_보고서.pdf",
                "application/pdf", "content".getBytes());
        ParsedFileName parsed = new ParsedFileName("2024", "서울시", "보고서", "pdf");
        when(fileParserService.parse("2024_서울시_보고서.pdf")).thenReturn(Optional.of(parsed));
        Path storedPath = Paths.get("/tmp/uploader-test/unclassified/2024_서울시_보고서.pdf");
        when(fileStorageService.saveToUnclassified(file, "2024_서울시_보고서.pdf")).thenReturn(storedPath);
        when(classificationService.classify(any(UploadedFile.class))).thenReturn(true);

        // when
        List<UploadResultItem> results = fileUploadService.upload(Collections.singletonList(file));

        // then
        assertEquals(1, results.size());
        assertTrue(results.get(0).isClassified());
    }

    @Test
    public void upload_파싱실패_미분류() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "잘못된파일명.pdf",
                "application/pdf", "content".getBytes());
        when(fileParserService.parse("잘못된파일명.pdf")).thenReturn(Optional.empty());
        Path storedPath = Paths.get("/tmp/uploader-test/unclassified/잘못된파일명.pdf");
        when(fileStorageService.saveToUnclassified(file, "잘못된파일명.pdf")).thenReturn(storedPath);

        List<UploadResultItem> results = fileUploadService.upload(Collections.singletonList(file));

        assertEquals(1, results.size());
        assertFalse(results.get(0).isClassified());
    }

    @Test
    public void upload_예외발생_다른파일계속처리() throws Exception {
        MockMultipartFile file1 = new MockMultipartFile("file", "오류파일.pdf",
                "application/pdf", "content".getBytes());
        MockMultipartFile file2 = new MockMultipartFile("file", "2024_서울시_보고서.pdf",
                "application/pdf", "content".getBytes());
        when(fileParserService.parse("오류파일.pdf")).thenReturn(Optional.empty());
        when(fileStorageService.saveToUnclassified(eq(file1), anyString())).thenThrow(new RuntimeException("저장 오류"));
        ParsedFileName parsed = new ParsedFileName("2024", "서울시", "보고서", "pdf");
        when(fileParserService.parse("2024_서울시_보고서.pdf")).thenReturn(Optional.of(parsed));
        Path storedPath = Paths.get("/tmp/uploader-test/unclassified/2024_서울시_보고서.pdf");
        when(fileStorageService.saveToUnclassified(eq(file2), anyString())).thenReturn(storedPath);
        when(classificationService.classify(any(UploadedFile.class))).thenReturn(true);

        List<UploadResultItem> results = fileUploadService.upload(Arrays.asList(file1, file2));

        assertEquals(2, results.size()); // 두 파일 모두 결과에 포함
    }
}
