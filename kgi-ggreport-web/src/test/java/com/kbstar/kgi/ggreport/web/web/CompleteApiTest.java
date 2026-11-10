package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionMapper;
import com.kbstar.kgi.ggreport.web.service.InstitutionCommandService;
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
        MockHttpServletResponse res = mockMvc.perform(post("/institutions").header("X-Emp-No", "3918264")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name_ko\":\"" + nameKo + "\"}"))
                .andReturn().getResponse();
        res.setCharacterEncoding("UTF-8");
        return json.readTree(res.getContentAsString()).path("institution_id").asText();
    }

    @Autowired
    private InstitutionCommandService commands;

    @Autowired
    private ObjectMapper appJson;   // 서버 설정(snake_case) 그대로

    /**
     * 내부 로직은 서비스를 직접 부른다 — HTTP 엔드포인트는 2026-11-10 이후 항상 403 이다
     * (제출 완료는 결재 절차로만, NEXT 59·021). 응답 모양은 예전 HTTP 응답처럼 맞춰 돌려준다.
     */
    private MockHttpServletResponse complete(String institutionId) throws Exception {
        MockHttpServletResponse res = new MockHttpServletResponse();
        res.setCharacterEncoding("UTF-8");
        try {
            res.setStatus(200);
            res.getWriter().write(appJson.writeValueAsString(commands.complete(institutionId, "dave")));
        } catch (ApiException e) {
            res = new MockHttpServletResponse();
            res.setCharacterEncoding("UTF-8");
            res.setStatus(e.getStatus());
            res.getWriter().write(json.writeValueAsString(
                    java.util.Collections.singletonMap("detail", e.getMessage())));
        }
        return res;
    }

    /** ⚠️ 외부 호출은 누가 부르든(부장·마스터·헤더 없음) 403 이고 상태는 그대로다. */
    @Test
    public void 엔드포인트는_누가_불러도_403이고_제출완료로_바뀌지_않는다() throws Exception {
        String id = make("차단구청");
        institutions.updateStage(id, 9);

        String[][] callers = {{"X-Emp-No", "1473958"}, {"X-Emp-No", "8203417"}, {"X-None", "x"}};
        for (String[] c : callers) {
            MockHttpServletResponse res = mockMvc.perform(
                    post("/institutions/" + id + "/complete").header(c[0], c[1]))
                    .andReturn().getResponse();
            assertEquals(c[0] + "=" + c[1], 403, res.getStatus());
        }
        assertEquals("단계가 9로 그대로", 9, institutions.selectById(id).getStage());
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
