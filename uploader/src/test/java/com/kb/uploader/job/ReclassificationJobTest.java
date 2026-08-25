package com.kb.uploader.job;

import com.kb.uploader.domain.UploadedFile;
import com.kb.uploader.mapper.UploadedFileMapper;
import com.kb.uploader.service.ClassificationService;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;

import java.util.Arrays;
import java.util.Collections;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@RunWith(MockitoJUnitRunner.class)
public class ReclassificationJobTest {

    @Mock private UploadedFileMapper uploadedFileMapper;
    @Mock private ClassificationService classificationService;
    @InjectMocks private ReclassificationJob reclassificationJob;

    @Test
    public void reclassify_미분류파일있음_분류시도() {
        UploadedFile file = new UploadedFile("2024_서울시_보고서.pdf", "/path/file.pdf", "2024", "서울시");
        when(uploadedFileMapper.findByStatus("UNCLASSIFIED")).thenReturn(Collections.singletonList(file));
        when(classificationService.classify(file)).thenReturn(true);

        reclassificationJob.reclassify();

        verify(classificationService, times(1)).classify(file);
    }

    @Test
    public void reclassify_미분류파일없음_호출안함() {
        when(uploadedFileMapper.findByStatus("UNCLASSIFIED")).thenReturn(Collections.emptyList());

        reclassificationJob.reclassify();

        verify(classificationService, never()).classify(any());
    }

    @Test
    public void reclassify_예외발생_나머지파일계속처리() {
        UploadedFile file1 = new UploadedFile("오류파일.pdf", "/path/file1.pdf", null, "알수없음");
        UploadedFile file2 = new UploadedFile("2024_서울시_보고서.pdf", "/path/file2.pdf", "2024", "서울시");
        when(uploadedFileMapper.findByStatus("UNCLASSIFIED")).thenReturn(Arrays.asList(file1, file2));
        when(classificationService.classify(file1)).thenThrow(new RuntimeException("분류 오류"));
        when(classificationService.classify(file2)).thenReturn(true);

        reclassificationJob.reclassify();

        verify(classificationService, times(1)).classify(file1);
        verify(classificationService, times(1)).classify(file2);
    }
}
