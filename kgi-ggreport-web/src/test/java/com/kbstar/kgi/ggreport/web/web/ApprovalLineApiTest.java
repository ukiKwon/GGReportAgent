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
        // 팀장의 대결자도 같은 직급인 다른 팀장 — 직급이 같으면 막지 않는다
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

    // ── 직위 검증 ─────────────────────────────────────────────────────

    @Test
    public void 직위는_회사_직급_중_하나여야_한다() throws Exception {
        String base = "{\"name\":\"김영업\",\"role\":\"영업팀\",\"approval_grade\":\"NONE\",\"position_title\":\"";
        call(ADMIN, put("/sysadmin/users/" + MEMBER), base + "사원\"}", 400);
        call(ADMIN, put("/sysadmin/users/" + MEMBER), base + "수석차장\"}", 200);
        call(ADMIN, put("/sysadmin/users/" + MEMBER), base + "\"}", 200);
        assertEquals(8, call(ADMIN, get("/sysadmin/meta"), null, 200).get("ranks").size());
    }
}
