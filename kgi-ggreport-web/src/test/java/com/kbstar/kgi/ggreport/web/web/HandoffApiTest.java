package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 이관 패키지 {@code GET /tasks/{id}/handoff} — Task 5B.1 의 마지막 조각.
 *
 * <p>⚠️ <b>{@code @Transactional} 로 롤백한다.</b> 여기서 만드는 공고·작업이 남으면
 * {@code EmptyStateApiTest}(빈 배열 계약)와 정합성 골든이 실행 순서에 따라 깨진다 —
 * {@code GoldenWriteScenarioTest} 와 같은 이유다.
 *
 * <p>골든에 이 경로의 응답이 없어(캡처 제외) <b>계약 테스트</b>로 고정한다. 특히
 * 아래 둘은 틀려도 화면이 조용히 이상해지는 자리라 명시적으로 본다:
 * 자기 팀 제외 · 에이전트 단계 제외.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class HandoffApiTest {

    @Autowired
    private MockMvc mockMvc;

    private final ObjectMapper json = new ObjectMapper();

    @Test
    public void 없는_작업의_이관패키지는_404다() throws Exception {
        mockMvc.perform(get("/tasks/task-00000000/handoff"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("task not found"));
    }

    @Test
    public void 이관패키지는_자기팀을_빼고_나머지_작성팀을_싣는다() throws Exception {
        List<JsonNode> tasks = 참여확정까지_진행한다();
        JsonNode mine = tasks.get(0);
        String myTeam = mine.path("team").asText();

        JsonNode handoff = handoffOf(mine.path("task_id").asText());

        assertEquals("노원구", handoff.path("institution_name").asText());
        assertNotNull(handoff.path("institution_id").asText(null));

        List<String> teams = new ArrayList<>();
        for (JsonNode team : handoff.path("teams")) {
            teams.add(team.path("team").asText());
        }
        assertFalse("자기 팀이 들어가면 안 된다 — 자기가 쓴 것을 받을 이유가 없다",
                teams.contains(myTeam));
        assertEquals("나머지 작성 2팀이 와야 한다", 2, teams.size());
        for (String agentTeam : new String[]{"RFI분석", "취합", "검증"}) {
            assertFalse("에이전트 단계는 사람 작성물이 없어 빈 카드가 된다: " + agentTeam,
                    teams.contains(agentTeam));
        }
    }

    /**
     * 문의처는 팀명(`영업`)이 아니라 <b>쪽지 수신자 이름</b>(`영업팀`)이다.
     * 화면이 이 변환을 복제하면 계정 전환기와 답이 갈라진다.
     */
    @Test
    public void 팀마다_문의처와_첨부목록이_실린다() throws Exception {
        List<JsonNode> tasks = 참여확정까지_진행한다();
        JsonNode handoff = handoffOf(tasks.get(0).path("task_id").asText());

        for (JsonNode team : handoff.path("teams")) {
            String name = team.path("team").asText();
            assertEquals(name + " 의 문의처가 쪽지 수신자 이름이 아니다",
                    name + "팀", team.path("contact").asText());
            assertTrue(name + " 의 첨부 목록이 배열이 아니다", team.path("files").isArray());
            assertNotNull(name + " 의 task_id 가 없다 — 화면이 첨부를 못 내려받는다",
                    team.path("task_id").asText(null));
        }
    }

    /**
     * {@code waiting_on} 은 디자이너 제출을 막는 근거이자 <b>"왜 제출할 수 없는지"</b>를
     * 설명하는 문구의 재료다. 결재 전에는 팀이 남아 있어야 한다.
     */
    @Test
    public void 결재_전에는_waiting_on에_팀이_남는다() throws Exception {
        List<JsonNode> tasks = 참여확정까지_진행한다();
        JsonNode handoff = handoffOf(tasks.get(0).path("task_id").asText());

        List<String> waiting = new ArrayList<>();
        for (JsonNode team : handoff.path("waiting_on")) {
            waiting.add(team.asText());
        }
        assertEquals("아직 아무도 결재를 안 받았으므로 실린 2팀이 그대로 남는다",
                2, waiting.size());

        for (JsonNode team : handoff.path("teams")) {
            assertTrue(team.path("team").asText() + " 이 working 이 아니다",
                    team.path("working").asBoolean());
        }
    }

    /** 산출물 자리는 <b>없어도 키가 있어야</b> 한다 — 화면이 유무로 분기하지 않게. */
    @Test
    public void 산출물이_아직_없어도_키는_온다() throws Exception {
        List<JsonNode> tasks = 참여확정까지_진행한다();
        JsonNode handoff = handoffOf(tasks.get(0).path("task_id").asText());

        assertTrue("scoring 키가 없다", handoff.has("scoring"));
        assertTrue("coverage 키가 없다", handoff.has("coverage"));
        assertTrue("pptx_path 키가 없다", handoff.has("pptx_path"));
        assertTrue("stage 키가 없다", handoff.has("stage"));
    }

    // ── 준비 ──────────────────────────────────────────────────────────

    /**
     * 공고 생성 → 참여결정 3단. 그 순간 팀별 작업 3건이 생긴다.
     *
     * <p>본문 모양은 골든 {@code 10}~{@code 13} 에서 그대로 가져왔다 —
     * {@code {tier, role, by, choice}} 다. 손으로 지어내면 400 이 난다(실제로 겪었다).
     */
    private List<JsonNode> 참여확정까지_진행한다() throws Exception {
        String body = json.createObjectNode()
                .put("institution_id", "nowon")
                .put("title", "이관 패키지 계약 테스트용 입찰 건")
                .toString();
        JsonNode created = call(post("/bidcases")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .header("X-User-Id", "dave"));
        String bidCaseId = created.path("bid_case_id").asText();

        JsonNode confirmed = null;
        for (String[] step : new String[][]{{"1", "alice"}, {"2", "bob"}, {"3", "carol"}}) {
            String decision = json.createObjectNode()
                    .put("tier", Integer.parseInt(step[0]))
                    .put("role", "영업팀")
                    .put("by", step[1])
                    .put("choice", "참여")
                    .toString();
            confirmed = call(post("/bidcases/" + bidCaseId + "/participation-decisions")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(decision)
                    .header("X-User-Id", step[1]));
        }
        assertEquals("참여확정이 아니다", "참여확정",
                confirmed.path("participation_status").asText());

        List<JsonNode> tasks = new ArrayList<>();
        for (JsonNode task : confirmed.path("tasks")) {
            tasks.add(task);
        }
        assertEquals("팀별 작업이 3건이 아니다", 3, tasks.size());
        return Collections.unmodifiableList(tasks);
    }

    private JsonNode handoffOf(String taskId) throws Exception {
        return call(get("/tasks/" + taskId + "/handoff"));
    }

    /**
     * ⚠️ <b>인코딩을 명시하지 않으면 한글이 깨진다</b> — {@code MockHttpServletResponse}
     * 의 기본 문자셋은 UTF-8 이 아니다. 그러면 실패 메시지가
     * {@code expected:<참여확정> but was:<ì°¸ì¬…>} 로 나와, 실제로는 잘 동작하는데
     * 계약이 틀린 것처럼 보인다({@code GoldenWriteScenarioTest}·{@code GoldenRunner} 와
     * 같은 처리다).
     */
    private JsonNode call(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder
                                  request) throws Exception {
        org.springframework.mock.web.MockHttpServletResponse response =
                mockMvc.perform(request)
                        .andExpect(status().is2xxSuccessful())
                        .andReturn().getResponse();
        response.setCharacterEncoding("UTF-8");
        return json.readTree(response.getContentAsString());
    }
}
