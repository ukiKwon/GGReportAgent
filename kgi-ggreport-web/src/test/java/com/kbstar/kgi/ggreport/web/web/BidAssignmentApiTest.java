package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.service.BidAssignmentService;
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

import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 019 배정 S2-a — 최초 배정·입력 검증·열람·이력·내 담당·isActiveAssignee.
 * ⚠️ X-Emp-No 는 자기신고다 — 여기서 고정하는 것은 업무 규칙이지 사칭 방지가 아니다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class BidAssignmentApiTest {

    private static final String LEAD = "5047192";     // 영업팀장 이영업
    private static final String MEMBER = "3918264";   // 영업팀 김영업
    private static final String MEMBER2 = "3361829";  // 영업팀 윤서준
    private static final String HEAD = "2674805";     // 영업부장
    private static final String DESIGNER = "7130526";
    private static final String ADMIN = "8203417";    // 시스템 관리자(전산팀)
    private static final String IT = "4482971";       // 전산팀

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private BidAssignmentService service;
    private final ObjectMapper om = new ObjectMapper();

    private String newCase() throws Exception {
        String res = mockMvc.perform(post("/bidcases").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"institution_id\":\"nowon\"}").header("X-User-Id", "dave"))
                .andReturn().getResponse().getContentAsString();
        String id = om.readTree(res).path("bid_case_id").asText();
        assertFalse(id.isEmpty());
        return id;
    }

    private static MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder b, String emp) {
        return emp == null ? b : b.header("X-Emp-No", emp);
    }

    private MvcResult assign(String bc, String emp, String json) throws Exception {
        return mockMvc.perform(as(post("/bidcases/" + bc + "/assignments")
                .contentType(MediaType.APPLICATION_JSON).content(json), emp)).andReturn();
    }

    private static String nos(String... n) {
        StringBuilder sb = new StringBuilder("{\"emp_nos\":[");
        for (int i = 0; i < n.length; i++) {
            sb.append(i == 0 ? "" : ",").append('"').append(n[i]).append('"');
        }
        return sb.append("]}").toString();
    }

    private MvcResult getAs(String path, String emp) throws Exception {
        return mockMvc.perform(as(get(path), emp)).andReturn();
    }

    private JsonNode json(MvcResult r) throws Exception {
        r.getResponse().setCharacterEncoding("UTF-8");
        return om.readTree(r.getResponse().getContentAsString());
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    // ── 최초 배정 ────────────────────────────────────────────────────

    @Test
    public void 영업팀장_최초_배정은_201이고_ASSIGN_이력이_사람마다_남는다() throws Exception {
        String bc = newCase();
        MvcResult r = assign(bc, LEAD, nos(MEMBER, MEMBER2));
        assertEquals(201, r.getResponse().getStatus());
        JsonNode j = json(r);
        assertEquals(bc, j.path("bid_case_id").asText());
        assertEquals(1, j.path("group_ver").asInt());
        assertEquals(2, j.path("assignees").size());
        assertEquals(2, count("SELECT COUNT(*) FROM BID_ASSIGN_LOG WHERE BID_CASE_ID=? AND ACTION_CD='ASSIGN'", bc));
        assertEquals(2, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=? AND ACTIVE_YN=1", bc));
        Map<String, Object> log = jdbc.queryForList(
                "SELECT ACTOR_EMP_NO, EMP_VERIFIED, REQ_ID FROM BID_ASSIGN_LOG WHERE BID_CASE_ID=? ORDER BY LOG_ID", bc).get(0);
        assertEquals(LEAD, log.get("ACTOR_EMP_NO"));
        assertEquals(0, ((Number) log.get("EMP_VERIFIED")).intValue());   // 자기신고
        assertEquals(null, log.get("REQ_ID"));
    }

    @Test
    public void 영업팀원_영업부장_디자이너_관리자는_최초_배정이_403이고_아무것도_안_남는다() throws Exception {
        String bc = newCase();
        for (String emp : new String[]{MEMBER, HEAD, DESIGNER, ADMIN}) {
            assertEquals(emp, 403, assign(bc, emp, nos(MEMBER)).getResponse().getStatus());
        }
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGN_CASE WHERE BID_CASE_ID=?", bc));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGN_LOG WHERE BID_CASE_ID=?", bc));
    }

    @Test
    public void 사번이_없으면_401_미등록_사번은_403() throws Exception {
        String bc = newCase();
        assertEquals(401, assign(bc, null, nos(MEMBER)).getResponse().getStatus());
        assertEquals(403, assign(bc, "9999999", nos(MEMBER)).getResponse().getStatus());
    }

    @Test
    public void 이미_배정된_건은_409_ASSIGNED_ALREADY() throws Exception {
        String bc = newCase();
        assertEquals(201, assign(bc, LEAD, nos(MEMBER)).getResponse().getStatus());
        MvcResult r = assign(bc, "5640327", nos(MEMBER2));   // 다른 영업팀장도 재배정 못 한다
        assertEquals(409, r.getResponse().getStatus());
        assertEquals("ASSIGNED_ALREADY", json(r).path("detail").path("code").asText());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=?", bc));
    }

    @Test
    public void 없는_입찰_건은_404() throws Exception {
        assertEquals(404, assign("no-such-case", LEAD, nos(MEMBER)).getResponse().getStatus());
        assertEquals(404, getAs("/bidcases/no-such-case/assignments", LEAD).getResponse().getStatus());
    }

    // ── 입력 검증 ────────────────────────────────────────────────────

    @Test
    public void 인원_수_형식_중복_대상_자격이_틀리면_400이고_배정되지_않는다() throws Exception {
        String bc = newCase();
        String[] eleven = new String[11];
        for (int i = 0; i < 11; i++) {
            eleven[i] = String.valueOf(1000000 + i);
        }
        jdbc.update("UPDATE USERS SET STATUS='LOCKED' WHERE EMP_NO=?", MEMBER2);
        String[] bad = {
                "{}",                              // 0명
                nos(),                             // 0명
                nos(eleven),                       // 11명
                nos(MEMBER, MEMBER),               // 중복
                nos("12345"),                      // 형식 오류
                nos("abcdefg"),
                nos(MEMBER2),                      // 비활성(잠김)
                nos("9999999"),                    // 미등록
                nos(IT),                           // 영업 계열 아님
                nos(HEAD),                         // 영업부장 지정 불가
                nos(DESIGNER),                     // 디자이너
                nos(MEMBER, HEAD),                 // 하나라도 틀리면 전체 거부
        };
        for (String body : bad) {
            assertEquals(body, 400, assign(bc, LEAD, body).getResponse().getStatus());
        }
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGN_CASE WHERE BID_CASE_ID=?", bc));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=?", bc));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGN_LOG WHERE BID_CASE_ID=?", bc));
    }

    @Test
    public void 열_명까지는_허용된다() throws Exception {
        String bc = newCase();
        List<String> emps = jdbc.queryForList(
                "SELECT EMP_NO FROM USERS WHERE ROLE='영업팀' AND STATUS='ACTIVE' ORDER BY EMP_NO", String.class);
        assertTrue("시드에 영업팀 2명 이상", emps.size() >= 2);
        assertEquals(201, assign(bc, LEAD, nos(emps.toArray(new String[0]))).getResponse().getStatus());
    }

    // ── 영업팀장 자기 포함 ───────────────────────────────────────────

    @Test
    public void 영업팀장이_자기를_넣어도_허용되고_이력에_표시되며_접근이력에_사번이_없다() throws Exception {
        String bc = newCase();
        assertEquals(201, assign(bc, LEAD, nos(LEAD, MEMBER)).getResponse().getStatus());
        assertEquals("팀장 자기 포함 배정", jdbc.queryForObject(
                "SELECT REASON FROM BID_ASSIGN_LOG WHERE BID_CASE_ID=? AND TARGET_EMP_NO=?", String.class, bc, LEAD));
        assertEquals(null, jdbc.queryForObject(
                "SELECT REASON FROM BID_ASSIGN_LOG WHERE BID_CASE_ID=? AND TARGET_EMP_NO=?", String.class, bc, MEMBER));
        String detail = jdbc.queryForObject(
                "SELECT DETAIL FROM ACCESS_LOG WHERE EVENT_TYPE='API' AND HTTP_METHOD='POST' AND REQ_PATH=? ORDER BY LOG_ID DESC",
                String.class, "/bidcases/" + bc + "/assignments");
        assertEquals("assign case=" + bc + " n=2 code=ASSIGN", detail);
        assertFalse(detail.contains(LEAD));
        assertFalse(detail.contains(MEMBER));
    }

    @Test
    public void 거부된_요청은_DENIED로_남고_본문_사번이_없다() throws Exception {
        String bc = newCase();
        assertEquals(403, assign(bc, MEMBER, nos(MEMBER2)).getResponse().getStatus());
        Map<String, Object> row = jdbc.queryForList(
                "SELECT EVENT_TYPE, STATUS_CODE, DETAIL, REQ_PATH FROM ACCESS_LOG WHERE REQ_PATH=? ORDER BY LOG_ID DESC",
                "/bidcases/" + bc + "/assignments").get(0);
        assertEquals("DENIED", row.get("EVENT_TYPE"));
        assertEquals(403, ((Number) row.get("STATUS_CODE")).intValue());
        assertFalse(String.valueOf(row.get("DETAIL")).contains(MEMBER2));
        assertFalse(String.valueOf(row.get("REQ_PATH")).contains("?"));
    }

    // ── 열람·이력 ────────────────────────────────────────────────────

    @Test
    public void 배정_전_열람은_assigned_false_이고_팀장만_can_assign() throws Exception {
        String bc = newCase();
        JsonNode lead = json(getAs("/bidcases/" + bc + "/assignments", LEAD));
        assertFalse(lead.path("assigned").asBoolean());
        assertEquals(0, lead.path("assignees").size());
        assertEquals(0, lead.path("group_ver").asInt());
        assertTrue(lead.path("viewer").path("can_assign").asBoolean());
        assertTrue(lead.path("pending_change").isNull());
        JsonNode member = json(getAs("/bidcases/" + bc + "/assignments", MEMBER));
        assertFalse(member.path("viewer").path("can_assign").asBoolean());
    }

    @Test
    public void 영업팀_전원은_열람하고_viewer가_맞다_디자이너_관리자는_403() throws Exception {
        String bc = newCase();
        assign(bc, LEAD, nos(MEMBER));
        String path = "/bidcases/" + bc + "/assignments";

        MvcResult asMember = getAs(path, MEMBER);
        assertEquals(200, asMember.getResponse().getStatus());
        JsonNode m = json(asMember);
        assertTrue(m.path("assigned").asBoolean());
        assertEquals(1, m.path("group_ver").asInt());
        assertEquals("김영업", m.path("assignees").get(0).path("name").asText());
        assertTrue(m.path("viewer").path("is_assignee").asBoolean());
        assertTrue(m.path("viewer").path("can_request_change").asBoolean());
        assertFalse(m.path("viewer").path("can_assign").asBoolean());

        JsonNode other = json(getAs(path, MEMBER2));
        assertFalse(other.path("viewer").path("is_assignee").asBoolean());
        assertFalse(other.path("viewer").path("can_request_change").asBoolean());

        assertEquals(200, getAs(path, HEAD).getResponse().getStatus());   // 영업부장은 tasks 메뉴가 없어도 열람
        assertTrue(json(getAs(path, LEAD)).path("viewer").path("can_request_change").asBoolean());

        assertEquals(403, getAs(path, DESIGNER).getResponse().getStatus());
        assertEquals(403, getAs(path, ADMIN).getResponse().getStatus());
        assertEquals(401, getAs(path, null).getResponse().getStatus());
    }

    @Test
    public void 이력은_영업팀이_보고_표시명과_자기신고_표시가_있다() throws Exception {
        String bc = newCase();
        assign(bc, LEAD, nos(MEMBER, MEMBER2));
        String path = "/bidcases/" + bc + "/assignments/history";
        MvcResult r = getAs(path, HEAD);
        assertEquals(200, r.getResponse().getStatus());
        JsonNode h = json(r);
        assertEquals(2, h.size());
        assertEquals("ASSIGN", h.get(0).path("action_cd").asText());
        assertEquals("최초 배정", h.get(0).path("action_name").asText());
        assertEquals(LEAD, h.get(0).path("actor_emp_no").asText());
        assertEquals("이영업", h.get(0).path("actor_name").asText());
        assertFalse(h.get(0).path("emp_verified").asBoolean());
        assertTrue(h.get(0).path("req_id").isNull());
        assertEquals(403, getAs(path, DESIGNER).getResponse().getStatus());
        assertEquals(403, getAs(path, ADMIN).getResponse().getStatus());
    }

    // ── 내 담당·쓰기 판정 ────────────────────────────────────────────

    @Test
    public void 내_담당은_자기_활성_건만_보인다() throws Exception {
        String bc = newCase();
        assign(bc, LEAD, nos(MEMBER));
        JsonNode mine = json(getAs("/me/assignments", MEMBER));
        assertEquals(1, mine.size());
        assertEquals(bc, mine.get(0).path("bid_case_id").asText());
        assertEquals(0, json(getAs("/me/assignments", MEMBER2)).size());
        assertEquals(401, getAs("/me/assignments", null).getResponse().getStatus());
    }

    /** ⚠️ MyBatis 1차 캐시: 같은 트랜잭션에서 먼저 조회한 값은 JdbcTemplate 변경을 못 본다 — 조회 전에 바꾼다. */
    @Test
    public void 해제된_담당은_내_담당에서_빠진다() throws Exception {
        String bc = newCase();
        assign(bc, LEAD, nos(MEMBER2));
        jdbc.update("UPDATE BID_ASSIGNMENT SET ACTIVE_YN=0 WHERE BID_CASE_ID=? AND EMP_NO=?", bc, MEMBER2);
        assertEquals(0, json(getAs("/me/assignments", MEMBER2)).size());
    }

    @Test
    public void isActiveAssignee는_해제되면_바로_false() throws Exception {
        String bc = newCase();
        assign(bc, LEAD, nos(MEMBER));
        assertTrue(service.isActiveAssignee(bc, MEMBER));
        assertFalse(service.isActiveAssignee(bc, MEMBER2));
        assertFalse("관리자 예외 없음", service.isActiveAssignee(bc, ADMIN));
        assertFalse(service.isActiveAssignee(null, MEMBER));
        assertFalse(service.isActiveAssignee(bc, null));
        assertFalse(service.isActiveAssignee(bc, "12"));
    }

    /** MyBatis 1차 캐시 때문에 해제는 조회 전에(다른 입찰 건으로) 만든다. */
    @Test
    public void 해제된_담당자는_isActiveAssignee가_바로_false() throws Exception {
        String bc = newCase();
        assign(bc, LEAD, nos(MEMBER));
        jdbc.update("UPDATE BID_ASSIGNMENT SET ACTIVE_YN=0, RELEASED_BY=?, RELEASED_AT='x' WHERE BID_CASE_ID=? AND EMP_NO=?",
                LEAD, bc, MEMBER);
        assertFalse(service.isActiveAssignee(bc, MEMBER));
    }

    // ── 담당자 후보 ──────────────────────────────────────────────────

    @Test
    public void 후보는_활성_영업팀과_영업팀장_본인_포함이고_열람자_규칙은_배정_조회와_같다() throws Exception {
        jdbc.update("UPDATE USERS SET STATUS='LOCKED' WHERE EMP_NO=?", MEMBER2);   // 비활성은 제외돼야 한다
        newCase();   // MyBatis 쓰기로 1차 캐시를 비운다(JdbcTemplate 로 USERS 를 바꾼 뒤)
        for (String emp : new String[]{MEMBER, LEAD, HEAD}) {
            MvcResult r = getAs("/assignment-candidates", emp);
            assertEquals(emp, 200, r.getResponse().getStatus());
            JsonNode arr = json(r);
            assertTrue(arr.isArray());
            java.util.Set<String> emps = new java.util.HashSet<>();
            for (JsonNode n : arr) {
                emps.add(n.path("emp_no").asText());
                assertFalse(n.path("name").asText().isEmpty());
                String role = n.path("role").asText();
                assertTrue(role.equals("영업팀") || role.equals("영업팀장"));
                assertTrue(n.has("position_title"));
            }
            assertTrue(emps.contains(MEMBER));
            assertTrue(emps.contains(LEAD));
            assertTrue(emps.contains("5640327"));
            assertFalse(emps.contains(MEMBER2));
            assertFalse(emps.contains(HEAD));
            assertFalse(emps.contains(DESIGNER));
            assertFalse(emps.contains(ADMIN));
            assertFalse(emps.contains(IT));
            assertEquals(count("SELECT COUNT(*) FROM USERS WHERE STATUS='ACTIVE' AND ROLE IN ('영업팀','영업팀장')"), arr.size());
        }
    }

    @Test
    public void 후보_목록은_DB_이름순과_같고_키는_네_개다() throws Exception {
        JsonNode arr = json(getAs("/assignment-candidates", LEAD));
        List<String> expected = jdbc.queryForList(
                "SELECT EMP_NO FROM USERS WHERE STATUS='ACTIVE' AND ROLE IN ('영업팀','영업팀장') ORDER BY NAME, EMP_NO", String.class);
        assertEquals(expected.size(), arr.size());
        for (int i = 0; i < expected.size(); i++) {
            assertEquals(expected.get(i), arr.get(i).path("emp_no").asText());
        }
        assertEquals(4, arr.get(0).size());   // emp_no, name, position_title, role
    }

    @Test
    public void 후보는_디자이너_관리자_전산팀이_403_사번_없음_401_미등록_403() throws Exception {
        for (String emp : new String[]{DESIGNER, ADMIN, IT}) {
            assertEquals(emp, 403, getAs("/assignment-candidates", emp).getResponse().getStatus());
        }
        assertEquals(401, getAs("/assignment-candidates", null).getResponse().getStatus());
        assertEquals(403, getAs("/assignment-candidates", "9999999").getResponse().getStatus());
        assertEquals(200, getAs("/assignment-candidates", LEAD).getResponse().getStatus());
        List<String> details = jdbc.queryForList(
                "SELECT DETAIL FROM ACCESS_LOG WHERE REQ_PATH='/assignment-candidates' AND STATUS_CODE=200", String.class);
        for (String d : details) {
            assertTrue(d == null || (!d.contains(MEMBER) && !d.contains("김영업")));
        }
    }
}
