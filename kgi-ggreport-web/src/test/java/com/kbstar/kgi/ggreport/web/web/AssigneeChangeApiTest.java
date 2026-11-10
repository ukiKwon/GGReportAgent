package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.dto.ApprovalIn;
import com.kbstar.kgi.ggreport.web.mapper.ApprovalRequestMapper;
import com.kbstar.kgi.ggreport.web.mapper.BidAssignmentMapper;
import com.kbstar.kgi.ggreport.web.service.ApprovalRequestService;
import com.kbstar.kgi.ggreport.web.service.BidAssignmentService;
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
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 019 배정 S2-b — 담당자 변경 결재(ASSIGNEE_CHANGE). 시드: 영업팀장 이영업 5047192·안재원 5640327(둘 다 활성),
 * 영업부장 박영업 2674805(→ 백수아 1473958, 역시 ROLE 영업부장), 영업팀 6명.
 * ⚠️ X-Emp-No 는 자기신고다 — 여기서 고정하는 것은 업무 규칙이지 사칭 방지가 아니다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class AssigneeChangeApiTest {

    private static final String LEAD = "5047192";     // 영업팀장 이영업
    private static final String LEAD2 = "5640327";    // 영업팀장 안재원
    private static final String HEAD = "2674805";     // 영업부장 박영업
    private static final String EXEC = "1473958";     // 영업부장(ROLE) 백수아, 박영업의 상위
    private static final String MEMBER = "3918264";   // 영업팀 김영업
    private static final String MEMBER2 = "3361829";  // 영업팀 윤서준
    private static final String M3 = "7742059";
    private static final String M4 = "2189346";
    private static final String M5 = "5934710";
    private static final String M6 = "8470251";
    private static final String DESIGNER = "7130526";
    private static final String ADMIN = "8203417";
    private static final String IT = "4482971";
    private static final String PATH = "/approval-requests/assignee-change";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private BidAssignmentService service;
    @Autowired private ApprovalRequestService approvals;
    @Autowired private ApprovalRequestMapper requestMapper;
    @Autowired private BidAssignmentMapper assignMapper;
    private final ObjectMapper om = new ObjectMapper();

    // ── 도우미 ───────────────────────────────────────────────────────

    private String newCase() throws Exception {
        String res = mockMvc.perform(post("/bidcases").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"institution_id\":\"nowon\"}").header("X-User-Id", "dave"))
                .andReturn().getResponse().getContentAsString();
        String id = om.readTree(res).path("bid_case_id").asText();
        assertFalse(id.isEmpty());
        return id;
    }

    /** MyBatis 쓰기 한 번으로 1차 캐시를 비운다(JdbcTemplate 으로 USERS 를 바꾼 뒤 호출). */
    private void flushCache() throws Exception {
        newCase();
    }

    private static MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder b, String emp) {
        return emp == null ? b : b.header("X-Emp-No", emp);
    }

    private JsonNode json(MvcResult r) throws Exception {
        return om.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private static String[] a(String... x) {
        return x;
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

    private void initial(String bc, String... emps) throws Exception {
        String body = "{\"emp_nos\":" + arr(emps) + "}";
        assertEquals(201, postJson("/bidcases/" + bc + "/assignments", LEAD, body).getResponse().getStatus());
    }

    private MvcResult change(String emp, String bc, String[] add, String[] remove, String reason) throws Exception {
        String body = "{\"bid_case_id\":\"" + bc + "\",\"add_emp_nos\":" + arr(add) + ",\"remove_emp_nos\":"
                + arr(remove) + ",\"reason\":\"" + reason + "\"}";
        return postJson(PATH, emp, body);
    }

    private long submitOk(String emp, String bc, String[] add, String[] remove) throws Exception {
        MvcResult r = change(emp, bc, add, remove, "인력 조정");
        assertEquals(201, r.getResponse().getStatus());
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

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private int active(String bc) {
        return count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=? AND ACTIVE_YN=1", bc);
    }

    private int groupVer(String bc) {
        return count("SELECT GROUP_VER FROM BID_ASSIGN_CASE WHERE BID_CASE_ID=?", bc);
    }

    private Long pending(String bc) {
        return jdbc.queryForList("SELECT PENDING_REQ_ID FROM BID_ASSIGN_CASE WHERE BID_CASE_ID=?", Long.class, bc).get(0);
    }

    private int changeRequests() {
        return count("SELECT COUNT(*) FROM APPROVAL_REQUEST WHERE REQ_TYPE='ASSIGNEE_CHANGE'");
    }

    // ── 상신 ─────────────────────────────────────────────────────────

    @Test
    public void 담당자_상신은_201_결재자는_영업팀장_배정은_그대로_선점과_pending_change() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER);
        MvcResult r = change(MEMBER, bc, a(MEMBER2), a(), "인력 보강");
        assertEquals(201, r.getResponse().getStatus());
        JsonNode j = json(r);
        long id = j.path("req_id").asLong();
        assertEquals("ASSIGNEE_CHANGE", j.path("req_type").asText());
        assertEquals("PENDING", j.path("status").asText());
        assertEquals(1, j.path("steps").size());
        assertEquals("LINE", j.path("steps").get(0).path("kind").asText());
        assertEquals(LEAD, j.path("steps").get(0).path("approver_emp_no").asText());
        assertEquals(1, j.path("payload").path("group_ver").asInt());
        assertEquals("인력 보강", j.path("payload").path("reason").asText());
        assertEquals("윤서준", j.path("people").get(0).path("name").asText());
        assertEquals(1, active(bc));                                  // 승인 전에는 배정 불변
        assertEquals(Long.valueOf(id), pending(bc));
        assertTrue(inInbox(LEAD, id));
        assertFalse(inInbox(HEAD, id));
        assertFalse(inInbox(MEMBER, id));

        JsonNode view = json(getAs("/bidcases/" + bc + "/assignments", MEMBER));
        assertEquals(id, view.path("pending_change").path("req_id").asLong());
        assertEquals(MEMBER2, view.path("pending_change").path("add_emp_nos").get(0).asText());
        assertEquals(0, view.path("pending_change").path("remove_emp_nos").size());
        assertEquals(MEMBER, view.path("pending_change").path("requested_by").asText());
        assertFalse(view.path("viewer").path("can_request_change").asBoolean());   // 진행 중이면 새 신청 불가
    }

    @Test
    public void 접근이력에는_건번호_인원수_요청번호만_남는다() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER);
        long id = submitOk(MEMBER, bc, a(MEMBER2), a());
        // 같은 경로의 이력이 다른 테스트에서도 쌓이므로 가장 최근 1건만 본다.
        String detail = jdbc.queryForList(
                "SELECT DETAIL FROM ACCESS_LOG WHERE EVENT_TYPE='API' AND HTTP_METHOD='POST' AND REQ_PATH=? ORDER BY LOG_ID DESC",
                String.class, PATH).get(0);
        assertEquals("assign case=" + bc + " add=1 remove=0 req=" + id + " code=CHANGE_REQ", detail);
        assertFalse(detail.contains(MEMBER2));
        assertFalse(detail.contains("인력 조정"));
    }

    @Test
    public void 상신_자격이_없으면_403이고_DENIED로_남는다() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER);
        for (String emp : new String[]{MEMBER2, HEAD, DESIGNER, ADMIN, IT}) {
            assertEquals(emp, 403, change(emp, bc, a(M3), a(), "사유").getResponse().getStatus());
        }
        assertEquals(401, change(null, bc, a(M3), a(), "사유").getResponse().getStatus());
        assertEquals(403, change("9999999", bc, a(M3), a(), "사유").getResponse().getStatus());
        assertEquals(0, changeRequests());
        Map<String, Object> row = jdbc.queryForList(
                "SELECT EVENT_TYPE, STATUS_CODE, DETAIL FROM ACCESS_LOG WHERE REQ_PATH=? ORDER BY LOG_ID DESC", PATH).get(0);
        assertEquals("DENIED", row.get("EVENT_TYPE"));
        assertEquals(403, ((Number) row.get("STATUS_CODE")).intValue());
        assertFalse(String.valueOf(row.get("DETAIL")).contains(bc));
    }

    @Test
    public void 입력_검증_400_404_409_422_어느_것도_요청을_남기지_않는다() throws Exception {
        jdbc.update("UPDATE USERS SET STATUS='LOCKED' WHERE EMP_NO=?", M6);   // 비활성 대상 — 아직 읽지 않은 행
        String bc = newCase();
        initial(bc, MEMBER);
        Object[][] bad = {
                {a(), a(), "사유"},                                 // 추가·해제 모두 없음
                {a(MEMBER2), a(MEMBER2), "사유"},                   // 겹침
                {a(MEMBER), a(), "사유"},                           // 이미 담당자를 추가
                {a(), a(MEMBER2), "사유"},                          // 담당자 아닌 사람 해제
                {a(HEAD), a(), "사유"},                             // 영업부장 불가
                {a(IT), a(), "사유"},                               // 영업 계열 아님
                {a(DESIGNER), a(), "사유"},                         // 디자이너 불가
                {a("12345"), a(), "사유"},                          // 형식 오류
                {a(MEMBER2, MEMBER2), a(), "사유"},                 // 중복
                {a("9999999"), a(), "사유"},                        // 미등록
                {a(M6), a(), "사유"},                               // 비활성(잠김)
                {a(M3), a(), ""},                                   // 사유 없음
                {a(M3), a(), "   "},
        };
        for (Object[] c : bad) {
            assertEquals(400, change(LEAD, bc, (String[]) c[0], (String[]) c[1], (String) c[2]).getResponse().getStatus());
        }
        StringBuilder longReason = new StringBuilder();
        for (int i = 0; i < 201; i++) {
            longReason.append('가');
        }
        assertEquals(400, change(LEAD, bc, a(M3), a(), longReason.toString()).getResponse().getStatus());
        assertEquals(400, postJson(PATH, LEAD, "{\"add_emp_nos\":[\"" + M3 + "\"],\"reason\":\"사유\"}").getResponse().getStatus());
        assertEquals(400, postJson(PATH, LEAD, "{}").getResponse().getStatus());
        assertEquals(422, change(LEAD, bc, a(M3), a(), "연락처 010-1234-5678").getResponse().getStatus());
        assertEquals(404, change(LEAD, "no-such-case", a(M3), a(), "사유").getResponse().getStatus());
        String bare = newCase();                                         // 배정 전 건
        MvcResult na = change(LEAD, bare, a(M3), a(), "사유");
        assertEquals(409, na.getResponse().getStatus());
        assertEquals("NOT_ASSIGNED", json(na).path("detail").path("code").asText());
        assertEquals(403, change(MEMBER, bare, a(M3), a(), "사유").getResponse().getStatus());
        assertEquals(0, changeRequests());
        assertNull(pending(bc));
    }

    @Test
    public void 마지막_한_명을_해제하면_400_NO_ASSIGNEE_LEFT() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER);
        MvcResult r = change(LEAD, bc, a(), a(MEMBER), "사유");
        assertEquals(400, r.getResponse().getStatus());
        assertEquals("NO_ASSIGNEE_LEFT", json(r).path("detail").path("code").asText());
        assertEquals(0, changeRequests());
    }

    @Test
    public void 결과가_열한_명이_되면_400_TOO_MANY_ASSIGNEES() throws Exception {
        for (int i = 1; i <= 5; i++) {                                   // 가상 영업팀 사용자 5명(테스트 트랜잭션 안에서만 존재)
            jdbc.update("INSERT INTO USERS (EMP_NO, NAME, ROLE, POSITION_TITLE, APPROVAL_GRADE, STATUS, FAILED_LOGINS, "
                    + "CREATED_AT, UPDATED_AT) VALUES (?, ?, '영업팀', '사원', 'NONE', 'ACTIVE', 0, 'x', 'x')", "910000" + i, "가상" + i);
        }
        String bc = newCase();
        initial(bc, MEMBER, MEMBER2, M3, M4, M5, M6, "9100001", "9100002", "9100003", "9100004");   // 10명
        MvcResult r = change(LEAD, bc, a("9100005"), a(), "사유");
        assertEquals(400, r.getResponse().getStatus());
        assertEquals("TOO_MANY_ASSIGNEES", json(r).path("detail").path("code").asText());
        assertEquals(0, changeRequests());
    }

    @Test
    public void 진행_중_신청이_있으면_409_CHANGE_PENDING_반려_취소_뒤에는_재신청된다() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER);
        long id1 = submitOk(MEMBER, bc, a(MEMBER2), a());
        MvcResult dup = change(LEAD, bc, a(M3), a(), "사유");
        assertEquals(409, dup.getResponse().getStatus());
        assertEquals("CHANGE_PENDING", json(dup).path("detail").path("code").asText());
        assertEquals(409, change(MEMBER, bc, a(M3), a(), "사유").getResponse().getStatus());
        assertEquals(1, changeRequests());

        assertEquals(400, decide(LEAD, id1, "REJECT", null).getResponse().getStatus());      // 반려 의견 필수
        MvcResult rej = decide(LEAD, id1, "REJECT", "인원 충분");
        assertEquals(200, rej.getResponse().getStatus());
        assertEquals("REJECTED", json(rej).path("status").asText());
        assertEquals(1, active(bc));
        assertEquals(1, groupVer(bc));

        long id2 = submitOk(MEMBER, bc, a(MEMBER2), a());                                      // 낡은 선점을 새 신청이 교체
        assertEquals(Long.valueOf(id2), pending(bc));
        MvcResult cancel = postJson("/approval-requests/" + id2 + "/cancel", MEMBER, "{}");
        assertEquals(200, cancel.getResponse().getStatus());
        long id3 = submitOk(MEMBER, bc, a(MEMBER2), a());
        assertEquals(Long.valueOf(id3), pending(bc));
    }

    // ── 승인 ─────────────────────────────────────────────────────────

    @Test
    public void 승인하면_한_번에_반영된다_추가_GROUP_VER_증가_선점_해제_이력() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER);
        long id = submitOk(MEMBER, bc, a(MEMBER2), a());
        MvcResult ok = decide(LEAD, id, "APPROVE", null);
        assertEquals(200, ok.getResponse().getStatus());
        JsonNode done = json(ok);
        assertEquals("APPROVED", done.path("status").asText());
        assertTrue(done.path("result_note").asText().contains("담당자 변경 반영"));
        assertEquals(2, active(bc));
        assertEquals(2, groupVer(bc));
        assertNull(pending(bc));
        List<Map<String, Object>> logs = jdbc.queryForList(
                "SELECT TARGET_EMP_NO, REQ_ID, ACTOR_EMP_NO, EMP_VERIFIED, REASON FROM BID_ASSIGN_LOG "
                        + "WHERE BID_CASE_ID=? AND ACTION_CD='ADD'", bc);
        assertEquals(1, logs.size());
        assertEquals(MEMBER2, logs.get(0).get("TARGET_EMP_NO"));
        assertEquals(id, ((Number) logs.get(0).get("REQ_ID")).longValue());
        assertEquals(LEAD, logs.get(0).get("ACTOR_EMP_NO"));
        assertEquals(0, ((Number) logs.get(0).get("EMP_VERIFIED")).intValue());     // 자기신고
        assertTrue(service.isActiveAssignee(bc, MEMBER2));
        JsonNode hist = json(getAs("/bidcases/" + bc + "/assignments/history", HEAD));
        assertEquals(2, hist.size());                                                // ASSIGN 1 + ADD 1
        assertEquals("ADD", hist.get(1).path("action_cd").asText());
        assertEquals(id, hist.get(1).path("req_id").asLong());
    }

    @Test
    public void 해제와_추가_동시_해제됐던_사람은_행_복구_영업팀장_관련이면_영업부장_결재() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER);
        long id1 = submitOk(MEMBER, bc, a(MEMBER2), a(MEMBER));                              // 자기 해제 + 추가
        assertEquals(200, decide(LEAD, id1, "APPROVE", null).getResponse().getStatus());
        assertFalse(service.isActiveAssignee(bc, MEMBER));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=? AND EMP_NO=? AND ACTIVE_YN=1", bc, MEMBER));
        assertEquals(403, change(MEMBER, bc, a(M3), a(), "사유").getResponse().getStatus());  // 해제되면 신청 자격도 없다

        MvcResult r = change(LEAD, bc, a(MEMBER), a(MEMBER2), "되돌림");                      // 팀장 상신 → 부장 결재
        assertEquals(201, r.getResponse().getStatus());
        long id2 = json(r).path("req_id").asLong();
        assertEquals(HEAD, json(r).path("steps").get(0).path("approver_emp_no").asText());
        assertEquals(200, decide(HEAD, id2, "APPROVE", null).getResponse().getStatus());
        assertEquals(2, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=?", bc));   // 새 행 없이 복구
        Map<String, Object> m = jdbc.queryForList(
                "SELECT ACTIVE_YN, RELEASED_BY FROM BID_ASSIGNMENT WHERE BID_CASE_ID=? AND EMP_NO=?", bc, MEMBER).get(0);
        assertEquals(1, ((Number) m.get("ACTIVE_YN")).intValue());
        assertNull(m.get("RELEASED_BY"));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=? AND EMP_NO=? AND ACTIVE_YN=1", bc, MEMBER2));
        assertEquals(3, groupVer(bc));
        assertEquals(2, count("SELECT COUNT(*) FROM BID_ASSIGN_LOG WHERE BID_CASE_ID=? AND ACTION_CD='ADD'", bc));
        assertEquals(2, count("SELECT COUNT(*) FROM BID_ASSIGN_LOG WHERE BID_CASE_ID=? AND ACTION_CD='RELEASE'", bc));
    }

    @Test
    public void 승인_직전_담당자_구성_버전이_바뀌면_409_GROUP_VER_CHANGED_배정은_그대로() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER);
        long id = submitOk(MEMBER, bc, a(MEMBER2), a());
        jdbc.update("UPDATE BID_ASSIGN_CASE SET GROUP_VER = GROUP_VER + 1 WHERE BID_CASE_ID=?", bc);   // 동시 변경 흉내
        MvcResult r = decide(LEAD, id, "APPROVE", null);
        assertEquals(409, r.getResponse().getStatus());
        assertEquals("GROUP_VER_CHANGED", json(r).path("detail").path("code").asText());
        assertEquals(2, groupVer(bc));                                                  // 증가되지 않았다
        assertEquals(1, active(bc));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGN_LOG WHERE BID_CASE_ID=? AND ACTION_CD='ADD'", bc));
        // 실제 운영에서는 이 409 가 decide 트랜잭션 전체(단계 승인 포함)를 되돌린다 — 이 테스트 하네스에서는 외부 트랜잭션이라 확인 불가.
    }

    // ── 결재선: 영업팀장 관련 ─────────────────────────────────────────

    @Test
    public void 영업팀장_상신은_영업부장_박영업이_결재한다_본인_백수아_팀원은_승인_못_한다() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER);
        long id = submitOk(LEAD, bc, a(MEMBER2), a());
        MvcResult v = getAs("/approval-requests?box=mine", LEAD);
        assertEquals(HEAD, json(v).path("items").get(0).path("steps").get(0).path("approver_emp_no").asText());
        assertEquals(403, decide(LEAD, id, "APPROVE", null).getResponse().getStatus());      // 본인 요청
        assertEquals(403, decide(EXEC, id, "APPROVE", null).getResponse().getStatus());      // 지정 결재자가 아님
        assertEquals(403, decide(MEMBER, id, "APPROVE", null).getResponse().getStatus());
        assertEquals(1, active(bc));
        assertEquals(200, decide(HEAD, id, "APPROVE", null).getResponse().getStatus());
        assertEquals(2, active(bc));
    }

    @Test
    public void 영업팀장이_현_담당자인_건은_팀원이_올려도_영업부장_결재() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER, LEAD);
        MvcResult r = change(MEMBER, bc, a(MEMBER2), a(), "사유");
        assertEquals(201, r.getResponse().getStatus());
        long id = json(r).path("req_id").asLong();
        assertEquals(HEAD, json(r).path("steps").get(0).path("approver_emp_no").asText());
        assertEquals(403, decide(LEAD, id, "APPROVE", null).getResponse().getStatus());      // 팀장 본인 건을 팀장이 승인 못 한다
        assertEquals(200, decide(HEAD, id, "APPROVE", null).getResponse().getStatus());
    }

    @Test
    public void 영업팀장이_추가_대상이면_영업부장_결재_다른_팀장도_승인_못_한다() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER);
        MvcResult r = change(MEMBER, bc, a(LEAD2), a(), "사유");
        assertEquals(201, r.getResponse().getStatus());
        long id = json(r).path("req_id").asLong();
        assertEquals(HEAD, json(r).path("steps").get(0).path("approver_emp_no").asText());
        assertEquals(403, decide(LEAD, id, "APPROVE", null).getResponse().getStatus());
        assertEquals(403, decide(LEAD2, id, "APPROVE", null).getResponse().getStatus());     // 승인자=수혜자 불가
        assertEquals(200, decide(HEAD, id, "APPROVE", null).getResponse().getStatus());
        assertTrue(service.isActiveAssignee(bc, LEAD2));
    }

    @Test
    public void 체인이_없고_영업팀장이_둘이면_400_APPROVER_NOT_RESOLVED_하나뿐이면_그_사람() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER);
        jdbc.update("UPDATE USERS SET APPROVER_EMP_NO=NULL WHERE EMP_NO=?", MEMBER);
        flushCache();
        MvcResult r = change(MEMBER, bc, a(MEMBER2), a(), "사유");
        assertEquals(400, r.getResponse().getStatus());
        assertEquals("APPROVER_NOT_RESOLVED", json(r).path("detail").path("code").asText());
        assertEquals(0, changeRequests());

        jdbc.update("UPDATE USERS SET STATUS='LOCKED' WHERE EMP_NO=?", LEAD2);
        flushCache();
        MvcResult ok = change(MEMBER, bc, a(MEMBER2), a(), "사유");
        assertEquals(201, ok.getResponse().getStatus());
        assertEquals(LEAD, json(ok).path("steps").get(0).path("approver_emp_no").asText());
    }

    @Test
    public void 박영업이_비활성이면_체인의_백수아가_결재하고_둘_다_비활성이면_400() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER);
        jdbc.update("UPDATE USERS SET STATUS='LOCKED' WHERE EMP_NO=?", HEAD);
        flushCache();
        MvcResult r = change(LEAD, bc, a(MEMBER2), a(), "사유");
        assertEquals(201, r.getResponse().getStatus());
        long id = json(r).path("req_id").asLong();
        assertEquals(EXEC, json(r).path("steps").get(0).path("approver_emp_no").asText());
        assertEquals(200, decide(EXEC, id, "APPROVE", null).getResponse().getStatus());      // 대표급이라 직급 규칙 통과

        String bc2 = newCase();
        initial(bc2, MEMBER);
        jdbc.update("UPDATE USERS SET STATUS='LOCKED' WHERE EMP_NO=?", EXEC);
        flushCache();
        MvcResult none = change(LEAD, bc2, a(MEMBER2), a(), "사유");
        assertEquals(400, none.getResponse().getStatus());
        assertEquals("APPROVER_NOT_RESOLVED", json(none).path("detail").path("code").asText());
    }

    // ── 대결 금지 ────────────────────────────────────────────────────

    @Test
    public void 대결자는_담당자_변경을_승인할_수_없고_받은_결재에도_안_보인다_권한_신청_대결은_그대로() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER);
        String from = Times.todayKst();
        String to = LocalDate.parse(from).plusDays(3).toString();
        MvcResult dep = postJson("/approval-deputies", LEAD, "{\"deputy_emp_no\":\"" + LEAD2 + "\",\"start_date\":\""
                + from + "\",\"end_date\":\"" + to + "\",\"reason\":\"출장\"}");
        assertEquals(200, dep.getResponse().getStatus());

        long id = submitOk(MEMBER, bc, a(MEMBER2), a());
        assertFalse(inInbox(LEAD2, id));
        assertEquals(403, decide(LEAD2, id, "APPROVE", null).getResponse().getStatus());
        assertEquals("PENDING", jdbc.queryForObject("SELECT STATUS FROM APPROVAL_REQUEST WHERE REQ_ID=?", String.class, id));
        assertEquals(1, active(bc));
        assertEquals(200, decide(LEAD, id, "APPROVE", null).getResponse().getStatus());

        // 같은 대결 지정이 권한 신청에서는 그대로 유효하다(기존 동작 불변).
        MvcResult perm = postJson("/approval-requests/perm", MEMBER,
                "{\"reason\":\"업무상 필요\",\"changes\":[{\"menu\":\"knowledge\",\"view\":true,\"write\":true}]}");
        assertEquals(200, perm.getResponse().getStatus());
        assertTrue(inInbox(LEAD2, json(perm).path("req_id").asLong()));
    }

    // ── 목록·유형 ────────────────────────────────────────────────────

    @Test
    public void 결재_유형_목록에_담당자_변경이_더해지고_권한_신청은_그대로다() throws Exception {
        JsonNode types = json(getAs("/approval-requests/types", MEMBER)).path("types");
        assertEquals("PERM_REQUEST", types.get(0).path("key").asText());
        boolean found = false;
        for (JsonNode t : types) {
            if ("ASSIGNEE_CHANGE".equals(t.path("key").asText())) {
                found = true;
                assertTrue(t.path("submittable").asBoolean());
            }
        }
        assertTrue(found);
    }

    // ── 보안 검토 보강(중-1·중-2·하-1·하-4·하-5, 2026-11-10) ───────────────

    private String reqStatus(long id) {
        return jdbc.queryForObject("SELECT STATUS FROM APPROVAL_REQUEST WHERE REQ_ID=?", String.class, id);
    }

    private ApprovalIn.Decision decision(String d, String comment) {
        ApprovalIn.Decision x = new ApprovalIn.Decision();
        x.setDecision(d);
        x.setComment(comment);
        return x;
    }

    private boolean inBox(String box, String emp, long id) throws Exception {
        MvcResult r = mockMvc.perform(as(get("/approval-requests").param("box", box), emp)).andReturn();
        for (JsonNode n : json(r).path("items")) {
            if (n.path("req_id").asLong() == id) {
                return true;
            }
        }
        return false;
    }

    @Test
    public void 끝난_요청과_단계는_상태_전이_문장이_0행이고_값이_바뀌지_않는다() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER);
        long id = submitOk(MEMBER, bc, a(MEMBER2), a());
        assertEquals(200, postJson("/approval-requests/" + id + "/cancel", MEMBER, "{}").getResponse().getStatus());
        assertEquals(0, requestMapper.updateRequest(id, "APPROVED", 1, "x", Times.nowIso()));
        assertEquals("CANCELLED", reqStatus(id));
        Long stepId = jdbc.queryForObject("SELECT STEP_ID FROM APPROVAL_STEP WHERE REQ_ID=?", Long.class, id);
        assertEquals(0, requestMapper.updateStep(stepId, "APPROVED", LEAD, 0, null, Times.nowIso()));
        assertEquals("SKIPPED", jdbc.queryForObject("SELECT STATUS FROM APPROVAL_STEP WHERE STEP_ID=?", String.class, stepId));
    }

    /**
     * 경합 재현: 같은 트랜잭션 안에서 MyBatis 가 PENDING 으로 읽어 둔(1차 캐시) 요청을 JdbcTemplate 으로 몰래 끝내면,
     * 서비스는 낡은 PENDING 을 믿고 들어가지만 UPDATE 의 STATUS 조건이 0행을 돌려 409 로 끝난다.
     */
    @Test
    public void 취소된_요청에_결재하면_409_상태는_취소_그대로() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER);
        long id = submitOk(MEMBER, bc, a(MEMBER2), a());
        requestMapper.selectById(id);
        jdbc.update("UPDATE APPROVAL_REQUEST SET STATUS='CANCELLED' WHERE REQ_ID=?", id);
        try {
            approvals.decide(id, decision("REJECT", "경합"), Actor.claimed(LEAD));
            fail("409 여야 한다");
        } catch (ApiException e) {
            assertEquals(409, e.getStatus());
        }
        assertEquals("CANCELLED", reqStatus(id));
    }

    @Test
    public void 승인된_요청에_취소하면_409_상태와_선점은_그대로() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER);
        long id = submitOk(MEMBER, bc, a(MEMBER2), a());
        requestMapper.selectById(id);
        jdbc.update("UPDATE APPROVAL_REQUEST SET STATUS='APPROVED' WHERE REQ_ID=?", id);
        try {
            approvals.cancel(id, Actor.claimed(MEMBER));
            fail("409 여야 한다");
        } catch (ApiException e) {
            assertEquals(409, e.getStatus());
        }
        assertEquals("APPROVED", reqStatus(id));
        assertEquals(Long.valueOf(id), pending(bc));
    }

    @Test
    public void 순차로도_처리된_요청에_결재_취소는_409() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER);
        long id = submitOk(MEMBER, bc, a(MEMBER2), a());
        assertEquals(200, postJson("/approval-requests/" + id + "/cancel", MEMBER, "{}").getResponse().getStatus());
        assertEquals(409, decide(LEAD, id, "APPROVE", null).getResponse().getStatus());
        assertEquals(409, postJson("/approval-requests/" + id + "/cancel", MEMBER, "{}").getResponse().getStatus());
        long id2 = submitOk(MEMBER, bc, a(MEMBER2), a());
        assertEquals(200, decide(LEAD, id2, "APPROVE", null).getResponse().getStatus());
        assertEquals(409, postJson("/approval-requests/" + id2 + "/cancel", MEMBER, "{}").getResponse().getStatus());
        assertEquals("APPROVED", reqStatus(id2));
    }

    @Test
    public void 취소하면_그_요청의_선점이_풀리고_다른_요청의_선점은_건드리지_않는다() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER);
        long id1 = submitOk(MEMBER, bc, a(MEMBER2), a());
        assertEquals(Long.valueOf(id1), pending(bc));
        assertEquals(200, postJson("/approval-requests/" + id1 + "/cancel", MEMBER, "{}").getResponse().getStatus());
        assertNull(pending(bc));
        assertEquals(1, groupVer(bc));
        JsonNode view = json(getAs("/bidcases/" + bc + "/assignments", MEMBER));
        assertTrue(view.path("pending_change").isNull());
        assertTrue(view.path("viewer").path("can_request_change").asBoolean());

        long id2 = submitOk(MEMBER, bc, a(MEMBER2), a());
        assertEquals(0, assignMapper.releasePending(bc, id1));
        assertEquals(Long.valueOf(id2), pending(bc));
        assertEquals(1, assignMapper.releasePending(bc, id2));
        assertNull(pending(bc));
    }

    @Test
    public void 승인_때_영업팀장이_추가_대상인데_결재자가_영업팀장이면_409_배정_불변() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER);
        long id = submitOk(MEMBER, bc, a(LEAD2), a());
        jdbc.update("UPDATE APPROVAL_STEP SET APPROVER_EMP_NO=? WHERE REQ_ID=?", LEAD, id);
        flushCache();
        MvcResult r = decide(LEAD, id, "APPROVE", null);
        assertEquals(409, r.getResponse().getStatus());
        assertEquals("APPROVER_ROLE_MISMATCH", json(r).path("detail").path("code").asText());
        assertEquals(1, active(bc));
        assertFalse(service.isActiveAssignee(bc, LEAD2));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGN_LOG WHERE BID_CASE_ID=? AND ACTION_CD='ADD'", bc));
    }

    @Test
    public void 승인_때_현_담당자에_영업팀장이_있는데_결재자가_영업팀장이면_409() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER, LEAD);
        long id = submitOk(MEMBER, bc, a(MEMBER2), a());
        jdbc.update("UPDATE APPROVAL_STEP SET APPROVER_EMP_NO=? WHERE REQ_ID=?", LEAD2, id);
        flushCache();
        MvcResult r = decide(LEAD2, id, "APPROVE", null);
        assertEquals(409, r.getResponse().getStatus());
        assertEquals("APPROVER_ROLE_MISMATCH", json(r).path("detail").path("code").asText());
        assertEquals(2, active(bc));
        assertFalse(service.isActiveAssignee(bc, MEMBER2));
    }

    @Test
    public void 영업부장_역할자는_팀장_상신_건의_결재선이_바뀌어도_승인한다_대조군() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER);
        long id = submitOk(LEAD, bc, a(MEMBER2), a());
        jdbc.update("UPDATE APPROVAL_STEP SET APPROVER_EMP_NO=? WHERE REQ_ID=?", EXEC, id);
        flushCache();
        assertEquals(200, decide(EXEC, id, "APPROVE", null).getResponse().getStatus());
        assertEquals(2, active(bc));
    }

    @Test
    public void 영업_계열이_아니면_담당자여도_존재하지_않는_건이어도_403_존재_여부가_드러나지_않는다() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER);
        jdbc.update("INSERT INTO BID_ASSIGNMENT (BID_CASE_ID, EMP_NO, ACTIVE_YN, ASSIGNED_BY, ASSIGNED_AT) "
                + "VALUES (?, ?, 1, ?, 'x')", bc, DESIGNER, LEAD);
        flushCache();
        for (String emp : new String[]{DESIGNER, ADMIN, IT, HEAD}) {
            assertEquals(emp, 403, change(emp, bc, a(M3), a(), "사유").getResponse().getStatus());
            assertEquals(emp, 403, change(emp, "no-such-case", a(M3), a(), "사유").getResponse().getStatus());
        }
        assertEquals(0, changeRequests());
        assertNull(pending(bc));
        assertEquals(404, change(LEAD, "no-such-case", a(M3), a(), "사유").getResponse().getStatus());
    }

    @Test
    public void 관리자_전체_목록에는_담당자_변경이_없고_상신자_결재자_목록에는_있다_권한_신청은_그대로() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER);
        long id = submitOk(MEMBER, bc, a(MEMBER2), a());
        MvcResult perm = postJson("/approval-requests/perm", MEMBER,
                "{\"reason\":\"업무상 필요\",\"changes\":[{\"menu\":\"knowledge\",\"view\":true,\"write\":true}]}");
        assertEquals(200, perm.getResponse().getStatus());
        long permId = json(perm).path("req_id").asLong();

        assertFalse(inBox("all", ADMIN, id));
        assertTrue(inBox("all", ADMIN, permId));
        MvcResult all = mockMvc.perform(as(get("/approval-requests").param("box", "all"), ADMIN)).andReturn();
        String body = all.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertFalse(body.contains(bc));
        assertFalse(body.contains("ASSIGNEE_CHANGE"));
        assertTrue(inBox("mine", MEMBER, id));
        assertTrue(inBox("inbox", LEAD, id));
    }

    @Test
    public void 담당자_변경은_신청자_본인만_취소_관리자는_403_권한_신청의_관리자_취소는_그대로() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER);
        long id = submitOk(MEMBER, bc, a(MEMBER2), a());
        assertEquals(403, postJson("/approval-requests/" + id + "/cancel", ADMIN, "{}").getResponse().getStatus());
        assertEquals("PENDING", reqStatus(id));
        assertEquals(Long.valueOf(id), pending(bc));
        assertEquals(403, postJson("/approval-requests/" + id + "/cancel", MEMBER2, "{}").getResponse().getStatus());
        assertEquals(200, postJson("/approval-requests/" + id + "/cancel", MEMBER, "{}").getResponse().getStatus());
        assertEquals("CANCELLED", reqStatus(id));

        MvcResult perm = postJson("/approval-requests/perm", MEMBER,
                "{\"reason\":\"업무상 필요\",\"changes\":[{\"menu\":\"knowledge\",\"view\":true,\"write\":true}]}");
        long permId = json(perm).path("req_id").asLong();
        assertEquals(200, postJson("/approval-requests/" + permId + "/cancel", ADMIN, "{}").getResponse().getStatus());
        assertEquals("CANCELLED", reqStatus(permId));
    }

    @Test
    public void 대기_변경에_이름이_붙는다_추가_해제_상신자_기존_키는_그대로() throws Exception {
        String bc = newCase();
        initial(bc, MEMBER, MEMBER2);
        long id = submitOk(MEMBER, bc, a(M3), a(MEMBER2));
        JsonNode pc = json(getAs("/bidcases/" + bc + "/assignments", MEMBER)).path("pending_change");
        assertEquals(id, pc.path("req_id").asLong());
        assertEquals(M3, pc.path("add_emp_nos").get(0).asText());
        assertEquals(MEMBER2, pc.path("remove_emp_nos").get(0).asText());
        assertEquals(MEMBER, pc.path("requested_by").asText());
        assertEquals(1, pc.path("add_people").size());
        assertEquals(M3, pc.path("add_people").get(0).path("emp_no").asText());
        assertEquals(jdbc.queryForObject("SELECT NAME FROM USERS WHERE EMP_NO=?", String.class, M3),
                pc.path("add_people").get(0).path("name").asText());
        assertEquals(MEMBER2, pc.path("remove_people").get(0).path("emp_no").asText());
        assertEquals(jdbc.queryForObject("SELECT NAME FROM USERS WHERE EMP_NO=?", String.class, MEMBER2),
                pc.path("remove_people").get(0).path("name").asText());
        assertEquals(jdbc.queryForObject("SELECT NAME FROM USERS WHERE EMP_NO=?", String.class, MEMBER),
                pc.path("requested_by_name").asText());
        assertEquals(2, pc.path("add_people").get(0).size());
    }

    @Test
    public void 신청_제목은_담당자_변경_기관명이고_기관이_없으면_건번호() throws Exception {
        String inst = jdbc.queryForObject("SELECT NAME_KO FROM INSTITUTIONS WHERE INSTITUTION_ID='nowon'", String.class);
        String bc = newCase();
        initial(bc, MEMBER);
        MvcResult r = change(MEMBER, bc, a(MEMBER2), a(), "인력 보강");
        assertEquals(201, r.getResponse().getStatus());
        assertEquals("담당자 변경 — " + inst, json(r).path("title").asText());

        String bc2 = newCase();
        initial(bc2, MEMBER);
        jdbc.update("UPDATE BID_CASES SET INSTITUTION_ID='no-such-inst' WHERE BID_CASE_ID=?", bc2);
        flushCache();
        MvcResult r2 = change(MEMBER, bc2, a(MEMBER2), a(), "인력 보강");
        assertEquals(201, r2.getResponse().getStatus());
        assertEquals("담당자 변경 — " + bc2, json(r2).path("title").asText());
    }
}
