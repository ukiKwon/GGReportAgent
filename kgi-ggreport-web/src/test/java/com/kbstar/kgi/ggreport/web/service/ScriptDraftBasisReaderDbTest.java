package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.domain.BidPrep;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
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
import java.util.Collections;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * NEXT 129 ⑤ — ScriptDraftBasisReader.read() 가 실제 DB(H2)의 요약 양식에서 <b>읽지 않아야 할 칸</b>을 읽지 않고,
 * 사번 모양 값은 버리는지(독립 검토 qa 4절 5·security: "읽지 않음"이 코드 주석만이 아니게). 새 컨텍스트를 만들지 않는다(@AppTest 공유).
 * 건·양식은 PrepScriptApiTest·PrepFormApiTest 와 같은 방식(API 로 개설 → 양식 prefill)으로 만들고, 저장된 판의 본문만 직접 바꾼다. 값은 모두 가상.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class ScriptDraftBasisReaderDbTest {

    private static final String LEAD = "5047192";
    private static final String MEMBER = "3918264";
    private static final String ASSIGNEE = "3361829";
    private static final String INST = "nowon";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PrepOpenApprovalSwitch openApproval;
    @Autowired private ScriptDraftBasisReader reader;
    @Autowired private PrepService prep;
    @Autowired private SysUserMapper users;
    private final ObjectMapper om = new ObjectMapper();

    @Before public void 옛_개설_신청_켜기() { openApproval.setForTest(true); }
    @After public void 옛_개설_신청_끄기() { openApproval.setForTest(false); }
    @Before public void 올해_목표_바탕() { TestGoals.seedThisYear(jdbc, INST); }

    private JsonNode json(MvcResult r) throws Exception {
        return om.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private MvcResult call(HttpMethod m, String path, String emp, String body, String screen, String button) throws Exception {
        MockHttpServletRequestBuilder b = MockMvcRequestBuilders.request(m, path);
        if (body != null) {
            b = b.contentType(MediaType.APPLICATION_JSON).content(body.replace('\'', '"').getBytes(StandardCharsets.UTF_8));
        } else if (m == HttpMethod.POST || m == HttpMethod.PUT) {
            b = b.content(new byte[0]);
        }
        b = b.header("X-Emp-No", emp);
        if (screen != null) {
            b = b.header("X-Screen-Id", screen).header("X-Button-Id", button);
        }
        return mockMvc.perform(b).andReturn();
    }

    private String opened() throws Exception {
        MvcResult c = call(HttpMethod.POST, "/preps", MEMBER, "{'institution_id':'" + INST + "'}", null, null);
        assertEquals(201, c.getResponse().getStatus());
        String bid = json(c).path("bid_case_id").asText();
        MvcResult o = call(HttpMethod.POST, "/bidcases/" + bid + "/prep/open-requests", MEMBER, "{'emp_nos':['" + ASSIGNEE + "']}", null, null);
        assertEquals(o.getResponse().getContentAsString(), 201, o.getResponse().getStatus());
        long req = json(o).path("req_id").asLong();
        assertEquals(200, call(HttpMethod.POST, "/approval-requests/" + req + "/decide", LEAD, "{'decision':'APPROVE','comment':null}", null, null)
                .getResponse().getStatus());
        return bid;
    }

    /** MyBatis 쓰기 한 번으로 1차 캐시를 비운다(JdbcTemplate 으로 행을 바꾼 뒤 호출 — PrepScriptApiTest 와 같은 방법). */
    private void flushCache() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post("/bidcases").contentType(MediaType.APPLICATION_JSON)
                .content("{\"institution_id\":\"nowon\"}").header("X-User-Id", "dave")).andReturn();
    }

    @Test
    public void 기관장_조직현황_MMDA_소재지는_읽지_않고_사번_모양_임직원_수는_버린다() throws Exception {
        String bid = opened();
        MvcResult pf = call(HttpMethod.POST, "/bidcases/" + bid + "/prep/forms/INST_SUMMARY/prefill", ASSIGNEE, "{'base_ver':0}", "prep_form", "form_prefill");
        assertEquals(pf.getResponse().getContentAsString(), 200, pf.getResponse().getStatus());
        int ver = json(pf).path("cur_ver").asInt();
        assertTrue(ver >= 1);

        String content = "{\"fields\":{"
                + "\"head_name\":{\"val\":\"홍가상기관장\"},\"head_title\":{\"val\":\"가상직함\"},"
                + "\"org_note\":{\"val\":\"ORGNOTE-가상조직\"},\"mmda_basis\":{\"val\":\"MMDABASIS-가상근거\"},"
                + "\"address\":{\"val\":\"ADDR-가상시 가상로 1\"},"
                + "\"staff\":{\"val\":\"1234567\"},"
                + "\"supervisor\":{\"val\":\"가상 주무부서\"},\"budget\":{\"val\":\"예산 1,000억원\"}},"
                + "\"lists\":{\"overview\":[\"가상 현황 1\"],\"competition\":[],\"effect\":[\"가상 기대효과 1\"]}}";
        assertEquals(1, jdbc.update("UPDATE BID_PREP_FORM_VER SET CONTENT_JSON = ? WHERE BID_CASE_ID = ? AND FORM_CD = 'INST_SUMMARY' AND VER_NO = ?",
                content, bid, ver));
        flushCache();

        SysUser me = users.selectByEmpNo(ASSIGNEE);
        assertNotNull(me);
        BidPrep p = prep.requireVisible(me, bid);
        ScriptDraftBasisReader.Basis b = reader.read(me, p);

        assertNull("사번 모양 7자리 숫자는 버린다", b.staff);
        assertTrue("버린 개수를 센다", b.piiDropped >= 1);
        assertEquals("가상 주무부서", b.supervisor);
        assertEquals("예산 1,000억원", b.budget);
        assertEquals(Collections.singletonList("가상 현황 1"), b.overview);
        assertEquals(Collections.singletonList("가상 기대효과 1"), b.effect);

        Set<String> ask = ScriptDraftService.askable(b);
        assertTrue(ask.contains("intro"));
        ScriptDraftPrompt.Facts f = ScriptDraftPrompt.facts(b, ask);
        String prompt = ScriptDraftPrompt.build(f, ask);
        for (String leaked : new String[]{"홍가상기관장", "가상직함", "ORGNOTE", "MMDABASIS", "ADDR-", "1234567"}) {
            assertFalse(leaked + " 가 프롬프트에 실렸다", prompt.contains(leaked));
        }
        assertTrue(prompt.contains("가상 주무부서"));
    }
}
