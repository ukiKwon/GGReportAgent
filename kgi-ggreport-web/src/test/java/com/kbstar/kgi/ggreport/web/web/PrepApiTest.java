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
    public void 확정_취소는_확정한_사람이나_영업팀장만_사유가_필요하고_취소하면_같은_건으로_다시_확정된다() throws Exception {
        String bid = confirm(MEMBER, INST);
        int cases = count("SELECT COUNT(*) FROM BID_CASES WHERE INSTITUTION_ID=?", INST);
        String path = "/bidcases/" + bid + "/prep/unconfirm";
        assertEquals(403, postJson(path, MEMBER2, "{\"reason\":\"사정이 바뀜\"}").getResponse().getStatus());   // 확정자도 팀장도 아님
        assertEquals(400, postJson(path, LEAD, "{\"reason\":\"\"}").getResponse().getStatus());
        assertEquals(422, postJson(path, LEAD, "{\"reason\":\"연락처 010-1234-5678\"}").getResponse().getStatus());
        assertEquals("CONFIRMED", state(bid));
        assertEquals(200, postJson(path, MEMBER, "{\"reason\":\"기관 사정으로 보류\"}").getResponse().getStatus());
        assertEquals("CANCELLED", state(bid));
        // 개설 전 확정 취소 건의 열람(security F3): 확정자·영업팀장·영업부장만. 취소 표시명은 '확정 취소'
        MvcResult seen = getAs("/bidcases/" + bid + "/prep", MEMBER);
        assertEquals(200, seen.getResponse().getStatus());
        assertEquals("확정 취소", json(seen).path("state_name").asText());
        assertEquals(404, getAs("/bidcases/" + bid + "/prep", MEMBER2).getResponse().getStatus());
        assertEquals(200, getAs("/bidcases/" + bid + "/prep", LEAD).getResponse().getStatus());
        assertEquals(200, getAs("/bidcases/" + bid + "/prep", HEAD).getResponse().getStatus());

        // 다시 확정하면 같은 BID_CASE 를 되살린다 — 새 건 없음, 확정자 갱신, 이력 CANCELLED→CONFIRMED
        MvcResult again = postJson("/preps", LEAD, "{\"institution_id\":\"" + INST + "\"}");
        assertEquals(201, again.getResponse().getStatus());
        assertEquals(bid, json(again).path("bid_case_id").asText());
        assertTrue(json(again).path("revived").asBoolean());
        assertEquals("CONFIRMED", state(bid));
        assertEquals(cases, count("SELECT COUNT(*) FROM BID_CASES WHERE INSTITUTION_ID=?", INST));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP WHERE INSTITUTION_ID=?", INST));
        assertEquals(LEAD, jdbc.queryForObject("SELECT CONFIRMED_BY FROM BID_PREP WHERE BID_CASE_ID=?", String.class, bid));
        assertEquals(2, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='CONFIRM'", bid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='CONFIRM' AND FROM_STATE='CANCELLED' AND TO_STATE='CONFIRMED'", bid));
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

        // 담당 해제(사용자 결정 ③): 활성 배정 0, 해제자·시각 기록, 배정 이력 RELEASE, 변경 신청 무효화용 GROUP_VER 증가
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=? AND ACTIVE_YN=1", bid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=? AND EMP_NO=? AND ACTIVE_YN=0 AND RELEASED_BY=? AND RELEASED_AT IS NOT NULL",
                bid, MEMBER2, LEAD2));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_ASSIGN_LOG WHERE BID_CASE_ID=? AND ACTION_CD='RELEASE' AND TARGET_EMP_NO=? AND ACTOR_EMP_NO=?",
                bid, MEMBER2, LEAD2));
        assertEquals(2, count("SELECT GROUP_VER FROM BID_ASSIGN_CASE WHERE BID_CASE_ID=?", bid));
        // 쓰기 권한 회수 — 옛 담당자는 체크·작성하기 403, 읽기만 가능(표시명 '중단(미참여)'), 영업팀장·영업부장도 읽기, 확정자(비팀장)·디자이너는 404
        assertEquals(403, postJson("/bidcases/" + bid + "/prep/tasks/T1/check", MEMBER2, "").getResponse().getStatus());
        assertEquals(403, postJson("/bidcases/" + bid + "/prep/start-writing", MEMBER2, "").getResponse().getStatus());
        MvcResult old = getAs("/bidcases/" + bid + "/prep", MEMBER2);
        assertEquals(200, old.getResponse().getStatus());
        assertEquals("CANCELLED", json(old).path("state_cd").asText());
        assertEquals("중단(미참여)", json(old).path("state_name").asText());
        assertFalse(json(old).path("viewer").path("is_assignee").asBoolean());
        assertEquals(0, json(old).path("assignees").size());
        assertEquals(200, getAs("/bidcases/" + bid + "/prep/history", MEMBER2).getResponse().getStatus());
        assertEquals(200, getAs("/bidcases/" + bid + "/prep", LEAD).getResponse().getStatus());
        assertEquals(200, getAs("/bidcases/" + bid + "/prep", HEAD).getResponse().getStatus());
        assertEquals(404, getAs("/bidcases/" + bid + "/prep", MEMBER).getResponse().getStatus());
        assertEquals(404, getAs("/bidcases/" + bid + "/prep", DESIGNER).getResponse().getStatus());

        // 개설 뒤 중단된 건은 같은 건으로 되살리지 않는다 — 건을 지정하면 409 PREP_ABORTED, 기관만 지정하면 새 건
        MvcResult named = postJson("/preps", MEMBER, "{\"institution_id\":\"" + INST + "\",\"bid_case_id\":\"" + bid + "\"}");
        assertEquals(409, named.getResponse().getStatus());
        assertEquals("PREP_ABORTED", json(named).path("detail").path("code").asText());
        String fresh = confirm(MEMBER, INST);
        assertFalse(fresh.equals(bid));
        assertEquals("CANCELLED", state(bid));
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

    // ── NEXT 70 후속(qa P2-1~P2-6·P3, security F3·F4·F5·F8, 사용자 결정 ①~④) ─────────────

    /** 옛 흐름(공고 반입)으로 생긴 사전준비 행 없는 입찰 건을 만든다. */
    private String legacyCase(String inst) throws Exception {
        MvcResult r = mockMvc.perform(post("/bidcases").contentType(MediaType.APPLICATION_JSON)
                .content("{\"institution_id\":\"" + inst + "\"}").header("X-User-Id", "dave")).andReturn();
        String bc = json(r).path("bid_case_id").asText();
        assertFalse(r.getResponse().getContentAsString(), bc.isEmpty());
        return bc;
    }

    private MvcResult confirmWith(String emp, String inst, String bid) throws Exception {
        return postJson("/preps", emp, "{\"institution_id\":\"" + inst + "\",\"bid_case_id\":\"" + bid + "\"}");
    }

    private static JsonNode task(JsonNode view, String cd) {
        for (JsonNode t : view.path("tasks")) {
            if (cd.equals(t.path("task_cd").asText())) {
                return t;
            }
        }
        return null;
    }

    @Test
    public void 기획승인_승인은_오케스트레이터_5번_게이트를_건드리지_않는다() throws Exception {   // 사용자 결정 ① · qa P2-1
        String bid = opened(INST);
        makeReady(bid);
        String now = Times.nowIso();
        jdbc.update("INSERT INTO ORCH_RUN (RUN_ID, INSTITUTION_ID, STATUS, CURRENT_NODE, PENDING_GATE,"
                        + " ACTIVE_INSTITUTION_ID, CREATED_AT, UPDATED_AT) VALUES (?,?,?,?,?,?,?,?)",
                "prep-gate-run", INST, "PENDING_APPROVAL", "rfi", "기획승인", INST, now, now);
        long req = planReq(bid, MEMBER2);
        assertEquals(200, decide(HEAD, req, "APPROVE", null).getResponse().getStatus());
        assertEquals("WRITABLE", state(bid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='PLAN_APPROVE'", bid));
        assertEquals("PENDING_APPROVAL", jdbc.queryForObject("SELECT STATUS FROM ORCH_RUN WHERE RUN_ID=?", String.class, "prep-gate-run"));
        assertEquals("기획승인", jdbc.queryForObject("SELECT PENDING_GATE FROM ORCH_RUN WHERE RUN_ID=?", String.class, "prep-gate-run"));
    }

    @Test
    public void 작성_가능_뒤_필수_과제가_풀리면_작성하기가_다시_막힌다() throws Exception {   // qa P2-2
        String bid = opened(INST);
        makeReady(bid);
        long req = planReq(bid, MEMBER2);
        assertEquals(200, decide(HEAD, req, "APPROVE", null).getResponse().getStatus());
        MvcResult before = getAs("/bidcases/" + bid + "/prep", MEMBER2);
        assertTrue(json(before).path("viewer").path("can_start_writing").asBoolean());

        jdbc.update("UPDATE BID_PREP_TASK SET REF_ATTACH_ID = NULL WHERE BID_CASE_ID = ? AND TASK_CD = 'T3'", bid);   // 확정본 지정이 풀림
        flushCache();
        MvcResult after = getAs("/bidcases/" + bid + "/prep", MEMBER2);
        assertEquals(200, after.getResponse().getStatus());
        assertFalse(json(after).path("viewer").path("can_start_writing").asBoolean());
        assertFalse(json(after).path("plan_approval_ready").asBoolean());
        MvcResult blocked = postJson("/bidcases/" + bid + "/prep/start-writing", MEMBER2, "");
        assertEquals(409, blocked.getResponse().getStatus());
        assertEquals("NOT_READY", json(blocked).path("detail").path("code").asText());
        assertEquals("WRITABLE", state(bid));
        assertEquals(0, count("SELECT COUNT(*) FROM TASKS WHERE BID_CASE_ID=?", bid));
    }

    @Test
    public void 이사회_자료_확정이면_T5가_자동_완료되고_부결이어도_완료_꼬리표만_붙으며_재작성_요구로_풀리면_자동_미완료() throws Exception {   // qa §6-1 · 사용자 결정 ④
        String bid = opened(INST);
        assertEquals(200, postJson("/bidcases/" + bid + "/prep/tasks/T1/check", MEMBER2, "").getResponse().getStatus());
        assertEquals(200, postJson("/bidcases/" + bid + "/prep/tasks/T2/check", MEMBER2, "").getResponse().getStatus());
        String now = Times.nowIso();
        jdbc.update("UPDATE BID_PREP_TASK SET REF_ATTACH_ID = 1, REF_BY = ?, REF_AT = ? WHERE BID_CASE_ID = ? AND TASK_CD = 'T3'",
                MEMBER2, now, bid);
        jdbc.update("INSERT INTO BOARD_MATERIAL (BID_CASE_ID, INSTITUTION_ID, BOARD_YEAR, STATUS_CD, RESULT_CD, FORM_ID, FORM_VER, CUR_SNAP,"
                        + " CREATED_BY, CREATED_AT, UPDATED_BY, UPDATED_AT) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                bid, INST, 2026, "CONFIRMED", "REJECTED", "default_doc", 0, 0, MEMBER2, now, MEMBER2, now);
        flushCache();

        JsonNode v = json(getAs("/bidcases/" + bid + "/prep", MEMBER2));
        JsonNode t5 = task(v, "T5");
        assertNotNull(t5);
        assertEquals("DONE", t5.path("state").asText());                  // 부결이어도 확정이면 완료
        assertTrue(t5.path("done_by").isNull());                          // 시스템 판정
        assertEquals("REJECTED", v.path("board_result").asText());
        assertEquals("부결", v.path("board_result_name").asText());
        assertTrue(v.path("plan_approval_ready").asBoolean());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='AUTO_DONE' AND TASK_CD='T5' AND ACTOR_EMP_NO IS NULL", bid));

        jdbc.update("UPDATE BOARD_MATERIAL SET STATUS_CD = 'DRAFT', RESULT_CD = NULL WHERE BID_CASE_ID = ?", bid);   // 영업부장 재작성 요구
        flushCache();
        JsonNode w = json(getAs("/bidcases/" + bid + "/prep", MEMBER2));
        assertEquals("TODO", task(w, "T5").path("state").asText());
        assertTrue(w.path("board_result").isNull());
        assertFalse(w.path("plan_approval_ready").asBoolean());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='AUTO_UNDONE' AND TASK_CD='T5'", bid));
    }

    @Test
    public void 사전준비_건에는_스위치와_무관하게_직접_배정이_409이고_개설_승인은_그대로_된다() throws Exception {   // qa P2-3
        String bid = confirm(MEMBER, INST);
        String path = "/bidcases/" + bid + "/assignments";
        MvcResult open = postJson(path, LEAD, "{\"emp_nos\":" + arr(MEMBER) + "}");
        assertEquals(409, open.getResponse().getStatus());
        assertEquals("PREP_CASE", json(open).path("detail").path("code").asText());
        legacy.setOpenForTest(false);
        try {
            MvcResult closed = postJson(path, LEAD, "{\"emp_nos\":" + arr(MEMBER) + "}");
            assertEquals(409, closed.getResponse().getStatus());   // 닫힘이어도 LEGACY_CLOSED(403)가 아니라 같은 409
            assertEquals("PREP_CASE", json(closed).path("detail").path("code").asText());
        } finally {
            legacy.setOpenForTest(true);
        }
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=?", bid));
        long req = openReq(bid, MEMBER, MEMBER2);
        assertEquals(200, decide(LEAD, req, "APPROVE", null).getResponse().getStatus());   // 막다른 길이 없다
        assertEquals("IN_PROGRESS", state(bid));
    }

    @Test
    public void 확정에_건을_지정하는_경로_다른_기관_404_이미_확정_409_정상_201과_새_건_없음() throws Exception {   // qa §6-4
        String other = legacyCase("dobong");
        assertEquals(404, confirmWith(MEMBER, INST, other).getResponse().getStatus());
        assertEquals(404, confirmWith(MEMBER, INST, "no-such-case").getResponse().getStatus());
        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP WHERE INSTITUTION_ID=?", INST));

        String lc = legacyCase(INST);
        int cases = count("SELECT COUNT(*) FROM BID_CASES WHERE INSTITUTION_ID=?", INST);
        MvcResult ok = confirmWith(MEMBER, INST, lc);
        assertEquals(201, ok.getResponse().getStatus());
        assertEquals(lc, json(ok).path("bid_case_id").asText());
        assertFalse(json(ok).path("revived").asBoolean());
        assertEquals(cases, count("SELECT COUNT(*) FROM BID_CASES WHERE INSTITUTION_ID=?", INST));   // 새 건이 생기지 않는다
        assertEquals("CONFIRMED", state(lc));

        MvcResult again = confirmWith(LEAD, INST, lc);   // 이미 확정된 건
        assertEquals(409, again.getResponse().getStatus());
        assertEquals("PREP_ALREADY_ACTIVE", json(again).path("detail").path("code").asText());
    }

    @Test
    public void 옛_직접_배정의_머리_행이_있는_건은_확정할_수_없다() throws Exception {   // security F8
        String lc = legacyCase(INST);
        assertEquals(201, postJson("/bidcases/" + lc + "/assignments", LEAD, "{\"emp_nos\":" + arr(MEMBER) + "}").getResponse().getStatus());
        MvcResult r = confirmWith(MEMBER, INST, lc);
        assertEquals(409, r.getResponse().getStatus());
        assertEquals("ASSIGNED_ALREADY", json(r).path("detail").path("code").asText());
        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP WHERE BID_CASE_ID=?", lc));
    }

    @Test
    public void 중단은_기획승인_중과_개설_대기에서는_409_작성_가능과_작성_중에서는_200_사유에_개인정보면_422() throws Exception {   // qa §6-5
        String bid = opened(INST);
        makeReady(bid);
        long req = planReq(bid, MEMBER2);
        String path = "/bidcases/" + bid + "/prep/cancel";
        MvcResult pending = postJson(path, LEAD, "{\"reason\":\"미참여 결정\"}");
        assertEquals(409, pending.getResponse().getStatus());
        assertEquals("PLAN_PENDING", json(pending).path("detail").path("code").asText());
        assertEquals("APPROVAL_PENDING", state(bid));
        assertEquals(200, decide(HEAD, req, "APPROVE", null).getResponse().getStatus());
        assertEquals("WRITABLE", state(bid));
        assertEquals(422, postJson(path, LEAD, "{\"reason\":\"연락처 010-1234-5678\"}").getResponse().getStatus());
        assertEquals("WRITABLE", state(bid));
        assertEquals(200, postJson(path, LEAD, "{\"reason\":\"미참여 결정\"}").getResponse().getStatus());   // 작성 가능에서 중단
        assertEquals("CANCELLED", state(bid));

        String b2 = confirm(MEMBER, INST);   // 개설 대기에서는 중단이 아니라 회수
        openReq(b2, MEMBER, MEMBER2);
        assertEquals(409, postJson("/bidcases/" + b2 + "/prep/cancel", LEAD, "{\"reason\":\"미참여 결정\"}").getResponse().getStatus());
        assertEquals("OPEN_PENDING", state(b2));

        String b3 = opened("dobong");   // 작성 중에서 중단
        makeReady(b3);
        long r3 = planReq(b3, MEMBER2);
        assertEquals(200, decide(HEAD, r3, "APPROVE", null).getResponse().getStatus());
        assertEquals(200, postJson("/bidcases/" + b3 + "/prep/start-writing", MEMBER2, "").getResponse().getStatus());
        assertEquals("WRITING", state(b3));
        assertEquals(200, postJson("/bidcases/" + b3 + "/prep/cancel", LEAD2, "{\"reason\":\"미참여 결정\"}").getResponse().getStatus());
        assertEquals("CANCELLED", state(b3));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=? AND ACTIVE_YN=1", b3));
        assertEquals(3, count("SELECT COUNT(*) FROM TASKS WHERE BID_CASE_ID=?", b3));   // 만든 작업은 기록으로 남는다
    }

    @Test
    public void 과제_코드가_형식_밖이면_404이고_감사_칸에는_남기지_않으며_역할_검사가_건_조회보다_먼저다() throws Exception {   // security F4·F5, qa §6-13
        String bid = opened(INST);
        String longCd = "AAAAAAAAAAAAAAAAAAAAAAAAA";   // 25자
        assertEquals(404, postJson("/bidcases/" + bid + "/prep/tasks/" + longCd + "/check", MEMBER2, "").getResponse().getStatus());
        assertEquals(404, postJson("/bidcases/" + bid + "/prep/tasks/t1/uncheck", MEMBER2, "").getResponse().getStatus());
        assertEquals(2, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND OUTCOME='HIDDEN' AND TASK_CD IS NULL", bid));

        // 없는 건과 있는 건이 같은 403 — 역할·담당 검사가 먼저
        String none = "/bidcases/no-such-case/prep/";
        assertEquals(403, postJson("/bidcases/no-such-case/prep/open-requests", DESIGNER, "{\"emp_nos\":" + arr(MEMBER2) + "}").getResponse().getStatus());
        assertEquals(403, postJson(none + "tasks/T1/check", MEMBER, "").getResponse().getStatus());
        assertEquals(403, postJson(none + "tasks/T1/check", HEAD, "").getResponse().getStatus());
        assertEquals(403, postJson(none + "plan-approval-requests", MEMBER, "").getResponse().getStatus());
        assertEquals(403, postJson(none + "start-writing", MEMBER, "").getResponse().getStatus());
        assertEquals(403, postJson("/bidcases/" + bid + "/prep/open-requests", DESIGNER, "{\"emp_nos\":" + arr(MEMBER2) + "}").getResponse().getStatus());
        assertEquals(403, postJson(none + "start-writing", MEMBER2, "").getResponse().getStatus());   // 없는 건에는 담당자가 없다 — 담당이 아니면 403
    }
}
