package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 결재 요청·대결. 시드: 김영업 {@code 3918264}(대리) → 이영업 {@code 5047192}(팀장) → 박영업 {@code 2674805}(부장)
 * → 백수아 {@code 1473958}(대표). 안재원 {@code 5640327}은 다른 팀장, 윤서준 {@code 3361829}는 계장, 마스터 {@code 8203417}이 관리자.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class ApprovalLineApiTest {

    private static final String MEMBER = "3918264";
    private static final String LEAD = "5047192";
    private static final String LEAD2 = "5640327";
    private static final String HEAD = "2674805";
    private static final String EXEC = "1473958";
    private static final String JUNIOR = "3361829";
    private static final String ADMIN = "8203417";
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private SysUserMapper userMapper;

    private static String today(int plusDays) {
        return LocalDate.now(ZoneId.of("Asia/Seoul")).plusDays(plusDays).toString();
    }

    private JsonNode call(String emp, MockHttpServletRequestBuilder b, String body, int expect) throws Exception {
        MockHttpServletRequestBuilder r = b.header(Actor.HEADER, emp);
        if (body != null) {
            r = r.contentType(MediaType.APPLICATION_JSON).content(body);
        }
        String text = mockMvc.perform(r).andExpect(status().is(expect)).andReturn().getResponse()
                .getContentAsString(StandardCharsets.UTF_8);
        return text.isEmpty() ? null : JSON.readTree(text);
    }

    private JsonNode submit(String emp, String changes, int expect) throws Exception {
        return call(emp, post("/approval-requests/perm"),
                "{\"reason\":\"업무상 필요\",\"changes\":" + changes + "}", expect);
    }

    private static final String KNOWLEDGE_WRITE = "[{\"menu\":\"knowledge\",\"view\":true,\"write\":true}]";
    private static final String APPROVALS_APPROVE = "[{\"menu\":\"approvals\",\"view\":true,\"approve\":true}]";

    private JsonNode decide(String emp, long id, String decision, String comment, int expect) throws Exception {
        return call(emp, post("/approval-requests/" + id + "/decide"),
                "{\"decision\":\"" + decision + "\",\"comment\":" + (comment == null ? "null" : "\"" + comment + "\"") + "}",
                expect);
    }

    private boolean inInbox(String emp, long id) throws Exception {
        for (JsonNode n : call(emp, get("/approval-requests").param("box", "inbox"), null, 200).get("items")) {
            if (n.get("req_id").asLong() == id) {
                return true;
            }
        }
        return false;
    }

    private boolean permOn(String emp, String menu, String flag) throws Exception {
        for (JsonNode n : call(ADMIN, get("/sysadmin/perms/" + emp), null, 200).get("menus")) {
            if (menu.equals(n.get("menu_key").asText())) {
                return n.get(flag).asBoolean();
            }
        }
        throw new AssertionError("menu not found " + menu);
    }

    // ── 상신·결재 ─────────────────────────────────────────────────────

    @Test
    public void 일반_메뉴_권한_신청은_팀장_승인으로_자동_반영된다() throws Exception {
        assertFalse(permOn(MEMBER, "knowledge", "write"));
        JsonNode r = submit(MEMBER, KNOWLEDGE_WRITE, 200);
        long id = r.get("req_id").asLong();
        assertEquals("PENDING", r.get("status").asText());
        assertEquals(1, r.get("steps").size());
        assertEquals(LEAD, r.get("steps").get(0).get("approver_emp_no").asText());
        assertTrue(inInbox(LEAD, id));
        assertFalse(inInbox(HEAD, id));                 // 부장은 아직 아니다
        assertFalse(inInbox(MEMBER, id));               // 본인 요청은 받은 결재에 없다

        JsonNode done = decide(LEAD, id, "APPROVE", "확인", 200);
        assertEquals("APPROVED", done.get("status").asText());
        assertTrue(done.get("result_note").asText().contains("권한 반영"));
        assertTrue(permOn(MEMBER, "knowledge", "write"));
        JsonNode log = call(ADMIN, get("/sysadmin/perm-changes").param("emp", MEMBER), null, 200).get("items");
        boolean linked = false;
        for (JsonNode n : log) {
            linked |= "approval:REQUEST".equals(n.get("item").asText()) && ("#" + id).equals(n.get("after_value").asText());
        }
        assertTrue("변경 이력에 요청 번호가 남아야 한다", linked);
    }

    @Test
    public void 결재_권한이_들어_있으면_승인_뒤_관리자_확인을_한_번_더_거친다() throws Exception {
        JsonNode r = submit(MEMBER, APPROVALS_APPROVE, 200);
        long id = r.get("req_id").asLong();
        assertEquals(2, r.get("steps").size());
        assertEquals("ADMIN", r.get("steps").get(1).get("kind").asText());

        JsonNode mid = decide(LEAD, id, "APPROVE", null, 200);
        assertEquals("PENDING", mid.get("status").asText());
        assertEquals(2, mid.get("current_step").asInt());
        assertFalse(permOn(MEMBER, "approvals", "approve"));      // 아직 반영 전
        assertFalse(inInbox(LEAD, id));
        assertTrue(inInbox(ADMIN, id));
        decide(LEAD, id, "APPROVE", null, 403);                   // 이미 지나간 단계

        assertEquals("APPROVED", decide(ADMIN, id, "APPROVE", null, 200).get("status").asText());
        assertTrue(permOn(MEMBER, "approvals", "approve"));
    }

    @Test
    public void 반려는_의견이_필수이고_권한은_반영되지_않는다() throws Exception {
        long id = submit(MEMBER, KNOWLEDGE_WRITE, 200).get("req_id").asLong();
        decide(LEAD, id, "REJECT", "  ", 400);
        JsonNode r = decide(LEAD, id, "REJECT", "범위가 넓습니다", 200);
        assertEquals("REJECTED", r.get("status").asText());
        assertEquals("범위가 넓습니다", r.get("steps").get(0).get("comment").asText());
        assertFalse(permOn(MEMBER, "knowledge", "write"));
        decide(LEAD, id, "APPROVE", null, 409);                   // 끝난 요청
    }

    @Test
    public void 결재자가_아니거나_본인이면_결재할_수_없다() throws Exception {
        long id = submit(MEMBER, KNOWLEDGE_WRITE, 200).get("req_id").asLong();
        decide(HEAD, id, "APPROVE", null, 403);                   // 지정 결재자가 아니고 대결도 아니다
        decide(MEMBER, id, "APPROVE", null, 403);                 // 본인
        decide(LEAD2, id, "APPROVE", null, 403);                  // 같은 직급이지만 대결 지정이 없다
        call("9999999", get("/approval-requests"), null, 403);    // 등록되지 않은 사번
        mockMvc.perform(get("/approval-requests")).andExpect(status().isUnauthorized());
    }

    @Test
    public void 신청_내용_검증() throws Exception {
        submit(MEMBER, "[]", 400);
        submit(MEMBER, "[{\"menu\":\"nope\",\"view\":true}]", 400);
        submit(MEMBER, "[{\"menu\":\"map\",\"view\":true,\"approve\":true}]", 400);           // 결재 기능이 없는 메뉴
        submit(MEMBER, "[{\"menu\":\"map\",\"view\":true},{\"menu\":\"map\",\"view\":true}]", 400);   // 중복
        call(MEMBER, post("/approval-requests/perm"), "{\"reason\":\"  \",\"changes\":" + KNOWLEDGE_WRITE + "}", 400);
    }

    @Test
    public void 결재자가_정해지지_않았으면_상신할_수_없고_최상위는_관리자_확인으로_간다() throws Exception {
        call(ADMIN, post("/sysadmin/users"), "{\"emp_no\":\"4040405\",\"name\":\"신입\",\"role\":\"영업팀\"}", 200);
        submit("4040405", KNOWLEDGE_WRITE, 400);                  // 영업팀은 팀장이 둘이라 지정 필요
        JsonNode top = submit(EXEC, KNOWLEDGE_WRITE, 200);
        assertEquals(1, top.get("steps").size());
        assertEquals("ADMIN", top.get("steps").get(0).get("kind").asText());
    }

    @Test
    public void 취소는_상신자나_관리자만() throws Exception {
        long id = submit(MEMBER, KNOWLEDGE_WRITE, 200).get("req_id").asLong();
        call(LEAD, post("/approval-requests/" + id + "/cancel"), null, 403);
        assertEquals("CANCELLED", call(MEMBER, post("/approval-requests/" + id + "/cancel"), null, 200)
                .get("status").asText());
        decide(LEAD, id, "APPROVE", null, 409);
        long id2 = submit(MEMBER, KNOWLEDGE_WRITE, 200).get("req_id").asLong();
        assertEquals("CANCELLED", call(ADMIN, post("/approval-requests/" + id2 + "/cancel"), null, 200)
                .get("status").asText());
    }

    @Test
    public void 전체_목록은_관리자만() throws Exception {
        submit(MEMBER, KNOWLEDGE_WRITE, 200);
        assertTrue(call(ADMIN, get("/approval-requests").param("box", "all"), null, 200).get("items").size() >= 1);
        call(MEMBER, get("/approval-requests").param("box", "all"), null, 403);
        call(MEMBER, get("/approval-requests").param("box", "weird"), null, 400);
        assertEquals(1, call(MEMBER, get("/approval-requests").param("box", "mine"), null, 200).get("items").size());
    }

    // ── 대결 ──────────────────────────────────────────────────────────

    private JsonNode deputy(String emp, String principal, String deputy, int from, int to, int expect) throws Exception {
        return call(emp, post("/approval-deputies"), "{" + (principal == null ? "" : "\"principal_emp_no\":\"" + principal + "\",")
                + "\"deputy_emp_no\":\"" + deputy + "\",\"start_date\":\"" + today(from) + "\",\"end_date\":\""
                + today(to) + "\",\"reason\":\"출장\"}", expect);
    }

    @Test
    public void 부장의_대결자를_다른_팀장으로_둘_수_있고_그_팀장이_대신_결재한다() throws Exception {
        // 팀장의 대결자도 같은 직급인 다른 팀장 — 대결자는 상신자와 같은 직급이어도 막지 않는다(아래 새 테스트 참고)
        JsonNode d = deputy(LEAD, null, LEAD2, 0, 3, 200);
        assertEquals(LEAD, d.get("principal_emp_no").asText());
        assertTrue(d.get("active_now").asBoolean());
        assertTrue(d.get("warning").isNull());                    // 과장 이상이라 경고 없음

        long id = submit(MEMBER, KNOWLEDGE_WRITE, 200).get("req_id").asLong();
        assertTrue(inInbox(LEAD2, id));
        JsonNode view = call(LEAD2, get("/approval-requests").param("box", "inbox"), null, 200).get("items").get(0);
        assertTrue(view.get("acting_as_deputy").asBoolean());
        JsonNode done = decide(LEAD2, id, "APPROVE", "대결", 200);
        assertTrue(done.get("steps").get(0).get("acted_as_deputy").asBoolean());
        assertEquals(LEAD2, done.get("steps").get(0).get("acted_by").asText());
        assertEquals(LEAD, done.get("steps").get(0).get("approver_emp_no").asText());
        assertTrue(permOn(MEMBER, "knowledge", "write"));
    }

    private JsonNode setApprover(String emp, String approver, int expect) throws Exception {
        return call(ADMIN, put("/sysadmin/users/" + emp + "/approver"),
                "{\"approver_emp_no\":\"" + approver + "\",\"mode\":\"MANUAL\"}", expect);
    }

    @Test
    public void 같은_직급을_결재자로_지정하면_지정이_400이고_더_높은_직급이면_상신이_통과한다() throws Exception {
        setApprover(LEAD2, LEAD, 400);                         // 팀장→팀장 : 지정 단계에서 같은 직급은 거부
        setApprover(LEAD2, HEAD, 200);
        JsonNode r = submit(LEAD2, KNOWLEDGE_WRITE, 200);      // 팀장→부장 : 통과
        assertEquals(HEAD, r.get("steps").get(0).get("approver_emp_no").asText());
    }

    @Test
    public void 이미_같은_직급으로_지정된_옛_쌍은_my_perms_는_살리고_상신은_막는다() throws Exception {
        // 규칙 변경 전에 만들어진 쌍을 DB 에 직접 심는다(지금은 API 로는 지정할 수 없다).
        userMapper.updateApprover(LEAD2, LEAD, 1, "2026-10-30T00:00:00+00:00");
        JsonNode perms = call(LEAD2, get("/approval-requests/my-perms"), null, 200);   // 400 으로 깨지지 않는다
        assertTrue(perms.get("approver_emp_no").isNull());
        assertTrue(perms.get("rank_can_approve").asBoolean());
        assertTrue(perms.get("menus").size() > 0);
        submit(LEAD2, KNOWLEDGE_WRITE, 400);                   // 상신 때는 여전히 같은 직급 결재자를 막는다
    }

    @Test
    public void 같은_직급이어도_대결_기간_밖이면_결재할_수_없다() throws Exception {
        long id = submit(LEAD2, KNOWLEDGE_WRITE, 200).get("req_id").asLong();
        deputy(HEAD, null, LEAD, 2, 4, 200);                   // 아직 시작 전
        assertFalse(inInbox(LEAD, id));
        decide(LEAD, id, "APPROVE", null, 403);
    }

    @Test
    public void 같은_직급_대결자에게는_지정이_있을_때만_결재_알림이_간다() throws Exception {
        submit(LEAD2, KNOWLEDGE_WRITE, 200);                   // 팀장 안재원 → 부장 박영업, 이영업은 대결 지정 없음
        assertEquals(0, notesTo(LEAD, "결재알림").size());
    }

    @Test
    public void 같은_직급_대결자가_지정돼_있으면_상신_때_결재_알림을_받는다() throws Exception {
        deputy(HEAD, null, LEAD, 0, 2, 200);                   // 부장이 팀장 이영업을 대결자로
        submit(LEAD2, KNOWLEDGE_WRITE, 200);
        assertEquals(1, notesTo(LEAD, "결재알림").size());
    }

    @Test
    public void 대결자는_상신자와_같은_직급이어도_대결할_수_있다() throws Exception {
        long id = submit(LEAD2, KNOWLEDGE_WRITE, 200).get("req_id").asLong();   // 팀장 안재원 → 부장 박영업
        assertFalse(inInbox(LEAD, id));
        decide(LEAD, id, "APPROVE", null, 403);                // 대결 지정 전: 같은 직급은 결재자가 못 된다
        deputy(HEAD, null, LEAD, 0, 2, 200);                   // 부장이 팀장 이영업을 대결자로
        assertTrue(inInbox(LEAD, id));
        JsonNode done = decide(LEAD, id, "APPROVE", "대결", 200);
        assertTrue(done.get("steps").get(0).get("acted_as_deputy").asBoolean());
        assertEquals(HEAD, done.get("steps").get(0).get("approver_emp_no").asText());
    }

    @Test
    public void 상신자보다_낮은_직급의_대결자는_그_건을_결재할_수_없다() throws Exception {
        JsonNode d = deputy(LEAD, null, JUNIOR, 0, 3, 200);       // 계장을 대결자로 — 지정은 허용(경고만)
        assertTrue(d.get("warning").asText().contains("과장"));
        long id = submit(MEMBER, KNOWLEDGE_WRITE, 200).get("req_id").asLong();   // 대리가 올린 건
        assertFalse(inInbox(JUNIOR, id));
        decide(JUNIOR, id, "APPROVE", null, 403);                 // 계장이 대리의 요청을 결재할 수는 없다
    }

    @Test
    public void 기간이_아직_시작되지_않았거나_취소됐거나_끝나면_대결이_아니다() throws Exception {
        JsonNode future = deputy(LEAD, null, LEAD2, 2, 4, 200);
        long id = submit(MEMBER, KNOWLEDGE_WRITE, 200).get("req_id").asLong();
        assertFalse(inInbox(LEAD2, id));
        call(LEAD, delete("/approval-deputies/" + future.get("deputy_id").asLong()), null, 200);
        JsonNode now = deputy(LEAD, null, LEAD2, 0, 1, 200);
        assertTrue(inInbox(LEAD2, id));
        call(LEAD, delete("/approval-deputies/" + now.get("deputy_id").asLong()), null, 200);
        assertFalse(inInbox(LEAD2, id));
        call(LEAD, delete("/approval-deputies/" + now.get("deputy_id").asLong()), null, 409);   // 이미 취소
    }

    @Test
    public void 대결_지정_검증() throws Exception {
        deputy(LEAD, null, LEAD, 0, 1, 400);                      // 자기 자신
        deputy(LEAD, null, "9999999", 0, 1, 400);
        deputy(LEAD, null, LEAD2, -1, 1, 400);                    // 과거 시작
        deputy(LEAD, null, LEAD2, 3, 1, 400);                     // 종료가 시작보다 이름
        deputy(LEAD, null, LEAD2, 0, 91, 400);                    // 90일 초과
        deputy(MEMBER, null, LEAD2, 0, 1, 400);                   // 결재 등급이 없는 사람은 결재자가 아니다
        deputy(MEMBER, LEAD, LEAD2, 0, 1, 403);                   // 남의 몫을 대신 지정할 수는 없다
        deputy(LEAD, null, LEAD2, 0, 5, 200);
        deputy(LEAD, null, HEAD, 3, 8, 409);                      // 기간이 겹친다
        deputy(ADMIN, LEAD, HEAD, 6, 8, 200);                     // 관리자는 대신 지정할 수 있다
    }

    @Test
    public void 대결_목록은_본인_관련만_관리자는_전체() throws Exception {
        deputy(LEAD, null, LEAD2, 0, 2, 200);
        assertEquals(1, call(LEAD2, get("/approval-deputies"), null, 200).get("items").size());   // 대결자로서
        assertEquals(0, call(HEAD, get("/approval-deputies"), null, 200).get("items").size());
        assertEquals(1, call(ADMIN, get("/approval-deputies").param("all", "true"), null, 200).get("items").size());
        call(HEAD, get("/approval-deputies").param("all", "true"), null, 403);
        call(HEAD, delete("/approval-deputies/" + call(ADMIN, get("/approval-deputies").param("all", "true"), null, 200)
                .get("items").get(0).get("deputy_id").asLong()), null, 403);
    }

    @Test
    public void 대결자_후보는_최소_정보만_담고_자기_자신은_뺀다() throws Exception {
        JsonNode users = call(LEAD, get("/approval-deputies/candidates"), null, 200).get("users");
        assertTrue(users.size() > 5);
        for (JsonNode u : users) {
            assertFalse(LEAD.equals(u.get("emp_no").asText()));
            assertEquals("ACTIVE", u.get("status").asText());
            assertFalse(u.has("last_login_at"));
            assertFalse(u.has("approver_emp_no"));
        }
        mockMvc.perform(get("/approval-deputies/candidates")).andExpect(status().isUnauthorized());
    }

    // ── 직위 검증 ─────────────────────────────────────────────────────

    @Test
    public void 직위는_회사_직급_중_하나여야_한다() throws Exception {
        String base = "{\"name\":\"김영업\",\"role\":\"영업팀\",\"approval_grade\":\"NONE\",\"position_title\":\"";
        call(ADMIN, put("/sysadmin/users/" + MEMBER), base + "사원\"}", 400);
        call(ADMIN, put("/sysadmin/users/" + MEMBER), base + "수석차장\"}", 200);
        call(ADMIN, put("/sysadmin/users/" + MEMBER), base + "\"}", 200);
        assertEquals(8, call(ADMIN, get("/sysadmin/meta"), null, 200).get("ranks").size());
    }

    // ── 내 권한 현황(my-perms) ────────────────────────────────────────

    private static boolean flag(JsonNode myPerms, String menu, String field) {
        for (JsonNode n : myPerms.get("menus")) {
            if (menu.equals(n.get("menu_key").asText())) {
                return n.get(field).asBoolean();
            }
        }
        throw new AssertionError("menu not found " + menu);
    }

    @Test
    public void 일반_사용자도_자기_권한_현황을_볼_수_있다() throws Exception {
        // /sysadmin/perms/{emp} 는 관리자 전용이다 — 같은 사용자가 거기서는 403을 받는다.
        call(MEMBER, get("/sysadmin/perms/" + MEMBER), null, 403);

        JsonNode me = call(MEMBER, get("/approval-requests/my-perms"), null, 200);
        assertEquals(MEMBER, me.get("emp_no").asText());
        assertEquals("김영업", me.get("name").asText());
        assertEquals("영업팀", me.get("role").asText());
        assertEquals("대리", me.get("position_title").asText());
        assertEquals(LEAD, me.get("approver_emp_no").asText());      // 상신하면 첫 번째로 받을 사람
        assertEquals("이영업", me.get("approver_name").asText());
        assertTrue(me.get("menus").size() > 0);
        assertTrue(flag(me, "knowledge", "view"));
        assertFalse(flag(me, "knowledge", "write"));
        // 결재 권한 여부(받은 결재 안내용)는 결재함 메뉴의 결재 권한과 같은 값이다.
        assertEquals(permOn(MEMBER, "approvals", "approve"), me.get("can_approve").asBoolean());
        assertFalse(me.get("can_approve").asBoolean());
    }

    @Test
    public void 직급상_팀장_이상이면_rank_can_approve_가_true_이고_기존_값은_그대로다() throws Exception {
        JsonNode lead = call(LEAD, get("/approval-requests/my-perms"), null, 200);
        assertEquals("팀장", lead.get("position_title").asText());       // 013 시드
        assertTrue(lead.get("rank_can_approve").asBoolean());
        // 기존 can_approve 는 메뉴 권한 기준 그대로 — 팀장에게도 false 다.
        assertEquals(permOn(LEAD, "approvals", "approve"), lead.get("can_approve").asBoolean());
        assertFalse(lead.get("can_approve").asBoolean());

        JsonNode member = call(MEMBER, get("/approval-requests/my-perms"), null, 200);
        assertEquals("대리", member.get("position_title").asText());
        assertFalse(member.get("rank_can_approve").asBoolean());

        assertTrue(call(HEAD, get("/approval-requests/my-perms"), null, 200).get("rank_can_approve").asBoolean());
        assertFalse(call(JUNIOR, get("/approval-requests/my-perms"), null, 200).get("rank_can_approve").asBoolean());

        // 기존 키가 모두 남아 있다.
        for (String k : new String[]{"emp_no", "name", "role", "position_title", "approver_emp_no",
                "approver_name", "can_approve", "menus"}) {
            assertTrue("키 누락: " + k, lead.has(k));
        }
    }

    @Test
    public void 사번을_넘겨도_다른_사람_권한은_볼_수_없다() throws Exception {
        JsonNode me = call(MEMBER, get("/approval-requests/my-perms").param("emp", LEAD), null, 200);
        assertEquals(MEMBER, me.get("emp_no").asText());
    }

    @Test
    public void 신청이_반영되면_내_권한_현황에_바로_보인다() throws Exception {
        assertFalse(flag(call(MEMBER, get("/approval-requests/my-perms"), null, 200), "knowledge", "write"));
        long id = submit(MEMBER, KNOWLEDGE_WRITE, 200).get("req_id").asLong();
        decide(LEAD, id, "APPROVE", "확인", 200);
        assertTrue(flag(call(MEMBER, get("/approval-requests/my-perms"), null, 200), "knowledge", "write"));
    }

    @Test
    public void 내_권한_현황은_로그인_없이_401_등록되지_않은_사번은_403() throws Exception {
        mockMvc.perform(get("/approval-requests/my-perms")).andExpect(status().isUnauthorized());
        call("9999999", get("/approval-requests/my-perms"), null, 403);
    }

    // ── 결재 알림 쪽지 ────────────────────────────────────────────────

    /** 사번 앞으로 간 쪽지 중 종류가 {@code kind} 인 것. */
    private java.util.List<JsonNode> notesTo(String emp, String kind) throws Exception {
        String text = mockMvc.perform(get("/notifications").param("recipient", emp)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        java.util.List<JsonNode> out = new java.util.ArrayList<>();
        for (JsonNode n : JSON.readTree(text)) {
            if (kind.equals(n.get("kind").asText())) {
                out.add(n);
            }
        }
        return out;
    }

    @Test
    public void 상신하면_결재자에게_개인_쪽지가_가고_결재함_링크가_붙는다() throws Exception {
        submit(MEMBER, KNOWLEDGE_WRITE, 200);
        java.util.List<JsonNode> got = notesTo(LEAD, "결재알림");
        assertEquals(1, got.size());
        assertEquals("approvals:inbox", got.get(0).get("link").asText());
        assertEquals("김영업", got.get(0).get("sender").asText());
        assertTrue(got.get(0).get("content").asText().contains("권한 신청"));
        assertEquals(0, notesTo(HEAD, "결재알림").size());        // 결재선에 없는 사람에게는 가지 않는다
        assertEquals(0, notesTo(MEMBER, "결재알림").size());      // 본인에게도 가지 않는다
    }

    @Test
    public void 대결_기간이면_대결자에게도_쪽지가_가되_결재할_수_없는_사람은_뺀다() throws Exception {
        deputy(LEAD, null, LEAD2, 0, 2, 200);             // 팀장 — 대리의 요청을 결재할 수 있다
        deputy(LEAD, null, JUNIOR, 3, 5, 200);            // 아직 시작 전 — 오늘은 대결자가 아니다
        submit(MEMBER, KNOWLEDGE_WRITE, 200);
        assertEquals(1, notesTo(LEAD, "결재알림").size());
        java.util.List<JsonNode> dep = notesTo(LEAD2, "결재알림");
        assertEquals(1, dep.size());
        assertTrue(dep.get(0).get("content").asText().contains("대결자"));
        assertEquals(0, notesTo(JUNIOR, "결재알림").size());
    }

    @Test
    public void 직급이_낮아_결재할_수_없는_대결자에게는_쪽지를_보내지_않는다() throws Exception {
        deputy(LEAD, null, JUNIOR, 0, 2, 200);            // 계장 < 대리 : 방향 규칙상 결재 불가
        submit(MEMBER, KNOWLEDGE_WRITE, 200);
        assertEquals(0, notesTo(JUNIOR, "결재알림").size());
    }

    @Test
    public void 승인되면_상신자에게_결과_쪽지가_가고_내가_올린_요청으로_이어진다() throws Exception {
        long id = submit(MEMBER, KNOWLEDGE_WRITE, 200).get("req_id").asLong();
        assertEquals(0, notesTo(MEMBER, "결재결과").size());
        decide(LEAD, id, "APPROVE", "확인", 200);
        java.util.List<JsonNode> got = notesTo(MEMBER, "결재결과");
        assertEquals(1, got.size());
        assertEquals("approvals:mine", got.get(0).get("link").asText());
        assertEquals("이영업", got.get(0).get("sender").asText());
        assertTrue(got.get(0).get("content").asText().contains("승인"));
    }

    @Test
    public void 반려되면_사유가_결과_쪽지에_실린다() throws Exception {
        long id = submit(MEMBER, KNOWLEDGE_WRITE, 200).get("req_id").asLong();
        decide(LEAD, id, "REJECT", "근거 부족", 200);
        java.util.List<JsonNode> got = notesTo(MEMBER, "결재결과");
        assertEquals(1, got.size());
        assertTrue(got.get(0).get("content").asText().contains("반려"));
        assertTrue(got.get(0).get("content").asText().contains("근거 부족"));
    }

    @Test
    public void 팀장이_승인하면_다음_단계인_관리자에게_쪽지가_간다() throws Exception {
        long id = submit(MEMBER, "[{\"menu\":\"admin\",\"view\":true}]", 200).get("req_id").asLong();
        assertEquals(0, notesTo(ADMIN, "결재알림").size());       // 아직 팀장 차례
        decide(LEAD, id, "APPROVE", "확인", 200);
        java.util.List<JsonNode> got = notesTo(ADMIN, "결재알림");
        assertEquals(1, got.size());
        assertEquals(Integer.valueOf(2), Integer.valueOf(got.get(0).get("stage").asInt()));
        assertEquals(0, notesTo(MEMBER, "결재결과").size());       // 아직 끝나지 않았다
    }

    @Test
    public void 남이_취소하면_상신자에게_알리고_본인_취소는_알리지_않는다() throws Exception {
        long own = submit(MEMBER, KNOWLEDGE_WRITE, 200).get("req_id").asLong();
        call(MEMBER, post("/approval-requests/" + own + "/cancel"), null, 200);
        assertEquals(0, notesTo(MEMBER, "결재결과").size());
        long other = submit(MEMBER, "[{\"menu\":\"knowledge\",\"view\":true,\"edit\":true}]", 200).get("req_id").asLong();
        call(ADMIN, post("/approval-requests/" + other + "/cancel"), null, 200);
        java.util.List<JsonNode> got = notesTo(MEMBER, "결재결과");
        assertEquals(1, got.size());
        assertTrue(got.get(0).get("content").asText().contains("취소"));
    }
}
