package com.kb.uploader.controller;

import com.kb.uploader.dto.UploadResultItem;
import com.kb.uploader.mapper.InstitutionMapper;
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

    // KGI11100$UploadAction 이 생성자 3번째 인자로 받는다(업로드 폼의 카테고리 목록을
    // populateCategories()에서 채운다). 이게 없으면 @WebMvcTest 컨텍스트 자체가 못 뜬다.
    @MockBean
    private InstitutionMapper instMapper;

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
        // upload()는 오버로드다 — 컨트롤러가 부르는 것은 4인자 쪽이다.
        // 1인자 스텁은 매칭되지 않아 results 가 null 로 들어간다.
        when(uploadService.upload(any(), any(), any(), any())).thenReturn(Arrays.asList(
            new UploadResultItem("2024_서울대_보고서.pdf", true, "대학교", "분류 완료")));
        when(fileMapper.countByStatus("UNCLASSIFIED")).thenReturn(0L);

        mockMvc.perform(multipart("/upload").file(file))
            .andExpect(status().isOk())
            .andExpect(view().name("upload"))
            .andExpect(model().attributeExists("results"));
    }
}
