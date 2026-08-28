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
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 쪽지 쓰기 — Task 5B.3. {@code POST /notifications} · {@code POST /{id}/read}.
 *
 * <p>⚠️ <b>{@code @Transactional} 로 롤백한다.</b> 여기서 만든 쪽지가 남으면
 * {@code EmptyStateApiTest}(쪽지함 빈 배열)와 골든 {@code 27} 이 실행 순서에 따라
 * 깨진다 — {@code GoldenWriteScenarioTest} 와 같은 이유다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class NotificationWriteApiTest {

    @Autowired
    private MockMvc mockMvc;

    private final ObjectMapper json = new ObjectMapper();

    /**
     * ⚠️ 이 테스트가 이 클래스의 이유다. 사람이 만들 수 있는 종류는 {@code 쪽지}
     * 하나여야 한다 — {@code 결재요청} 을 만들 수 있으면 결재 흐름을 위조할 수 있다.
     */
    @Test
    public void 사람이_보낸_쪽지는_종류가_쪽지로_고정된다() throws Exception {
        JsonNode sent = send("{\"recipient\":\"전산팀\",\"content\":\"확인 부탁드립니다\","
                + "\"sender\":\"김 차장\",\"kind\":\"결재요청\"}");

        assertEquals("본문의 kind 를 따라가면 안 된다", "쪽지", sent.path("kind").asText());
        assertEquals("전산팀", sent.path("recipient").asText());
        assertEquals("김 차장", sent.path("sender").asText());
        assertTrue("id 모양이 원본(ntf-token_hex(4))과 다르다",
                sent.path("notification_id").asText().matches("ntf-[0-9a-f]{8}"));
    }

    @Test
    public void 보낸_쪽지가_수신자_쪽지함에_보인다() throws Exception {
        send("{\"recipient\":\"예산팀\",\"content\":\"자료 요청\",\"sender\":\"최 디자이너\"}");

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/notifications").param("recipient", "예산팀"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].content").value("자료 요청"))
                .andExpect(jsonPath("$[0].kind").value("쪽지"));
    }

    /**
     * 이미 읽은 것을 다시 눌러도 안전하다 — 쪽지함은 여러 탭에서 열려 있을 수 있어
     * 같은 요청이 두 번 오는 것이 <b>정상 경로</b>다. 두 번째는 {@code read=false}.
     */
    @Test
    public void 읽음처리는_두_번_눌러도_안전하다() throws Exception {
        JsonNode sent = send("{\"recipient\":\"영업팀\",\"content\":\"확인\"}");
        String id = sent.path("notification_id").asText();

        assertTrue("처음 읽음 처리는 true 여야 한다", readFlag(id));
        assertFalse("두 번째는 false — 오류가 아니다", readFlag(id));
    }

    @Test
    public void 없는_쪽지를_읽음처리하면_404다() throws Exception {
        mockMvc.perform(post("/notifications/ntf-00000000/read"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("notification not found"));
    }

    /** 수신자가 없으면 아무에게도 안 가는 쪽지가 남는다 — 400 으로 막는다. */
    @Test
    public void 수신자가_비면_400이다() throws Exception {
        mockMvc.perform(post("/notifications")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"recipient\":\"  \",\"content\":\"본문\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").exists());
    }

    // ── 도구 ──────────────────────────────────────────────────────────

    private JsonNode send(String body) throws Exception {
        return call(post("/notifications")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body), 201);
    }

    private boolean readFlag(String notificationId) throws Exception {
        return call(post("/notifications/" + notificationId + "/read"), 200)
                .path("read").asBoolean();
    }

    /** ⚠️ 인코딩을 명시하지 않으면 한글이 깨져 비교가 통째로 어긋난다. */
    private JsonNode call(MockHttpServletRequestBuilder request, int expected) throws Exception {
        MockHttpServletResponse response = mockMvc.perform(request)
                .andExpect(status().is(expected))
                .andReturn().getResponse();
        response.setCharacterEncoding("UTF-8");
        return json.readTree(response.getContentAsString());
    }
}
