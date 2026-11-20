package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 사업계획 수집 일괄 요청(POST /plan-collect/batch, NEXT 103) — 한도·권한·기관별 결과·감사 기관당 1행·쪽지 한 묶음·정규화 중복 제거.
 * SALES 3918264 김영업, SALES2 7742059 장하윤, DESIGNER 7130526, BUDGET 1857403. 기관 jongno + 시드의 다른 기관 1곳.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class PlanCollectBatchApiTest {

    private static final String SALES = "3918264";
    private static final String SALES2 = "7742059";
    private static final String DESIGNER = "7130526";
    private static final String BUDGET = "1857403";
    private static final String INST = "jongno";
    private static final String BATCH_BTN = "plan_collect_request_batch";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    private final ObjectMapper json = new ObjectMapper();

    private MockHttpServletResponse call(MockHttpServletRequestBuilder b, String emp) throws Exception {
        if (emp != null) b.header("X-Emp-No", emp);
        MockHttpServletResponse res = mockMvc.perform(b).andReturn().getResponse();
        res.setCharacterEncoding("UTF-8");
        return res;
    }
    private MockHttpServletResponse batch(String body, String emp) throws Exception {
        return call(post("/plan-collect/batch").contentType(MediaType.APPLICATION_JSON).content(body), emp);
    }
    private MockHttpServletResponse batchIds(String emp, String... ids) throws Exception { return batch(ids(ids), emp); }
    private MockHttpServletResponse ask(String inst, String emp) throws Exception { return call(post("/institutions/" + inst + "/plan-collect"), emp); }
    private static String ids(String... ids) {
        StringBuilder sb = new StringBuilder("{\"institution_ids\":[");
        for (int i = 0; i < ids.length; i++) sb.append(i > 0 ? "," : "").append('"').append(ids[i]).append('"');
        return sb.append("]}").toString();
    }
    private JsonNode body(MockHttpServletResponse r) throws Exception { return json.readTree(r.getContentAsString()); }
    private int count(String sql, Object... a) { return jdbc.queryForObject(sql, Integer.class, a); }
    private int notes() { return count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE KIND='수집요청' AND RECIPIENT IN ('전산팀','전산팀장')"); }
    private int batchAudit(String outcome) {
        return count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='COLLECT_REQUEST' AND BUTTON_ID=? AND OUTCOME=?", BATCH_BTN, outcome);
    }
    /** 시드에 있는 jongno 말고 다른 기관 1곳(없으면 시험이 의미 없으므로 실패). */
    private String other() {
        List<String> l = jdbc.queryForList("SELECT INSTITUTION_ID FROM INSTITUTIONS WHERE INSTITUTION_ID <> ? ORDER BY INSTITUTION_ID", String.class, INST);
        assertFalse("시드에 jongno 외 기관이 있어야 한다", l.isEmpty());
        return l.get(0);
    }
    private static String result(JsonNode b, String inst) {
        for (JsonNode n : b.path("results")) if (inst.equals(n.path("institution_id").asText())) return n.path("result_cd").asText();
        return null;
    }

    @Test
    public void 새_기관_2곳이면_모두_requested이고_감사_2행_쪽지는_합계_2통() throws Exception {
        String o = other();
        int before = notes();
        MockHttpServletResponse r = batchIds(SALES, INST, o);
        assertEquals(r.getContentAsString(), 200, r.getStatus());
        JsonNode b = body(r);
        assertEquals(2, b.path("requested_count").asInt());
        assertEquals(0, b.path("error_count").asInt());
        assertTrue(b.path("note_sent").asBoolean());
        assertEquals("requested", result(b, INST));
        assertEquals("requested", result(b, o));
        assertEquals("기관당 감사 1행", 2, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='COLLECT_REQUEST' AND OUTCOME='OK'"
                + " AND ACTOR_EMP_NO=? AND BUTTON_ID=?", SALES, BATCH_BTN));
        assertEquals("쪽지는 기관당이 아니라 수신처(전산팀·전산팀장)당 한 통 = 합계 2통", before + 2, notes());
        assertEquals(2, count("SELECT COUNT(*) FROM PLAN_COLLECT_REQ WHERE STATUS_CD='REQUESTED' AND OPEN_INST_ID IN (?,?)", INST, o));
        String note = jdbc.queryForObject("SELECT CONTENT FROM NOTIFICATIONS WHERE KIND='수집요청' AND RECIPIENT='전산팀'", String.class);
        assertTrue(note.contains("2곳"));
        assertFalse("쪽지에 사번이 없다", note.contains(SALES));
        assertFalse("응답에 사번이 없다", r.getContentAsString().contains(SALES));
    }

    @Test
    public void 단건_응답에는_quiet가_섞이지_않고_쪽지는_전과_같다() throws Exception {
        MockHttpServletResponse a = ask(INST, SALES);
        assertEquals(201, a.getStatus());
        assertFalse(a.getContentAsString().contains("quiet"));
        assertFalse(a.getContentAsString().contains("fresh"));
        assertEquals(2, notes());
    }

    @Test
    public void 이미_내가_요청한_기관은_already_남이_연_기관은_joined_없는_기관은_not_found_쪽지는_새_요청분만() throws Exception {
        String o = other();
        ask(INST, SALES);
        ask(o, SALES2);
        int before = notes();
        MockHttpServletResponse r = batchIds(SALES, INST, o, "no-such-inst");
        assertEquals(r.getContentAsString(), 200, r.getStatus());
        JsonNode b = body(r);
        assertEquals("already", result(b, INST));
        assertEquals("joined", result(b, o));
        assertEquals("not_found", result(b, "no-such-inst"));
        assertEquals(0, b.path("requested_count").asInt());
        assertEquals(1, b.path("joined_count").asInt());
        assertEquals(1, b.path("already_count").asInt());
        assertEquals(1, b.path("not_found_count").asInt());
        assertFalse("새 요청이 없으니 쪽지도 없다", b.path("note_sent").asBoolean());
        assertEquals(before, notes());
        assertEquals(1, batchAudit("DUPLICATE"));
        assertEquals(1, batchAudit("JOINED"));
    }

    @Test
    public void 대소문자만_다른_id_50개는_처리_1건_감사_1행() throws Exception {
        Set<String> v = new LinkedHashSet<>();
        for (int m = 0; m < 64 && v.size() < 50; m++) {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < INST.length(); i++) {
                char c = INST.charAt(i);
                sb.append((m >> i & 1) == 1 ? Character.toUpperCase(c) : c);
            }
            v.add(sb.toString());
        }
        assertEquals(50, v.size());
        MockHttpServletResponse r = batchIds(SALES, v.toArray(new String[0]));
        assertEquals(r.getContentAsString(), 200, r.getStatus());
        JsonNode b = body(r);
        assertEquals(1, b.path("results").size());
        assertEquals(1, b.path("requested_count").asInt());
        assertEquals("requested", result(b, INST));
        assertEquals(1, batchAudit("OK"));
        assertEquals(1, count("SELECT COUNT(*) FROM PLAN_COLLECT_REQ WHERE INSTITUTION_ID=?", INST));
    }

    @Test
    public void 한도_밖_빈_배열_형식_오류는_400_BAD_IDS이고_INVALID_감사() throws Exception {
        List<String> over = new ArrayList<>();
        for (int i = 0; i < 51; i++) over.add("inst" + i);
        MockHttpServletResponse r = batchIds(SALES, over.toArray(new String[0]));
        assertEquals(400, r.getStatus());
        assertEquals("BAD_IDS", body(r).path("detail").path("code").asText());
        assertEquals(1, batchAudit("INVALID"));
        assertEquals(400, batch("{\"institution_ids\":[]}", SALES).getStatus());
        assertEquals(400, batch("{}", SALES).getStatus());
        assertEquals(400, batchIds(SALES, "../x").getStatus());
        assertEquals(400, batchIds(SALES, "a b").getStatus());
        assertEquals(0, count("SELECT COUNT(*) FROM PLAN_COLLECT_REQ"));
        assertEquals(0, notes());
    }

    @Test
    public void 디자이너_재무부서는_403이고_사번없으면_401_JSON이_아니면_415() throws Exception {
        assertEquals(403, batchIds(DESIGNER, INST).getStatus());
        assertEquals(403, batchIds(BUDGET, INST).getStatus());
        assertEquals(401, batchIds(null, INST).getStatus());
        assertEquals(2, batchAudit("DENIED"));
        assertEquals(0, count("SELECT COUNT(*) FROM PLAN_COLLECT_REQ"));
        assertEquals(0, notes());
        assertEquals(415, call(post("/plan-collect/batch").contentType(MediaType.TEXT_PLAIN).content(ids(INST)), SALES).getStatus());
    }

    @Test
    public void 일괄도_취소_뒤_10분_안_재요청이면_쪽지를_생략한다() throws Exception {
        ask(INST, SALES);
        assertEquals(200, call(post("/institutions/" + INST + "/plan-collect/cancel"), SALES).getStatus());
        int before = notes();
        JsonNode b = body(batchIds(SALES, INST));
        assertEquals("requested", result(b, INST));
        assertFalse(b.path("note_sent").asBoolean());
        assertEquals(before, notes());
    }

    @Test
    public void 접근_이력_DETAIL은_건수만이고_기관_id와_사번이_없다() throws Exception {
        String o = other();
        assertEquals(200, batchIds(SALES, INST, o).getStatus());
        List<String> d = jdbc.queryForList("SELECT DETAIL FROM ACCESS_LOG WHERE EVENT_TYPE='API' AND HTTP_METHOD='POST'"
                + " AND REQ_PATH='/plan-collect/batch' ORDER BY LOG_ID DESC", String.class);
        assertFalse("접근 이력이 남아야 한다", d.isEmpty());
        assertTrue(d.get(0), d.get(0).contains("plan-collect batch n=2 requested=2 joined=0 already=0"));
        assertFalse(d.get(0), d.get(0).contains(INST) || d.get(0).contains(o) || d.get(0).contains(SALES));
    }
}
