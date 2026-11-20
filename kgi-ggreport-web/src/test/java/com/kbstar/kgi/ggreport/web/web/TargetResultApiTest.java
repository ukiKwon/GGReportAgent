package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.support.Times;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * 협약 성과(NEXT 104) API. 사람: 영업 3918264 · 영업팀장 5047192 · 전산 4482971 · 디자이너 7130526 · 예산팀 1857403 · 예산팀장 9026715. 기관 jongno.
 * 시험 DB 의 INST_BID_TARGET·INST_BANK_CONTRACT 가 비어 있다고 가정(BidTargetApiTest 와 같음). 읽기 전용 API 라 시드는 JDBC 로 직접 넣는다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class TargetResultApiTest {
    private static final String SALES = "3918264", LEAD = "5047192", IT = "4482971", DESIGNER = "7130526", FIN = "1857403", FIN_LEAD = "9026715";
    private static final String PATH = "/bid-targets/results";
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;

    private static int y() { return Integer.parseInt(Times.todayKst().substring(0, 4)); }

    private MvcResult getAs(String emp, String url) throws Exception {
        MockHttpServletRequestBuilder b = get(url);
        if (emp != null) b = b.header(Actor.HEADER, emp);
        return mockMvc.perform(b).andReturn();
    }
    private static JsonNode json(MvcResult r) throws Exception { return JSON.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8)); }
    private static int status(MvcResult r) { return r.getResponse().getStatus(); }
    private JsonNode report(int year) throws Exception {
        MvcResult r = getAs(SALES, PATH + "?year=" + year);
        assertEquals(200, status(r));
        return json(r);
    }
    private int count(String table) { return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class); }
    private int denied(String emp) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE='DENIED' AND EMP_NO=? AND REQ_PATH=? AND STATUS_CODE=403", Integer.class, emp, PATH);
    }
    private void userPerm(String emp, String menu, int view, int edit) {
        jdbc.update("DELETE FROM USER_MENU_PERMS WHERE EMP_NO=? AND MENU_KEY=?", emp, menu);
        jdbc.update("INSERT INTO USER_MENU_PERMS (EMP_NO, MENU_KEY, CAN_VIEW, CAN_WRITE, CAN_EDIT, CAN_APPROVE, UPDATED_AT)"
                + " VALUES (?,?,?,0,?,0,'2026-11-17T00:00:00+00:00')", emp, menu, view, edit);
    }

    private void target(int no, int rev, String action, String kind, Integer year, String tag, String reason, String etc) {
        jdbc.update("INSERT INTO INST_BID_TARGET (INSTITUTION_ID, TARGET_NO, REV_NO, ACTION_CD, KIND_CD, TARGET_YEAR, TAG_CD, MEMO, OWNER_EMP_NO, OWNER_NAME,"
                + " CANCEL_REASON_CD, CANCEL_REASON_ETC, EDITOR_EMP_NO, EDITOR_NAME, EMP_VERIFIED, SCREEN_ID, BUTTON_ID, UI_VALID, SAVED_AT)"
                + " VALUES ('jongno',?,?,?,?,?,?,NULL,'3918264','김영업',?,?,'3918264','김영업',0,'bid_board','seed',1,'2026-11-18T00:00:00+09:00')",
                no, rev, action, kind, year, tag, reason, etc);
    }
    private void line(int no, String rank, String bank, String from, String to) {
        jdbc.update("INSERT INTO INST_BANK_CONTRACT (INSTITUTION_ID, CONTRACT_NO, REV_NO, ACTION_CD, ORIGIN_CD, RANK_CD, BANK_CD, TERM_FROM, TERM_TO,"
                + " SRC_KIND, CHECKED_DATE, OVERLAP_CONFIRMED, EDITOR_EMP_NO, EDITOR_NAME, EMP_VERIFIED, SCREEN_ID, BUTTON_ID, UI_VALID, SAVED_AT)"
                + " VALUES ('jongno',?,1,'SAVE','MANUAL',?,?,?,?,'STAFF','2026-11-18',0,'3918264','김영업',0,'bank_contract','seed',1,'2026-11-18T00:00:00+09:00')",
                no, rank, bank, from, to);
    }
    private void prep(String caseId, String state, String confirmedAt, String updatedAt) {
        jdbc.update("INSERT INTO BID_PREP (BID_CASE_ID, INSTITUTION_ID, STATE_CD, CONFIRMED_BY, CONFIRMED_AT, UPDATED_BY, UPDATED_AT)"
                + " VALUES (?,'jongno',?,'3918264',?,'3918264',?)", caseId, state, confirmedAt, updatedAt);
    }
    private static void keys(JsonNode n, List<String> out) {
        if (n.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> it = n.fields();
            while (it.hasNext()) { Map.Entry<String, JsonNode> e = it.next(); out.add(e.getKey()); keys(e.getValue(), out); }
        } else if (n.isArray()) {
            for (JsonNode c : n) keys(c, out);
        }
    }

    // ── 권한 ──
    @Test public void 사번_없으면_401() throws Exception {
        assertEquals(401, status(getAs(null, PATH)));
    }

    @Test public void 영업_팀장_디자이너_전산은_200() throws Exception {
        for (String emp : new String[]{SALES, LEAD, DESIGNER, IT}) assertEquals(emp, 200, status(getAs(emp, PATH)));
    }

    @Test public void 예산팀_예산팀장은_403이고_DENIED가_남는다() throws Exception {
        assertEquals(403, status(getAs(FIN, PATH)));
        assertEquals(1, denied(FIN));
        assertEquals(403, status(getAs(FIN_LEAD, PATH)));
        assertEquals(1, denied(FIN_LEAD));
    }

    @Test public void 예산팀에_map_예외를_켜도_역할_검사가_먼저라_403() throws Exception {
        userPerm(FIN, "map", 1, 1);
        assertEquals(403, status(getAs(FIN, PATH)));
    }

    @Test public void 연도_입력_검증() throws Exception {
        assertEquals(400, status(getAs(SALES, PATH + "?year=20x6")));
        assertEquals(400, status(getAs(SALES, PATH + "?year=1989")));
        assertEquals(200, status(getAs(SALES, PATH)));
    }

    // ── 판정 ──
    @Test public void 재유치_성공_한_건() throws Exception {
        final int Y = y();
        target(1, 1, "SAVE", "GOAL", Y, "NEW", null, null);
        line(1, "FIRST", "B02", (Y - 3) + "-01", Y + "-12");
        line(2, "FIRST", "B02", (Y + 1) + "-01", (Y + 4) + "-12");
        JsonNode r = report(Y);
        JsonNode it = r.path("items").get(0);
        assertEquals("jongno", it.path("institution_id").asText());
        assertEquals("SUCCESS", it.path("result_cd").asText());
        assertEquals("RETAIN", it.path("win_kind").asText());
        assertEquals("PRIOR_CONTRACT", it.path("win_kind_basis").asText());
        assertEquals("FIRST", it.path("win_rank_cd").asText());
        assertTrue(it.path("banks").get(0).path("is_kb").asBoolean());
        assertEquals("STAFF", it.path("evidence").path("src_kind_cd").asText());
        assertEquals("NONE", it.path("prep").path("kind").asText());
        assertTrue("담당자 이름은 내지 않는다(사용자 11-20)", it.path("owner_name").isNull());
        JsonNode s = r.path("summary");
        assertEquals(1, s.path("target_n").asInt()); assertEquals(1, s.path("success_n").asInt());
        assertEquals(1, s.path("success_retain_n").asInt()); assertEquals(0, s.path("success_new_n").asInt());
        assertEquals(100.0, s.path("success_rate").asDouble(), 0.0001);
        assertEquals(1, s.path("rate_denominator").asInt());
        assertFalse(r.path("truncated").asBoolean());
    }

    @Test public void 다른_은행이면_실패_성공률_0() throws Exception {
        final int Y = y();
        target(1, 1, "SAVE", "GOAL", Y, "RETAIN", null, null);
        line(1, "FIRST", "B03", (Y + 1) + "-01", (Y + 4) + "-12");
        JsonNode r = report(Y);
        assertEquals("FAIL", r.path("items").get(0).path("result_cd").asText());
        assertEquals(1, r.path("summary").path("fail_n").asInt());
        assertEquals(0.0, r.path("summary").path("success_rate").asDouble(), 0.0001);
    }

    @Test public void 약정이_없으면_지난해는_미등록_다음해는_대기_분모는_0이라_성공률_null() throws Exception {
        final int Y = y();
        target(1, 1, "SAVE", "GOAL", Y - 1, "NEW", null, null);
        target(2, 1, "SAVE", "GOAL", Y + 1, "NEW", null, null);
        JsonNode past = report(Y - 1);
        assertEquals("UNREGISTERED", past.path("items").get(0).path("result_cd").asText());
        assertEquals(1, past.path("summary").path("unregistered_n").asInt());
        assertTrue(past.path("summary").path("success_rate").isNull());
        JsonNode next = report(Y + 1);
        assertEquals("PENDING", next.path("items").get(0).path("result_cd").asText());
        assertEquals(1, next.path("summary").path("pending_n").asInt());
    }

    // ── 뺀 곳 ──
    @Test public void 포기로_뺀_곳은_분모에서_빠지고_뺀_곳에_들어간다() throws Exception {
        final int Y = y();
        target(1, 1, "SAVE", "GOAL", Y, "NEW", null, null);
        target(1, 2, "CANCEL", "GOAL", Y, "NEW", "DROPPED", null);
        JsonNode r = report(Y);
        assertEquals(0, r.path("summary").path("target_n").asInt());
        assertEquals(1, r.path("summary").path("removed_n").asInt());
        JsonNode rm = r.path("removed_items").get(0);
        assertEquals("CANCEL", rm.path("removed_kind").asText());
        assertEquals("DROPPED", rm.path("reason_cd").asText());
    }

    @Test public void 잘못_넣음_중복_취소는_뺀_곳에서_제외() throws Exception {
        final int Y = y();
        target(1, 1, "SAVE", "GOAL", Y, "NEW", null, null);
        target(1, 2, "CANCEL", "GOAL", Y, "NEW", "WRONG", null);
        JsonNode r = report(Y);
        assertEquals(0, r.path("summary").path("target_n").asInt());
        assertEquals(0, r.path("summary").path("removed_n").asInt());
        assertEquals(0, r.path("removed_items").size());
        jdbc.update("DELETE FROM INST_BID_TARGET");
        target(1, 1, "SAVE", "GOAL", Y, "NEW", null, null);
        target(1, 2, "CANCEL", "GOAL", Y, "NEW", "DUP", null);
        assertEquals(0, report(Y).path("summary").path("removed_n").asInt());
    }

    @Test public void 취소_뒤_같은_해에_다시_넣으면_뺀_곳에_안_센다() throws Exception {
        final int Y = y();
        target(1, 1, "SAVE", "GOAL", Y, "NEW", null, null);
        target(1, 2, "CANCEL", "GOAL", Y, "NEW", "DROPPED", null);
        target(2, 1, "SAVE", "GOAL", Y, "RETAIN", null, null);
        JsonNode r = report(Y);
        assertEquals(1, r.path("summary").path("target_n").asInt());
        assertEquals(0, r.path("summary").path("removed_n").asInt());
    }

    @Test public void 관심으로_옮김과_연도_바꿈도_뺀_곳() throws Exception {
        final int Y = y();
        target(1, 1, "SAVE", "GOAL", Y, "NEW", null, null);
        target(1, 2, "MOVE", "WATCH", null, "NEW", null, null);
        assertEquals("MOVE_TO_WATCH", report(Y).path("removed_items").get(0).path("removed_kind").asText());
        jdbc.update("DELETE FROM INST_BID_TARGET");
        target(1, 1, "SAVE", "GOAL", Y, "NEW", null, null);
        target(1, 2, "SAVE", "GOAL", Y + 1, "NEW", null, null);
        assertEquals("YEAR_CHANGED", report(Y).path("removed_items").get(0).path("removed_kind").asText());
    }

    @Test public void 기타_사유가_전화번호면_가리고_평범하면_그대로() throws Exception {
        final int Y = y();
        target(1, 1, "SAVE", "GOAL", Y, "NEW", null, null);
        target(1, 2, "CANCEL", "GOAL", Y, "NEW", "ETC", "문의 010-1234-5678");
        assertEquals("기타(가림)", report(Y).path("removed_items").get(0).path("reason_name").asText());
        jdbc.update("DELETE FROM INST_BID_TARGET");
        target(1, 1, "SAVE", "GOAL", Y, "NEW", null, null);
        target(1, 2, "CANCEL", "GOAL", Y, "NEW", "ETC", "예산 사정으로 포기");
        assertEquals("예산 사정으로 포기", report(Y).path("removed_items").get(0).path("reason_name").asText());
    }

    // ── 잘림(F5) ──
    @Test public void 목표가_상한을_넘으면_숫자와_뺀곳은_비우고_잘림을_알린다() throws Exception {
        final int Y = y();
        List<Object[]> batch = new ArrayList<Object[]>();
        for (int i = 0; i < 2001; i++) batch.add(new Object[]{"bulk" + String.format("%05d", i), Y});
        jdbc.batchUpdate("INSERT INTO INST_BID_TARGET (INSTITUTION_ID, TARGET_NO, REV_NO, ACTION_CD, KIND_CD, TARGET_YEAR, TAG_CD, MEMO, OWNER_EMP_NO, OWNER_NAME,"
                + " CANCEL_REASON_CD, CANCEL_REASON_ETC, EDITOR_EMP_NO, EDITOR_NAME, EMP_VERIFIED, SCREEN_ID, BUTTON_ID, UI_VALID, SAVED_AT)"
                + " VALUES (?,1,1,'SAVE','GOAL',?,'NEW',NULL,NULL,NULL,NULL,NULL,'3918264','김영업',0,'bid_board','seed',1,'2026-11-18T00:00:00+09:00')", batch);
        JsonNode r = report(Y);
        assertTrue(r.path("truncated").asBoolean());
        assertTrue(r.path("summary").isNull());
        assertTrue(r.path("removed_items").isNull());
        assertEquals(2000, r.path("items").size());
    }

    // ── 응답·감사·읽기 전용 ──
    @Test public void 응답에_사번과_감사_칸이_없고_키는_모두_snake_case() throws Exception {
        final int Y = y();
        target(1, 1, "SAVE", "GOAL", Y, "NEW", null, null);
        line(2, "FIRST", "B02", (Y + 1) + "-01", (Y + 4) + "-12");
        MvcResult res = getAs(SALES, PATH + "?year=" + Y);
        String body = res.getResponse().getContentAsString(StandardCharsets.UTF_8);
        for (String bad : new String[]{"3918264", "editor", "screen_id", "button_id", "src_url", "memo", "emp_verified"}) assertFalse(bad, body.contains(bad));
        List<String> ks = new ArrayList<String>();
        keys(json(res), ks);
        for (String k : ks) assertTrue(k, k.matches("[a-z0-9_]+"));
    }

    @Test public void 읽기_전용_행_수가_그대로고_접근_이력은_건수만_남긴다() throws Exception {
        final int Y = y();
        target(1, 1, "SAVE", "GOAL", Y, "NEW", null, null);
        line(2, "FIRST", "B02", (Y + 1) + "-01", (Y + 4) + "-12");
        int t0 = count("INST_BID_TARGET"), c0 = count("INST_BANK_CONTRACT");
        assertEquals(200, status(getAs(SALES, PATH + "?year=" + Y)));
        assertEquals(t0, count("INST_BID_TARGET"));
        assertEquals(c0, count("INST_BANK_CONTRACT"));
        List<String> d = jdbc.queryForList("SELECT DETAIL FROM ACCESS_LOG WHERE EVENT_TYPE='API' AND HTTP_METHOD='GET' ORDER BY LOG_ID DESC", String.class);
        assertEquals("target-result n=1 removed=0", d.get(0));
        assertFalse(d.get(0).contains(String.valueOf(Y)));
    }

    @Test public void 이웃_연도에_이중_계산되지_않는다_1월_시작은_전년도_목표() throws Exception {
        final int Y = y();
        target(1, 1, "SAVE", "GOAL", Y - 1, "NEW", null, null);
        target(2, 1, "SAVE", "GOAL", Y, "NEW", null, null);
        line(1, "FIRST", "B02", Y + "-01", (Y + 3) + "-12");   // Y-1 귀속
        assertEquals("SUCCESS", report(Y - 1).path("items").get(0).path("result_cd").asText());
        assertEquals("PENDING", report(Y).path("items").get(0).path("result_cd").asText());
    }

    @Test public void 공동_지정_JOINT_국민은행은_성공_순위_집계에는_안_들어간다() throws Exception {
        final int Y = y();
        target(1, 1, "SAVE", "GOAL", Y, "NEW", null, null);
        line(1, "JOINT", "B02", (Y + 1) + "-01", (Y + 4) + "-12");
        JsonNode s = report(Y).path("summary");
        assertEquals(1, s.path("success_n").asInt());
        assertEquals(0, s.path("success_first_n").asInt());
        assertEquals(0, s.path("success_second_n").asInt());
    }

    @Test public void 제안_진행_ACTIVE와_CANCELLED_가장_최근_갱신이_이긴다() throws Exception {
        final int Y = y();
        target(1, 1, "SAVE", "GOAL", Y, "NEW", null, null);
        prep("p1", "IN_PROGRESS", Y + "-03-01T00:00:00.000000+00:00", Y + "-03-02T00:00:00.000000+00:00");
        JsonNode it = report(Y).path("items").get(0).path("prep");
        assertEquals("ACTIVE", it.path("kind").asText());
        assertEquals("IN_PROGRESS", it.path("state_cd").asText());
        prep("p2", "CANCELLED", Y + "-04-01T00:00:00.000000+00:00", Y + "-04-02T00:00:00.000000+00:00");
        assertEquals("CANCELLED", report(Y).path("items").get(0).path("prep").path("kind").asText());
    }

    @Test public void 제안_확정_시각은_한국_시각_연도로_가른다_UTC_경계() throws Exception {
        final int Y = y();
        target(1, 1, "SAVE", "GOAL", Y, "NEW", null, null);
        prep("pA", "CONFIRMED", (Y - 1) + "-12-31T15:30:00.000000+00:00", (Y - 1) + "-12-31T15:30:00.000000+00:00");
        assertEquals("ACTIVE", report(Y).path("items").get(0).path("prep").path("kind").asText());
        jdbc.update("DELETE FROM BID_PREP");
        prep("pB", "CONFIRMED", Y + "-12-31T15:30:00.000000+00:00", Y + "-12-31T15:30:00.000000+00:00");
        assertEquals("NONE", report(Y).path("items").get(0).path("prep").path("kind").asText());
        jdbc.update("DELETE FROM BID_PREP");
        prep("pC", "CONFIRMED", (Y - 1) + "-12-31T15:00:00.000000+00:00", (Y - 1) + "-12-31T15:00:00.000000+00:00");
        assertEquals("ACTIVE", report(Y).path("items").get(0).path("prep").path("kind").asText());
        jdbc.update("DELETE FROM BID_PREP");
        prep("pD", "CONFIRMED", Y + "-12-31T15:00:00.000000+00:00", Y + "-12-31T15:00:00.000000+00:00");
        assertEquals("NONE", report(Y).path("items").get(0).path("prep").path("kind").asText());
    }

    @Test public void 뺀_곳은_기관당_한_건_가장_늦게_뺀_기록() throws Exception {
        final int Y = y();
        target(1, 1, "SAVE", "GOAL", Y, "NEW", null, null);
        target(1, 2, "CANCEL", "GOAL", Y, "NEW", "DROPPED", null);
        target(2, 1, "SAVE", "GOAL", Y, "NEW", null, null);
        target(2, 2, "CANCEL", "GOAL", Y, "NEW", "ETC", "예산 사정으로 포기");
        jdbc.update("UPDATE INST_BID_TARGET SET SAVED_AT='2026-11-19T00:00:00+00:00' WHERE TARGET_NO=2 AND REV_NO=2");
        jdbc.update("UPDATE INST_BID_TARGET SET SAVED_AT='2026-11-18T00:00:00+00:00' WHERE TARGET_NO=1 AND REV_NO=2");
        JsonNode r = report(Y);
        assertEquals(1, r.path("summary").path("removed_n").asInt());
        assertEquals(1, r.path("removed_items").size());
        assertEquals(2, r.path("removed_items").get(0).path("target_no").asInt());
    }
}
