package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Before;
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
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * '입찰 없음'인데 제안 진행 중인 건 알림(048) — 사전준비 상세의 nobid_notice 와 [계속 작성] POST /bidcases/{id}/prep/nobid-ack.
 * 사용자(009 시드, 가상): 영업팀 3918264 · 영업팀 7742059 · 영업팀장 5047192 · 영업부장 2674805 · 전산팀 4482971 · 디자이너 7130526.
 * 기관 jongno(LAST_BID 2022-10-18). 건·담당·회차·판정은 JDBC 로 <b>첫 API 호출 전에</b> 만든다(같은 테스트 트랜잭션의 MyBatis 지역 캐시).
 * 롤백한다. ACCESS_LOG 는 별도 트랜잭션이라 남으므로 증분·최신 행으로 본다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class PrepNobidApiTest {

    private static final String SALES = "3918264";
    private static final String SALES2 = "7742059";
    private static final String LEAD = "5047192";
    private static final String LEAD2 = "5640327";   // 다른 팀 영업팀장(시드: 아래 팀원 없음)
    private static final String HEAD = "2674805";
    private static final String IT = "4482971";
    private static final String DESIGNER = "7130526";
    private static final String INST = "jongno";
    private static final String BID = "nb-test-a";
    private static final String BID2 = "nb-test-b";
    private static final String HANDLED = "2026-11-19T10:00:00+09:00";
    private static final String HANDLER = "가상기록자";
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcTemplate jdbc;

    @Before
    public void anchor() {
        jdbc.update("UPDATE INSTITUTIONS SET LAST_BID = ? WHERE INSTITUTION_ID = ?", "2022-10-18", INST);
    }

    // ── 도구 ─────────────────────────────────────────────────────────────

    private void prep(String bid, String state, String confirmedBy) {
        boolean opened = !"CONFIRMED".equals(state) && !"OPEN_PENDING".equals(state);
        jdbc.update("INSERT INTO BID_PREP (BID_CASE_ID, INSTITUTION_ID, STATE_CD, CONFIRMED_BY, CONFIRMED_AT, OPENED_BY, OPENED_AT,"
                        + " UPDATED_BY, UPDATED_AT) VALUES (?, ?, ?, ?, '2026-11-18T09:00:00+09:00', ?, ?, ?, '2026-11-18T09:00:00+09:00')",
                bid, INST, state, confirmedBy, opened ? HEAD : null, opened ? "2026-11-18T10:00:00+09:00" : null, confirmedBy);
    }

    private void assign(String bid, String emp) {
        jdbc.update("INSERT INTO BID_ASSIGNMENT (BID_CASE_ID, EMP_NO, ACTIVE_YN, ASSIGNED_BY, ASSIGNED_AT)"
                + " VALUES (?, ?, 1, ?, '2026-11-18T10:00:00+09:00')", bid, emp, HEAD);
    }

    private void round(int seq, String closedAt, String reason) {
        jdbc.update("INSERT INTO NOTICE_ROUND (INSTITUTION_ID, ROUND_SEQ, SOURCE_CD, ANCHOR_LAST_BID, OPENED_AT, OPENED_BY,"
                        + " CLOSED_AT, CLOSE_REASON_CD, CLOSED_BY, CLOSED_LAST_BID)"
                        + " VALUES (?, ?, 'INST_DATA', '2022-10-18', '2026-11-18T09:00:00+09:00', ?, ?, ?, ?, ?)",
                INST, seq, LEAD, closedAt, reason, closedAt == null ? null : LEAD, closedAt == null ? null : "2022-10-18");
    }

    private void log(int seq, int rev, String status, String at) {
        jdbc.update("INSERT INTO NOTICE_ROUND_LOG (INSTITUTION_ID, ROUND_SEQ, REV_NO, STATUS_CD, ACTIVE_PREP, SNAP_DUE_CONFIRMED,"
                        + " HANDLER_EMP_NO, HANDLER_NAME, EMP_VERIFIED, SCREEN_ID, BUTTON_ID, UI_VALID, HANDLED_AT)"
                        + " VALUES (?, ?, ?, ?, 1, 0, ?, ?, 0, 'bid_notice', 'save_confirmed', 1, ?)",
                INST, seq, rev, status, LEAD, HANDLER, at);
    }

    /** 회차 1: REV 1 미뤄짐 → REV 2 입찰 없음(그 저장으로 닫힘). */
    private void noBidRound() {
        round(1, HANDLED, "NO_BID");
        log(1, 1, "DELAYED", "2026-11-18T09:00:00+09:00");
        log(1, 2, "NO_BID", HANDLED);
    }

    private void userPerm(String emp, String menu, int view, int edit) {
        jdbc.update("INSERT INTO USER_MENU_PERMS (EMP_NO, MENU_KEY, CAN_VIEW, CAN_WRITE, CAN_EDIT, CAN_APPROVE, UPDATED_AT)"
                + " VALUES (?,?,?,0,?,0,'2026-11-19T00:00:00+00:00')", emp, menu, view, edit);
    }

    private MvcResult detail(String emp, String bid) throws Exception {
        return mockMvc.perform(get("/bidcases/" + bid + "/prep").header(Actor.HEADER, emp)
                .header("X-Screen-Id", "prep_detail").header("X-Button-Id", "open")).andReturn();
    }

    private JsonNode body(String emp, String bid) throws Exception {
        MvcResult r = detail(emp, bid);
        assertEquals(200, r.getResponse().getStatus());
        return json(r);
    }

    private JsonNode notice(String emp, String bid) throws Exception {
        return body(emp, bid).path("nobid_notice");
    }

    private MvcResult ack(String emp, String bid, String content, String screen, String button) throws Exception {
        MockHttpServletRequestBuilder b = post(ackPath(bid)).contentType(MediaType.APPLICATION_JSON);
        if (content != null) {
            b = b.content(content);
        }
        if (emp != null) {
            b = b.header(Actor.HEADER, emp);
        }
        return mockMvc.perform(b.header("X-Screen-Id", screen).header("X-Button-Id", button)).andReturn();
    }

    private MvcResult ack(String emp, String bid, String content) throws Exception {
        return ack(emp, bid, content, "prep_detail", "nobid_continue");
    }

    private static String ackBody(int seq, int rev) {
        return "{\"round_seq\":" + seq + ",\"rev_no\":" + rev + "}";
    }

    private static String ackPath(String bid) {
        return "/bidcases/" + bid + "/prep/nobid-ack";
    }

    private static JsonNode json(MvcResult r) throws Exception {
        return JSON.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private static String code(MvcResult r) throws Exception {
        return json(r).path("detail").path("code").asText();
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private int ackRows() {
        return count("SELECT COUNT(*) FROM PREP_NOBID_ACK WHERE INSTITUTION_ID = ?", INST);
    }

    private int denied(String emp, String path) {
        return count("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE='DENIED' AND EMP_NO=? AND REQ_PATH=? AND STATUS_CODE=403", emp, path);
    }

    private int act(String bid, String emp, String outcome) {
        return count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='NOBID_ACK' AND ACTOR_EMP_NO=? AND OUTCOME=?",
                bid, emp, outcome);
    }

    private String lastDetail(String method, String path) {
        List<String> rows = jdbc.queryForList("SELECT DETAIL FROM ACCESS_LOG WHERE EVENT_TYPE='API' AND HTTP_METHOD=? AND REQ_PATH=?"
                + " ORDER BY LOG_ID DESC", String.class, method, path);
        return rows.isEmpty() ? null : rows.get(0);
    }

    // ── 1~4 받는 사람·정리 판정 ──────────────────────────────────────────

    @Test
    public void 담당_영업팀은_팝업을_받고_정리_권한은_없다() throws Exception {
        prep(BID, "IN_PROGRESS", SALES2);
        assign(BID, SALES);
        noBidRound();
        JsonNode b = body(SALES, BID);
        JsonNode n = b.path("nobid_notice");
        assertTrue(n.path("applicable").asBoolean());
        assertEquals("popup", n.path("mode").asText());
        assertEquals(INST, n.path("institution_id").asText());
        assertEquals(1, n.path("round_seq").asInt());
        assertEquals(2, n.path("rev_no").asInt());
        assertEquals("NO_BID", n.path("status_cd").asText());
        assertEquals(HANDLED, n.path("handled_at").asText());
        assertEquals(HANDLER, n.path("handler_name").asText());
        assertFalse(n.path("emp_verified").asBoolean());
        assertTrue(n.path("can_view_notice").asBoolean());
        assertFalse(n.path("acked").asBoolean());
        assertTrue(n.path("can_ack").asBoolean());
        assertEquals("NONE", n.path("tidy_action").asText());
        assertFalse(b.path("viewer").path("can_cancel").asBoolean());   // 같은 판정 함수
    }

    @Test
    public void 영업팀장은_개설_뒤_건에서_CANCEL() throws Exception {
        prep(BID, "WRITING", SALES);
        assign(BID, SALES);   // 11-27: 팀장은 자기 팀 건만 본다 — 담당자(SALES, LEAD 팀)가 있어야 같은 팀 건
        noBidRound();
        JsonNode b = body(LEAD, BID);
        assertEquals("popup", b.path("nobid_notice").path("mode").asText());
        assertEquals("CANCEL", b.path("nobid_notice").path("tidy_action").asText());
        assertTrue(b.path("viewer").path("can_cancel").asBoolean());
    }

    @Test
    public void 영업부장은_팝업을_받되_정리_판정은_NONE() throws Exception {
        prep(BID, "WRITING", SALES);
        prep(BID2, "CONFIRMED", SALES);
        noBidRound();
        for (String bid : new String[]{BID, BID2}) {
            JsonNode b = body(HEAD, bid);
            assertEquals(bid, "popup", b.path("nobid_notice").path("mode").asText());
            assertEquals(bid, "NONE", b.path("nobid_notice").path("tidy_action").asText());
            assertFalse(bid, b.path("viewer").path("can_cancel").asBoolean());
            assertFalse(bid, b.path("viewer").path("can_unconfirm").asBoolean());
        }
    }

    @Test
    public void 확정됨은_확정자와_팀장이_UNCONFIRM_다른_영업팀은_사실줄만() throws Exception {
        prep(BID, "CONFIRMED", SALES);
        noBidRound();
        JsonNode mine = body(SALES, BID);
        assertEquals("popup", mine.path("nobid_notice").path("mode").asText());
        assertEquals("UNCONFIRM", mine.path("nobid_notice").path("tidy_action").asText());
        assertTrue(mine.path("viewer").path("can_unconfirm").asBoolean());
        assertEquals("UNCONFIRM", notice(LEAD, BID).path("tidy_action").asText());
        JsonNode other = notice(SALES2, BID);
        assertTrue(other.path("applicable").asBoolean());
        assertEquals("fact_only", other.path("mode").asText());
        assertFalse(other.path("can_ack").asBoolean());
        assertEquals("NONE", other.path("tidy_action").asText());
    }

    @Test
    public void 디자이너_담당자는_사실줄만이고_POST는_403_DENIED() throws Exception {
        prep(BID, "IN_PROGRESS", SALES);
        assign(BID, DESIGNER);
        noBidRound();
        JsonNode n = notice(DESIGNER, BID);
        assertEquals("fact_only", n.path("mode").asText());
        assertFalse(n.path("can_ack").asBoolean());
        assertEquals("NONE", n.path("tidy_action").asText());
        int before = denied(DESIGNER, ackPath(BID));
        assertEquals(403, ack(DESIGNER, BID, ackBody(1, 2)).getResponse().getStatus());
        assertEquals(before + 1, denied(DESIGNER, ackPath(BID)));
        assertEquals(0, ackRows());
        assertEquals(1, act(BID, DESIGNER, "DENIED"));
    }

    @Test
    public void 승인_대기_상태는_먼저_회수_코드를_권한자에게만() throws Exception {
        prep(BID, "OPEN_PENDING", SALES);
        prep(BID2, "APPROVAL_PENDING", SALES);
        assign(BID2, SALES);
        noBidRound();
        assertEquals("OPEN_PENDING", notice(LEAD, BID).path("tidy_action").asText());
        assertEquals("NONE", notice(HEAD, BID).path("tidy_action").asText());
        assertEquals("PLAN_PENDING", notice(LEAD, BID2).path("tidy_action").asText());
        JsonNode member = notice(SALES, BID2);
        assertEquals("popup", member.path("mode").asText());   // 담당자
        assertEquals("NONE", member.path("tidy_action").asText());
    }

    // ── 대상 아님 ─────────────────────────────────────────────────────

    private static void assertNone(JsonNode n) {
        assertFalse(n.path("applicable").asBoolean());
        assertEquals("none", n.path("mode").asText());
        assertEquals(INST, n.path("institution_id").asText());
        assertTrue(n.path("round_seq").isNull());
        assertTrue(n.path("handled_at").isNull());
        assertTrue(n.path("handler_name").isNull());
        assertFalse(n.path("can_ack").asBoolean());
        assertEquals("NONE", n.path("tidy_action").asText());
    }

    @Test
    public void 회차가_없으면_대상_아님() throws Exception {
        prep(BID, "IN_PROGRESS", SALES);
        assign(BID, SALES);   // 11-27: 팀장 열람은 자기 팀 건만 — 담당자가 LEAD 팀이어야 상세가 열린다
        assertNone(notice(LEAD, BID));
    }

    @Test
    public void 열린_회차가_뒤에_있으면_대상_아님() throws Exception {
        prep(BID, "IN_PROGRESS", SALES);
        assign(BID, SALES);   // 11-27: 팀장 열람은 자기 팀 건만
        noBidRound();
        round(2, null, null);
        log(2, 1, "DELAYED", "2026-11-19T11:00:00+09:00");
        assertNone(notice(LEAD, BID));
    }

    @Test
    public void 취소된_건이면_대상_아님() throws Exception {
        prep(BID, "CANCELLED", SALES);
        assign(BID, SALES);   // 11-27: 중단 건은 옛 담당의 팀장만 본다(담당 행은 남아 있다)
        noBidRound();
        assertNone(notice(LEAD, BID));
    }

    /** N6(사용자 11-27): 다른 팀 팀장은 같은 확정됨 건을 봐도 받는 사람이 아니다 — 사실 줄만, 확인·정리 없음. 개설 뒤 건은 그 팀 밖이라 404. */
    @Test
    public void 다른_팀_팀장은_사실줄만이고_ack_정리_판정이_없다() throws Exception {
        prep(BID, "CONFIRMED", SALES);
        prep(BID2, "WRITING", SALES);
        assign(BID2, SALES);
        noBidRound();
        JsonNode n = notice(LEAD2, BID);
        assertTrue(n.path("applicable").asBoolean());
        assertEquals("fact_only", n.path("mode").asText());
        assertFalse(n.path("can_ack").asBoolean());
        assertEquals("NONE", n.path("tidy_action").asText());
        assertEquals(403, ack(LEAD2, BID, ackBody(1, 2)).getResponse().getStatus());
        assertEquals(0, ackRows());
        assertEquals(404, detail(LEAD2, BID2).getResponse().getStatus());   // 개설 뒤 다른 팀 건은 상세부터 없다
        assertEquals(404, ack(LEAD2, BID2, ackBody(1, 2)).getResponse().getStatus());
        assertEquals("같은 팀 팀장은 받는다", "UNCONFIRM", notice(LEAD, BID).path("tidy_action").asText());
    }

    // ── map 권한 ──────────────────────────────────────────────────────

    @Test
    public void map_조회_권한이_없으면_기록자와_시각을_비우고_기록은_서버_값으로_남는다() throws Exception {
        userPerm(SALES, "map", 0, 0);
        prep(BID, "IN_PROGRESS", SALES);
        assign(BID, SALES);
        noBidRound();
        JsonNode n = notice(SALES, BID);
        assertEquals("popup", n.path("mode").asText());
        assertEquals(1, n.path("round_seq").asInt());
        assertEquals(2, n.path("rev_no").asInt());
        assertTrue(n.path("handled_at").isNull());
        assertTrue(n.path("handler_name").isNull());
        assertTrue(n.path("emp_verified").isNull());
        assertFalse(n.path("can_view_notice").asBoolean());
        assertEquals(201, ack(SALES, BID, ackBody(1, 2)).getResponse().getStatus());
        assertEquals(HANDLED, jdbc.queryForObject("SELECT NOTICE_HANDLED_AT FROM PREP_NOBID_ACK WHERE EMP_NO=?", String.class, SALES));
    }

    // ── 7~10 기록·다시 안 뜸 ─────────────────────────────────────────

    @Test
    public void 계속_작성은_한_줄만_남기고_업무_상태는_그대로다() throws Exception {
        prep(BID, "IN_PROGRESS", SALES);
        assign(BID, SALES);
        noBidRound();
        int logs = count("SELECT COUNT(*) FROM NOTICE_ROUND_LOG WHERE INSTITUTION_ID=?", INST);
        MvcResult r = ack(SALES, BID, ackBody(1, 2));
        assertEquals(201, r.getResponse().getStatus());
        JsonNode j = json(r);
        assertTrue(j.path("saved").asBoolean());
        assertEquals(INST, j.path("institution_id").asText());
        assertNotNull(j.path("acked_at").textValue());
        assertFalse(j.has("handled_at"));
        assertFalse(j.has("handler_name"));
        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM PREP_NOBID_ACK WHERE EMP_NO=? AND INSTITUTION_ID=?", SALES, INST);
        assertEquals(1, ((Number) row.get("ROUND_SEQ")).intValue());
        assertEquals(HANDLED, row.get("NOTICE_HANDLED_AT"));
        assertEquals(2, ((Number) row.get("NOTICE_REV_NO")).intValue());
        assertEquals(BID, row.get("BID_CASE_ID"));
        assertEquals("IN_PROGRESS", row.get("PREP_STATE_CD"));
        assertEquals("prep_detail", row.get("SCREEN_ID"));
        assertEquals("nobid_continue", row.get("BUTTON_ID"));
        assertEquals(1, ((Number) row.get("UI_VALID")).intValue());
        assertEquals(0, ((Number) row.get("EMP_VERIFIED")).intValue());
        assertEquals("IN_PROGRESS", jdbc.queryForObject("SELECT STATE_CD FROM BID_PREP WHERE BID_CASE_ID=?", String.class, BID));
        assertEquals("2026-11-18T09:00:00+09:00", jdbc.queryForObject("SELECT UPDATED_AT FROM BID_PREP WHERE BID_CASE_ID=?", String.class, BID));
        assertEquals(logs, count("SELECT COUNT(*) FROM NOTICE_ROUND_LOG WHERE INSTITUTION_ID=?", INST));
        assertEquals(1, act(BID, SALES, "OK"));
        assertEquals("nobid-notice ack inst=" + INST, lastDetail("POST", ackPath(BID)));
    }

    @Test
    public void 두_번째는_200_saved_false_본인은_다시_안_뜨고_다른_사람은_뜬다() throws Exception {
        prep(BID, "IN_PROGRESS", SALES);
        assign(BID, SALES);
        noBidRound();
        assertEquals(201, ack(SALES, BID, ackBody(1, 2)).getResponse().getStatus());
        MvcResult again = ack(SALES, BID, ackBody(1, 2));
        assertEquals(200, again.getResponse().getStatus());
        assertFalse(json(again).path("saved").asBoolean());
        assertNotNull(json(again).path("acked_at").textValue());
        assertEquals(1, ackRows());
        JsonNode mine = notice(SALES, BID);
        assertTrue(mine.path("acked").asBoolean());
        assertEquals("fact_only", mine.path("mode").asText());
        assertTrue(mine.path("applicable").asBoolean());   // 사실 줄은 남는다
        JsonNode lead = notice(LEAD, BID);
        assertFalse(lead.path("acked").asBoolean());
        assertEquals("popup", lead.path("mode").asText());
    }

    // ── 11 기관 자료 넘어감 · 최신 확인 ───────────────────────────────

    @Test
    public void 기관_자료가_넘어가면_대상_아님이고_옛_값_POST는_409_NOT_APPLICABLE() throws Exception {
        prep(BID, "IN_PROGRESS", SALES);
        assign(BID, SALES);
        noBidRound();
        assertEquals("popup", notice(SALES, BID).path("mode").asText());
        jdbc.update("UPDATE INSTITUTIONS SET LAST_BID = ? WHERE INSTITUTION_ID = ?", "2026-12-01", INST);
        assertNone(notice(SALES, BID));
        MvcResult r = ack(SALES, BID, ackBody(1, 2));
        assertEquals(409, r.getResponse().getStatus());
        assertEquals("NOT_APPLICABLE", code(r));
        assertEquals(0, ackRows());
        assertEquals(1, act(BID, SALES, "BLOCKED"));
        assertEquals("nobid-notice ack 409 NOT_APPLICABLE", lastDetail("POST", ackPath(BID)));
    }

    @Test
    public void 회차나_판정_번호가_다르면_409_NOTICE_CHANGED() throws Exception {
        prep(BID, "IN_PROGRESS", SALES);
        assign(BID, SALES);
        noBidRound();
        MvcResult oldRev = ack(SALES, BID, ackBody(1, 1));
        assertEquals(409, oldRev.getResponse().getStatus());
        assertEquals("NOTICE_CHANGED", code(oldRev));
        MvcResult otherRound = ack(SALES, BID, ackBody(2, 2));
        assertEquals(409, otherRound.getResponse().getStatus());
        assertEquals("NOTICE_CHANGED", code(otherRound));
        assertEquals(0, ackRows());
    }

    // ── 검증 순서 ─────────────────────────────────────────────────────

    @Test
    public void 본문_검사는_역할_403_뒤이고_400_메시지에_내부_정보가_없다() throws Exception {
        prep(BID, "IN_PROGRESS", SALES);
        assign(BID, SALES);
        noBidRound();
        assertEquals(403, ack(IT, BID, null).getResponse().getStatus());   // 본문이 없어도 역할이 먼저
        for (String bad : new String[]{null, "{}", "{\"round_seq\":1}", "{\"round_seq\":0,\"rev_no\":2}",
                "{\"round_seq\":1,\"rev_no\":1000000}"}) {
            MvcResult r = ack(SALES, BID, bad);
            assertEquals(String.valueOf(bad), 400, r.getResponse().getStatus());
            assertEquals("BAD_VALUE", code(r));
            String msg = json(r).path("detail").path("message").asText();
            assertFalse(msg.contains("PREP_NOBID_ACK"));
            assertFalse(msg.contains("Exception"));
        }
        assertEquals("nobid-notice ack 400 BAD_VALUE", lastDetail("POST", ackPath(BID)));
        assertEquals(0, ackRows());
    }

    @Test
    public void 없는_건과_못_보는_건은_404이고_역할_403이_먼저다() throws Exception {
        prep(BID, "IN_PROGRESS", SALES);
        noBidRound();
        assertEquals(404, ack(SALES, "nb-none", ackBody(1, 2)).getResponse().getStatus());
        assertEquals(403, ack(IT, "nb-none", ackBody(1, 2)).getResponse().getStatus());
        assertEquals(404, detail(SALES2, BID).getResponse().getStatus());   // 담당 아님·개설 뒤 → 상세와 같은 404
        assertEquals(404, ack(SALES2, BID, ackBody(1, 2)).getResponse().getStatus());
        assertEquals(401, ack(null, BID, ackBody(1, 2)).getResponse().getStatus());
    }

    @Test
    public void 볼_수는_있지만_받는_사람이_아니면_403() throws Exception {
        prep(BID, "CONFIRMED", SALES);
        noBidRound();
        int before = denied(SALES2, ackPath(BID));
        assertEquals(403, ack(SALES2, BID, ackBody(1, 2)).getResponse().getStatus());
        assertEquals(before + 1, denied(SALES2, ackPath(BID)));
        assertEquals(0, ackRows());
    }

    @Test
    public void 허용_밖_머리글은_UNKNOWN과_UI_VALID_0으로_남긴다() throws Exception {
        prep(BID, "IN_PROGRESS", SALES);
        assign(BID, SALES);
        noBidRound();
        assertEquals(201, ack(SALES, BID, ackBody(1, 2), "evil\nscreen", "drop_table").getResponse().getStatus());
        Map<String, Object> row = jdbc.queryForMap("SELECT SCREEN_ID, BUTTON_ID, UI_VALID FROM PREP_NOBID_ACK WHERE EMP_NO=?", SALES);
        assertEquals("UNKNOWN", row.get("SCREEN_ID"));
        assertEquals("UNKNOWN", row.get("BUTTON_ID"));
        assertEquals(0, ((Number) row.get("UI_VALID")).intValue());
    }

    @Test
    public void 상세_접근_이력에는_nobid_표시만_붙고_이름과_시각은_없다() throws Exception {
        prep(BID, "IN_PROGRESS", SALES);
        assign(BID, SALES);
        noBidRound();
        body(SALES, BID);
        String d = lastDetail("GET", "/bidcases/" + BID + "/prep");
        assertTrue(d, d.endsWith(" nobid=Y"));
        assertFalse(d.contains(HANDLER));
        assertFalse(d.contains(HANDLED));
    }
}
