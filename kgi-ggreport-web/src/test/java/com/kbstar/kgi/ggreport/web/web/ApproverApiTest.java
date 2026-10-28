package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.support.ApproverRules;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.hamcrest.Matchers.containsString;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 결재라인(사용자별 상위 결재자). 시드(009·011): 영업팀·디자이너는 팀장이 2명이라 이영업({@code 5047192})으로
 * <b>지정</b>, 예산팀은 한예산({@code 9026715})으로 <b>자동</b>, 팀장 → 박영업({@code 2674805}) → 백수아({@code 1473958}, 최상위).
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class ApproverApiTest {

    private static final String ADMIN = "8203417";
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private SysUserMapper userMapper;

    private ResultActions asAdmin(MockHttpServletRequestBuilder b) throws Exception {
        return mockMvc.perform(b.header(Actor.HEADER, ADMIN));
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder b, String body) {
        return b.contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private JsonNode user(String emp) throws Exception {
        String body = asAdmin(get("/sysadmin/users")).andExpect(status().isOk()).andReturn()
                .getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        for (JsonNode n : JSON.readTree(body).get("users")) {
            if (emp.equals(n.get("emp_no").asText())) {
                return n;
            }
        }
        throw new AssertionError("user not found: " + emp);
    }

    private void setApprover(String emp, String approver, String mode, int expectStatus) throws Exception {
        String body = "{\"approver_emp_no\":" + (approver == null ? "null" : "\"" + approver + "\"")
                + ",\"mode\":\"" + mode + "\"}";
        asAdmin(json(put("/sysadmin/users/" + emp + "/approver"), body)).andExpect(status().is(expectStatus));
    }

    // ── 시드 ──────────────────────────────────────────────────────────

    @Test
    public void 시드의_자동_결재자는_규칙의_결과와_같다() {
        List<SysUser> all = userMapper.selectAll();
        for (SysUser u : all) {
            if (u.getApproverManual() == 1) {
                continue;
            }
            ApproverRules.Result r = ApproverRules.resolve(u, all);
            assertEquals("자동 결재자가 규칙과 어긋남: " + u.getEmpNo(),
                    r.getState() == ApproverRules.State.OK ? r.getEmpNo() : null, u.getApproverEmpNo());
        }
    }

    @Test
    public void 목록에_결재자와_체인이_실린다() throws Exception {
        JsonNode m = user("3918264");   // 영업팀 팀원 — 지정
        assertEquals("5047192", m.get("approver_emp_no").asText());
        assertEquals("MANUAL", m.get("approver_mode").asText());
        assertEquals("MANUAL_OK", m.get("approver_state").asText());
        assertEquals("이영업", m.get("approver_name").asText());
        assertEquals(3, m.get("chain").size());
        assertEquals("박영업", m.get("chain").get(1).get("name").asText());
        assertEquals("백수아", m.get("chain").get(2).get("name").asText());

        JsonNode budget = user("1857403");   // 예산팀 — 자동
        assertEquals("AUTO_OK", budget.get("approver_state").asText());
        assertEquals("9026715", budget.get("approver_emp_no").asText());

        JsonNode top = user("1473958");
        assertEquals("TOP", top.get("approver_state").asText());
        assertEquals(0, top.get("chain").size());
    }

    // ── 새 사용자·상태 변화에 따른 자동 재계산 ─────────────────────────────

    @Test
    public void 예산팀_신규_사용자는_예산팀장으로_자동_결정된다() throws Exception {
        asAdmin(json(post("/sysadmin/users"),
                "{\"emp_no\":\"4040404\",\"name\":\"신입\",\"role\":\"예산팀\"}")).andExpect(status().isOk());
        JsonNode n = user("4040404");
        assertEquals("9026715", n.get("approver_emp_no").asText());
        assertEquals("AUTO", n.get("approver_mode").asText());
    }

    @Test
    public void 팀장이_둘인_팀의_신규_사용자는_지정_필요로_남는다() throws Exception {
        asAdmin(json(post("/sysadmin/users"),
                "{\"emp_no\":\"4040405\",\"name\":\"신입\",\"role\":\"영업팀\"}")).andExpect(status().isOk());
        JsonNode n = user("4040405");
        assertEquals("NEEDS", n.get("approver_state").asText());
        assertEquals(true, n.get("approver_emp_no").isNull());
        assertEquals(true, n.get("approver_note").asText().contains("2명"));
    }

    @Test
    public void 자동_모드_결재자가_퇴직하면_비고_지정한_결재자가_퇴직하면_무효로_표시된다() throws Exception {
        asAdmin(json(put("/sysadmin/users/9026715/status"), "{\"status\":\"RETIRED\"}")).andExpect(status().isOk());
        assertEquals("NEEDS", user("1857403").get("approver_state").asText());   // 예산팀: 후보 없음
        assertEquals(true, user("1857403").get("approver_emp_no").isNull());

        asAdmin(json(put("/sysadmin/users/5047192/status"), "{\"status\":\"LOCKED\"}")).andExpect(status().isOk());
        JsonNode sales = user("3918264");   // 지정(MANUAL)은 그대로 두되 무효로 알린다
        assertEquals("5047192", sales.get("approver_emp_no").asText());
        assertEquals("MANUAL_INVALID", sales.get("approver_state").asText());
    }

    // ── 지정 ──────────────────────────────────────────────────────────

    @Test
    public void 관리자가_결재자를_지정하면_바로_반영되고_이력에_남는다() throws Exception {
        setApprover("3918264", "5640327", "MANUAL", 200);
        assertEquals("5640327", user("3918264").get("approver_emp_no").asText());
        asAdmin(get("/sysadmin/perm-changes").param("emp", "3918264")).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].item").value("user:APPROVER"))
                .andExpect(jsonPath("$.items[0].before_value").value("5047192"))
                .andExpect(jsonPath("$.items[0].after_value").value("5640327"))
                .andExpect(jsonPath("$.items[0].actor_emp_no").value(ADMIN));
    }

    @Test
    public void 자동으로_되돌리면_후보가_모호한_사람은_비게_된다() throws Exception {
        setApprover("3918264", null, "AUTO", 200);
        JsonNode n = user("3918264");
        assertEquals("AUTO", n.get("approver_mode").asText());
        assertEquals("NEEDS", n.get("approver_state").asText());
        setApprover("1857403", null, "AUTO", 200);   // 후보가 하나면 다시 정해진다
        assertEquals("9026715", user("1857403").get("approver_emp_no").asText());
    }

    @Test
    public void 잘못된_지정은_거부한다() throws Exception {
        setApprover("3918264", "3918264", "MANUAL", 400);   // 자기 자신
        setApprover("3918264", "4482971", "MANUAL", 400);   // 결재 등급 없음
        setApprover("3918264", "9999999", "MANUAL", 400);   // 없는 사번
        setApprover("3918264", "12345", "MANUAL", 400);     // 형식
        setApprover("3918264", null, "MANUAL", 400);        // 지정인데 값 없음
        setApprover("3918264", "5047192", "SOMETHING", 400);
        setApprover("9999999", "5047192", "MANUAL", 404);
    }

    @Test
    public void 순환_지정은_거부한다() throws Exception {
        setApprover("5047192", "5640327", "MANUAL", 200);   // 이영업 → 안재원
        setApprover("5640327", "5047192", "MANUAL", 400);   // 안재원 → 이영업 이면 순환
        setApprover("2674805", "5047192", "MANUAL", 400);   // 박영업 → 이영업 → 박영업
    }

    @Test
    public void 잠기거나_퇴직한_사람은_결재자로_지정할_수_없다() throws Exception {
        asAdmin(json(put("/sysadmin/users/5640327/status"), "{\"status\":\"RETIRED\"}")).andExpect(status().isOk());
        setApprover("3918264", "5640327", "MANUAL", 400);
    }

    @Test
    public void 관리자가_아니면_403() throws Exception {
        mockMvc.perform(json(put("/sysadmin/users/3918264/approver").header(Actor.HEADER, "3918264"),
                "{\"approver_emp_no\":\"5640327\",\"mode\":\"MANUAL\"}")).andExpect(status().isForbidden());
        assertEquals("5047192", userMapper.selectByEmpNo("3918264").getApproverEmpNo());
        assertNull(userMapper.selectByEmpNo("1473958").getApproverEmpNo());
    }
}
