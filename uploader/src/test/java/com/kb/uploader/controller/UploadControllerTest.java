package com.kb.uploader.controller;

import com.kb.uploader.dto.UploadResultItem;
import com.kb.uploader.mapper.UploadedFileMapper;
import com.kb.uploader.service.FileUploadService;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import java.util.Arrays;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@RunWith(SpringRunner.class)
@WebMvcTest(controllers = {KGI11000$UploadView.class, KGI11100$UploadAction.class})
public class UploadControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private FileUploadService uploadService;

    @MockBean
    private UploadedFileMapper fileMapper;

    @Test
    public void GET_upload_200반환() throws Exception {
        when(fileMapper.countByStatus("UNCLASSIFIED")).thenReturn(0L);
        mockMvc.perform(get("/upload"))
            .andExpect(status().isOk())
            .andExpect(view().name("upload"));
    }

    @Test
    public void POST_upload_결과_모델포함() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
            "files", "2024_서울대_보고서.pdf",
            "application/pdf", "내용".getBytes());
        when(uploadService.upload(any())).thenReturn(Arrays.asList(
            new UploadResultItem("2024_서울대_보고서.pdf", true, "대학교", "분류 완료")));
        when(fileMapper.countByStatus("UNCLASSIFIED")).thenReturn(0L);

        mockMvc.perform(multipart("/upload").file(file))
            .andExpect(status().isOk())
            .andExpect(view().name("upload"))
            .andExpect(model().attributeExists("results"));
    }
}
