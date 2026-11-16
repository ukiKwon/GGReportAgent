package com.kb.uploader.controller;

import com.kb.uploader.domain.UploadedFile;
import com.kb.uploader.mapper.UploadedFileMapper;
import com.kb.uploader.service.FileContentService;
import com.kb.uploader.service.FileStorageService;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Optional;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** NEXT 87: RFP '원문 보기' — 분석 때 저장한 .full.txt 를 그대로 준다(사용자 11-16 ⓑ). */
@RunWith(SpringRunner.class)
@WebMvcTest(RfpApiController.class)
public class RfpFullTextApiTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UploadedFileMapper fileMapper;

    @MockBean
    private FileContentService contentService;

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private UploadedFile rfpWith(String md, String full) throws Exception {
        File m = tmp.newFile(md);
        Files.write(m.toPath(), "# 요약".getBytes(StandardCharsets.UTF_8));
        if (full != null) {
            Files.write(FileStorageService.fullTextPathOf(m.getAbsolutePath()), full.getBytes(StandardCharsets.UTF_8));
        }
        return new UploadedFile("공고.pdf", m.getAbsolutePath());
    }

    @Test
    public void 정상은_200_text_plain_원문_그대로() throws Exception {
        when(fileMapper.findActiveById(1L)).thenReturn(Optional.of(rfpWith("a.md", "원문 가나다\n둘째 줄")));
        mockMvc.perform(get("/api/rfps/1/fulltext"))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("text/plain"))
            .andExpect(content().string("원문 가나다\n둘째 줄"))
            .andExpect(header().string("X-Fulltext-Truncated", "false"))
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(header().string("X-Content-Type-Options", "nosniff"));
    }

    @Test
    public void 잘린_원문은_헤더로_알린다() throws Exception {
        when(fileMapper.findActiveById(2L)).thenReturn(Optional.of(rfpWith("b.md",
                "본문\n\n[※ 원문이 길어 여기서 잘렸습니다 (전체 9자 중 2자). 원본 파일을 확인하세요.]\n")));
        mockMvc.perform(get("/api/rfps/2/fulltext"))
            .andExpect(status().isOk())
            .andExpect(header().string("X-Fulltext-Truncated", "true"));
    }

    @Test
    public void 반려_삭제는_404_한_문구() throws Exception {
        when(fileMapper.findActiveById(3L)).thenReturn(Optional.empty());
        mockMvc.perform(get("/api/rfps/3/fulltext"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error").value("찾을 수 없습니다."))
            .andExpect(jsonPath("$.code").doesNotExist());
        verify(fileMapper, never()).findById(any());
    }

    @Test
    public void 옛_분석_건은_원문_없음을_code로_구분하고_경로를_싣지_않는다() throws Exception {
        when(fileMapper.findActiveById(4L)).thenReturn(Optional.of(rfpWith("secret_old.md", null)));
        mockMvc.perform(get("/api/rfps/4/fulltext"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("fulltext_missing"))
            .andExpect(content().string(not(containsString("secret_old"))));
    }

    @Test
    public void 파싱_미성공_RFP_아님은_404_한_문구() throws Exception {
        when(fileMapper.findActiveById(5L)).thenReturn(Optional.of(new UploadedFile("공고.pdf", "/tmp/공고.pdf")));
        mockMvc.perform(get("/api/rfps/5/fulltext")).andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error").value("찾을 수 없습니다."));
        when(fileMapper.findActiveById(6L)).thenReturn(Optional.of(new UploadedFile("제안.pptx", "/tmp/x.json")));
        mockMvc.perform(get("/api/rfps/6/fulltext")).andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error").value("찾을 수 없습니다."));
    }

    @Test
    public void 요약_응답은_그대로() throws Exception {
        when(fileMapper.findActiveById(7L)).thenReturn(Optional.of(rfpWith("c.md", "원문")));
        mockMvc.perform(get("/api/rfps/7"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.markdown").value("# 요약"));
    }

    @Test
    public void 원문_경로는_md에서만_계산() {
        assertEquals("x.full.txt", FileStorageService.fullTextPathOf("x.md").toString());
        assertNull(FileStorageService.fullTextPathOf("x.json"));
        assertNull(FileStorageService.fullTextPathOf(null));
    }
}
