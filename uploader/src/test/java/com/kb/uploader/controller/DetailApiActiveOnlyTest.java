package com.kb.uploader.controller;

import com.kb.uploader.domain.UploadedFile;
import com.kb.uploader.mapper.UploadedFileMapper;
import com.kb.uploader.service.FileContentService;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * 외부 조회 API(RFP·제안서 상세, 원본 다운로드)는 반려(03)·삭제(04) 건을 없는 것으로 보고(findActiveById),
 * 404 문구는 원인과 무관하게 하나이며 id·파일명을 싣지 않는다(security 11-16).
 */
@RunWith(SpringRunner.class)
@WebMvcTest({RfpApiController.class, ProposalApiController.class, FileSearchApiController.class})
public class DetailApiActiveOnlyTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UploadedFileMapper fileMapper;

    @MockBean
    private FileContentService contentService;

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    @Test
    public void 반려_삭제_건은_세_곳_모두_404_한_문구이고_findById는_쓰지_않는다() throws Exception {
        when(fileMapper.findActiveById(7L)).thenReturn(Optional.empty());
        for (String url : new String[]{"/api/rfps/7", "/api/proposals/7", "/api/files/7/download"}) {
            mockMvc.perform(get(url))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("찾을 수 없습니다."))
                .andExpect(content().string(not(containsString("id="))));
        }
        verify(fileMapper, never()).findById(any());
    }

    @Test
    public void 산출물_파일이_없으면_404이고_파일명을_싣지_않는다() throws Exception {
        UploadedFile f = new UploadedFile("공고.pdf", tmp.getRoot().getAbsolutePath() + "/secret_name.md");
        when(fileMapper.findActiveById(8L)).thenReturn(Optional.of(f));
        mockMvc.perform(get("/api/rfps/8"))
            .andExpect(status().isNotFound())
            .andExpect(content().string(not(containsString("secret_name"))));
    }

    @Test
    public void 정상_RFP는_200이고_markdown을_준다() throws Exception {
        File md = tmp.newFile("ok.md");
        Files.write(md.toPath(), "# 요약".getBytes(StandardCharsets.UTF_8));
        when(fileMapper.findActiveById(9L)).thenReturn(Optional.of(new UploadedFile("공고.pdf", md.getAbsolutePath())));
        mockMvc.perform(get("/api/rfps/9"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.markdown").value("# 요약"));
    }

    @Test
    public void 제안서_산출물이_객체가_아니면_500_고정_문구() throws Exception {
        File json = tmp.newFile("arr.json");
        Files.write(json.toPath(), "[1,2]".getBytes(StandardCharsets.UTF_8));
        when(fileMapper.findActiveById(10L)).thenReturn(Optional.of(new UploadedFile("제안.pptx", json.getAbsolutePath())));
        mockMvc.perform(get("/api/proposals/10"))
            .andExpect(status().isInternalServerError())
            .andExpect(jsonPath("$.error").value("산출물 읽기 실패"))
            .andExpect(content().string(not(containsString("arr.json"))));
    }

    @Test
    public void 정상_제안서는_200() throws Exception {
        File json = tmp.newFile("ok.json");
        Files.write(json.toPath(), "{\"slides\":[],\"jsonFileName\":\"위조\"}".getBytes(StandardCharsets.UTF_8));
        when(fileMapper.findActiveById(11L)).thenReturn(Optional.of(new UploadedFile("제안.pptx", json.getAbsolutePath())));
        mockMvc.perform(get("/api/proposals/11"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.slides").isArray())
            .andExpect(jsonPath("$.jsonFileName").value("ok.json"));   // 산출물 키가 메타를 덮지 않음
    }
}
