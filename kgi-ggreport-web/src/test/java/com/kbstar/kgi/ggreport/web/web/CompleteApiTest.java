package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionMapper;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 완료 처리 — Task 5B.6. {@code POST /institutions/{id}/complete}.
 *
 * <p>고정하는 것은 <b>단계 문지기</b>와 <b>아카이브 경로 방어</b> 둘이다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class CompleteApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private InstitutionMapper institutions;

    private final ObjectMapper json = new ObjectMapper();

    private String make(String nameKo) throws Exception {
        MockHttpServletResponse res = mockMvc.perform(post("/institutions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name_ko\":\"" + nameKo + "\"}"))
                .andReturn().getResponse();
        res.setCharacterEncoding("UTF-8");
        return json.readTree(res.getContentAsString()).path("institution_id").asText();
    }

    private MockHttpServletResponse complete(String institutionId) throws Exception {
        MockHttpServletResponse res = mockMvc.perform(
                        post("/institutions/" + institutionId + "/complete")
                                .header("X-User-Id", "dave"))
                .andReturn().getResponse();
        res.setCharacterEncoding("UTF-8");
        return res;
    }

    /**
     * ⚠️ <b>이 테스트가 이 클래스의 이유다.</b> 단계 문지기가 없으면 진행 중인 건을
     * 완료 처리해 산출물이 없는 빈 아카이브가 남고, 공고가 {@code 제출완료} 로 바뀌어
     * <b>되돌릴 화면이 사라진다.</b>
     */
    @Test
    public void 단계가_9가_아니면_409다() throws Exception {
        String id = make("완료전구청");  // 새 기관은 stage 1 이다

        MockHttpServletResponse res = complete(id);
        assertEquals(409, res.getStatus());
        assertTrue(json.readTree(res.getContentAsString()).path("detail").asText().contains("stage 9"));
    }

    @Test
    public void 없는_기관이면_404다() throws Exception {
        MockHttpServletResponse res = complete("new-deadbeef");
        assertEquals(404, res.getStatus());
        assertEquals("institution not found",
                json.readTree(res.getContentAsString()).path("detail").asText());
    }

    @Test
    public void 단계_9면_아카이브하고_누가_눌렀는지_돌려준다() throws Exception {
        String id = make("완료구청");
        institutions.updateStage(id, 9);

        MockHttpServletResponse res = complete(id);
        assertEquals(res.getContentAsString(), 200, res.getStatus());

        JsonNode body = json.readTree(res.getContentAsString());
        assertTrue("아카이브 경로가 있어야 한다", body.path("archive_dir").asText().length() > 0);
        assertTrue("기관명이 경로에 들어간다", body.path("archive_dir").asText().contains("완료구청"));
        assertEquals("dave", body.path("completed_by").asText());
    }

    /**
     * ⚠️ 아카이브 경로는 <b>기관명으로 조립되고 통째로 지워진다.</b> 기관명에
     * {@code ..} 가 섞이면 아카이브 밖 디렉터리를 지운다 — 지우기 전에 울타리를 본다.
     */
    @Test
    public void 기관명이_경로를_벗어나면_400이다() throws Exception {
        String id = make("../../탈출구청");
        institutions.updateStage(id, 9);

        assertEquals(400, complete(id).getStatus());
    }
}
