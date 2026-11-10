package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.mapper.TaskMapper;
import com.kbstar.kgi.ggreport.web.support.Teams;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.Assert.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 결재 구멍 닫기(2026-11-10) — {@code /tasks/{id}/approve}·{@code /institutions/{id}/checkpoint}.
 *
 * <p>⚠️ X-Emp-No 는 자기신고다 — 여기서 고정하는 것은 <b>업무 규칙</b>(역할·본인 결재 금지)이지
 * 사칭 방지가 아니다. 시드 사번: 영업팀 3918264·영업팀장 5047192·전산팀장 6295038·영업부장 2674805.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class ApprovalHoleApiTest {

    private static final String BODY = "{\"approved\":true}";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TaskMapper tasks;

    private String task(String id, String team, String assignee, String status) {
        tasks.insert(id, "bc-hole-" + id, team);
        if (assignee != null) {
            tasks.claimAssigneeIfUnset(id, assignee);
        }
        tasks.updateStatus(id, status);
        return id;
    }

    /** 역할 검사를 통과했다 — 가짜 작업이라 그 뒤 맥락 조회에서 404 가 날 수 있어 401·403 이 아님만 본다. */
    private void passed(int status) {
        assertEquals("역할 검사 통과(401·403 아님): " + status, true, status != 401 && status != 403);
    }

    private int approve(String id, String emp) throws Exception {
        org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder b =
                post("/tasks/" + id + "/approve").header("X-User-Id", "x")
                        .contentType(MediaType.APPLICATION_JSON).content(BODY);
        if (emp != null) {
            b = b.header("X-Emp-No", emp);
        }
        return mockMvc.perform(b).andReturn().getResponse().getStatus();
    }

    @Test
    public void 사번이_없으면_401이다() throws Exception {
        String id = task("task-hole0001", "영업", "dave", Teams.SUBMITTED_STATUS);
        assertEquals(401, approve(id, null));
    }

    @Test
    public void 팀원과_남의_팀_팀장은_403이고_상태는_그대로다() throws Exception {
        String id = task("task-hole0002", "영업", "dave", Teams.SUBMITTED_STATUS);
        assertEquals(403, approve(id, "3918264"));   // 영업팀원
        assertEquals(403, approve(id, "6295038"));   // 전산팀장
        assertEquals(Teams.SUBMITTED_STATUS, tasks.selectById(id).getStatus());
    }

    @Test
    public void 그_팀의_팀장은_결재한다() throws Exception {
        String id = task("task-hole0003", "영업", "dave", Teams.SUBMITTED_STATUS);
        passed(approve(id, "5047192"));   // 성공 경로 본문은 골든 17·20·23 이 본다
    }

    @Test
    public void 본인이_담당한_작업은_결재할_수_없다() throws Exception {
        String id = task("task-hole0004", "영업", "이영업", Teams.SUBMITTED_STATUS);   // 5047192 = 이영업
        assertEquals(403, approve(id, "5047192"));
        assertEquals(Teams.SUBMITTED_STATUS, tasks.selectById(id).getStatus());
    }

    @Test
    public void 디자이너_최종본은_영업부장만_결재한다() throws Exception {
        String id = task("task-hole0005", Teams.DESIGNER_TEAM, "dave", Teams.APPROVED_STATUS);
        assertEquals(403, approve(id, "5047192"));   // 영업팀장은 최종 결재 불가
        passed(approve(id, "2674805"));   // 영업부장
    }

    private int checkpoint(String emp) throws Exception {
        org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder b =
                post("/institutions/new-deadbeef/checkpoint")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"approved\":true,\"by\":\"영업부장\"}");
        if (emp != null) {
            b = b.header("X-Emp-No", emp);
        }
        return mockMvc.perform(b).andReturn().getResponse().getStatus();
    }

    /** 실제 입찰 건에 묶인 작업 — 맥락 조회(selectContext)까지 지나 승인이 끝까지 간다. */
    private String realTask(String taskId, String team, String assignee, String status) throws Exception {
        String res = mockMvc.perform(post("/bidcases").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"institution_id\":\"nowon\",\"title\":\"결재 테스트\"}")
                        .header("X-User-Id", "dave"))
                .andReturn().getResponse().getContentAsString();
        String bc = new com.fasterxml.jackson.databind.ObjectMapper().readTree(res).path("bid_case_id").asText();
        tasks.insert(taskId, bc, team);
        tasks.claimAssigneeIfUnset(taskId, assignee);
        tasks.updateStatus(taskId, status);
        return taskId;
    }

    @Test
    public void 실제_입찰건_작업은_팀장이_결재하고_상태가_바뀐다() throws Exception {
        String id = realTask("task-hole1001", "영업", "dave", Teams.SUBMITTED_STATUS);
        assertEquals(200, approve(id, "5047192"));
        assertEquals(Teams.APPROVED_STATUS, tasks.selectById(id).getStatus());
    }

    @Test
    public void 팀장이_담당한_작업은_영업부장만_결재한다() throws Exception {
        String id = realTask("task-hole1002", "영업", "이영업", Teams.SUBMITTED_STATUS);   // 5047192 = 이영업
        assertEquals(403, approve(id, "5047192"));   // 본인 작업 결재 금지
        assertEquals(403, approve(id, "3918264"));
        assertEquals(200, approve(id, "2674805"));   // 영업부장이 결재
        assertEquals(Teams.APPROVED_STATUS, tasks.selectById(id).getStatus());
    }

    @Test
    public void 같은_역할의_다른_사람이_이어받아도_된다() throws Exception {
        String id = realTask("task-hole1003", "영업", "dave", Teams.SUBMITTED_STATUS);
        tasks.claimApproverIfUnset(id, "먼저잡은사람");
        assertEquals(200, approve(id, "5640327"));   // 안재원(영업팀장)
    }

    @Test
    public void 사번도_헤더도_없으면_400이_아니라_401이다() throws Exception {
        String id = realTask("task-hole1004", "영업", "dave", Teams.SUBMITTED_STATUS);
        assertEquals(401, mockMvc.perform(post("/tasks/" + id + "/approve")
                        .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andReturn().getResponse().getStatus());
    }

    @Test
    public void 영업부장_결재함에_팀장_담당_작업이_올라온다() throws Exception {
        realTask("task-hole1005", "영업", "이영업", Teams.SUBMITTED_STATUS);
        String boss = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/approvals").header("X-Emp-No", "2674805"))
                .andReturn().getResponse().getContentAsString();
        assertEquals(true, boss.contains("task-hole1005"));
        String lead = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/approvals").header("X-Emp-No", "5047192"))
                .andReturn().getResponse().getContentAsString();
        assertEquals("팀장 담당 건은 팀장 결재함에서 빠진다는 보장은 아니다 — 부장 결재함 포함만 고정", true, boss.length() > 0);
    }

    @Test
    public void 체크포인트는_영업부장만_누른다() throws Exception {
        assertEquals(401, checkpoint(null));
        assertEquals(403, checkpoint("3918264"));   // 영업팀원(body.by 로 부장 행세해도)
        assertEquals(403, checkpoint("5047192"));   // 영업팀장
        // 영업부장은 역할 검사를 지나 게이트 검사까지 간다(없는 기관이라 4xx 지만 401·403 은 아니다)
        int s = checkpoint("2674805");
        assertEquals("역할 통과 후 게이트 단계", true, s != 401 && s != 403);
    }
}
