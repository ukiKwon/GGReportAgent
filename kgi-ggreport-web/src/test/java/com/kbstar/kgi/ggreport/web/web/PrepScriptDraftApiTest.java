package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.support.PrepOpenApprovalSwitch;
import com.kbstar.kgi.ggreport.web.support.TestGoals;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * NEXT 129 ⑤ — 발표 대본 AI 초안(POST /bidcases/{id}/prep/board-script-draft, GET /llm/script-draft/status), <b>꺼진 상태(기본)</b>.
 * 판정 순서 404 → 403 → 409 → 503 중 "꺼짐"이 맨 끝임을 고정한다. 켜진 상태의 순서·감사는 PrepScriptDraftFlowTest(Mockito)가 본다.
 * ⚠️ X-Emp-No 는 자기신고 — 업무 규칙이지 사칭 방지가 아니다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class PrepScriptDraftApiTest {

    private static final String LEAD = "5047192";
    private static final String MEMBER = "3918264";
    private static final String ASSIGNEE = "3361829";
    private static final String DESIGNER = "7130526";
    private static final String IT = "4482971";
    private static final String UNKNOWN_EMP = "9999999";
    private static final String INST = "nowon";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PrepOpenApprovalSwitch openApproval;
    private final ObjectMapper om = new ObjectMapper();

    @Before public void 옛_개설_신청_켜기() { openApproval.setForTest(true); }
    @After public void 옛_개설_신청_끄기() { openApproval.setForTest(false); }
    @Before public void 올해_목표_바탕() { TestGoals.seedThisYear(jdbc, INST); }

    private JsonNode json(MvcResult r) throws Exception {
        return om.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private MvcResult call(HttpMethod m, String path, String emp, String body, String screen, String button) throws Exception {
        MockHttpServletRequestBuilder b = MockMvcRequestBuilders.request(m, path);
        if (body != null) {
            b = b.contentType(MediaType.APPLICATION_JSON).content(body.replace('\'', '"').getBytes(StandardCharsets.UTF_8));
        } else if (m == HttpMethod.POST || m == HttpMethod.PUT) {
            b = b.content(new byte[0]);   // 본문 없는 쓰기 — 브라우저처럼 Content-Length: 0
        }
        if (emp != null) {
            b = b.header("X-Emp-No", emp);
        }
        if (screen != null) {
            b = b.header("X-Screen-Id", screen);
        }
        if (button != null) {
            b = b.header("X-Button-Id", button);
        }
        return mockMvc.perform(b).andReturn();
    }

    private MvcResult draft(String bid, String emp) throws Exception {
        return call(HttpMethod.POST, "/bidcases/" + bid + "/prep/board-script-draft", emp, null, "prep_detail", "script_ai_draft");
    }

    private String opened() throws Exception {
        MvcResult c = call(HttpMethod.POST, "/preps", MEMBER, "{'institution_id':'" + INST + "'}", null, null);
        assertEquals(201, c.getResponse().getStatus());
        String bid = json(c).path("bid_case_id").asText();
        MvcResult o = call(HttpMethod.POST, "/bidcases/" + bid + "/prep/open-requests", MEMBER, "{'emp_nos':['" + ASSIGNEE + "']}", null, null);
        assertEquals(o.getResponse().getContentAsString(), 201, o.getResponse().getStatus());
        long req = json(o).path("req_id").asLong();
        assertEquals(200, call(HttpMethod.POST, "/approval-requests/" + req + "/decide", LEAD, "{'decision':'APPROVE','comment':null}", null, null).getResponse().getStatus());
        return bid;
    }

    private int acts(String bid, String outcome) {
        return count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='SCRIPT_AI_DRAFT' AND OUTCOME=?", bid, outcome);
    }

    @Test
    public void 사번이_없으면_401이고_감사_줄은_없다() throws Exception {
        String bid = opened();
        assertEquals(401, draft(bid, null).getResponse().getStatus());
        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE ACTION_CD='SCRIPT_AI_DRAFT'"));
    }

    @Test
    public void 미등록_사번은_403_DENIED_한_줄() throws Exception {
        String bid = opened();
        assertEquals(403, draft(bid, UNKNOWN_EMP).getResponse().getStatus());
        assertEquals(1, acts(bid, "DENIED"));
    }

    @Test
    public void 건을_못_보는_전산_디자이너와_없는_건은_503이_아니라_404() throws Exception {
        String bid = opened();
        assertEquals(404, draft(bid, IT).getResponse().getStatus());
        assertEquals(404, draft(bid, DESIGNER).getResponse().getStatus());
        assertEquals(2, acts(bid, "HIDDEN"));
        assertEquals(404, draft("no-such-case", ASSIGNEE).getResponse().getStatus());
    }

    @Test
    public void 담당자는_꺼져_있으면_503_LLM_OFF_BLOCKED_한_줄이고_이사회_감사는_없다() throws Exception {
        String bid = opened();
        MvcResult r = draft(bid, ASSIGNEE);
        assertEquals(503, r.getResponse().getStatus());
        assertEquals("LLM_OFF", json(r).path("detail").path("code").asText());
        assertEquals(1, acts(bid, "BLOCKED"));
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MATERIAL_ACT WHERE ACTION_CD IN ('SCRIPT_AI_DRAFT','SCRIPT_AI_SEND')"));
    }

    @Test
    public void 비담당_영업팀장은_꺼져_있어도_503이_아니라_403() throws Exception {
        String bid = opened();
        MvcResult r = draft(bid, LEAD);
        assertEquals(403, r.getResponse().getStatus());
        assertEquals("SCRIPT_DRAFT_NOT_ALLOWED", json(r).path("detail").path("code").asText());
        assertEquals(1, acts(bid, "DENIED"));
    }

    @Test
    public void 상태_조회는_사번이_없으면_401_담당자는_꺼짐이고_probe를_줘도_reachable_키가_없다() throws Exception {
        assertEquals(401, call(HttpMethod.GET, "/llm/script-draft/status", null, null, null, null).getResponse().getStatus());
        MvcResult r = call(HttpMethod.GET, "/llm/script-draft/status?probe=1", ASSIGNEE, null, null, null);
        assertEquals(200, r.getResponse().getStatus());
        JsonNode j = json(r);
        assertFalse(j.path("enabled").asBoolean(true));
        assertEquals("OFF", j.path("state").asText());
        assertEquals("LOCAL_TRIAL", j.path("mode").asText());
        assertTrue(j.path("reachable").isMissingNode());
        assertTrue(j.path("model_ready").isMissingNode());
        MvcResult d = call(HttpMethod.GET, "/llm/script-draft/status?probe=1", DESIGNER, null, null, null);
        assertTrue(json(d).path("reachable").isMissingNode());
    }
}
