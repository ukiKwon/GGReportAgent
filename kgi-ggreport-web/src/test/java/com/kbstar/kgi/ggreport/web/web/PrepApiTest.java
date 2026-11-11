package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.support.LegacyFlowSwitch;
import com.kbstar.kgi.ggreport.web.support.Times;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * NEXT 70 제안서 사전준비 서버 1차 — 제안 확정 → 개설 신청·승인 → 과제 체크 → 기획승인 → 작성하기, 중단, 목록.
 * 시드: 영업팀 김영업 3918264·윤서준 3361829, 영업팀장 이영업 5047192·안재원 5640327, 영업부장 박영업 2674805, 관리자 8203417, 디자이너 7130526.
 * ⚠️ X-Emp-No 는 자기신고다 — 여기서 고정하는 것은 업무 규칙이지 사칭 방지가 아니다.
 * 테스트 트랜잭션이 하나라 서비스가 던진 409 앞에서 쓴 행은 롤백되지 않는다 — 실패 케이스는 그 앞에서 쓴 것이 없는 순서로만 단언한다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class PrepApiTest {

    private static final String LEAD = "5047192";
    private static final String LEAD2 = "5640327";
    private static final String HEAD = "2674805";
    private static final String MEMBER = "3918264";
    private static final String MEMBER2 = "3361829";
    private static final String DESIGNER = "7130526";
    private static final String ADMIN = "8203417";
    private static final String INST = "nowon";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private LegacyFlowSwitch legacy;
    private final ObjectMapper om = new ObjectMapper();

    // ── 도우미 ───────────────────────────────────────────────────────

    private static MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder b, String emp) {
        return emp == null ? b : b.header("X-Emp-No", emp);
    }

    private JsonNode json(MvcResult r) throws Exception {
        return om.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private static String arr(String... x) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < x.length; i++) {
            sb.append(i == 0 ? "" : ",").append('"').append(x[i]).append('"');
        }
        return sb.append("]").toString();
    }

    private MvcResult postJson(String path, String emp, String body) throws Exception {
        return mockMvc.perform(as(post(path).contentType(MediaType.APPLICATION_JSON).content(body), emp)).andReturn();
    }

    private MvcResult getAs(String path, String emp) throws Exception {
        return mockMvc.perform(as(get(path), emp)).andReturn();
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private String state(String bid) {
        return jdbc.queryForObject("SELECT STATE_CD FROM BID_PREP WHERE BID_CASE_ID=?", String.class, bid);
    }

    /** JdbcTemplate 으로 값을 바꾼 뒤 MyBatis 1차 캐시를 비운다(MyBatis 쓰기 한 번). */
    private void flushCache() throws Exception {
        mockMvc.perform(post("/bidcases").contentType(MediaType.APPLICATION_JSON)
                .content("{\"institution_id\":\"dobong\"}").header("X-User-Id", "dave")).andReturn();
    }

    private String confirm(String emp, String inst) throws Exception {
        MvcResult r = postJson("/preps", emp, "{\"institution_id\":\"" + inst + "\"}");
        assertEquals(201, r.getResponse().getStatus());
        assertEquals("CONFIRMED", json(r).path("state_cd").asText());
        String bid = json(r).path("bid_case_id").asText();
        assertFalse(bid.isEmpty());
        return bid;
    }

    private long openReq(String bid, String emp, String... nominees) throws Exception {
        MvcResult r = postJson("/bidcases/" + bid + "/prep/open-requests", emp, "{\"emp_nos\":" + arr(nominees) + "}");
        assertEquals(r.getResponse().getContentAsString(), 201, r.getResponse().getStatus());
        return json(r).path("req_id").asLong();
    }

    private MvcResult decide(String emp, long id, String decision, String comment) throws Exception {
        String body = "{\"decision\":\"" + decision + "\",\"comment\":" + (comment == null ? "null" : "\"" + comment + "\"") + "}";
        return postJson("/approval-requests/" + id + "/decide", emp, body);
    }

    private boolean inInbox(String emp, long id) throws Exception {
        MvcResult r = mockMvc.perform(as(get("/approval-requests").param("box", "inbox"), emp)).andReturn();
        for (JsonNode n : json(r).path("items")) {
            if (n.path("req_id").asLong() == id) {
                return true;
            }
        }
        return false;
    }

    /** 확정(김영업) → 개설 신청(윤서준 지명) → 영업팀장 승인. 담당자는 윤서준이다. */
    private String opened(String inst) throws Exception {
        String bid = confirm(MEMBER, inst);
        long req = openReq(bid, MEMBER, MEMBER2);
        assertEquals(200, decide(LEAD, req, "APPROVE", null).getResponse().getStatus());
        assertEquals("IN_PROGRESS", state(bid));
        return bid;
    }

    /** T1·T2 체크 + T3 확정본 지정 + T5 를 선택 과제로(필수 과제를 모두 끝낸 상태). T5 는 이사회 확정 실물이 있어야 끝나서 테스트에서는 선택으로 둔다. */
    private void makeReady(String bid) throws Exception {
        assertEquals(200, postJson("/bidcases/" + bid + "/prep/tasks/T1/check", MEMBER2, "").getResponse().getStatus());
        assertEquals(200, postJson("/bidcases/" + bid + "/prep/tasks/T2/check", MEMBER2, "").getResponse().getStatus());
        jdbc.update("UPDATE BID_PREP_TASK SET REF_ATTACH_ID = 1, REF_BY = ?, REF_AT = ? WHERE BID_CASE_ID = ? AND TASK_CD = 'T3'",
                MEMBER2, Times.nowIso(), bid);
        jdbc.update("UPDATE BID_PREP_TASK SET KIND_CD = 'OPTIONAL' WHERE BID_CASE_ID = ? AND TASK_CD = 'T5'", bid);
        flushCache();
    }

    private long planReq(String bid, String emp) throws Exception {
        MvcResult r = postJson("/bidcases/" + bid + "/prep/plan-approval-requests", emp, "");
        assertEquals(r.getResponse().getContentAsString(), 201, r.getResponse().getStatus());
        return json(r).path("req_id").asLong();
    }

    // ── 제안 확정 ────────────────────────────────────────────────────

    @Test
    public void 제안_확정은_영업팀만_하고_기관당_활성_건은_하나다() throws Exception {
        assertEquals(401, postJson("/preps", null, "{\"institution_id\":\"" + INST + "\"}").getResponse().getStatus());
        assertEquals(403, postJson("/preps", DESIGNER, "{\"institution_id\":\"" + INST + "\"}").getResponse().getStatus());
        assertEquals(403, postJson("/preps", HEAD, "{\"institution_id\":\"" + INST + "\"}").getResponse().getStatus());
        assertEquals(404, postJson("/preps", MEMBER, "{\"institution_id\":\"no-such-inst\"}").getResponse().getStatus());
        String bid = confirm(MEMBER, INST);
        MvcResult second = postJson("/preps", LEAD, "{\"institution_id\":\"" + INST + "\"}");   // 같은 기관 두 번째 확정
        assertEquals(409, second.getResponse().getStatus());
        assertEquals("PREP_ALREADY_ACTIVE", json(second).path("detail").path("code").asText());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP WHERE INSTITUTION_ID=?", INST));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='CONFIRM'", bid));
    }

    @Test
    public void 확정_취소는_확정한_사람이나_영업팀장만_사유가_필요하고_취소하면_다시_확정할_수_있다() throws Exception {
        String bid = confirm(MEMBER, INST);
        String path = "/bidcases/" + bid + "/prep/unconfirm";
        assertEquals(403, postJson(path, MEMBER2, "{\"reason\":\"사정이 바뀜\"}").getResponse().getStatus());   // 확정자도 팀장도 아님
        assertEquals(400, postJson(path, LEAD, "{\"reason\":\"\"}").getResponse().getStatus());
        assertEquals(422, postJson(path, LEAD, "{\"reason\":\"연락처 010-1234-5678\"}").getResponse().getStatus());
        assertEquals("CONFIRMED", state(bid));
        assertEquals(200, postJson(path, MEMBER, "{\"reason\":\"기관 사정으로 보류\"}").getResponse().getStatus());
        assertEquals("CANCELLED", state(bid));
        String again = confirm(LEAD, INST);   // 취소된 건은 활성이 아니라 새로 확정된다
        assertFalse(again.equals(bid));
    }

    // ── 개설 신청·승인 ───────────────────────────────────────────────

    @Test
    public void 개설_대기_중_지명자는_상세가_404이고_체크는_403이며_배정은_아직_없다() throws Exception {
        String bid = confirm(MEMBER, INST);
        long req = openReq(bid, MEMBER, MEMBER2);
        assertEquals("OPEN_PENDING", state(bid));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=?", bid));   // 승인 전 배정 없음
        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP_TASK WHERE BID_CASE_ID=?", bid));

        MvcResult hidden = getAs("/bidcases/" + bid + "/prep", MEMBER2);
        MvcResult none = getAs("/bidcases/no-such-case/prep", MEMBER2);
        assertEquals(404, hidden.getResponse().getStatus());
        assertEquals(404, none.getResponse().getStatus());
        assertEquals(none.getResponse().getContentAsString(StandardCharsets.UTF_8),
                hidden.getResponse().getContentAsString(StandardCharsets.UTF_8));   // 없는 건과 같은 응답 바이트
        assertEquals(404, getAs("/bidcases/" + bid + "/prep/history", MEMBER2).getResponse().getStatus());
        assertEquals(403, postJson("/bidcases/" + bid + "/prep/tasks/T1/check", MEMBER2, "").getResponse().getStatus());
        // 상세·이력 두 번 숨겼으니 HIDDEN 2행
        assertEquals(2, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTOR_EMP_NO=? AND OUTCOME='HIDDEN'", bid, MEMBER2));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTOR_EMP_NO=? AND ACTION_CD='CHECK' AND OUTCOME='DENIED'", bid, MEMBER2));

        MvcResult head = getAs("/bidcases/" + bid + "/prep", HEAD);   // 영업부장은 개설 대기 상세를 본다
        assertEquals(200, head.getResponse().getStatus());
        assertEquals("OPEN_PENDING", json(head).path("state_cd").asText());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTOR_EMP_NO=? AND ACTION_CD='VIEW' AND OUTCOME='OK'", bid, HEAD));
        assertTrue(inInbox(LEAD, req));
    }

    @Test
    public void 개설_승인_뒤_진행_상태가_되고_지명자가_담당자로_배정되며_과제가_복사된다() throws Exception {
        String bid = opened(INST);
        assertEquals(1, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=? AND EMP_NO=? AND ACTIVE_YN=1", bid, MEMBER2));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_ASSIGN_LOG WHERE BID_CASE_ID=? AND ACTION_CD='ASSIGN' AND REQ_ID IS NOT NULL", bid));
        assertEquals(6, count("SELECT COUNT(*) FROM BID_PREP_TASK WHERE BID_CASE_ID=?", bid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='OPEN_APPROVE'", bid));

        MvcResult r = getAs("/bidcases/" + bid + "/prep", MEMBER2);
        assertEquals(200, r.getResponse().getStatus());
        JsonNode v = json(r);
        assertEquals("IN_PROGRESS", v.path("state_cd").asText());
        assertTrue(v.path("viewer").path("is_assignee").asBoolean());
        assertEquals(6, v.path("tasks").size());
        assertEquals(4, v.path("progress").path("total").asInt());   // T4·T6 은 준비중이라 분모에서 빠진다
        assertEquals(0, v.path("progress").path("done").asInt());
        assertFalse(v.path("plan_approval_ready").asBoolean());
        JsonNode t5 = null;
        for (JsonNode t : v.path("tasks")) {
            if ("T5".equals(t.path("task_cd").asText())) {
                t5 = t;
            }
        }
        assertNotNull(t5);
        assertEquals("LOCKED", t5.path("state").asText());   // T3 이 끝나야 열린다
        assertEquals("T3", t5.path("locked_by").asText());
        // 담당이 아닌 영업팀원은 404, 영업부장은 200
        assertEquals(404, getAs("/bidcases/" + bid + "/prep", MEMBER).getResponse().getStatus());
        assertEquals(200, getAs("/bidcases/" + bid + "/prep", HEAD).getResponse().getStatus());
    }

    @Test
    public void 승인자가_지명자이면_403이고_배정은_생기지_않는다() throws Exception {
        String bid = confirm(MEMBER, INST);
        long req = openReq(bid, MEMBER, MEMBER2);
        // 신청 뒤 지명 목록에 결재자가 끼어든 상황을 만든다(서버 방어 확인 — API 로는 만들 수 없다)
        jdbc.update("UPDATE APPROVAL_REQUEST SET PAYLOAD = ? WHERE REQ_ID = ?",
                "{\"bid_case_id\":\"" + bid + "\",\"nominee_emp_nos\":" + arr(MEMBER2, LEAD) + "}", req);
        flushCache();
        assertEquals(403, decide(LEAD, req, "APPROVE", null).getResponse().getStatus());
        assertEquals("OPEN_PENDING", state(bid));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=?", bid));
    }

    @Test
    public void 팀장이_상신하거나_지명되면_영업부장이_결재한다() throws Exception {
        String bid = confirm(LEAD, INST);
        long req = openReq(bid, LEAD, MEMBER2);   // 팀장 상신
        assertTrue(inInbox(HEAD, req));
        assertFalse(inInbox(LEAD2, req));
        assertEquals(403, decide(LEAD2, req, "APPROVE", null).getResponse().getStatus());   // 다른 팀장은 결재할 수 없다
        assertEquals(200, decide(HEAD, req, "APPROVE", null).getResponse().getStatus());
        assertEquals("IN_PROGRESS", state(bid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=? AND EMP_NO=?", bid, MEMBER2));
    }

    @Test
    public void 팀장을_지명하면_영업부장이_결재한다() throws Exception {
        String bid = confirm(MEMBER, INST);
        long req = openReq(bid, MEMBER, MEMBER2, LEAD2);   // 지명자 중 영업팀장
        assertTrue(inInbox(HEAD, req));
        assertFalse(inInbox(LEAD, req));
        assertEquals(200, decide(HEAD, req, "APPROVE", null).getResponse().getStatus());
        assertEquals(2, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=? AND ACTIVE_YN=1", bid));
    }

    @Test
    public void 개설_신청은_영업팀만_하고_지명은_영업부장_불가_이미_대기_중이면_409() throws Exception {
        String bid = confirm(MEMBER, INST);
        String path = "/bidcases/" + bid + "/prep/open-requests";
        assertEquals(403, postJson(path, DESIGNER, "{\"emp_nos\":" + arr(MEMBER2) + "}").getResponse().getStatus());
        assertEquals(400, postJson(path, MEMBER, "{\"emp_nos\":" + arr(HEAD) + "}").getResponse().getStatus());   // 영업부장 지명 불가
        assertEquals(400, postJson(path, MEMBER, "{\"emp_nos\":[]}").getResponse().getStatus());
        assertEquals(400, postJson(path, MEMBER, "{\"emp_nos\":" + arr(MEMBER2, MEMBER2) + "}").getResponse().getStatus());
        openReq(bid, MEMBER, MEMBER2);
        MvcResult dup = postJson(path, MEMBER, "{\"emp_nos\":" + arr(MEMBER2) + "}");
        assertEquals(409, dup.getResponse().getStatus());
        assertEquals("OPEN_PENDING", json(dup).path("detail").path("code").asText());
        // 대기 중 확정 취소는 먼저 회수하라는 409
        MvcResult un = postJson("/bidcases/" + bid + "/prep/unconfirm", LEAD, "{\"reason\":\"취소\"}");
        assertEquals(409, un.getResponse().getStatus());
        assertEquals("OPEN_PENDING", json(un).path("detail").path("code").asText());
    }

    @Test
    public void 개설_신청_회수와_반려는_확정됨으로_되돌린다() throws Exception {
        String bid = confirm(MEMBER, INST);
        long r1 = openReq(bid, MEMBER, MEMBER2);
        assertEquals(403, postJson("/approval-requests/" + r1 + "/cancel", ADMIN, "").getResponse().getStatus());   // 관리자도 남의 신청은 못 거둔다
        assertEquals(200, postJson("/approval-requests/" + r1 + "/cancel", MEMBER, "").getResponse().getStatus());
        assertEquals("CONFIRMED", state(bid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='OPEN_WITHDRAW'", bid));

        long r2 = openReq(bid, MEMBER, MEMBER2);
        assertEquals(400, decide(LEAD, r2, "REJECT", null).getResponse().getStatus());   // 반려는 의견 필수
        assertEquals(200, decide(LEAD, r2, "REJECT", "지명 재검토").getResponse().getStatus());
        assertEquals("CONFIRMED", state(bid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='OPEN_REJECT'", bid));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=?", bid));
        openReq(bid, MEMBER, MEMBER2);   // 다시 신청할 수 있다
    }

    // ── 과제 체크·기획승인·작성하기 ──────────────────────────────────

    @Test
    public void 체크는_담당자만_직접_체크_과제만_잠긴_과제는_409() throws Exception {
        String bid = opened(INST);
        String base = "/bidcases/" + bid + "/prep/tasks/";
        assertEquals(403, postJson(base + "T1/check", MEMBER, "").getResponse().getStatus());   // 담당 아님
        assertEquals(403, postJson(base + "T1/check", HEAD, "").getResponse().getStatus());     // 영업부장은 읽기 전용
        assertEquals(401, postJson(base + "T1/check", null, "").getResponse().getStatus());
        MvcResult fact = postJson(base + "T3/check", MEMBER2, "");   // 사실 판정 과제
        assertEquals(409, fact.getResponse().getStatus());
        assertEquals("NOT_MANUAL", json(fact).path("detail").path("code").asText());
        assertEquals(404, postJson(base + "T9/check", MEMBER2, "").getResponse().getStatus());
        MvcResult prepairing = postJson(base + "T6/check", MEMBER2, "");   // 준비중(실물 없음)
        assertEquals(409, prepairing.getResponse().getStatus());
        assertEquals("TASK_NOT_AVAILABLE", json(prepairing).path("detail").path("code").asText());

        MvcResult ok = postJson(base + "T1/check", MEMBER2, "");
        assertEquals(200, ok.getResponse().getStatus());
        assertEquals(1, json(ok).path("progress").path("done").asInt());
        assertEquals(409, postJson(base + "T1/check", MEMBER2, "").getResponse().getStatus());   // 이미 체크됨
        assertEquals(200, postJson(base + "T1/uncheck", MEMBER2, "").getResponse().getStatus());
        assertEquals(409, postJson(base + "T1/uncheck", MEMBER2, "").getResponse().getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='TASK_CHECK' AND ACTOR_EMP_NO=?", bid, MEMBER2));
    }

    @Test
    public void 필수_과제가_남아_있으면_기획승인_요청은_409_NOT_READY() throws Exception {
        String bid = opened(INST);
        MvcResult r = postJson("/bidcases/" + bid + "/prep/plan-approval-requests", MEMBER2, "");
        assertEquals(409, r.getResponse().getStatus());
        assertEquals("NOT_READY", json(r).path("detail").path("code").asText());
        String missing = json(r).path("detail").path("missing").toString();
        assertTrue(missing, missing.contains("T1") && missing.contains("T2") && missing.contains("T3") && missing.contains("T5"));
        assertEquals(403, postJson("/bidcases/" + bid + "/prep/plan-approval-requests", MEMBER, "").getResponse().getStatus());
        assertEquals("IN_PROGRESS", state(bid));
    }

    @Test
    public void 기획승인_승인_때_필수_과제를_다시_판정해_어긋나면_409() throws Exception {
        String bid = opened(INST);
        makeReady(bid);
        long req = planReq(bid, MEMBER2);
        assertEquals("APPROVAL_PENDING", state(bid));
        assertTrue(inInbox(HEAD, req));
        // 상신 뒤 T3 확정본 지정이 풀린 상황
        jdbc.update("UPDATE BID_PREP_TASK SET REF_ATTACH_ID = NULL WHERE BID_CASE_ID = ? AND TASK_CD = 'T3'", bid);
        flushCache();
        MvcResult r = decide(HEAD, req, "APPROVE", null);
        assertEquals(409, r.getResponse().getStatus());
        assertEquals("NOT_READY", json(r).path("detail").path("code").asText());
        assertEquals("APPROVAL_PENDING", state(bid));
        assertEquals(0, count("SELECT DONE_YN FROM BID_PREP_TASK WHERE BID_CASE_ID=? AND TASK_CD='T3'", bid));   // 자동 미완료 전환
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='AUTO_UNDONE' AND ACTOR_EMP_NO IS NULL", bid));
    }

    @Test
    public void 기획승인_승인은_작성_가능이고_작성하기는_세_팀_작업을_만들며_재호출은_409() throws Exception {
        String bid = opened(INST);
        makeReady(bid);
        long req = planReq(bid, MEMBER2);
        assertEquals(403, decide(LEAD, req, "APPROVE", null).getResponse().getStatus());   // 결재자는 영업부장 고정
        assertEquals(200, decide(HEAD, req, "APPROVE", null).getResponse().getStatus());
        assertEquals("WRITABLE", state(bid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='PLAN_APPROVE'", bid));

        String path = "/bidcases/" + bid + "/prep/start-writing";
        assertEquals(403, postJson(path, MEMBER, "").getResponse().getStatus());
        assertEquals(403, postJson(path, HEAD, "").getResponse().getStatus());
        assertEquals(0, count("SELECT COUNT(*) FROM TASKS WHERE BID_CASE_ID=?", bid));
        MvcResult ok = postJson(path, MEMBER2, "");
        assertEquals(200, ok.getResponse().getStatus());
        assertEquals("WRITING", json(ok).path("state_cd").asText());
        assertEquals(3, json(ok).path("created_tasks").asInt());
        assertEquals("WRITING", state(bid));
        assertEquals(3, count("SELECT COUNT(*) FROM TASKS WHERE BID_CASE_ID=?", bid));
        assertEquals(409, postJson(path, MEMBER2, "").getResponse().getStatus());
        assertEquals(3, count("SELECT COUNT(*) FROM TASKS WHERE BID_CASE_ID=?", bid));
    }

    @Test
    public void 기획승인_회수와_반려는_진행_상태로_되돌린다() throws Exception {
        String bid = opened(INST);
        makeReady(bid);
        long r1 = planReq(bid, MEMBER2);
        assertEquals(200, postJson("/approval-requests/" + r1 + "/cancel", MEMBER2, "").getResponse().getStatus());
        assertEquals("IN_PROGRESS", state(bid));
        long r2 = planReq(bid, MEMBER2);
        assertEquals(400, decide(HEAD, r2, "REJECT", null).getResponse().getStatus());
        assertEquals(200, decide(HEAD, r2, "REJECT", "자료 보완 필요").getResponse().getStatus());
        assertEquals("IN_PROGRESS", state(bid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='PLAN_WITHDRAW'", bid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='PLAN_REJECT'", bid));
    }

    // ── 중단 ─────────────────────────────────────────────────────────

    @Test
    public void 중단은_개설_뒤_영업팀장만_사유가_필요하다() throws Exception {
        String bid = confirm(MEMBER, INST);
        String path = "/bidcases/" + bid + "/prep/cancel";
        assertEquals(409, postJson(path, LEAD, "{\"reason\":\"미참여 결정\"}").getResponse().getStatus());   // 개설 전은 확정 취소를 쓴다
        long req = openReq(bid, MEMBER, MEMBER2);
        assertEquals(200, decide(LEAD, req, "APPROVE", null).getResponse().getStatus());

        assertEquals(403, postJson(path, MEMBER2, "{\"reason\":\"미참여 결정\"}").getResponse().getStatus());
        assertEquals(403, postJson(path, HEAD, "{\"reason\":\"미참여 결정\"}").getResponse().getStatus());
        assertEquals(400, postJson(path, LEAD, "{\"reason\":\"\"}").getResponse().getStatus());
        assertEquals("IN_PROGRESS", state(bid));
        assertEquals(200, postJson(path, LEAD2, "{\"reason\":\"미참여 결정\"}").getResponse().getStatus());
        assertEquals("CANCELLED", state(bid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='CANCEL' AND REASON IS NOT NULL", bid));
        confirm(MEMBER, INST);   // 중단된 건은 활성이 아니라 같은 기관을 다시 확정할 수 있다
    }

    // ── 목록·이력 ────────────────────────────────────────────────────

    @Test
    public void 목록은_기관명_상태_진척_담당자_이름만_보여주고_영업팀만_본다() throws Exception {
        assertEquals(401, getAs("/preps", null).getResponse().getStatus());
        assertEquals(403, getAs("/preps", DESIGNER).getResponse().getStatus());
        assertEquals(403, getAs("/preps", ADMIN).getResponse().getStatus());
        String bid = opened(INST);
        for (String emp : new String[]{MEMBER, HEAD}) {   // 담당이 아니어도 목록은 본다
            MvcResult r = getAs("/preps", emp);
            assertEquals(200, r.getResponse().getStatus());
            JsonNode item = null;
            for (JsonNode n : json(r)) {
                if (bid.equals(n.path("bid_case_id").asText())) {
                    item = n;
                }
            }
            assertNotNull(item);
            assertFalse(item.path("institution_name").asText().isEmpty());
            assertEquals("IN_PROGRESS", item.path("state_cd").asText());
            assertEquals(4, item.path("progress").path("total").asInt());
            assertEquals("윤서준", item.path("assignee_names").get(0).asText());
            assertFalse(item.has("tasks"));
            assertFalse(item.has("assignees"));
            assertFalse(item.has("confirmed_by"));
        }
    }

    @Test
    public void 이력은_담당자와_영업부장이_보고_비담당은_404() throws Exception {
        String bid = opened(INST);
        MvcResult r = getAs("/bidcases/" + bid + "/prep/history", MEMBER2);
        assertEquals(200, r.getResponse().getStatus());
        String events = json(r).toString();
        assertTrue(events, events.contains("CONFIRM") && events.contains("OPEN_SUBMIT") && events.contains("OPEN_APPROVE"));
        assertTrue(json(r).get(0).has("emp_verified"));
        assertEquals(200, getAs("/bidcases/" + bid + "/prep/history", HEAD).getResponse().getStatus());
        assertEquals(404, getAs("/bidcases/" + bid + "/prep/history", MEMBER).getResponse().getStatus());
        assertEquals(404, getAs("/bidcases/" + bid + "/prep/history", DESIGNER).getResponse().getStatus());
    }

    // ── 옛 최초 배정 경로(B2) ────────────────────────────────────────

    @Test
    public void 옛_흐름_스위치가_닫히면_팀장_직접_최초_배정은_막힌다() throws Exception {
        String res = mockMvc.perform(post("/bidcases").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"institution_id\":\"" + INST + "\"}").header("X-User-Id", "dave"))
                .andReturn().getResponse().getContentAsString();
        String bc = om.readTree(res).path("bid_case_id").asText();
        legacy.setOpenForTest(false);
        try {
            MvcResult r = postJson("/bidcases/" + bc + "/assignments", LEAD, "{\"emp_nos\":" + arr(MEMBER) + "}");
            assertEquals(403, r.getResponse().getStatus());
            assertEquals("LEGACY_CLOSED", json(r).path("detail").path("code").asText());
            assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=?", bc));
        } finally {
            legacy.setOpenForTest(true);
        }
        assertEquals(201, postJson("/bidcases/" + bc + "/assignments", LEAD, "{\"emp_nos\":" + arr(MEMBER) + "}")
                .getResponse().getStatus());   // 열림이면 옛 동작 그대로
    }
}
