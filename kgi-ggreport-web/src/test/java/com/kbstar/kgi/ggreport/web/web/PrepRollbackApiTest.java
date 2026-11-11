package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.support.Times;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * NEXT 70 후속 — 승인 후처리가 409 로 끝났을 때 앞서 쓴 것이 함께 되돌아가는지(qa §6-7·8: NOMINEE_CHANGED·APPROVER_ROLE_MISMATCH).
 *
 * <p>⚠️ 일부러 {@code @Transactional} 을 붙이지 않는다 — 테스트 트랜잭션이 서비스 트랜잭션을 삼키면 롤백 여부를 볼 수 없다
 * ({@link InboxTxRollbackTest} 와 같은 방식). 대신 직접 만든 행과 바꾼 사용자 행을 앞뒤로 되돌린다:
 * 이 테스트가 만든 입찰 건(BID_CASES·BID_PREP*·BID_ASSIGN*)·결재 요청·접근 이력·쪽지, 그리고 USERS 의 역할·상태.
 */
@RunWith(SpringRunner.class)
@AppTest
public class PrepRollbackApiTest {

    private static final String LEAD = "5047192";
    private static final String MEMBER = "3918264";
    private static final String MEMBER2 = "3361829";
    private static final String INST = "nowon";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    private final ObjectMapper om = new ObjectMapper();

    private final List<String> bids = new ArrayList<>();
    private final List<Long> reqs = new ArrayList<>();
    private long accessLogBase;
    private String startedAt;
    private String memberRole;
    private String member2Status;

    @Before
    public void 앞정리() {
        accessLogBase = jdbc.queryForObject("SELECT COALESCE(MAX(LOG_ID), 0) FROM ACCESS_LOG", Long.class);
        startedAt = Times.nowIso();
        memberRole = jdbc.queryForObject("SELECT ROLE FROM USERS WHERE EMP_NO=?", String.class, MEMBER);
        member2Status = jdbc.queryForObject("SELECT STATUS FROM USERS WHERE EMP_NO=?", String.class, MEMBER2);
    }

    @After
    public void 뒤정리() {
        jdbc.update("UPDATE USERS SET ROLE=? WHERE EMP_NO=?", memberRole, MEMBER);
        jdbc.update("UPDATE USERS SET STATUS=? WHERE EMP_NO=?", member2Status, MEMBER2);
        for (Long id : reqs) {
            jdbc.update("DELETE FROM APPROVAL_STEP WHERE REQ_ID=?", id);
            jdbc.update("DELETE FROM APPROVAL_REQUEST WHERE REQ_ID=?", id);
        }
        for (String b : bids) {
            jdbc.update("DELETE FROM BID_PREP_TASK WHERE BID_CASE_ID=?", b);
            jdbc.update("DELETE FROM BID_PREP_LOG WHERE BID_CASE_ID=?", b);
            jdbc.update("DELETE FROM BID_PREP_ACT WHERE BID_CASE_ID=?", b);
            jdbc.update("DELETE FROM BID_PREP WHERE BID_CASE_ID=?", b);
            jdbc.update("DELETE FROM BID_ASSIGN_LOG WHERE BID_CASE_ID=?", b);
            jdbc.update("DELETE FROM BID_ASSIGNMENT WHERE BID_CASE_ID=?", b);
            jdbc.update("DELETE FROM BID_ASSIGN_CASE WHERE BID_CASE_ID=?", b);
            jdbc.update("DELETE FROM TASKS WHERE BID_CASE_ID=?", b);
            jdbc.update("DELETE FROM BID_CASES WHERE BID_CASE_ID=?", b);
        }
        jdbc.update("DELETE FROM NOTIFICATIONS WHERE CREATED_AT >= ?", startedAt);
        jdbc.update("DELETE FROM ACCESS_LOG WHERE LOG_ID > ?", accessLogBase);
    }

    private JsonNode json(MvcResult r) throws Exception {
        return om.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private MvcResult postJson(String path, String emp, String body) throws Exception {
        return mockMvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body).header("X-Emp-No", emp)).andReturn();
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    /** MEMBER 가 확정하고 MEMBER2 를 지명해 개설을 신청한 상태 — 반환값은 요청 번호, 입찰 건은 bids 에 기록한다. */
    private long pendingOpen() throws Exception {
        MvcResult c = postJson("/preps", MEMBER, "{\"institution_id\":\"" + INST + "\"}");
        assertEquals(c.getResponse().getContentAsString(), 201, c.getResponse().getStatus());
        String bid = json(c).path("bid_case_id").asText();
        bids.add(bid);
        MvcResult o = postJson("/bidcases/" + bid + "/prep/open-requests", MEMBER, "{\"emp_nos\":[\"" + MEMBER2 + "\"]}");
        assertEquals(o.getResponse().getContentAsString(), 201, o.getResponse().getStatus());
        long req = json(o).path("req_id").asLong();
        reqs.add(req);
        assertFalse(bid.isEmpty());
        return req;
    }

    private String bidOf(long req) {
        return jdbc.queryForObject("SELECT BID_CASE_ID FROM BID_PREP WHERE OPEN_REQ_ID=?", String.class, req);
    }

    @Test
    public void 상신_뒤_지명자가_비활성이면_승인은_409_NOMINEE_CHANGED이고_배정_개설_결재가_모두_되돌아간다() throws Exception {
        long req = pendingOpen();
        String bid = bidOf(req);
        jdbc.update("UPDATE USERS SET STATUS='LOCKED' WHERE EMP_NO=?", MEMBER2);

        MvcResult r = postJson("/approval-requests/" + req + "/decide", LEAD, "{\"decision\":\"APPROVE\",\"comment\":null}");

        assertEquals(r.getResponse().getContentAsString(), 409, r.getResponse().getStatus());
        assertEquals("NOMINEE_CHANGED", json(r).path("detail").path("code").asText());
        assertEquals("OPEN_PENDING", jdbc.queryForObject("SELECT STATE_CD FROM BID_PREP WHERE BID_CASE_ID=?", String.class, bid));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=?", bid));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGN_CASE WHERE BID_CASE_ID=?", bid));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP_TASK WHERE BID_CASE_ID=?", bid));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='OPEN_APPROVE'", bid));
        assertEquals("승인이 되돌아가 요청은 그대로 진행 중이어야 한다", "PENDING",
                jdbc.queryForObject("SELECT STATUS FROM APPROVAL_REQUEST WHERE REQ_ID=?", String.class, req));
        assertEquals("결재 단계도 그대로 대기", 0,
                count("SELECT COUNT(*) FROM APPROVAL_STEP WHERE REQ_ID=? AND STATUS <> 'PENDING'", req));
        assertEquals("승인 성공 감사 줄은 결재와 함께 되돌아간다", 0,
                count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='OPEN_APPROVE' AND OUTCOME='OK'", bid));
        assertEquals("실패 시도는 따로 한 줄", 1,
                count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='OPEN_APPROVE' AND OUTCOME='BLOCKED'"
                        + " AND ACTOR_EMP_NO=? AND STATE_CD='OPEN_PENDING' AND SCREEN_ID='UNKNOWN'", bid, LEAD));
    }

    @Test
    public void 상신_뒤_신청자가_영업팀장이_되면_영업팀장의_승인은_거절되고_아무것도_바뀌지_않는다() throws Exception {
        long req = pendingOpen();
        String bid = bidOf(req);
        String leadRole = jdbc.queryForObject("SELECT ROLE FROM USERS WHERE EMP_NO=?", String.class, LEAD);
        jdbc.update("UPDATE USERS SET ROLE=? WHERE EMP_NO=?", leadRole, MEMBER);   // 신청자 역할이 팀장으로 바뀐 상황(뒤정리가 되돌린다)

        MvcResult r = postJson("/approval-requests/" + req + "/decide", LEAD, "{\"decision\":\"APPROVE\",\"comment\":null}");

        // 결재 자격 검사(같은 직급끼리는 결재 불가)가 사전준비 후처리보다 먼저 403으로 막는다 — 어느 쪽이든 승인이 나지 않으면 된다.
        assertEquals(r.getResponse().getContentAsString(), 403, r.getResponse().getStatus());
        assertEquals("OPEN_PENDING", jdbc.queryForObject("SELECT STATE_CD FROM BID_PREP WHERE BID_CASE_ID=?", String.class, bid));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=?", bid));
        assertEquals("PENDING", jdbc.queryForObject("SELECT STATUS FROM APPROVAL_REQUEST WHERE REQ_ID=?", String.class, req));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='OPEN_APPROVE' AND OUTCOME='DENIED' AND ACTOR_EMP_NO=?", bid, LEAD));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='OPEN_APPROVE' AND OUTCOME='OK'", bid));
    }
}
