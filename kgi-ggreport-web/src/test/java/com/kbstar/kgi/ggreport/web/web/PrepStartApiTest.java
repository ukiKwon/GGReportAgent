package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.config.BidTargetSettings;
import com.kbstar.kgi.ggreport.web.support.PrepOpenApprovalSwitch;
import com.kbstar.kgi.ggreport.web.support.TestGoals;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 사전준비 개설 신청(팀장 결재) 폐지와 결재 없는 시작 {@code POST /bidcases/{bid}/prep/start}(사용자 11-25 NEXT 114, 설계 backend-dev 0953 + security 11-25 반영).
 * 확정한 사람 또는 확정자의 같은 팀 영업팀장만 시작하고, 알림 받을 팀장을 못 정하면 409 NOTIFY_TARGET_NOT_RESOLVED(fail-closed),
 * 성공 감사 줄은 서비스가 같은 트랜잭션에서 쓴다(롤백은 PrepRollbackApiTest). 시드: 영업팀 김영업 3918264·윤서준 3361829(결재선 영업팀장 이영업 5047192, 수동 지정),
 * 영업팀장 이영업 5047192·안재원 5640327(다른 팀 팀장), 영업부장 박영업 2674805, 디자이너 7130526.
 * ⚠️ X-Emp-No 는 자기신고다 — 여기서 고정하는 것은 업무 규칙이지 사칭 방지가 아니다.
 * 한 테스트 트랜잭션이라 서비스가 던진 오류 앞에서 쓴 행은 롤백되지 않는다 — 실패 케이스는 그 앞에서 쓴 것이 없는 순서로만 단언한다(start 의 검증은 쓰기 앞에 있다).
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class PrepStartApiTest {

    private static final String LEAD = "5047192";
    private static final String LEAD2 = "5640327";
    private static final String HEAD = "2674805";
    private static final String MEMBER = "3918264";
    private static final String MEMBER2 = "3361829";
    private static final String DESIGNER = "7130526";
    private static final String INST = "nowon";
    private static final String KIND = "사전준비알림";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PrepOpenApprovalSwitch openApproval;
    @Autowired private BidTargetSettings targetSettings;
    private final ObjectMapper om = new ObjectMapper();

    @Before
    public void 새_흐름_바탕() {
        openApproval.setForTest(false);   // 결재 없는 시작(기본)
        TestGoals.seedThisYear(jdbc, INST);
    }

    @After
    public void 되돌리기() {
        openApproval.setForTest(false);
        targetSettings.setApprovalRequired(true);
    }

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

    private MvcResult postUi(String path, String emp, String body, String screen, String button) throws Exception {
        MockHttpServletRequestBuilder b = post(path).contentType(MediaType.APPLICATION_JSON).content(body);
        if (screen != null) { b = b.header("X-Screen-Id", screen); }
        if (button != null) { b = b.header("X-Button-Id", button); }
        return mockMvc.perform(as(b, emp)).andReturn();
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

    private String confirm(String emp, String inst) throws Exception {
        MvcResult r = postUi("/preps", emp, "{\"institution_id\":\"" + inst + "\"}", "bid_board", "confirm");
        assertEquals(r.getResponse().getContentAsString(), 201, r.getResponse().getStatus());
        String bid = json(r).path("bid_case_id").asText();
        assertFalse(bid.isEmpty());
        return bid;
    }

    private MvcResult start(String bid, String emp, String... nominees) throws Exception {
        return postUi("/bidcases/" + bid + "/prep/start", emp, "{\"emp_nos\":" + arr(nominees) + "}", "prep_detail", "open_start");
    }

    private int act(String bid, String outcome, String emp, String screen, String button, int valid, String st) {
        return count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='OPEN_START' AND OUTCOME=? AND ACTOR_EMP_NO=?"
                + " AND SCREEN_ID=? AND BUTTON_ID=? AND UI_VALID=? AND STATE_CD=?", bid, outcome, emp, screen, button, valid, st);
    }

    private int notes(String recipient) {
        return count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE RECIPIENT=? AND KIND=?", recipient, KIND);
    }

    private void goalRow(String inst, int no, int rev, String action, String kind, Integer year) {
        jdbc.update("INSERT INTO INST_BID_TARGET (INSTITUTION_ID, TARGET_NO, REV_NO, ACTION_CD, KIND_CD, TARGET_YEAR, TAG_CD, EDITOR_EMP_NO, EDITOR_NAME,"
                + " EMP_VERIFIED, SCREEN_ID, BUTTON_ID, UI_VALID, SAVED_AT, WATCH_EMP_NO) VALUES (?,?,?,?,?,?,'NEW','3918264','김영업',0,'bid_board','seed',1,"
                + "'2026-11-25T00:00:00+09:00',NULL)", inst, no, rev, action, kind, year);
    }

    private void assertCode(MvcResult r, int status, String code) throws Exception {
        assertEquals(r.getResponse().getContentAsString(), status, r.getResponse().getStatus());
        assertEquals(code, json(r).path("detail").path("code").asText());
    }

    // ── 시험 ────────────────────────────────────────────────────────

    @Test
    public void S1_확정자가_담당자를_지정하면_결재_없이_IN_PROGRESS가_되고_같은_팀_팀장에게_알림이_가며_감사가_같은_줄에_남는다() throws Exception {
        String bid = confirm(MEMBER, INST);
        int reqs0 = count("SELECT COUNT(*) FROM APPROVAL_REQUEST WHERE REQ_TYPE='BID_OPEN'");
        MvcResult r = start(bid, MEMBER, MEMBER2);
        assertEquals(r.getResponse().getContentAsString(), 200, r.getResponse().getStatus());
        assertEquals("IN_PROGRESS", json(r).path("state_cd").asText());
        assertEquals(1, json(r).path("notified_count").asInt());
        assertEquals(1, json(r).path("assignee_count").asInt());
        assertEquals("IN_PROGRESS", state(bid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP WHERE BID_CASE_ID=? AND OPENED_BY=? AND OPENED_AT IS NOT NULL", bid, MEMBER));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=? AND EMP_NO=? AND ACTIVE_YN=1", bid, MEMBER2));
        assertEquals(count("SELECT COUNT(*) FROM PREP_TASK_DEF WHERE ENABLED=1"), count("SELECT COUNT(*) FROM BID_PREP_TASK WHERE BID_CASE_ID=?", bid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='OPEN_START' AND FROM_STATE='CONFIRMED'"
                + " AND TO_STATE='IN_PROGRESS' AND REQ_ID IS NULL", bid));
        assertEquals("개설 결재 요청은 늘지 않는다", reqs0, count("SELECT COUNT(*) FROM APPROVAL_REQUEST WHERE REQ_TYPE='BID_OPEN'"));
        assertEquals("성공 감사 줄 정확히 한 줄(서비스가 쓰고 컨트롤러는 안 쓴다)", 1, act(bid, "OK", MEMBER, "prep_detail", "open_start", 1, "CONFIRMED"));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='OPEN_START'", bid));
        assertEquals("알림은 같은 팀 팀장에게만", 1, notes(LEAD));
        assertEquals(0, notes(MEMBER2));
        assertEquals(0, notes(MEMBER));
        assertEquals(0, notes(HEAD));
    }

    @Test
    public void S3_확정자의_같은_팀_영업팀장이_시작하면_200이고_본인은_알림에서_빠지고_영업부장에게_간다() throws Exception {
        String bid = confirm(MEMBER, INST);
        MvcResult r = start(bid, LEAD, MEMBER2);
        assertEquals(r.getResponse().getContentAsString(), 200, r.getResponse().getStatus());
        assertEquals("IN_PROGRESS", state(bid));
        assertEquals(1, notes(HEAD));
        assertEquals(0, notes(LEAD));
        assertEquals(1, act(bid, "OK", LEAD, "prep_detail", "open_start", 1, "CONFIRMED"));
    }

    @Test
    public void S3b_영업팀장이_확정하고_스스로_시작하면_영업부장에게만_알림이_간다() throws Exception {
        String bid = confirm(LEAD, INST);
        MvcResult r = start(bid, LEAD, MEMBER2);
        assertEquals(r.getResponse().getContentAsString(), 200, r.getResponse().getStatus());
        assertEquals(1, json(r).path("notified_count").asInt());
        assertEquals(1, notes(HEAD));
        assertEquals(0, notes(LEAD));
    }

    @Test
    public void S4_확정자도_같은_팀_팀장도_아니면_403이고_상태는_CONFIRMED이며_거부_감사가_남는다() throws Exception {
        String bid = confirm(MEMBER, INST);
        String body = "{\"emp_nos\":" + arr(MEMBER2) + "}";
        for (String emp : new String[]{MEMBER2, DESIGNER, HEAD, LEAD2}) {   // 비확정 팀원·디자이너·영업부장·다른 팀 팀장(security ①)
            MvcResult r = postUi("/bidcases/" + bid + "/prep/start", emp, body, "prep_detail", "open_start");
            assertEquals(emp + " " + r.getResponse().getContentAsString(), 403, r.getResponse().getStatus());
            assertEquals(emp, 1, act(bid, "DENIED", emp, "prep_detail", "open_start", 1, "CONFIRMED"));
        }
        assertEquals("CONFIRMED", state(bid));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=?", bid));
        assertEquals(0, notes(HEAD) + notes(LEAD) + notes(LEAD2));
    }

    @Test
    public void S5_지명이_비었거나_영업부장이거나_열한_명이거나_중복이면_400이고_아무것도_바뀌지_않는다() throws Exception {
        String bid = confirm(MEMBER, INST);
        String[][] bad = {
                {}, {HEAD},
                {MEMBER2, MEMBER2},
                {"1000001", "1000002", "1000003", "1000004", "1000005", "1000006", "1000007", "1000008", "1000009", "1000010", "1000011"}};
        for (String[] nominees : bad) {
            MvcResult r = start(bid, MEMBER, nominees);
            assertEquals(r.getResponse().getContentAsString(), 400, r.getResponse().getStatus());
        }
        assertEquals("CONFIRMED", state(bid));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=?", bid));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP_TASK WHERE BID_CASE_ID=?", bid));
    }

    @Test
    public void S6_두_번_시작하면_409_STATE_CHANGED이고_없는_건은_404다() throws Exception {
        String bid = confirm(MEMBER, INST);
        assertEquals(200, start(bid, MEMBER, MEMBER2).getResponse().getStatus());
        assertCode(start(bid, MEMBER, MEMBER2), 409, "STATE_CHANGED");
        assertEquals(1, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=?", bid));
        assertEquals(404, start("NO-SUCH-CASE", MEMBER, MEMBER2).getResponse().getStatus());
    }

    @Test
    public void S7_확정_뒤_목표에서_빠진_기관은_시작이_409_NOT_GOAL_TARGET이고_상태와_배정은_그대로다() throws Exception {
        final String inst = "jongno";
        final int y = TestGoals.thisYear();
        goalRow(inst, 1, 1, "SAVE", "GOAL", y);
        String bid = confirm(MEMBER, inst);
        goalRow(inst, 1, 2, "CANCEL", "GOAL", y);
        MvcResult r = start(bid, MEMBER, MEMBER2);
        assertCode(r, 409, "NOT_GOAL_TARGET");
        assertEquals("CONFIRMED", state(bid));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=?", bid));
        assertEquals(1, act(bid, "BLOCKED", MEMBER, "prep_detail", "open_start", 1, "CONFIRMED"));
        assertFalse(r.getResponse().getContentAsString(StandardCharsets.UTF_8).contains(inst));   // 문구에 기관 id 없음
    }

    @Test
    public void S8_스위치가_꺼져_있으면_새_개설_신청은_409_OPEN_APPROVAL_CLOSED이고_결재_요청이_생기지_않는다() throws Exception {
        String bid = confirm(MEMBER, INST);
        int reqs0 = count("SELECT COUNT(*) FROM APPROVAL_REQUEST");
        MvcResult r = postJson("/bidcases/" + bid + "/prep/open-requests", MEMBER, "{\"emp_nos\":" + arr(MEMBER2) + "}");
        assertCode(r, 409, "OPEN_APPROVAL_CLOSED");
        assertEquals(reqs0, count("SELECT COUNT(*) FROM APPROVAL_REQUEST"));
        assertEquals("CONFIRMED", state(bid));
    }

    @Test
    public void S9_옛_개설_대기_건은_시작이_409_OPEN_PENDING이고_결재_승인으로_끝까지_처리된다() throws Exception {
        String bid = confirm(MEMBER, INST);
        openApproval.setForTest(true);
        MvcResult o = postJson("/bidcases/" + bid + "/prep/open-requests", MEMBER, "{\"emp_nos\":" + arr(MEMBER2) + "}");
        assertEquals(o.getResponse().getContentAsString(), 201, o.getResponse().getStatus());
        long req = json(o).path("req_id").asLong();
        openApproval.setForTest(false);
        assertCode(start(bid, MEMBER, MEMBER2), 409, "OPEN_PENDING");
        MvcResult d = postJson("/approval-requests/" + req + "/decide", LEAD, "{\"decision\":\"APPROVE\",\"comment\":null}");
        assertEquals(d.getResponse().getContentAsString(), 200, d.getResponse().getStatus());
        assertEquals("IN_PROGRESS", state(bid));
    }

    @Test
    public void S10_옛_개설_신청을_회수하면_CONFIRMED로_돌아와_새_시작이_된다() throws Exception {
        String bid = confirm(MEMBER, INST);
        openApproval.setForTest(true);
        MvcResult o = postJson("/bidcases/" + bid + "/prep/open-requests", MEMBER, "{\"emp_nos\":" + arr(MEMBER2) + "}");
        assertEquals(o.getResponse().getContentAsString(), 201, o.getResponse().getStatus());
        long req = json(o).path("req_id").asLong();
        openApproval.setForTest(false);
        assertEquals(200, postUi("/approval-requests/" + req + "/cancel", MEMBER, "", "prep_detail", "withdraw").getResponse().getStatus());
        assertEquals("CONFIRMED", state(bid));
        MvcResult r = start(bid, MEMBER, MEMBER2);
        assertEquals(r.getResponse().getContentAsString(), 200, r.getResponse().getStatus());
        assertEquals("IN_PROGRESS", state(bid));
    }

    @Test
    public void S11_옛_흐름이_켜져_있으면_시작은_409_OPEN_APPROVAL_ON이다() throws Exception {
        String bid = confirm(MEMBER, INST);
        openApproval.setForTest(true);
        assertCode(start(bid, MEMBER, MEMBER2), 409, "OPEN_APPROVAL_ON");
        assertEquals("CONFIRMED", state(bid));
    }

    @Test
    public void S11b_목표_기관_결재가_꺼지면_개설_결재가_자동으로_돌아와_시작은_409_OPEN_APPROVAL_ON이다() throws Exception {
        String bid = confirm(MEMBER, INST);
        targetSettings.setApprovalRequired(false);   // @After 가 되돌린다
        assertCode(start(bid, MEMBER, MEMBER2), 409, "OPEN_APPROVAL_ON");
        assertEquals("CONFIRMED", state(bid));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=?", bid));
    }

    @Test
    public void S12_확정_건_상세의_viewer는_확정자만_시작_버튼이_보이고_개설_신청_버튼은_없다() throws Exception {
        String bid = confirm(MEMBER, INST);
        JsonNode mine = json(getAs("/bidcases/" + bid + "/prep", MEMBER)).path("viewer");
        assertTrue(mine.path("can_start_prep").asBoolean());
        assertFalse(mine.path("can_request_open").asBoolean());
        JsonNode other = json(getAs("/bidcases/" + bid + "/prep", MEMBER2)).path("viewer");
        assertFalse(other.path("can_start_prep").asBoolean());
        assertFalse(other.path("can_request_open").asBoolean());
        JsonNode lead = json(getAs("/bidcases/" + bid + "/prep", LEAD)).path("viewer");
        assertTrue("확정자의 같은 팀 팀장", lead.path("can_start_prep").asBoolean());
        JsonNode lead2 = json(getAs("/bidcases/" + bid + "/prep", LEAD2)).path("viewer");
        assertFalse("다른 팀 팀장", lead2.path("can_start_prep").asBoolean());
    }

    @Test
    public void S13_시작_이력은_OPEN_START_사전준비_시작이고_의견은_팀장에게만_보인다() throws Exception {
        String bid = confirm(MEMBER, INST);
        MvcResult r = postUi("/bidcases/" + bid + "/prep/start", MEMBER, "{\"emp_nos\":" + arr(MEMBER2) + ",\"comment\":\"담당 지정 의견\"}",
                "prep_detail", "open_start");
        assertEquals(r.getResponse().getContentAsString(), 200, r.getResponse().getStatus());
        JsonNode forLead = findEvent(json(getAs("/bidcases/" + bid + "/prep/history", LEAD)), "OPEN_START");
        assertEquals("사전준비 시작", forLead.path("event_name").asText());
        assertEquals("담당 지정 의견", forLead.path("reason").asText());
        JsonNode forAssignee = findEvent(json(getAs("/bidcases/" + bid + "/prep/history", MEMBER2)), "OPEN_START");
        assertTrue(forAssignee.path("reason").isNull());
    }

    @Test
    public void S14_알림_받을_팀장을_못_정하면_409_NOTIFY_TARGET_NOT_RESOLVED이고_시작되지_않는다() throws Exception {
        String bid = confirm(MEMBER, INST);
        jdbc.update("UPDATE USERS SET APPROVER_MANUAL=0 WHERE EMP_NO=?", MEMBER);   // 결재선 자동 지정 → 같은 팀 팀장을 정할 수 없다
        flushMyBatisCache();
        MvcResult r = start(bid, MEMBER, MEMBER2);
        assertCode(r, 409, "NOTIFY_TARGET_NOT_RESOLVED");
        String text = r.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertTrue(text.contains("알림을 받을 영업팀장을 찾지 못했습니다"));
        assertFalse(text.contains(MEMBER) || text.contains(MEMBER2) || text.contains(LEAD));   // 사번 없음
        assertEquals("CONFIRMED", state(bid));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=?", bid));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP_TASK WHERE BID_CASE_ID=?", bid));
        assertEquals(1, act(bid, "BLOCKED", MEMBER, "prep_detail", "open_start", 1, "CONFIRMED"));
    }

    @Test
    public void S15_시작의_화면_값은_prep_detail_open_start만_유효하고_그_밖은_UNKNOWN으로_남는다() throws Exception {
        String bid = confirm(MEMBER, INST);
        String body = "{\"emp_nos\":" + arr(MEMBER2) + "}";
        assertEquals(403, postUi("/bidcases/" + bid + "/prep/start", MEMBER2, body, "prep_list", "open_start").getResponse().getStatus());
        assertEquals(1, act(bid, "DENIED", MEMBER2, "UNKNOWN", "open_start", 0, "CONFIRMED"));
        assertEquals(200, postUi("/bidcases/" + bid + "/prep/start", MEMBER, body, "map_popover", "open_start").getResponse().getStatus());
        assertEquals("성공 줄도 화면이 어긋나면 UNKNOWN·ui_valid=0", 1, act(bid, "OK", MEMBER, "UNKNOWN", "open_start", 0, "CONFIRMED"));
    }

    private JsonNode findEvent(JsonNode history, String event) {
        for (JsonNode n : history) {
            if (event.equals(n.path("event_cd").asText())) {
                return n;
            }
        }
        throw new AssertionError("이력에 " + event + " 가 없다: " + history);
    }

    /** JdbcTemplate 으로 값을 바꾼 뒤 MyBatis 1차 캐시를 비운다(PrepApiTest.flushCache 와 같다). */
    private void flushMyBatisCache() throws Exception {
        mockMvc.perform(post("/bidcases").contentType(MediaType.APPLICATION_JSON)
                .content("{\"institution_id\":\"dobong\"}").header("X-User-Id", "dave")).andReturn();
    }
}
