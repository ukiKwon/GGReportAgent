package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.support.Times;
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
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 공고 상태 기록(037) API — 회차·낙관적 잠금·회차 닫힘·'공고 종료' 확인·권한(수정 권한 AND 영업팀 계열)·감사.
 * 사용자: 영업팀 3918264 김영업 · 영업팀 7742059 장하윤 · 영업팀장 5047192 · 영업부장 2674805 · 전산팀 4482971(열람만) · 디자이너 7130526 · 관리자 8203417.
 * 기관 jongno 의 LAST_BID 를 2022-10-18 로 두고 시작한다. 롤백한다(접근 이력 ACCESS_LOG 는 별도 트랜잭션이라 남으므로 증분·최신 행으로 본다).
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class NoticeRoundApiTest {

    private static final String SALES = "3918264";
    private static final String SALES2 = "7742059";
    private static final String LEAD = "5047192";
    private static final String HEAD = "2674805";
    private static final String IT = "4482971";
    private static final String DESIGNER = "7130526";
    private static final String INST = "jongno";
    private static final String PATH = "/institutions/jongno/notice-rounds/judgments";
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcTemplate jdbc;

    @Before
    public void anchor() {
        setLastBid("2022-10-18");
    }

    // ── 도구 ─────────────────────────────────────────────────────────────

    private void setLastBid(String v) {
        jdbc.update("UPDATE INSTITUTIONS SET LAST_BID = ? WHERE INSTITUTION_ID = ?", v, INST);
    }

    private static String tomorrow() {
        return LocalDate.parse(Times.todayKst()).plusDays(1).toString();
    }

    private static String body(Integer seq, int base, String status, String opinion, String next) throws Exception {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("round_seq", seq);
        m.put("base_rev_no", base);
        m.put("status_cd", status);
        m.put("opinion", opinion);
        m.put("next_check_date", next);
        return JSON.writeValueAsString(m);
    }

    private MvcResult save(String emp, String button, String inst, String content) throws Exception {
        MockHttpServletRequestBuilder b = post("/institutions/" + inst + "/notice-rounds/judgments")
                .contentType(MediaType.APPLICATION_JSON).content(content);
        if (emp != null) {
            b = b.header(Actor.HEADER, emp);
        }
        b = b.header("X-Screen-Id", "bid_notice");
        if (button != null) {
            b = b.header("X-Button-Id", button);
        }
        return mockMvc.perform(b).andReturn();
    }

    private MvcResult saveOk(String emp, String content) throws Exception {
        MvcResult r = save(emp, "save", INST, content);
        assertEquals(201, r.getResponse().getStatus());
        return r;
    }

    private MvcResult getAs(String emp, String url) throws Exception {
        MockHttpServletRequestBuilder b = get(url);
        if (emp != null) {
            b = b.header(Actor.HEADER, emp);
        }
        return mockMvc.perform(b).andReturn();
    }

    private static JsonNode json(MvcResult r) throws Exception {
        return JSON.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private static String text(MvcResult r) throws Exception {
        return r.getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    private JsonNode current(String emp) throws Exception {
        MvcResult r = getAs(emp, "/notice-rounds/current");
        assertEquals(200, r.getResponse().getStatus());
        return json(r);
    }

    private static boolean hasInst(JsonNode current, String inst) {
        for (JsonNode n : current.path("items")) {
            if (inst.equals(n.path("institution_id").asText())) {
                return true;
            }
        }
        return false;
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private int logRows() {
        return count("SELECT COUNT(*) FROM NOTICE_ROUND_LOG WHERE INSTITUTION_ID = ?", INST);
    }

    private int roundRows() {
        return count("SELECT COUNT(*) FROM NOTICE_ROUND WHERE INSTITUTION_ID = ?", INST);
    }

    private int denied(String emp, String path) {
        return count("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE='DENIED' AND EMP_NO=? AND REQ_PATH=? AND STATUS_CODE=403", emp, path);
    }

    private String lastDetail() {
        List<String> rows = jdbc.queryForList("SELECT DETAIL FROM ACCESS_LOG WHERE EVENT_TYPE='API' AND HTTP_METHOD='POST'"
                + " AND REQ_PATH=? ORDER BY LOG_ID DESC", String.class, PATH);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private void userPerm(String emp, String menu, int view, int edit) {
        jdbc.update("INSERT INTO USER_MENU_PERMS (EMP_NO, MENU_KEY, CAN_VIEW, CAN_WRITE, CAN_EDIT, CAN_APPROVE, UPDATED_AT)"
                + " VALUES (?,?,?,0,?,0,'2026-11-16T00:00:00+00:00')", emp, menu, view, edit);
    }

    private void activePrep(String state) {
        jdbc.update("INSERT INTO BID_PREP (BID_CASE_ID, INSTITUTION_ID, STATE_CD, CONFIRMED_BY, CONFIRMED_AT, UPDATED_BY, UPDATED_AT)"
                + " VALUES ('nr-test-case', ?, ?, '3918264', '2026-11-16T00:00:00+09:00', '3918264', '2026-11-16T00:00:00+09:00')", INST, state);
    }

    /** 영업팀이 DELAYED 로 첫 저장(회차 1·REV 1). */
    private void firstSave() throws Exception {
        saveOk(SALES, body(null, 0, "DELAYED", "게시판 공고 없음", tomorrow()));
    }

    private static int instItems(JsonNode current, String inst) {
        int n = 0;
        for (JsonNode it : current.path("items")) {
            if (inst.equals(it.path("institution_id").asText())) {
                n++;
            }
        }
        return n;
    }

    private static JsonNode instItem(JsonNode current, String inst) {
        for (JsonNode it : current.path("items")) {
            if (inst.equals(it.path("institution_id").asText())) {
                return it;
            }
        }
        return null;
    }

    private static String noBid() throws Exception {
        return body(null, 0, "NO_BID", "기관이 약정 1년 연장 통보", null);
    }

    // ── 열람·권한 ────────────────────────────────────────────────────────

    @Test
    public void 사번이_없으면_current_401() throws Exception {
        assertEquals(401, getAs(null, "/notice-rounds/current").getResponse().getStatus());
        assertEquals(403, getAs("9999999", "/notice-rounds/current").getResponse().getStatus());
    }

    @Test
    public void 전산팀은_열람만_can_edit_false_빈_목록() throws Exception {
        JsonNode c = current(IT);
        assertFalse(c.path("can_edit").asBoolean());
        assertEquals(0, c.path("items").size());
        assertEquals(Times.todayKst(), c.path("today").asText());
    }

    @Test
    public void can_edit_는_수정_권한과_영업팀_계열_둘_다일_때만_true() throws Exception {
        assertTrue(current(SALES).path("can_edit").asBoolean());
        assertTrue(current(LEAD).path("can_edit").asBoolean());
        assertTrue(current(HEAD).path("can_edit").asBoolean());
        assertFalse(current(DESIGNER).path("can_edit").asBoolean());
        userPerm(IT, "map", 1, 1);   // 기관 수정 권한만 줘도
        assertFalse(current(IT).path("can_edit").asBoolean());
    }

    @Test
    public void 전산팀_저장은_403_표는_비고_접근_이력에_DENIED_한_건() throws Exception {
        int before = denied(IT, PATH);
        MvcResult r = save(IT, "save", INST, body(null, 0, "IN_PROGRESS", null, null));
        assertEquals(403, r.getResponse().getStatus());
        assertEquals(0, logRows());
        assertEquals(0, roundRows());
        assertEquals(before + 1, denied(IT, PATH));
    }

    @Test
    public void 디자이너_저장은_403_DENIED_한_건_표는_빈다() throws Exception {
        int before = denied(DESIGNER, PATH);
        MvcResult r = save(DESIGNER, "save", INST, body(null, 0, "IN_PROGRESS", null, null));
        assertEquals(403, r.getResponse().getStatus());
        assertEquals(0, logRows());
        assertEquals(0, roundRows());
        assertEquals(before + 1, denied(DESIGNER, PATH));
    }

    @Test
    public void 전산팀에_기관_수정_예외를_줘도_저장은_403() throws Exception {
        userPerm(IT, "map", 1, 1);
        userPerm(IT, "regions", 1, 1);
        int before = denied(IT, PATH);
        MvcResult r = save(IT, "save", INST, body(null, 0, "IN_PROGRESS", null, null));
        assertEquals(403, r.getResponse().getStatus());
        assertEquals(0, logRows());
        assertEquals(before + 1, denied(IT, PATH));
    }

    @Test
    public void 영업팀도_수정_권한을_모두_끄면_403() throws Exception {
        userPerm(SALES, "map", 1, 0);
        userPerm(SALES, "regions", 1, 0);
        assertEquals(403, save(SALES, "save", INST, body(null, 0, "IN_PROGRESS", null, null)).getResponse().getStatus());
        assertFalse(current(SALES).path("can_edit").asBoolean());
        assertEquals(0, logRows());
    }

    @Test
    public void 사번이_없거나_미등록이면_저장_401_403() throws Exception {
        assertEquals(401, save(null, "save", INST, body(null, 0, "IN_PROGRESS", null, null)).getResponse().getStatus());
        assertEquals(403, save("9999999", "save", INST, body(null, 0, "IN_PROGRESS", null, null)).getResponse().getStatus());
        assertEquals(0, logRows());
    }

    @Test
    public void 영업팀장과_영업부장도_저장할_수_있다() throws Exception {
        MvcResult a = saveOk(LEAD, body(null, 0, "IN_PROGRESS", null, null));
        assertEquals(1, json(a).path("rev_no").asInt());
        MvcResult b = saveOk(HEAD, body(1, 1, "DELAYED", "부장 확인", tomorrow()));
        assertEquals(2, json(b).path("rev_no").asInt());
    }

    // ── 저장 ─────────────────────────────────────────────────────────────

    @Test
    public void 첫_저장은_회차를_열고_처리자는_서버가_채운다() throws Exception {
        MvcResult r = saveOk(SALES, body(null, 0, "DELAYED", "게시판 공고 없음", tomorrow()));
        JsonNode j = json(r);
        assertTrue(j.path("saved").asBoolean());
        assertEquals(1, j.path("round_seq").asInt());
        assertEquals(1, j.path("rev_no").asInt());
        assertTrue(j.path("round_opened").asBoolean());
        assertEquals("김영업", j.path("handler_name").asText());
        assertFalse(j.path("emp_verified").asBoolean());

        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM NOTICE_ROUND_LOG WHERE INSTITUTION_ID = ?", INST);
        assertEquals("3918264", row.get("HANDLER_EMP_NO"));
        assertEquals("김영업", row.get("HANDLER_NAME"));
        assertEquals(0, ((Number) row.get("EMP_VERIFIED")).intValue());
        assertEquals("bid_notice", row.get("SCREEN_ID"));
        assertEquals("save", row.get("BUTTON_ID"));
        assertEquals(1, ((Number) row.get("UI_VALID")).intValue());
        assertNull(row.get("PREV_STATUS_CD"));
        assertEquals("DELAYED", row.get("STATUS_CD"));
        assertEquals(tomorrow(), row.get("NEXT_CHECK_DATE"));
        assertEquals("2022-10-18", row.get("SNAP_LAST_BID"));
        assertEquals("2022-10-18", jdbc.queryForObject("SELECT ANCHOR_LAST_BID FROM NOTICE_ROUND WHERE INSTITUTION_ID = ?", String.class, INST));
        assertEquals("INST_DATA", jdbc.queryForObject("SELECT SOURCE_CD FROM NOTICE_ROUND WHERE INSTITUTION_ID = ?", String.class, INST));
    }

    @Test
    public void 본문의_처리자_칸은_무시한다() throws Exception {
        String content = body(null, 0, "DELAYED", "게시판 공고 없음", tomorrow());
        content = content.substring(0, content.length() - 1) + ",\"handler_emp_no\":\"5047192\",\"handler_name\":\"가짜\"}";
        saveOk(SALES, content);
        assertEquals("3918264", jdbc.queryForObject("SELECT HANDLER_EMP_NO FROM NOTICE_ROUND_LOG WHERE INSTITUTION_ID = ?", String.class, INST));
        assertEquals("김영업", jdbc.queryForObject("SELECT HANDLER_NAME FROM NOTICE_ROUND_LOG WHERE INSTITUTION_ID = ?", String.class, INST));
    }

    @Test
    public void 스냅샷이_이력에_남고_판단에는_쓰지_않는다() throws Exception {
        String content = "{\"round_seq\":null,\"base_rev_no\":0,\"status_cd\":\"IN_PROGRESS\",\"snapshot\":"
                + "{\"due_date\":\"2026-10-31\",\"due_basis\":\"cycle\",\"due_confirmed\":false,\"auto_kind\":\"overdue\",\"auto_days\":16}}";
        saveOk(SALES, content);
        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM NOTICE_ROUND_LOG WHERE INSTITUTION_ID = ?", INST);
        assertEquals("2026-10-31", row.get("SNAP_DUE_DATE"));
        assertEquals("CYCLE", row.get("SNAP_DUE_BASIS"));
        assertEquals("OVERDUE", row.get("SNAP_AUTO_KIND"));
        assertEquals(16, ((Number) row.get("SNAP_AUTO_DAYS")).intValue());
        assertEquals(0, ((Number) row.get("SNAP_DUE_CONFIRMED")).intValue());
    }

    @Test
    public void 같은_첫_저장을_다른_사람이_또_보내면_ROUND_CHANGED_409() throws Exception {
        firstSave();
        MvcResult r = save(SALES2, "save", INST, body(null, 0, "IN_PROGRESS", null, null));
        assertEquals(409, r.getResponse().getStatus());
        JsonNode d = json(r).path("detail");
        assertEquals("ROUND_CHANGED", d.path("code").asText());
        assertEquals("김영업", d.path("latest").path("handler_name").asText());
        assertEquals(1, logRows());
    }

    @Test
    public void 형식_위반은_400_REV가_뒤처지면_STALE_409() throws Exception {
        firstSave();
        MvcResult bad = save(SALES2, "save", INST, body(1, 0, "IN_PROGRESS", null, null));
        assertEquals(400, bad.getResponse().getStatus());
        assertEquals("base_rev_no", json(bad).path("detail").path("field").asText());
        MvcResult stale = save(SALES2, "save", INST, body(1, 2, "IN_PROGRESS", null, null));
        assertEquals(409, stale.getResponse().getStatus());
        assertEquals("STALE", json(stale).path("detail").path("code").asText());
        assertEquals(1, logRows());
    }

    @Test
    public void 이어_저장은_REV를_올리고_이전_값을_남긴다() throws Exception {
        firstSave();
        MvcResult r = saveOk(SALES2, body(1, 1, "IN_PROGRESS", "재공고 확인", null));
        assertEquals(2, json(r).path("rev_no").asInt());
        assertFalse(json(r).path("round_opened").asBoolean());
        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM NOTICE_ROUND_LOG WHERE INSTITUTION_ID = ? AND REV_NO = 2", INST);
        assertEquals("DELAYED", row.get("PREV_STATUS_CD"));
        assertEquals(tomorrow(), row.get("PREV_NEXT_CHECK"));
        assertEquals("7742059", row.get("HANDLER_EMP_NO"));
        assertEquals("장하윤", row.get("HANDLER_NAME"));
    }

    @Test
    public void 값이_그대로면_NO_CHANGE_200_행을_만들지_않는다() throws Exception {
        firstSave();
        saveOk(SALES2, body(1, 1, "IN_PROGRESS", "재공고 확인", null));
        MvcResult r = save(SALES2, "save", INST, body(1, 2, "IN_PROGRESS", "재공고 확인", null));
        assertEquals(200, r.getResponse().getStatus());
        assertFalse(json(r).path("saved").asBoolean());
        assertEquals("NO_CHANGE", json(r).path("code").asText());
        assertEquals(2, logRows());
    }

    @Test
    public void 허용_밖_버튼은_UNKNOWN_UI_VALID_0() throws Exception {
        MvcResult r = save(SALES, "hack", INST, body(null, 0, "IN_PROGRESS", null, null));
        assertEquals(201, r.getResponse().getStatus());
        assertEquals("UNKNOWN", jdbc.queryForObject("SELECT BUTTON_ID FROM NOTICE_ROUND_LOG WHERE INSTITUTION_ID = ?", String.class, INST));
        assertEquals(0, count("SELECT UI_VALID FROM NOTICE_ROUND_LOG WHERE INSTITUTION_ID = ?", INST));
    }

    // ── 진행 중 제안 ─────────────────────────────────────────────────────

    @Test
    public void 진행_중_제안이_있는_공고_종료는_확인을_요구하고_확인하면_저장된다() throws Exception {
        activePrep("IN_PROGRESS");
        String content = body(null, 0, "CLOSED", "게시판에서 종료 확인", null);
        MvcResult r = save(SALES, "save", INST, content);
        assertEquals(409, r.getResponse().getStatus());
        JsonNode d = json(r).path("detail");
        assertEquals("ACTIVE_PREP_CONFIRM_REQUIRED", d.path("code").asText());
        assertEquals("IN_PROGRESS", d.path("prep_state_cd").asText());
        assertEquals(0, logRows());
        assertEquals("notice-round save 409 ACTIVE_PREP_CONFIRM_REQUIRED", lastDetail());

        MvcResult ok = save(SALES, "save_confirmed", INST, content);
        assertEquals(201, ok.getResponse().getStatus());
        assertEquals(1, count("SELECT ACTIVE_PREP FROM NOTICE_ROUND_LOG WHERE INSTITUTION_ID = ?", INST));
        assertEquals("IN_PROGRESS", jdbc.queryForObject("SELECT ACTIVE_PREP_STATE FROM NOTICE_ROUND_LOG WHERE INSTITUTION_ID = ?", String.class, INST));
        assertEquals("save_confirmed", jdbc.queryForObject("SELECT BUTTON_ID FROM NOTICE_ROUND_LOG WHERE INSTITUTION_ID = ?", String.class, INST));
    }

    @Test
    public void 진행_중_제안이_있어도_종료가_아니면_확인_없이_저장된다() throws Exception {
        activePrep("IN_PROGRESS");
        saveOk(SALES, body(null, 0, "DELAYED", "재공고 대기", tomorrow()));
        assertEquals(1, count("SELECT ACTIVE_PREP FROM NOTICE_ROUND_LOG WHERE INSTITUTION_ID = ?", INST));
    }

    // ── 회차 닫힘 ────────────────────────────────────────────────────────

    @Test
    public void 기관_자료가_넘어가면_current에서_빠지고_history는_stale() throws Exception {
        firstSave();
        assertTrue(hasInst(current(SALES), INST));
        setLastBid("2026-10-20");
        assertFalse(hasInst(current(SALES), INST));
        JsonNode h = json(getAs(IT, "/institutions/" + INST + "/notice-rounds"));
        assertTrue(h.path("rounds").get(0).path("stale").asBoolean());
        assertTrue(h.path("rounds").get(0).path("open").asBoolean());
    }

    @Test
    public void 넘어간_뒤_저장은_옛_회차를_닫고_새_회차를_연다() throws Exception {
        firstSave();
        setLastBid("2026-10-20");
        MvcResult changed = save(SALES, "save", INST, body(1, 1, "IN_PROGRESS", null, null));
        assertEquals(409, changed.getResponse().getStatus());
        assertEquals("ROUND_CHANGED", json(changed).path("detail").path("code").asText());
        MvcResult ok = saveOk(SALES, body(null, 0, "IN_PROGRESS", null, null));
        assertEquals(2, json(ok).path("round_seq").asInt());
        assertTrue(json(ok).path("round_opened").asBoolean());
        Map<String, Object> r1 = jdbc.queryForMap("SELECT * FROM NOTICE_ROUND WHERE INSTITUTION_ID = ? AND ROUND_SEQ = 1", INST);
        assertTrue(r1.get("CLOSED_AT") != null);
        assertEquals("SOURCE_ADVANCED", r1.get("CLOSE_REASON_CD"));
        assertEquals("2026-10-20", r1.get("CLOSED_LAST_BID"));
        assertEquals("3918264", r1.get("CLOSED_BY"));
        assertEquals("2026-10-20", jdbc.queryForObject("SELECT ANCHOR_LAST_BID FROM NOTICE_ROUND WHERE INSTITUTION_ID = ? AND ROUND_SEQ = 2", String.class, INST));
        assertEquals(1, count("SELECT COUNT(*) FROM NOTICE_ROUND WHERE INSTITUTION_ID = ? AND CLOSED_AT IS NULL", INST));
    }

    @Test
    public void 기관_자료가_앞으로_당겨지거나_비면_닫지_않는다() throws Exception {
        firstSave();
        setLastBid("2020-01-01");
        assertTrue(hasInst(current(SALES), INST));
        saveOk(SALES2, body(1, 1, "IN_PROGRESS", "확인", null));
        setLastBid(null);
        assertTrue(hasInst(current(SALES), INST));
        MvcResult r = saveOk(SALES, body(1, 2, "DELAYED", "다시 대기", tomorrow()));
        assertEquals(1, json(r).path("round_seq").asInt());
        assertEquals(3, json(r).path("rev_no").asInt());
        assertEquals(1, roundRows());
        assertEquals(1, count("SELECT COUNT(*) FROM NOTICE_ROUND WHERE INSTITUTION_ID = ? AND CLOSED_AT IS NULL", INST));
    }

    @Test
    public void 기준이_비었다가_자료가_채워지면_닫지_않고_기준만_채운다() throws Exception {
        setLastBid(null);
        firstSave();
        assertNull(jdbc.queryForObject("SELECT ANCHOR_LAST_BID FROM NOTICE_ROUND WHERE INSTITUTION_ID = ?", String.class, INST));
        setLastBid("2026-10-20");
        MvcResult r = saveOk(SALES, body(1, 1, "IN_PROGRESS", "자료 채워짐", null));
        assertEquals(1, json(r).path("round_seq").asInt());
        assertFalse(json(r).path("round_opened").asBoolean());
        assertEquals("2026-10-20", jdbc.queryForObject("SELECT ANCHOR_LAST_BID FROM NOTICE_ROUND WHERE INSTITUTION_ID = ?", String.class, INST));
        assertEquals(1, roundRows());
    }

    // ── 입찰 없음(040) ───────────────────────────────────────────────────

    @Test
    public void 입찰_없음_저장은_201이고_회차를_바로_닫는다() throws Exception {
        MvcResult r = saveOk(SALES, noBid());
        assertEquals(1, json(r).path("round_seq").asInt());
        assertTrue(json(r).path("round_opened").asBoolean());
        assertTrue(json(r).path("round_closed").asBoolean());
        assertEquals("NO_BID", json(r).path("status_cd").asText());
        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM NOTICE_ROUND WHERE INSTITUTION_ID = ? AND ROUND_SEQ = 1", INST);
        assertEquals("NO_BID", row.get("CLOSE_REASON_CD"));
        assertEquals("3918264", row.get("CLOSED_BY"));
        assertEquals("2022-10-18", row.get("CLOSED_LAST_BID"));
        assertTrue(row.get("CLOSED_AT") != null);
        assertEquals(0, count("SELECT COUNT(*) FROM NOTICE_ROUND WHERE INSTITUTION_ID = ? AND CLOSED_AT IS NULL", INST));
        assertEquals(1, logRows());
    }

    @Test
    public void 일반_저장은_round_closed가_false다() throws Exception {
        MvcResult r = saveOk(SALES, body(null, 0, "DELAYED", "게시판 공고 없음", tomorrow()));
        assertFalse(json(r).path("round_closed").asBoolean());
    }

    @Test
    public void 입찰_없음은_의견이_없으면_400_아무것도_쓰지_않는다() throws Exception {
        MvcResult r = save(SALES, "save", INST, body(null, 0, "NO_BID", null, null));
        assertEquals(400, r.getResponse().getStatus());
        assertEquals(0, logRows());
        assertEquals(0, roundRows());
    }

    @Test
    public void 입찰_없음도_진행_중_제안이_있으면_확인을_요구한다() throws Exception {
        activePrep("IN_PROGRESS");
        MvcResult r = save(SALES, "save", INST, noBid());
        assertEquals(409, r.getResponse().getStatus());
        assertEquals("ACTIVE_PREP_CONFIRM_REQUIRED", json(r).path("detail").path("code").asText());
        assertEquals(0, roundRows());
        assertEquals(0, logRows());
        MvcResult ok = save(SALES, "save_confirmed", INST, noBid());
        assertEquals(201, ok.getResponse().getStatus());
        assertEquals(1, count("SELECT ACTIVE_PREP FROM NOTICE_ROUND_LOG WHERE INSTITUTION_ID = ?", INST));
        assertEquals(0, count("SELECT COUNT(*) FROM NOTICE_ROUND WHERE INSTITUTION_ID = ? AND CLOSED_AT IS NULL", INST));
    }

    @Test
    public void 입찰_없음_뒤_저장은_새_회차이고_옛_회차_번호는_409() throws Exception {
        saveOk(SALES, noBid());
        MvcResult old = save(SALES, "save", INST, body(1, 1, "IN_PROGRESS", null, null));
        assertEquals(409, old.getResponse().getStatus());
        assertEquals("ROUND_CHANGED", json(old).path("detail").path("code").asText());
        MvcResult ok = saveOk(SALES, body(null, 0, "IN_PROGRESS", null, null));
        assertEquals(2, json(ok).path("round_seq").asInt());
        assertTrue(json(ok).path("round_opened").asBoolean());
        assertFalse(json(ok).path("round_closed").asBoolean());
    }

    @Test
    public void 입찰_없음_뒤_current는_그_기관을_round_closed_true로_내보낸다() throws Exception {
        saveOk(SALES, noBid());
        JsonNode cur = current(SALES);
        assertEquals(1, instItems(cur, INST));
        JsonNode it = instItem(cur, INST);
        assertEquals("NO_BID", it.path("status_cd").asText());
        assertTrue(it.path("round_closed").asBoolean());
        assertEquals("NO_BID", it.path("close_reason_cd").asText());
        assertEquals(1, it.path("round_seq").asInt());
        assertEquals(1, it.path("rev_no").asInt());
        assertEquals("김영업", it.path("handler_name").asText());
        assertTrue(it.path("next_check_date").isNull());
    }

    @Test
    public void 열린_회차_항목은_round_closed_false_close_reason_null이다() throws Exception {
        firstSave();
        JsonNode it = instItem(current(SALES), INST);
        assertFalse(it.path("round_closed").asBoolean());
        assertTrue(it.path("close_reason_cd").isNull());
    }

    @Test
    public void 입찰_없음_뒤_기관_자료가_넘어가면_current에서_빠진다() throws Exception {
        saveOk(SALES, noBid());
        setLastBid("2022-10-18");      // 같음 — 안 넘어감
        assertTrue(hasInst(current(SALES), INST));
        setLastBid("2020-01-01");      // 앞당김 — 안 넘어감
        assertTrue(hasInst(current(SALES), INST));
        setLastBid("2026-10-20");      // 넘어감
        assertFalse(hasInst(current(SALES), INST));
    }

    @Test
    public void 입찰_없음_뒤_새_회차를_열면_current는_새_회차_한_건만_낸다() throws Exception {
        saveOk(SALES, noBid());
        saveOk(SALES, body(null, 0, "IN_PROGRESS", null, null));
        JsonNode cur = current(SALES);
        assertEquals(1, instItems(cur, INST));
        JsonNode it = instItem(cur, INST);
        assertEquals(2, it.path("round_seq").asInt());
        assertEquals("IN_PROGRESS", it.path("status_cd").asText());
        assertFalse(it.path("round_closed").asBoolean());
    }

    @Test
    public void 자료가_넘어가서_닫힌_회차는_current에_나오지_않는다() throws Exception {
        firstSave();
        jdbc.update("UPDATE NOTICE_ROUND SET CLOSED_AT = '2026-11-16T00:00:00+09:00', CLOSE_REASON_CD = 'SOURCE_ADVANCED',"
                + " CLOSED_BY = '3918264', CLOSED_LAST_BID = '2022-10-18' WHERE INSTITUTION_ID = ? AND ROUND_SEQ = 1", INST);
        assertFalse(hasInst(current(SALES), INST));
    }

    @Test
    public void 기준이_둘_다_비면_입찰_없음은_새_회차가_열릴_때까지_처리됨으로_남는다() throws Exception {
        setLastBid(null);
        saveOk(SALES, noBid());
        assertNull(jdbc.queryForObject("SELECT CLOSED_LAST_BID FROM NOTICE_ROUND WHERE INSTITUTION_ID = ? AND ROUND_SEQ = 1", String.class, INST));
        setLastBid("2026-10-20");
        assertTrue(hasInst(current(SALES), INST));   // 비교할 기준이 없어 넘어감을 알 수 없다(알려진 한계)
    }

    @Test
    public void 입찰_없음_회차의_history는_닫힘_NO_BID() throws Exception {
        saveOk(SALES, noBid());
        JsonNode h = json(getAs(IT, "/institutions/" + INST + "/notice-rounds"));
        JsonNode r0 = h.path("rounds").get(0);
        assertFalse(r0.path("open").asBoolean());
        assertFalse(r0.path("stale").asBoolean());
        assertEquals("NO_BID", r0.path("close_reason_cd").asText());
        assertEquals("NO_BID", r0.path("logs").get(0).path("status_cd").asText());
    }

    @Test
    public void 입찰_없음도_열람만_하는_사용자나_디자이너는_저장_403() throws Exception {
        assertEquals(403, save(IT, "save", INST, noBid()).getResponse().getStatus());
        assertEquals(403, save(DESIGNER, "save", INST, noBid()).getResponse().getStatus());
        assertEquals(0, roundRows());
    }

    // ── 이력 조회 ────────────────────────────────────────────────────────

    @Test
    public void 이력은_최신이_먼저이고_사번_화면_버튼은_내보내지_않는다() throws Exception {
        firstSave();
        saveOk(SALES2, body(1, 1, "IN_PROGRESS", "재공고 확인", null));
        MvcResult r = getAs(IT, "/institutions/" + INST + "/notice-rounds");
        assertEquals(200, r.getResponse().getStatus());
        String t = text(r);
        assertFalse(t.contains("handler_emp_no"));
        assertFalse(t.contains("screen_id"));
        assertFalse(t.contains("button_id"));
        assertFalse(t.contains("3918264"));
        assertFalse(t.contains("7742059"));
        JsonNode logs = json(r).path("rounds").get(0).path("logs");
        assertEquals(2, logs.size());
        assertEquals(2, logs.get(0).path("rev_no").asInt());
        assertEquals("장하윤", logs.get(0).path("handler_name").asText());
        assertEquals("DELAYED", logs.get(0).path("prev_status_cd").asText());
        assertFalse(json(r).path("truncated").asBoolean());
    }

    private void seedLogs(int n) {
        jdbc.update("INSERT INTO NOTICE_ROUND (INSTITUTION_ID, ROUND_SEQ, SOURCE_CD, ANCHOR_LAST_BID, OPENED_AT, OPENED_BY)"
                + " VALUES (?, 1, 'INST_DATA', '2022-10-18', '2026-11-16T00:00:00+09:00', '3918264')", INST);
        for (int i = 1; i <= n; i++) {
            jdbc.update("INSERT INTO NOTICE_ROUND_LOG (INSTITUTION_ID, ROUND_SEQ, REV_NO, STATUS_CD, HANDLER_EMP_NO, HANDLER_NAME,"
                    + " SCREEN_ID, BUTTON_ID, HANDLED_AT) VALUES (?, 1, ?, 'IN_PROGRESS', '3918264', '김영업', 'bid_notice', 'save',"
                    + " '2026-11-16T00:00:00+09:00')", INST, i);
        }
    }

    @Test
    public void 이력이_200건을_넘으면_truncated_true_200건만_돌려준다() throws Exception {
        seedLogs(201);
        JsonNode h = json(getAs(IT, "/institutions/" + INST + "/notice-rounds"));
        assertTrue(h.path("truncated").asBoolean());
        JsonNode logs = h.path("rounds").get(0).path("logs");
        assertEquals(200, logs.size());
        assertEquals(201, logs.get(0).path("rev_no").asInt());
        assertEquals(2, logs.get(199).path("rev_no").asInt());
    }

    @Test
    public void 이력이_정확히_200건이면_truncated_false() throws Exception {
        seedLogs(200);
        JsonNode h = json(getAs(IT, "/institutions/" + INST + "/notice-rounds"));
        assertFalse(h.path("truncated").asBoolean());
        assertEquals(200, h.path("rounds").get(0).path("logs").size());
    }

    @Test
    public void 관리자도_영업팀_계열이_아니면_저장_403_DENIED_한_건() throws Exception {
        String admin = "8203417";
        int before = denied(admin, PATH);
        MvcResult r = save(admin, "save", INST, body(null, 0, "IN_PROGRESS", null, null));
        assertEquals(403, r.getResponse().getStatus());
        assertEquals(0, logRows());
        assertEquals(0, roundRows());
        assertEquals(before + 1, denied(admin, PATH));
    }

    @Test
    public void ROUND_CHANGED_문구는_두_원인을_포괄한다() throws Exception {
        firstSave();
        MvcResult r = save(SALES2, "save", INST, body(null, 0, "IN_PROGRESS", null, null));
        assertEquals("회차가 바뀌었거나 다른 사람이 먼저 기록했습니다. 목록을 새로 불러온 뒤 다시 저장하세요.",
                json(r).path("detail").path("message").asText());
    }

    @Test
    public void 이력_조회는_사번이_없으면_401() throws Exception {
        assertEquals(401, getAs(null, "/institutions/" + INST + "/notice-rounds").getResponse().getStatus());
    }

    @Test
    public void 없는_기관이거나_id가_너무_길면_404() throws Exception {
        assertEquals(404, save(SALES, "save", "no-such", body(null, 0, "IN_PROGRESS", null, null)).getResponse().getStatus());
        assertEquals(404, getAs(SALES, "/institutions/no-such/notice-rounds").getResponse().getStatus());
        String longId = new String(new char[65]).replace('\0', 'a');
        assertEquals(404, save(SALES, "save", longId, body(null, 0, "IN_PROGRESS", null, null)).getResponse().getStatus());
        assertEquals(404, getAs(SALES, "/institutions/" + longId + "/notice-rounds").getResponse().getStatus());
    }

    // ── 입력 ─────────────────────────────────────────────────────────────

    @Test
    public void 본문이_없거나_형식이_틀리면_400() throws Exception {
        assertEquals(400, save(SALES, "save", INST, "").getResponse().getStatus());
        assertEquals(400, save(SALES, "save", INST, "{\"round_seq\":\"abc\",\"base_rev_no\":0,\"status_cd\":\"IN_PROGRESS\"}").getResponse().getStatus());
        assertEquals(0, logRows());
    }

    @Test
    public void 방향_바꿈_줄_구분자_짝_없는_서로게이트가_든_의견은_400() throws Exception {
        // 짝 없는 서로게이트(U+D800)는 HTTP 본문 UTF-8 인코딩에서 '?'로 바뀌어 서버에 닿지 않는다 — NoticeRoundRulesTest 가 직접 확인한다.
        int[] cps = {0x202E, 0x0085, 0x2028};
        for (int cp : cps) {
            String op = "앞" + new String(Character.toChars(cp)) + "뒤";
            MvcResult r = save(SALES, "save", INST, body(null, 0, "DELAYED", op, tomorrow()));
            assertEquals("cp=" + Integer.toHexString(cp), 400, r.getResponse().getStatus());
            assertEquals("opinion", json(r).path("detail").path("field").asText());
        }
        assertEquals(0, logRows());
    }

    @Test
    public void 개인정보가_든_의견은_400_고정_문구_검출값은_응답에_없다() throws Exception {
        MvcResult r = save(SALES, "save", INST, body(null, 0, "DELAYED", "담당자 010-1234-5678 로 확인함", tomorrow()));
        assertEquals(400, r.getResponse().getStatus());
        JsonNode d = json(r).path("detail");
        assertEquals("opinion", d.path("field").asText());
        assertEquals("의견에 주민등록번호·전화번호 같은 개인정보를 적을 수 없습니다.", d.path("message").asText());
        assertFalse(text(r).contains("5678"));
        assertEquals(0, logRows());
    }

    // ── 감사 ─────────────────────────────────────────────────────────────

    @Test
    public void 접근_이력_DETAIL에는_REV와_사유_코드만_있고_의견은_없다() throws Exception {
        firstSave();
        assertEquals("notice-round save rev=1", lastDetail());
        MvcResult stale = save(SALES2, "save", INST, body(1, 5, "IN_PROGRESS", "의견본문", null));
        assertEquals(409, stale.getResponse().getStatus());
        assertEquals("notice-round save 409 STALE", lastDetail());
        MvcResult same = save(SALES2, "save", INST, body(1, 1, "DELAYED", "게시판 공고 없음", tomorrow()));   // 첫 저장과 같은 값
        assertEquals(200, same.getResponse().getStatus());
        assertEquals("notice-round save no-change", lastDetail());
        MvcResult bad = save(SALES2, "save", INST, body(1, 1, "DONE", "의견본문", null));
        assertEquals(400, bad.getResponse().getStatus());
        assertEquals("notice-round save 400 INVALID", lastDetail());
        assertFalse(String.valueOf(lastDetail()).contains("의견본문"));
        MvcResult none = save(SALES, "save", "no-such", body(null, 0, "IN_PROGRESS", null, null));
        assertEquals(404, none.getResponse().getStatus());
    }
}
