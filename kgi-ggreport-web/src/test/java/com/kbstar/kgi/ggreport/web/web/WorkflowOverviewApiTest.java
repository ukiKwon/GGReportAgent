package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 제안서 진행 현황 목록(GET /workflow/overview). 시드: 영업팀 김영업 {@code 3918264}(workflow 조회 가능),
 * 영업부장 박영업 {@code 2674805}(역할 기본에서 workflow 꺼짐). 기관은 시드 25건 + 직접 심는 실행·공고·담당.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class WorkflowOverviewApiTest {

    private static final String MEMBER = "3918264";
    private static final String HEAD = "2674805";
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcTemplate jdbc;

    private JsonNode overview(String emp, int expect) throws Exception {
        org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder b = get("/workflow/overview");
        if (emp != null) {
            b = b.header(Actor.HEADER, emp);
        }
        String text = mockMvc.perform(b).andExpect(status().is(expect)).andReturn().getResponse()
                .getContentAsString(StandardCharsets.UTF_8);
        return text.isEmpty() ? null : JSON.readTree(text);
    }

    private JsonNode item(JsonNode root, String id) {
        for (JsonNode n : root.get("items")) {
            if (id.equals(n.get("institution_id").asText())) {
                return n;
            }
        }
        throw new AssertionError("institution not found: " + id);
    }

    private void bid(String id, String inst, String status) {
        jdbc.update("INSERT INTO BID_CASES (BID_CASE_ID, INSTITUTION_ID, PARTICIPATION_STATUS) VALUES (?,?,?)",
                id, inst, status);
    }

    private void task(String id, String bid, String team, String assignee) {
        jdbc.update("INSERT INTO TASKS (TASK_ID, BID_CASE_ID, TEAM, ASSIGNEE) VALUES (?,?,?,?)",
                id, bid, team, assignee);
    }

    private void run(String id, String inst, String status, String gate, String created) {
        boolean active = "RUNNING".equals(status) || "PENDING_APPROVAL".equals(status);
        jdbc.update("INSERT INTO ORCH_RUN (RUN_ID, INSTITUTION_ID, STATUS, CURRENT_NODE, PENDING_GATE,"
                        + " ACTIVE_INSTITUTION_ID, CREATED_AT, UPDATED_AT) VALUES (?,?,?,?,?,?,?,?)",
                id, inst, status, "rfi", gate, active ? inst : null, created, created);
    }

    @Test
    public void 로그인이_없으면_401_권한이_없거나_미등록이면_403() throws Exception {
        overview(null, 401);
        overview(HEAD, 403);            // 영업부장은 역할 기본에서 workflow 조회가 꺼져 있다
        overview("9999999", 403);       // 등록되지 않은 사번
    }

    @Test
    public void 실행이_없는_기관은_NONE_이고_키가_모두_있다() throws Exception {
        JsonNode r = overview(MEMBER, 200);
        assertEquals(25, r.get("items").size());
        JsonNode d = item(r, "dobong");
        for (String k : new String[]{"institution_id", "name", "region", "region_code", "stage", "stage_label",
                "state", "gate", "done", "bid_count", "assignees", "updated_at"}) {
            assertTrue("키 누락: " + k, d.has(k));
        }
        assertEquals("NONE", d.get("state").asText());
        assertTrue(d.get("gate").isNull());
        assertFalse(d.get("done").asBoolean());
        assertEquals(0, d.get("bid_count").asInt());
        assertEquals(0, d.get("assignees").size());
        assertTrue(d.get("updated_at").isNull());
        // institution_id 오름차순
        String prev = "";
        for (JsonNode n : r.get("items")) {
            String id = n.get("institution_id").asText();
            assertTrue(id + " 정렬", prev.compareTo(id) <= 0);
            prev = id;
        }
    }

    @Test
    public void 마지막_실행의_상태와_결재_대기_게이트가_나온다() throws Exception {
        run("r1", "dobong", "PENDING_APPROVAL", "기획승인", "2026-10-30T01:00:00+00:00");
        JsonNode d = item(overview(MEMBER, 200), "dobong");
        assertEquals("PENDING_APPROVAL", d.get("state").asText());
        assertEquals("기획승인", d.get("gate").asText());
        assertEquals("2026-10-30T01:00:00+00:00", d.get("updated_at").asText());
    }

    @Test
    public void 끝난_실행의_게이트는_보이지_않고_새_실행이_이긴다() throws Exception {
        run("r1", "dobong", "PENDING_APPROVAL", "기획승인", "2026-10-30T01:00:00+00:00");
        jdbc.update("UPDATE ORCH_RUN SET STATUS='FAILED', ACTIVE_INSTITUTION_ID=NULL WHERE RUN_ID='r1'");
        run("r2", "dobong", "DONE", "기획승인", "2026-10-30T02:00:00+00:00");   // 끝났지만 게이트 값이 남아 있다
        JsonNode d = item(overview(MEMBER, 200), "dobong");
        assertEquals("DONE", d.get("state").asText());
        assertTrue(d.get("gate").isNull());
    }

    @Test
    public void 같은_시각의_두_실행은_RUN_ID_가_큰_쪽이_이긴다() throws Exception {
        run("r-a", "dobong", "DONE", null, "2026-10-30T01:00:00+00:00");
        run("r-b", "dobong", "FAILED", null, "2026-10-30T01:00:00+00:00");
        assertEquals("FAILED", item(overview(MEMBER, 200), "dobong").get("state").asText());
    }

    @Test
    public void 완료는_최신_공고가_제출완료일_때만이고_공고_건수가_나온다() throws Exception {
        // 데이터를 모두 심은 뒤 한 번만 조회한다 — 테스트 트랜잭션 안에서는 MyBatis 1차 캐시가 살아 있어
        // JdbcTemplate 로 넣은 행이 같은 세션의 두 번째 조회에 반영되지 않는다(요청마다 세션이 다른 운영과 무관).
        bid("b1", "dobong", "검토중");
        bid("b2", "dobong", "제출완료");           // 나중에 넣은 것이 SEQ_NO 가 크다 = 최신
        bid("b3", "nowon", "제출완료");
        bid("b4", "nowon", "검토중");              // 최신이 검토중이면 완료가 아니다
        JsonNode r = overview(MEMBER, 200);
        JsonNode d = item(r, "dobong");
        assertEquals(2, d.get("bid_count").asInt());
        assertTrue(d.get("done").asBoolean());
        JsonNode n = item(r, "nowon");
        assertEquals(2, n.get("bid_count").asInt());
        assertFalse(n.get("done").asBoolean());
    }

    @Test
    public void 담당자는_중복과_빈_값을_빼고_mine_은_이름이나_사번이_일치하는_기관이다() throws Exception {
        bid("b1", "dobong", "검토중");
        bid("b2", "dobong", "검토중");
        bid("b3", "nowon", "검토중");
        task("t1", "b1", "팀A", "김영업");
        task("t2", "b2", "팀B", "김영업");       // 같은 기관의 다른 공고에도 같은 사람 → 한 번만
        task("t3", "b1", "팀C", "이영업");
        task("t4", "b2", "팀D", "");            // 빈 값은 뺀다
        task("t5", "b3", "팀A", MEMBER);        // 사번으로 심은 담당도 본인
        JsonNode r = overview(MEMBER, 200);
        JsonNode d = item(r, "dobong");
        assertEquals(2, d.get("assignees").size());
        assertEquals("김영업", d.get("assignees").get(0).asText());
        assertEquals("이영업", d.get("assignees").get(1).asText());
        assertEquals(2, r.get("mine").size());
        assertEquals("dobong", r.get("mine").get(0).asText());
        assertEquals("nowon", r.get("mine").get(1).asText());
        // 담당자로 심지 않은 사용자(예산팀 정예산)는 mine 이 비어 있다 — 같은 트랜잭션이라 캐시된 결과의 mine 계산만 다시 한다
        assertEquals(0, overview("1857403", 200).get("mine").size());
    }

    @Test
    public void 시도_이름은_시군구코드_앞_두자리에서_온다() throws Exception {
        jdbc.update("UPDATE INSTITUTIONS SET REGION_CODE='11140' WHERE INSTITUTION_ID='dobong'");
        jdbc.update("UPDATE INSTITUTIONS SET REGION_CODE='99999' WHERE INSTITUTION_ID='nowon'");
        JsonNode r = overview(MEMBER, 200);
        assertEquals("서울", item(r, "dobong").get("region").asText());
        assertEquals("11140", item(r, "dobong").get("region_code").asText());
        assertTrue(item(r, "nowon").get("region").isNull());          // 모르는 코드
    }

    @Test
    public void 단계_이름은_1에서_9까지_나온다() throws Exception {
        jdbc.update("UPDATE INSTITUTIONS SET STAGE=1 WHERE INSTITUTION_ID='dobong'");
        jdbc.update("UPDATE INSTITUTIONS SET STAGE=5 WHERE INSTITUTION_ID='nowon'");
        JsonNode r = overview(MEMBER, 200);
        assertEquals("입찰현황 파악", item(r, "dobong").get("stage_label").asText());
        assertEquals("제안서 기획", item(r, "nowon").get("stage_label").asText());
    }
}
