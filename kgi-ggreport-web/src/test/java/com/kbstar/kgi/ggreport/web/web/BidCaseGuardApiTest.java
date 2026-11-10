package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.Assert.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 참여결정·최종확정 문지기(2026-11-10, security S-2·S-3).
 *
 * <p>⚠️ X-Emp-No 는 자기신고다 — 고정하는 것은 업무 규칙(단계별 역할)이지 사칭 방지가 아니다.
 * 단계별 역할: 1=영업팀(3918264), 2=영업팀장(5047192), 3=영업부장(2674805), 최종 확정=영업부장.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class BidCaseGuardApiTest {

    @Autowired
    private MockMvc mockMvc;

    private final ObjectMapper json = new ObjectMapper();

    private String newCase() throws Exception {
        MockHttpServletResponse res = mockMvc.perform(post("/bidcases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"institution_id\":\"nowon\",\"title\":\"문지기 테스트\"}")
                        .header("X-User-Id", "dave"))
                .andReturn().getResponse();
        return json.readTree(res.getContentAsString()).path("bid_case_id").asText();
    }

    private int decide(String id, int tier, String emp) throws Exception {
        MockHttpServletRequestBuilder b = post("/bidcases/" + id + "/participation-decisions")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"tier\":" + tier + ",\"role\":\"영업부장\",\"by\":\"위조\",\"choice\":\"참여\"}");
        if (emp != null) {
            b = b.header("X-Emp-No", emp);
        }
        return mockMvc.perform(b).andReturn().getResponse().getStatus();
    }

    @Test
    public void 사번이_없으면_401이다() throws Exception {
        assertEquals(401, decide(newCase(), 1, null));
    }

    @Test
    public void 단계마다_맞는_역할만_통과한다() throws Exception {
        String id = newCase();
        assertEquals(403, decide(id, 1, "5047192"));   // 1단을 팀장이
        assertEquals(403, decide(id, 2, "3918264"));   // 2단을 팀원이
        assertEquals(403, decide(id, 3, "5047192"));   // 3단을 팀장이
        assertEquals(200, decide(id, 1, "3918264"));
        assertEquals(200, decide(id, 2, "5047192"));
        assertEquals(200, decide(id, 3, "2674805"));
    }

    @Test
    public void 범위_밖_단계는_신원이_있어야_400이다() throws Exception {
        String id = newCase();
        assertEquals(401, decide(id, 9, null));
        assertEquals(400, decide(id, 9, "2674805"));
    }

    @Test
    public void 최종_확정은_영업부장만_누른다() throws Exception {
        String id = newCase();
        for (String emp : new String[]{null, "3918264", "5047192"}) {
            MockHttpServletRequestBuilder b = post("/bidcases/" + id + "/finalize")
                    .contentType(MediaType.APPLICATION_JSON).content("{\"approved\":true}")
                    .header("X-User-Id", "x");
            if (emp != null) {
                b = b.header("X-Emp-No", emp);
            }
            int s = mockMvc.perform(b).andReturn().getResponse().getStatus();
            assertEquals(String.valueOf(emp), emp == null ? 401 : 403, s);
        }
        // 영업부장은 역할 검사를 지나 단계 검사(작업이 2차완료가 아님 → 4xx)까지 간다 — 401·403 은 아니다.
        int s = mockMvc.perform(post("/bidcases/" + id + "/finalize")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"approved\":true}")
                        .header("X-Emp-No", "2674805"))
                .andReturn().getResponse().getStatus();
        assertEquals("역할 통과 후 상태 검사", true, s != 401 && s != 403);
    }
}
