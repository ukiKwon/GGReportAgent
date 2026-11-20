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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import com.kbstar.kgi.ggreport.web.support.Times;
import java.time.Duration;
import java.time.Instant;
import static org.junit.Assert.assertNull;

/**
 * 사업계획 수집 요청(045) — 요청·덧붙임·취소·권한·처리 목록·내려받기·수집 중 표시·반입 자동 반영·제외·실패·감사·쪽지.
 * ADMIN 8203417(전산팀·마스터), SALES 3918264 김영업, SALES2 7742059 장하윤, DESIGNER 7130526, BUDGET 1857403. 기관 jongno. agent 설정 없음(꺼짐).
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class PlanCollectApiTest {

    private static final String ADMIN = "8203417";
    private static final String SALES = "3918264";
    private static final String SALES2 = "7742059";
    private static final String DESIGNER = "7130526";
    private static final String BUDGET = "1857403";
    private static final String INST = "jongno";
    private static final String IT_LEAD = "6295038";   // 오전산(전산팀장) — 목록 반출 자격(A2)
    private static final String HDR = "기관ID,문서명,원천종류,대상기간시작,대상기간끝,출처URL,확인일,수집자,분야번호,분야명,사업번호,상위사업번호,"
            + "사업명,내용,예산상태,예산금액,예산단위,연차예산,원문쪽,확인상태,진행상태,이행률";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    private final ObjectMapper json = new ObjectMapper();

    private MockHttpServletResponse call(MockHttpServletRequestBuilder b, String emp) throws Exception {
        if (emp != null) b.header("X-Emp-No", emp);
        MockHttpServletResponse res = mockMvc.perform(b).andReturn().getResponse();
        res.setCharacterEncoding("UTF-8");
        return res;
    }
    private MockHttpServletResponse ask(String emp) throws Exception { return call(post("/institutions/" + INST + "/plan-collect"), emp); }
    private MockHttpServletResponse cancel(String emp) throws Exception { return call(post("/institutions/" + INST + "/plan-collect/cancel"), emp); }
    private MockHttpServletResponse admin(String path, String body, String emp) throws Exception {
        return call(post(path).contentType(MediaType.APPLICATION_JSON).content(body), emp);
    }
    private static String keys(String k) { return "{\"req_keys\":[\"" + k + "\"]}"; }
    private static String keysReason(String k, String r) { return "{\"req_keys\":[\"" + k + "\"],\"reason\":\"" + r + "\"}"; }
    private String key() { return jdbc.queryForObject("SELECT REQ_KEY FROM PLAN_COLLECT_REQ WHERE OPEN_INST_ID=?", String.class, INST); }
    private String state(String k) { return jdbc.queryForObject("SELECT STATUS_CD FROM PLAN_COLLECT_REQ WHERE REQ_KEY=?", String.class, k); }
    private int count(String sql, Object... a) { return jdbc.queryForObject(sql, Integer.class, a); }
    private JsonNode body(MockHttpServletResponse r) throws Exception { return json.readTree(r.getContentAsString()); }
    private static String first(JsonNode b) { return b.path("results").get(0).path("result_cd").asText(); }
    /** 전산팀장에게 admin 키 — 시험 DB 에 033 이 없어도 되게(ApproverApiTest:282 방식). 있으면 무해. */
    private void itLeadAdmin() throws Exception {
        MockHttpServletResponse r = call(put("/sysadmin/perms/" + IT_LEAD).contentType(MediaType.APPLICATION_JSON)
                .content("{\"changes\":[{\"menu\":\"admin\",\"view\":true}]}"), ADMIN);
        assertEquals(r.getContentAsString(), 200, r.getStatus());
    }
    private static String sha256(String s) throws Exception {
        StringBuilder sb = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8))) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    private static JsonNode find(JsonNode items, String inst) {
        for (JsonNode n : items) if (inst.equals(n.path("institution_id").asText())) return n;
        return null;
    }

    private void importPlan() throws Exception {
        LocalDate d = LocalDate.now(ZoneId.of("Asia/Seoul")).minusDays(1);
        String row = String.join(",", INST, "종로 시험 계획(가상)", "4개년계획", "2023", "2030", "https://www.Example.kr/plan.pdf", d.toString(),
                "plan-collector/1.0", "1", "시험 분야", "1", "", "시험 사업", "", "원문에 없음", "", "", "", "", "", "", "");
        String name = INST + "_" + d.format(DateTimeFormatter.ofPattern("yyyyMMdd")) + "_plan.csv";
        MockHttpServletResponse r = call(multipart("/institutions/" + INST + "/plans/import")
                .file(new MockMultipartFile("file", name, "text/csv", (HDR + "\n" + row + "\n").getBytes(StandardCharsets.UTF_8))), ADMIN);
        assertEquals(r.getContentAsString(), 201, r.getStatus());
    }

    @Test
    public void 첫_요청은_201이고_두번째_사람은_덧붙고_개발부서_쪽지는_한번만() throws Exception {
        MockHttpServletResponse a = ask(SALES);
        assertEquals(a.getContentAsString(), 201, a.getStatus());
        assertEquals("REQUESTED", body(a).path("status_cd").asText());
        assertEquals(1, body(a).path("requester_count").asInt());
        assertTrue(body(a).path("requested_by_me").asBoolean());
        MockHttpServletResponse b = ask(SALES2);
        assertEquals(200, b.getStatus());
        assertEquals("JOINED", body(b).path("outcome").asText());
        assertEquals(2, body(b).path("requester_count").asInt());
        assertEquals(1, count("SELECT COUNT(*) FROM PLAN_COLLECT_REQ WHERE INSTITUTION_ID=?", INST));
        assertEquals(2, count("SELECT COUNT(*) FROM PLAN_COLLECT_REQUESTER WHERE INSTITUTION_ID=? AND CANCELED_AT IS NULL", INST));
        assertEquals(2, count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE KIND='수집요청' AND RECIPIENT IN ('전산팀','전산팀장')"));
        String note = jdbc.queryForObject("SELECT CONTENT FROM NOTIFICATIONS WHERE KIND='수집요청' AND RECIPIENT='전산팀'", String.class);
        assertFalse("쪽지에 요청자 사번이 없다", note.contains(SALES));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='COLLECT_REQUEST' AND OUTCOME='OK' AND ACTOR_EMP_NO=?"
                + " AND SCREEN_ID='plan_collect' AND BUTTON_ID='plan_collect_request' AND UI_VALID=1", SALES));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='COLLECT_REQUEST' AND OUTCOME='JOINED' AND ACTOR_EMP_NO=?", SALES2));
    }

    @Test
    public void 같은_사람이_또_누르면_200_DUPLICATE이고_줄이_늘지_않는다() throws Exception {
        ask(SALES);
        MockHttpServletResponse again = ask(SALES);
        assertEquals(200, again.getStatus());
        assertEquals("DUPLICATE", body(again).path("outcome").asText());
        assertEquals(1, count("SELECT COUNT(*) FROM PLAN_COLLECT_REQUESTER WHERE INSTITUTION_ID=?", INST));
    }

    @Test
    public void 디자이너_재무부서는_403이고_DENIED가_남고_사번없으면_401() throws Exception {
        assertEquals(403, ask(DESIGNER).getStatus());
        assertEquals(403, ask(BUDGET).getStatus());
        assertEquals(401, ask(null).getStatus());
        assertEquals(0, count("SELECT COUNT(*) FROM PLAN_COLLECT_REQ"));
        assertEquals(2, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='COLLECT_REQUEST' AND OUTCOME='DENIED' AND ACTOR_EMP_NO IN (?,?)",
                DESIGNER, BUDGET));
        assertEquals(404, call(post("/institutions/no-such-inst/plan-collect"), SALES).getStatus());
    }

    @Test
    public void 화면_상태는_요청자_수와_내_요청만_주고_사번_이름은_없다() throws Exception {
        ask(SALES);
        MockHttpServletResponse r = call(get("/plan-collect/status"), SALES2);
        assertEquals(200, r.getStatus());
        JsonNode s = body(r);
        assertTrue(s.path("can_request").asBoolean());
        JsonNode it = find(s.path("items"), INST);
        assertEquals(1, it.path("requester_count").asInt());
        assertFalse(it.path("requested_by_me").asBoolean());
        assertFalse(r.getContentAsString().contains(SALES) || r.getContentAsString().contains("김영업"));
        assertFalse(body(call(get("/plan-collect/status"), DESIGNER)).path("can_request").asBoolean());
    }

    @Test
    public void 마지막_요청자가_취소하면_닫히고_다시_요청하면_새_요청이다() throws Exception {
        ask(SALES);
        ask(SALES2);
        String k = key();
        MockHttpServletResponse c1 = cancel(SALES);
        assertEquals(200, c1.getStatus());
        assertEquals("REQUESTED", body(c1).path("status_cd").asText());
        assertEquals(1, body(c1).path("requester_count").asInt());
        assertEquals("이미 취소한 사람", 404, cancel(SALES).getStatus());
        MockHttpServletResponse c2 = cancel(SALES2);
        assertEquals("CANCELED", body(c2).path("status_cd").asText());
        assertEquals("CANCELED", state(k));
        assertEquals(0, count("SELECT COUNT(*) FROM PLAN_COLLECT_REQ WHERE OPEN_INST_ID IS NOT NULL"));
        assertEquals(201, ask(SALES).getStatus());
        assertEquals(2, count("SELECT COUNT(*) FROM PLAN_COLLECT_REQ WHERE INSTITUTION_ID=?", INST));
    }

    @Test
    public void 수집_중_표시_뒤에는_취소가_409이고_다시_표시하면_NOT_REQUESTED() throws Exception {
        ask(SALES);
        String k = key();
        MockHttpServletResponse m = admin("/plan-collect/mark-running", keys(k), ADMIN);
        assertEquals(m.getContentAsString(), 200, m.getStatus());
        assertEquals("OK", first(body(m)));
        assertEquals("RUNNING", state(k));
        assertEquals(409, cancel(SALES).getStatus());
        assertEquals("NOT_REQUESTED", first(body(admin("/plan-collect/mark-running", keys(k), ADMIN))));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='COLLECT_RUN' AND OUTCOME='MANUAL'"
                + " AND SCREEN_ID='plan_collect_admin' AND BUTTON_ID='plan_collect_mark'"));
        assertEquals("수집 중에도 요청자는 덧붙는다", 200, ask(SALES2).getStatus());
    }

    @Test
    public void 처리_목록은_묶음_요청자_이전_도메인_마지막_반입일을_주고_관리자만() throws Exception {
        importPlan();
        ask(SALES);
        ask(SALES2);
        MockHttpServletResponse r = call(get("/plan-collect/requests"), ADMIN);
        assertEquals(r.getContentAsString(), 200, r.getStatus());
        JsonNode b = body(r);
        assertEquals("OFF", b.path("agent_state").asText());
        assertFalse(b.path("agent_enabled").asBoolean());
        JsonNode it = find(b.path("items"), INST);
        assertEquals(2, it.path("requester_count").asInt());
        assertTrue(it.path("requester_names").toString().contains("김영업"));
        assertTrue(it.path("requester_names").toString().contains("장하윤"));
        assertEquals("example.kr", it.path("prev_domains").get(0).asText());
        assertFalse(it.path("last_import_at").isNull());
        assertFalse("사번은 싣지 않는다", r.getContentAsString().contains(SALES));
        assertEquals(403, call(get("/plan-collect/requests"), SALES).getStatus());
        assertEquals(1, body(call(get("/plan-collect/admin/status"), ADMIN)).path("requested_count").asInt());
        assertEquals(400, call(get("/plan-collect/requests?scope=x"), ADMIN).getStatus());
    }

    @Test
    public void 설정이_없으면_실행은_503_BLOCKED_NO_URL이고_상태는_그대로() throws Exception {
        ask(SALES);
        String k = key();
        MockHttpServletResponse r = admin("/plan-collect/run", keys(k), ADMIN);
        assertEquals(503, r.getStatus());
        assertEquals("BLOCKED_NO_URL", body(r).path("detail").path("code").asText());
        assertEquals("REQUESTED", state(k));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='COLLECT_RUN' AND OUTCOME='BLOCKED_NO_URL'"));
        assertEquals(403, admin("/plan-collect/run", keys(k), SALES).getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='COLLECT_RUN' AND OUTCOME='DENIED' AND ACTOR_EMP_NO=?", SALES));
    }

    @Test
    public void 내려받기는_사번없는_CSV이고_상태를_바꾸지_않는다() throws Exception {
        importPlan();
        ask(SALES);
        ask(SALES2);
        String k = key();
        itLeadAdmin();
        MockHttpServletResponse r = admin("/plan-collect/export.csv", keys(k), IT_LEAD);
        assertEquals(r.getContentAsString(), 200, r.getStatus());
        assertEquals(sha256(INST), r.getHeader("X-Plan-Export-Sha256"));
        assertTrue(r.getHeader("Content-Disposition").startsWith("attachment"));
        byte[] raw = r.getContentAsByteArray();
        assertEquals((byte) 0xEF, raw[0]);
        String text = new String(raw, StandardCharsets.UTF_8);
        assertTrue(text, text.contains("\"jongno\"") && text.contains("\"example.kr\"") && text.contains("\"2\"")
                && text.contains("jongno_YYYYMMDD_plan.csv"));
        assertFalse(text.contains(SALES) || text.contains("김영업"));
        assertEquals("REQUESTED", state(k));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='COLLECT_EXPORT' AND OUTCOME='OK' AND ITEM_COUNT=1"
                + " AND ACTOR_EMP_NO=? AND FILE_SHA256=?", IT_LEAD, sha256(INST)));
        assertEquals(403, admin("/plan-collect/export.csv", keys(k), SALES).getStatus());
    }

    @Test
    public void 수집_반입이_들어오면_반영됨이_되고_요청자_전원에게_쪽지() throws Exception {
        ask(SALES);
        ask(SALES2);
        String k = key();
        admin("/plan-collect/mark-running", keys(k), ADMIN);
        importPlan();
        assertEquals("APPLIED", state(k));
        assertEquals(1, count("SELECT COUNT(*) FROM PLAN_COLLECT_REQ WHERE REQ_KEY=? AND OPEN_INST_ID IS NULL AND APPLIED_IMPORT_ID IS NOT NULL", k));
        assertEquals(1, count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE KIND='수집결과' AND RECIPIENT=?", SALES));
        assertEquals(1, count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE KIND='수집결과' AND RECIPIENT=?", SALES2));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='COLLECT_APPLY' AND OUTCOME='OK' AND ITEM_COUNT=2"));
    }

    @Test
    public void 요청됨_상태에서도_수집_반입이면_반영되고_시드는_반영하지_않는다() throws Exception {
        ask(SALES);
        String k = key();
        assertEquals(201, call(post("/institutions/" + INST + "/plans/seed"), ADMIN).getStatus());
        assertEquals("시드는 세지 않는다", "REQUESTED", state(k));
        // 시드 판이 있는 기관에도 수집 반입은 들어간다(034 판 되돌림 가드는 반대 방향만 막는다)
        importPlan();
        assertEquals("APPLIED", state(k));
    }

    @Test
    public void 제외는_사유_필수_개인정보_거부_그리고_요청자에게_쪽지() throws Exception {
        ask(SALES);
        String k = key();
        assertEquals(400, admin("/plan-collect/exclude", keysReason(k, " "), ADMIN).getStatus());
        assertEquals(400, admin("/plan-collect/exclude", keysReason(k, "담당 010-1234-5678 확인"), ADMIN).getStatus());
        assertEquals("요청됨에는 실패 표시 불가", "NOT_RUNNING", first(body(admin("/plan-collect/fail", keysReason(k, "응답 없음"), ADMIN))));
        MockHttpServletResponse ok = admin("/plan-collect/exclude", keysReason(k, "이미 최신 자료 있음"), ADMIN);
        assertEquals("OK", first(body(ok)));
        assertEquals("EXCLUDED", state(k));
        assertEquals("이미 최신 자료 있음", jdbc.queryForObject("SELECT CLOSE_REASON FROM PLAN_COLLECT_REQ WHERE REQ_KEY=?", String.class, k));
        assertEquals(1, count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE KIND='수집결과' AND RECIPIENT=?", SALES));
        assertEquals("NOT_OPEN", first(body(admin("/plan-collect/exclude", keysReason(k, "다시"), ADMIN))));
        assertTrue("사유 400 두 번은 INVALID 로 남는다", count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='COLLECT_EXCLUDE' AND OUTCOME='INVALID'") >= 2);
    }

    @Test
    public void 수집_중이면_실패_표시로_닫고_쪽지() throws Exception {
        ask(SALES);
        String k = key();
        admin("/plan-collect/mark-running", keys(k), ADMIN);
        assertEquals("OK", first(body(admin("/plan-collect/fail", keysReason(k, "2주째 반입 없음"), ADMIN))));
        assertEquals("FAILED", state(k));
        assertEquals(1, count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE KIND='수집결과' AND RECIPIENT=?", SALES));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='COLLECT_FAIL' AND OUTCOME='OK' AND BUTTON_ID='plan_collect_fail'"));
    }

    @Test
    public void 잘못된_키와_JSON이_아닌_본문은_막는다() throws Exception {
        MockHttpServletResponse bad = admin("/plan-collect/mark-running", "{\"req_keys\":[\"../x\"]}", ADMIN);
        assertEquals(400, bad.getStatus());
        assertEquals("BAD_KEYS", body(bad).path("detail").path("code").asText());
        assertEquals(400, admin("/plan-collect/mark-running", "{\"req_keys\":[]}", ADMIN).getStatus());
        StringBuilder many = new StringBuilder("{\"req_keys\":[");
        for (int i = 0; i < 51; i++) many.append(i > 0 ? "," : "").append('"').append(UUID.randomUUID()).append('"');
        assertEquals(400, admin("/plan-collect/mark-running", many.append("]}").toString(), ADMIN).getStatus());
        assertEquals(415, call(post("/plan-collect/mark-running").contentType(MediaType.TEXT_PLAIN).content("x"), ADMIN).getStatus());
    }
    @Test
    public void 재무부서는_요청_현황도_403이고_접근_이력에_DENIED_디자이너는_200() throws Exception {
        assertEquals(403, call(get("/plan-collect/status"), BUDGET).getStatus());
        assertTrue(count("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE='DENIED' AND EMP_NO=? AND REQ_PATH='/plan-collect/status' AND STATUS_CODE=403",
                BUDGET) >= 1);
        MockHttpServletResponse d = call(get("/plan-collect/status"), DESIGNER);
        assertEquals(200, d.getStatus());
        assertFalse(body(d).path("can_request").asBoolean());
    }

    @Test
    public void 요청자가_아닌_영업의_취소는_404_디자이너는_403과_DENIED() throws Exception {
        ask(SALES);
        MockHttpServletResponse r = cancel(SALES2);
        assertEquals(404, r.getStatus());
        assertEquals("NO_REQUEST", body(r).path("detail").path("code").asText());
        assertEquals(403, cancel(DESIGNER).getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='COLLECT_CANCEL' AND OUTCOME='DENIED' AND ACTOR_EMP_NO=?", DESIGNER));
        assertEquals("REQUESTED", state(key()));
    }

    @Test
    public void 대문자_기관_ID로_요청해도_201이고_정식_소문자로_저장된다() throws Exception {
        MockHttpServletResponse r = call(post("/institutions/JONGNO/plan-collect"), SALES);
        assertEquals(r.getContentAsString(), 201, r.getStatus());
        assertEquals(INST, body(r).path("institution_id").asText());
        assertEquals(1, count("SELECT COUNT(*) FROM PLAN_COLLECT_REQ WHERE INSTITUTION_ID=? AND OPEN_INST_ID=?", INST, INST));
    }

    @Test
    public void 내려받기_칸이_수식으로_시작하면_작은따옴표를_붙인다() throws Exception {
        jdbc.update("UPDATE INSTITUTIONS SET NAME_KO=? WHERE INSTITUTION_ID=?", "=cmd", INST);   // 시험 트랜잭션이 되돌린다
        ask(SALES);
        itLeadAdmin();
        String text = new String(admin("/plan-collect/export.csv", keys(key()), IT_LEAD).getContentAsByteArray(), StandardCharsets.UTF_8);
        assertTrue(text, text.contains("\"'=cmd\""));
    }

    @Test
    public void 닫힌_키만_내보내면_머리줄만이고_감사_건수는_0() throws Exception {
        ask(SALES);
        String k = key();
        admin("/plan-collect/exclude", keysReason(k, "이미 최신 자료 있음"), ADMIN);
        itLeadAdmin();
        MockHttpServletResponse r = admin("/plan-collect/export.csv", keys(k), IT_LEAD);
        assertEquals(200, r.getStatus());
        assertEquals(sha256(""), r.getHeader("X-Plan-Export-Sha256"));   // 빈 집합
        String text = new String(r.getContentAsByteArray(), StandardCharsets.UTF_8);
        assertEquals(text, 1, text.split("\r\n").length);
        assertTrue(text.contains("기관ID"));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='COLLECT_EXPORT' AND OUTCOME='OK' AND ITEM_COUNT=0"));
    }

    @Test
    public void 사유에_유선번호나_방향_바꿈_문자가_있으면_400과_고정_코드() throws Exception {
        ask(SALES);
        String k = key();
        MockHttpServletResponse a = admin("/plan-collect/exclude", keysReason(k, "담당 02-123-4567 확인"), ADMIN);
        assertEquals(400, a.getStatus());
        assertEquals("REASON_PII", body(a).path("detail").path("code").asText());
        MockHttpServletResponse b = admin("/plan-collect/exclude", keysReason(k, "자료\u202E없음"), ADMIN);
        assertEquals(400, b.getStatus());
        assertEquals("REASON_FORMAT", body(b).path("detail").path("code").asText());
        assertEquals("REASON_REQUIRED", body(admin("/plan-collect/exclude", keysReason(k, " "), ADMIN)).path("detail").path("code").asText());
        assertEquals("REQUESTED", state(k));
    }

    @Test
    public void 취소_직후_다시_요청하면_개발부서_쪽지를_생략하고_10분이_지나면_보낸다() throws Exception {
        String notes = "SELECT COUNT(*) FROM NOTIFICATIONS WHERE KIND='수집요청' AND RECIPIENT IN ('전산팀','전산팀장')";
        int base = count(notes);
        ask(SALES);
        assertEquals(base + 2, count(notes));
        cancel(SALES);
        assertEquals(201, ask(SALES).getStatus());
        assertEquals("10분 안 취소 뒤 재요청 — 쪽지 생략", base + 2, count(notes));
        cancel(SALES);
        jdbc.update("UPDATE PLAN_COLLECT_REQ SET CLOSED_AT=? WHERE INSTITUTION_ID=? AND STATUS_CD='CANCELED'",
                Times.iso(Instant.now().minus(Duration.ofMinutes(11))), INST);
        assertEquals(201, ask(SALES).getStatus());
        assertEquals(base + 4, count(notes));
    }

    @Test
    public void 실패_제외로_닫힌_최근_요청은_last_closed로_보이고_디자이너에게는_항목이_없다() throws Exception {
        ask(SALES);
        admin("/plan-collect/exclude", keysReason(key(), "이미 최신 자료 있음"), ADMIN);
        MockHttpServletResponse r = call(get("/plan-collect/status"), SALES2);
        JsonNode lc = find(body(r).path("last_closed"), INST);
        assertEquals("EXCLUDED", lc.path("status_cd").asText());
        assertEquals("이미 최신 자료 있음", lc.path("close_reason").asText());
        assertFalse(lc.path("closed_at").isNull());
        assertFalse("사번 없음", r.getContentAsString().contains(SALES));
        JsonNode des = body(call(get("/plan-collect/status"), DESIGNER)).path("last_closed");
        assertTrue("디자이너는 last_closed 가 빈 배열", des.isArray() && des.size() == 0);
        ask(SALES);
        assertNull("다시 열리면 last_closed 에서 빠진다", find(body(call(get("/plan-collect/status"), SALES2)).path("last_closed"), INST));
    }

    @Test
    public void 수집_반입으로_닫힌_기관은_recent_applied에_보이고_사번없이_디자이너에게도_보인다() throws Exception {
        ask(SALES);
        importPlan();
        MockHttpServletResponse r = call(get("/plan-collect/status"), SALES2);
        assertEquals(200, r.getStatus());
        JsonNode ra = find(body(r).path("recent_applied"), INST);
        assertTrue("반입 직후 recent_applied 에 있다", ra != null);
        assertFalse(ra.path("closed_at").isNull());
        assertEquals("키는 institution_id·closed_at 뿐", 2, ra.size());
        assertFalse("사번 없음", r.getContentAsString().contains(SALES));
        JsonNode des = body(call(get("/plan-collect/status"), DESIGNER));
        assertTrue("디자이너도 recent_applied 를 본다", find(des.path("recent_applied"), INST) != null);
        assertTrue("디자이너 last_closed 는 빈 배열", des.path("last_closed").isArray() && des.path("last_closed").size() == 0);
        assertEquals("재무부서는 status 자체가 403", 403, call(get("/plan-collect/status"), BUDGET).getStatus());
    }

    @Test
    public void recent_applied는_KST_날짜_기준_7일_경계로_빠진다() throws Exception {
        ask(SALES);
        importPlan();
        // cutoff = (오늘 KST − 6일)의 KST 00:00 — 반입한 날을 포함해 7일
        Instant cutoff = LocalDate.now(ZoneId.of("Asia/Seoul")).minusDays(6).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant();
        jdbc.update("UPDATE PLAN_COLLECT_REQ SET CLOSED_AT=? WHERE INSTITUTION_ID=? AND STATUS_CD='APPLIED'",
                Times.iso(cutoff.plus(Duration.ofMinutes(1))), INST);
        assertTrue("cutoff + 1분 — 있다(영업부서)",
                find(body(call(get("/plan-collect/status"), SALES2)).path("recent_applied"), INST) != null);
        assertTrue("cutoff + 1분 — 있다(디자이너)",
                find(body(call(get("/plan-collect/status"), DESIGNER)).path("recent_applied"), INST) != null);
        jdbc.update("UPDATE PLAN_COLLECT_REQ SET CLOSED_AT=? WHERE INSTITUTION_ID=? AND STATUS_CD='APPLIED'",
                Times.iso(cutoff.minus(Duration.ofMinutes(1))), INST);
        assertNull("cutoff − 1분 — 빠진다(영업부서)", find(body(call(get("/plan-collect/status"), SALES2)).path("recent_applied"), INST));
        assertNull("cutoff − 1분 — 빠진다(디자이너)", find(body(call(get("/plan-collect/status"), DESIGNER)).path("recent_applied"), INST));
    }

    @Test
    public void 반입_뒤_다시_열린_요청이_있어도_recent_applied는_유지되고_실패_제외는_APPLIED를_가리지_않는다() throws Exception {
        ask(SALES);
        importPlan();
        ask(SALES);
        assertTrue("열린 요청이 있어도 7일 안 반입이면 보인다",
                find(body(call(get("/plan-collect/status"), SALES2)).path("recent_applied"), INST) != null);
        admin("/plan-collect/exclude", keysReason(key(), "이미 최신 자료 있음"), ADMIN);
        JsonNode s = body(call(get("/plan-collect/status"), SALES2));
        assertEquals("EXCLUDED", find(s.path("last_closed"), INST).path("status_cd").asText());
        assertTrue("그래도 APPLIED 는 유지", find(s.path("recent_applied"), INST) != null);
        int n = 0;
        for (JsonNode x : s.path("recent_applied")) if (INST.equals(x.path("institution_id").asText())) n++;
        assertEquals("기관별 1건", 1, n);
    }

    @Test
    public void 폼_전송은_415() throws Exception {
        assertEquals(415, call(post("/plan-collect/exclude").contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .content("reason=x"), ADMIN).getStatus());
        assertEquals(415, call(post("/plan-collect/export.csv").contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .content("req_keys=x"), ADMIN).getStatus());
    }

    @Test
    public void 전산팀원은_목록_반출_403_LEAD_ONLY이고_감사_DENIED() throws Exception {
        ask(SALES);
        MockHttpServletResponse r = admin("/plan-collect/export.csv", keys(key()), ADMIN);
        assertEquals(403, r.getStatus());
        assertEquals("LEAD_ONLY", body(r).path("detail").path("code").asText());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='COLLECT_EXPORT' AND OUTCOME='DENIED' AND ACTOR_EMP_NO=?", ADMIN));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='COLLECT_EXPORT' AND OUTCOME='OK'"));
    }

    @Test
    public void 처리_목록은_반출_자격과_폴더_켜짐을_알린다() throws Exception {
        JsonNode a = body(call(get("/plan-collect/requests"), ADMIN));
        assertFalse(a.path("can_export").asBoolean());
        assertFalse(a.path("inbox_enabled").asBoolean());
        itLeadAdmin();
        assertTrue(body(call(get("/plan-collect/requests"), IT_LEAD)).path("can_export").asBoolean());
    }

    @Test
    public void 폴더_확인은_설정이_없으면_503이고_경로를_싣지_않는다() throws Exception {
        MockHttpServletResponse r = call(get("/plan-collect/inbox"), ADMIN);
        assertEquals(503, r.getStatus());
        assertEquals("PLAN_INBOX_OFF", body(r).path("detail").path("code").asText());
        MockHttpServletResponse p = admin("/plan-collect/inbox/import", "{\"file_names\":[\"jongno_20261118_plan.csv\"]}", ADMIN);
        assertEquals(503, p.getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='IMPORT' AND OUTCOME='INBOX_OFF'"
                + " AND SCREEN_ID='plan_collect_admin' AND BUTTON_ID='plan_inbox_import'"));
    }

    @Test
    public void 폴더_확인_반입은_영업_디자이너_재무_403_사번없음_401() throws Exception {
        for (String emp : new String[]{SALES, DESIGNER, BUDGET}) {
            assertEquals(emp, 403, call(get("/plan-collect/inbox"), emp).getStatus());
        }
        assertEquals(401, call(get("/plan-collect/inbox"), null).getStatus());
        assertEquals(403, admin("/plan-collect/inbox/import", "{\"file_names\":[\"jongno_20261118_plan.csv\"]}", SALES).getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='IMPORT' AND OUTCOME='DENIED' AND ACTOR_EMP_NO=?"
                + " AND BUTTON_ID='plan_inbox_import'", SALES));
    }

    @Test
    public void 폴더_반입_폼_전송은_415() throws Exception {
        assertEquals(415, call(post("/plan-collect/inbox/import").contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .content("file_names=x"), ADMIN).getStatus());
    }
}
