package com.kb.uploader.controller;

import com.kb.uploader.domain.UploadedFile;
import com.kb.uploader.mapper.UploadedFileMapper;
import com.kb.uploader.service.FileContentService;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Arrays;
import java.util.Collections;

import static org.hamcrest.Matchers.nullValue;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@RunWith(SpringRunner.class)
@WebMvcTest(FileSearchApiController.class)
public class FileSearchApiControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UploadedFileMapper fileMapper;

    @MockBean
    private FileContentService contentService;

    @Test
    public void 기관명으로_검색_결과반환() throws Exception {
        UploadedFile file = new UploadedFile(
            "2024_KB국민은행_분기보고서.pdf", "/tmp/test.pdf", "2024", "KB국민은행");
        when(fileMapper.search("KB국민은행", "", ""))
            .thenReturn(Arrays.asList(file));
        when(contentService.extractText("/tmp/test.pdf"))
            .thenReturn("분기 순이익 1조원");

        mockMvc.perform(get("/api/files/search")
                .param("institution", "KB국민은행"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.files[0].institution").value("KB국민은행"))
            .andExpect(jsonPath("$.files[0].content").value("분기 순이익 1조원"));
    }

    @Test
    public void 파라미터_없이_빈목록_반환() throws Exception {
        when(fileMapper.search("", "", "")).thenReturn(Collections.emptyList());

        mockMvc.perform(get("/api/files/search"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.files").isArray())
            .andExpect(jsonPath("$.files").isEmpty());
    }

    @Test
    public void content_null인_파일도_포함() throws Exception {
        UploadedFile file = new UploadedFile(
            "2024_우리은행_현황.hwp", "/tmp/test.hwp", "2024", "우리은행");
        when(fileMapper.search("", "", "")).thenReturn(Arrays.asList(file));
        when(contentService.extractText("/tmp/test.hwp")).thenReturn(null);

        mockMvc.perform(get("/api/files/search"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.files[0].content").value(nullValue()));
    }
}
