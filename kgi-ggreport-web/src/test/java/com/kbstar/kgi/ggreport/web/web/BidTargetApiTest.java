package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.support.Times;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** 올해 목표 기관(043) API. 사람: 영업 3918264 김영업 · 영업팀장 5047192 · 전산 4482971 · 디자이너 7130526. 기관 jongno. */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class BidTargetApiTest {
    private static final String SALES = "3918264", LEAD = "5047192", IT = "4482971", DESIGNER = "7130526";
    private static final String PATH = "/institutions/jongno/bid-targets";
    private static final String ADD = "add_bid_target", EDIT = "edit_bid_target", TAG = "change_target_tag", CANCEL = "cancel_bid_target";
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private com.kbstar.kgi.ggreport.web.config.BidTargetSettings settings;

    /** NEXT 105 — 이 시험은 043·044 단건 쓰기(결재 없이 바로)를 본다. 결재 스위치를 끄고 시험 뒤 되돌린다(결재 규칙은 TargetChangeApiTest). */
    @org.junit.Before public void 결재_스위치_끔() { settings.setApprovalRequired(false); }
    @org.junit.After public void 결재_스위치_복구() { settings.setApprovalRequired(true); }   // 코드 기본값(true)으로

    /** 올해 — 서버가 요청 때 쓰는 Times.todayKst 와 같은 원천을 그때그때 읽는다(연말 경계에서 시험이 흔들리지 않게, QA P3-3). 시험마다 `final int Y = y();` */
    private static int y() { return Integer.parseInt(Times.todayKst().substring(0, 4)); }

    private static Map<String, Object> body(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("target_year", y()); m.put("tag_cd", "NEW");
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private MvcResult send(String emp, String path, String button, Object content) throws Exception {
        MockHttpServletRequestBuilder b = post(path).contentType(MediaType.APPLICATION_JSON).content(JSON.writeValueAsString(content));
        if (emp != null) b = b.header(Actor.HEADER, emp);
        b = b.header("X-Screen-Id", "bid_board");
        if (button != null) b = b.header("X-Button-Id", button);
        return mockMvc.perform(b).andReturn();
    }
    private MvcResult getAs(String emp, String url) throws Exception {
        MockHttpServletRequestBuilder b = get(url); if (emp != null) b = b.header(Actor.HEADER, emp); return mockMvc.perform(b).andReturn();
    }
    private static JsonNode json(MvcResult r) throws Exception { return JSON.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8)); }
    private static int status(MvcResult r) { return r.getResponse().getStatus(); }
    private int rows() { return jdbc.queryForObject("SELECT COUNT(*) FROM INST_BID_TARGET", Integer.class); }
    private String lastDetail() {
        List<String> d = jdbc.queryForList("SELECT DETAIL FROM ACCESS_LOG WHERE EVENT_TYPE='API' AND HTTP_METHOD='POST' ORDER BY LOG_ID DESC", String.class);
        return d.isEmpty() ? null : d.get(0);
    }
    private static Map<String, Object> cancelBody(int base, String reason) {
        Map<String, Object> m = new LinkedHashMap<String, Object>(); m.put("base_rev_no", base); if (reason != null) m.put("cancel_reason_cd", reason); return m;
    }

    @Test public void 넣기는_서버가_수정자를_채우고_가짜_수정자는_무시한다() throws Exception {
        Map<String, Object> b = body("memo", "2금고 노림"); b.put("editor_emp_no", "0000000"); b.put("editor_name", "가짜");
        MvcResult r = send(SALES, PATH, ADD, b);
        assertEquals(201, status(r));
        assertEquals(1, json(r).path("target_no").asInt());
        assertEquals(1, json(r).path("rev_no").asInt());
        assertEquals("김영업", json(r).path("item").path("editor_name").asText());
        assertFalse(json(r).path("item").path("emp_verified").asBoolean());
        assertEquals("3918264", jdbc.queryForObject("SELECT EDITOR_EMP_NO FROM INST_BID_TARGET", String.class));
        assertEquals(1, jdbc.queryForObject("SELECT UI_VALID FROM INST_BID_TARGET", Integer.class).intValue());
        assertEquals("bid-target save no=1 rev=1", lastDetail());
    }

    @Test public void 같은_해_두번째는_409_다른_해는_통과_연도_범위() throws Exception {
        final int Y = y();
        assertEquals(201, status(send(SALES, PATH, ADD, body())));
        MvcResult dup = send(SALES, PATH, ADD, body());
        assertEquals(409, status(dup)); assertEquals("DUP_TARGET", json(dup).path("detail").path("code").asText());
        assertEquals(201, status(send(SALES, PATH, ADD, body("target_year", Y + 1))));
        assertEquals(400, status(send(SALES, PATH, ADD, body("target_year", Y - 1))));
        assertEquals(400, status(send(SALES, PATH, ADD, body("target_year", Y + 3))));
    }

    @Test public void 태그_코드는_코드표만() throws Exception {
        assertEquals(400, status(send(SALES, PATH, ADD, body("tag_cd", "XX"))));
        // 11-25(사용자) — 목표로 처음 넣을 때 구분은 비워 둘 수 있다(이전에는 '태그 없으면 400'). 비우면 NULL 로 저장되고 목록에는 tag_cd null.
        Map<String, Object> b = body(); b.remove("tag_cd");
        assertEquals(201, status(send(SALES, PATH, ADD, b)));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM INST_BID_TARGET WHERE TAG_CD IS NULL", Integer.class).intValue());
        JsonNode first = json(getAs(SALES, "/bid-targets")).path("items").get(0);
        assertTrue(first.path("tag_cd").isNull());
        assertTrue(first.path("tag_name").isNull());
    }

    @Test public void 구분을_빈_값으로_보내도_넣기는_201_NULL_저장_고치기에서_비우기도_된다() throws Exception {
        assertEquals(201, status(send(SALES, PATH, ADD, body("tag_cd", ""))));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM INST_BID_TARGET WHERE REV_NO=1 AND TAG_CD IS NULL", Integer.class).intValue());
        assertEquals(201, status(send(SALES, PATH, TAG, body("target_no", 1, "base_rev_no", 1, "tag_cd", "RETAIN"))));   // 채우기
        assertEquals(201, status(send(SALES, PATH, TAG, body("target_no", 1, "base_rev_no", 2, "tag_cd", ""))));        // 다시 비우기
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM INST_BID_TARGET WHERE REV_NO=3 AND TAG_CD IS NULL", Integer.class).intValue());
        assertEquals(400, status(send(SALES, PATH, TAG, body("target_no", 1, "base_rev_no", 3, "tag_cd", "XX"))));      // 모르는 코드는 여전히 400
    }

    @Test public void 영업부서가_아니면_403_없으면_401() throws Exception {
        MvcResult r = send(DESIGNER, PATH, ADD, body());
        assertEquals(403, status(r));
        assertEquals(403, status(send(IT, PATH, ADD, body())));
        assertEquals(401, status(send(null, PATH, ADD, body())));
        assertEquals(0, rows());
    }

    @Test public void 고치기_NO_CHANGE_STALE_빼기_다시넣기() throws Exception {
        assertEquals(201, status(send(SALES, PATH, ADD, body())));
        MvcResult e = send(SALES, PATH, TAG, body("target_no", 1, "base_rev_no", 1, "tag_cd", "RETAIN"));
        assertEquals(201, status(e)); assertEquals(2, json(e).path("rev_no").asInt());
        assertEquals("change_target_tag", jdbc.queryForObject("SELECT BUTTON_ID FROM INST_BID_TARGET WHERE REV_NO=2", String.class));
        assertEquals(200, status(send(SALES, PATH, TAG, body("target_no", 1, "base_rev_no", 2, "tag_cd", "RETAIN"))));
        MvcResult stale = send(SALES, PATH, TAG, body("target_no", 1, "base_rev_no", 1, "tag_cd", "NEW"));
        assertEquals(409, status(stale)); assertEquals("STALE", json(stale).path("detail").path("code").asText());
        assertEquals(400, status(send(SALES, PATH + "/1/cancel", CANCEL, cancelBody(2, null))));   // 사유 없음
        MvcResult c = send(LEAD, PATH + "/1/cancel", CANCEL, cancelBody(2, "DROPPED"));              // 남이 넣은 것을 뺌
        assertEquals(201, status(c)); assertEquals("CANCEL", json(c).path("action_cd").asText());
        assertEquals("bid-target cancel no=1 rev=3 other=1", lastDetail());                         // S2
        assertEquals(0, json(getAs(SALES, "/bid-targets")).path("items").size());
        MvcResult again = send(SALES, PATH, ADD, body());
        assertEquals(201, status(again)); assertEquals(2, json(again).path("target_no").asInt());
        assertEquals("ALREADY_CANCELLED", json(send(SALES, PATH + "/1/cancel", CANCEL, cancelBody(3, "DUP"))).path("detail").path("code").asText());
    }

    @Test public void 본인이_뺀_것은_other_0() throws Exception {
        assertEquals(201, status(send(SALES, PATH, ADD, body())));
        assertEquals(201, status(send(SALES, PATH + "/1/cancel", CANCEL, cancelBody(1, "WRONG"))));
        assertEquals("bid-target cancel no=1 rev=2 other=0", lastDetail());
    }

    @Test public void 메모_개인정보_422_길이와_줄바꿈_400() throws Exception {
        MvcResult r = send(SALES, PATH, ADD, body("memo", "010-1234-5678"));
        assertEquals(422, status(r));
        assertFalse(r.getResponse().getContentAsString(StandardCharsets.UTF_8).contains("1234-5678"));
        StringBuilder sb = new StringBuilder(); for (int i = 0; i < 101; i++) sb.append('가');
        assertEquals(400, status(send(SALES, PATH, ADD, body("memo", sb.toString()))));
        assertEquals(400, status(send(SALES, PATH, ADD, body("memo", "a\nb"))));
    }

    @Test public void 주_담당은_영업부서만_사번은_쓰기_자격자에게만_보인다() throws Exception {
        assertEquals(400, status(send(SALES, PATH, ADD, body("owner_emp_no", DESIGNER))));
        assertEquals(400, status(send(SALES, PATH, ADD, body("owner_emp_no", "abc"))));
        MvcResult ok = send(SALES, PATH, ADD, body("owner_emp_no", LEAD));
        assertEquals(201, status(ok)); assertFalse(json(ok).path("item").path("owner_name").asText().isEmpty());
        assertTrue(json(getAs(SALES, "/bid-targets")).path("items").get(0).has("owner_emp_no"));
        assertFalse(json(getAs(DESIGNER, "/bid-targets")).path("items").get(0).has("owner_emp_no"));
    }

    @Test public void 화면_버튼이_허용_밖이면_UNKNOWN() throws Exception {
        assertEquals(201, status(send(SALES, PATH, EDIT, body())));
        assertEquals("UNKNOWN", jdbc.queryForObject("SELECT BUTTON_ID FROM INST_BID_TARGET", String.class));
        assertEquals(0, jdbc.queryForObject("SELECT UI_VALID FROM INST_BID_TARGET", Integer.class).intValue());
    }

    @Test public void 목록_조회_연도_형식_기본값() throws Exception {
        final int Y = y();
        assertEquals(400, status(getAs(SALES, "/bid-targets?year=abc")));
        MvcResult r = getAs(DESIGNER, "/bid-targets");
        assertEquals(200, status(r));
        assertEquals(Y, json(r).path("year").asInt());
        assertEquals(30, json(r).path("delay_days").asInt());
        assertEquals(3, json(r).path("codes").path("tags").size());
        assertEquals("RETAIN", json(r).path("codes").path("tags").path(0).path("code").asText());
        assertEquals("REGAIN", json(r).path("codes").path("tags").path(1).path("code").asText());
        assertEquals("NEW", json(r).path("codes").path("tags").path(2).path("code").asText());
        assertFalse(json(r).path("can_edit").asBoolean());
    }

    private void line(int no, String bank, String from, String to) {
        jdbc.update("INSERT INTO INST_BANK_CONTRACT (INSTITUTION_ID, CONTRACT_NO, REV_NO, ACTION_CD, ORIGIN_CD, RANK_CD, BANK_CD, TERM_FROM, TERM_TO,"
                + " SRC_KIND, CHECKED_DATE, OVERLAP_CONFIRMED, EDITOR_EMP_NO, EDITOR_NAME, EMP_VERIFIED, SCREEN_ID, BUTTON_ID, UI_VALID, SAVED_AT)"
                + " VALUES ('jongno', ?, 1, 'SAVE', 'MANUAL', 'FIRST', ?, ?, ?, 'STAFF', '2026-01-01', 1, '3918264', '김영업', 0, 'UNKNOWN', 'UNKNOWN', 0, '2026-01-01T00:00:00+09:00')",
                no, bank, from, to);
    }

    @Test public void 연도별_은행_상태_요약_연표() throws Exception {
        final int Y = y();
        line(1, "B02", String.valueOf(Y - 5), (Y - 2) + "-12-31");
        line(2, "B04", String.valueOf(Y - 1), (Y + 2) + "-12-31");
        assertEquals(201, status(send(SALES, PATH, ADD, body())));
        JsonNode bank = json(getAs(SALES, "/bid-targets")).path("items").get(0).path("bank");
        assertEquals("OTHER", bank.path("kb_now").asText());
        assertEquals(Y - 2, bank.path("last_kb_year").asInt());
        JsonNode years = json(getAs(SALES, "/institutions/jongno/bank-years?from=" + (Y - 6) + "&to=" + Y)).path("years");
        assertEquals("NO_RECORD", years.get(0).path("state").asText());
        assertEquals("KB", years.get(1).path("state").asText());
        assertEquals("OTHER", years.get(5).path("state").asText());
        assertEquals(400, status(getAs(SALES, "/institutions/jongno/bank-years?from=" + Y + "&to=" + (Y - 1))));
        assertEquals(400, status(getAs(SALES, "/institutions/jongno/bank-years?from=" + (Y - 41) + "&to=" + Y)));
        assertEquals(400, status(getAs(SALES, "/institutions/jongno/bank-years?from=abc")));
        MvcResult s = getAs(SALES, "/bank-contracts/summary");
        assertEquals(200, status(s));
        assertEquals(1, json(s).path("items").size());
        assertEquals("jongno", json(s).path("items").get(0).path("institution_id").asText());
        assertFalse(json(s).path("truncated").asBoolean());
    }

    @Test public void 접근_이력에_메모와_연도_값이_없다() throws Exception {
        final int Y = y();
        assertEquals(201, status(send(SALES, PATH, ADD, body("memo", "비밀스런메모"))));
        String d = lastDetail();
        assertFalse(d.contains("비밀스런메모"));
        assertFalse(d.contains(String.valueOf(Y)));
    }

    // ---- QA 043 서버 검토 4절 1~6 ----

    private void userPerm(String emp, String menu, int view, int edit) {
        jdbc.update("DELETE FROM USER_MENU_PERMS WHERE EMP_NO=? AND MENU_KEY=?", emp, menu);
        jdbc.update("INSERT INTO USER_MENU_PERMS (EMP_NO, MENU_KEY, CAN_VIEW, CAN_WRITE, CAN_EDIT, CAN_APPROVE, UPDATED_AT)"
                + " VALUES (?,?,?,0,?,0,'2026-11-17T00:00:00+00:00')", emp, menu, view, edit);
    }
    private int denied(String emp, String path) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE='DENIED' AND EMP_NO=? AND REQ_PATH=? AND STATUS_CODE=403",
                Integer.class, emp, path);
    }

    /** P2-1 — 시드에는 '기관 수정 권한은 있으나 영업이 아닌' 사람이 없다(기본값은 영업 계열만 edit). 디자이너에게 사용자 예외(map 조회+수정)를 켜 둘째 겹을 지나게 한다. */
    @Test public void 기관_수정_권한이_있어도_영업_계열이_아니면_둘째_겹_403() throws Exception {
        assertEquals(201, status(send(SALES, PATH, ADD, body())));   // 빼기 시험용 기존 행 1
        userPerm(DESIGNER, "map", 1, 1);
        int before = denied(DESIGNER, PATH), beforeCancel = denied(DESIGNER, PATH + "/1/cancel");
        MvcResult add = send(DESIGNER, PATH, ADD, body("target_year", y() + 1));
        assertEquals(403, status(add));
        assertTrue(add.getResponse().getContentAsString(StandardCharsets.UTF_8).contains("영업부서"));
        assertEquals(before + 1, denied(DESIGNER, PATH));
        assertEquals(403, status(send(DESIGNER, PATH + "/1/cancel", CANCEL, cancelBody(1, "WRONG"))));
        assertEquals(beforeCancel + 1, denied(DESIGNER, PATH + "/1/cancel"));
        assertEquals(1, rows());   // 영업이 넣은 1행 그대로
        assertEquals(1, json(getAs(SALES, "/bid-targets")).path("items").size());
        assertFalse(json(getAs(DESIGNER, "/bid-targets")).path("can_edit").asBoolean());   // 목록의 can_edit 도 같은 함수
    }

    @Test public void history_액션_사유_사번_미노출_404() throws Exception {
        assertEquals(201, status(send(SALES, PATH, ADD, body("owner_emp_no", LEAD))));
        Map<String, Object> c = cancelBody(1, "ETC"); c.put("cancel_reason_etc", "담당 변경");
        assertEquals(201, status(send(LEAD, PATH + "/1/cancel", CANCEL, c)));
        MvcResult h = getAs(DESIGNER, PATH + "/history");
        assertEquals(200, status(h));
        JsonNode items = json(h).path("items");
        assertEquals(2, items.size());
        assertEquals("CANCEL", items.get(0).path("action_cd").asText());
        assertEquals("담당 변경", items.get(0).path("cancel_reason_name").asText());
        assertEquals("SAVE", items.get(1).path("action_cd").asText());
        for (JsonNode it : items) {
            assertFalse(it.has("owner_emp_no"));
            assertFalse(it.has("editor_emp_no"));
        }
        assertFalse(json(h).path("truncated").asBoolean());
        String raw = h.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertFalse(raw.contains(SALES)); assertFalse(raw.contains(LEAD));
        assertEquals(404, status(getAs(DESIGNER, "/institutions/zzz/bid-targets/history")));
    }

    @Test public void 고치기로_연도를_바꾸면_같은_해_다른_목표와_DUP_TARGET() throws Exception {
        final int Y = y();
        assertEquals(201, status(send(SALES, PATH, ADD, body())));
        assertEquals(201, status(send(SALES, PATH, ADD, body("target_year", Y + 1))));
        MvcResult r = send(SALES, PATH, EDIT, body("target_no", 1, "base_rev_no", 1, "target_year", Y + 1));
        assertEquals(409, status(r));
        assertEquals("DUP_TARGET", json(r).path("detail").path("code").asText());
        assertEquals(2, json(r).path("detail").path("latest").path("target_no").asInt());
        assertEquals(2, rows());
    }

    @Test public void 빼기는_옛_rev면_STALE_행_수_그대로() throws Exception {
        assertEquals(201, status(send(SALES, PATH, ADD, body())));
        assertEquals(201, status(send(SALES, PATH, TAG, body("target_no", 1, "base_rev_no", 1, "tag_cd", "RETAIN"))));
        assertEquals(2, rows());
        MvcResult r = send(SALES, PATH + "/1/cancel", CANCEL, cancelBody(1, "WRONG"));
        assertEquals(409, status(r));
        assertEquals("STALE", json(r).path("detail").path("code").asText());
        assertEquals(2, rows());
    }

    @Test public void 뺀_기록을_고치려_하면_ALREADY_CANCELLED() throws Exception {
        assertEquals(201, status(send(SALES, PATH, ADD, body())));
        assertEquals(201, status(send(SALES, PATH + "/1/cancel", CANCEL, cancelBody(1, "WRONG"))));
        MvcResult r = send(SALES, PATH, EDIT, body("target_no", 1, "base_rev_no", 2, "tag_cd", "RETAIN"));
        assertEquals(409, status(r));
        assertEquals("ALREADY_CANCELLED", json(r).path("detail").path("code").asText());
        assertEquals(2, rows());
    }

    @Test public void 응답_어디에도_수정자_사번이_없다() throws Exception {
        List<String> raws = new java.util.ArrayList<String>();
        MvcResult add = send(SALES, PATH, ADD, body());
        raws.add(add.getResponse().getContentAsString(StandardCharsets.UTF_8));
        MvcResult dup = send(SALES, PATH, ADD, body());
        assertEquals(409, status(dup));
        raws.add(dup.getResponse().getContentAsString(StandardCharsets.UTF_8));
        MvcResult stale = send(SALES, PATH, TAG, body("target_no", 1, "base_rev_no", 9, "tag_cd", "RETAIN"));
        assertEquals(409, status(stale));
        raws.add(stale.getResponse().getContentAsString(StandardCharsets.UTF_8));
        MvcResult cancel = send(LEAD, PATH + "/1/cancel", CANCEL, cancelBody(1, "DUP"));
        assertEquals(201, status(cancel));
        raws.add(cancel.getResponse().getContentAsString(StandardCharsets.UTF_8));
        String[] urls = {"/bid-targets", PATH + "/history", "/bank-contracts/summary", "/institutions/jongno/bank-years"};
        for (String emp : new String[]{SALES, DESIGNER}) {
            for (String u : urls) raws.add(getAs(emp, u).getResponse().getContentAsString(StandardCharsets.UTF_8));
        }
        for (String raw : raws) {
            assertFalse(raw, raw.contains(SALES));
            assertFalse(raw, raw.contains(LEAD));
        }
    }

    // ---- 044 관심 기관·옮기기·입찰 종료 409 ----

    private static final String ADD_WATCH = "add_watch_target", TO_GOAL = "move_to_goal", TO_WATCH = "move_to_watch";

    private static Map<String, Object> watchBody(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("kind_cd", "WATCH"); m.put("tag_cd", "NEW");
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }
    private static Map<String, Object> moveBody(Integer base, String to, Integer year) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        if (base != null) m.put("base_rev_no", base);
        if (to != null) m.put("to_kind_cd", to);
        if (year != null) m.put("target_year", year);
        return m;
    }
    private static String code(MvcResult r) throws Exception { return json(r).path("detail").path("code").asText(); }

    /** 기관 jongno 의 공고 회차 1(열림) + 최신 판정. anchor = ANCHOR_LAST_BID(없으면 null). */
    private void round(String status, String handledAt, String anchor) {
        jdbc.update("INSERT INTO NOTICE_ROUND (INSTITUTION_ID, ROUND_SEQ, SOURCE_CD, ANCHOR_LAST_BID, OPENED_AT, OPENED_BY)"
                + " VALUES ('jongno', 1, 'INST_DATA', ?, '2026-01-01T00:00:00+09:00', '3918264')", anchor);
        jdbc.update("INSERT INTO NOTICE_ROUND_LOG (INSTITUTION_ID, ROUND_SEQ, REV_NO, STATUS_CD, HANDLER_EMP_NO, HANDLER_NAME, SCREEN_ID, BUTTON_ID, HANDLED_AT)"
                + " VALUES ('jongno', 1, 1, ?, '3918264', '김영업', 'bid_notice', 'save', ?)", status, handledAt);
    }
    private static String thisYearAt() { return Times.todayKst() + "T09:00:00+09:00"; }
    private void closedRound() { round("CLOSED", thisYearAt(), null); }
    private void activePrep(String state) {
        jdbc.update("INSERT INTO BID_PREP (BID_CASE_ID, INSTITUTION_ID, STATE_CD, CONFIRMED_BY, CONFIRMED_AT, UPDATED_BY, UPDATED_AT)"
                + " VALUES ('bt-test-case', 'jongno', ?, '3918264', '2026-11-16T00:00:00+09:00', '3918264', '2026-11-16T00:00:00+09:00')", state);
    }

    @Test public void 관심_넣기는_연도_없이_201_목록_watch_items() throws Exception {
        MvcResult r = send(SALES, PATH, ADD_WATCH, watchBody());
        assertEquals(201, status(r));
        assertEquals("WATCH", json(r).path("item").path("kind_cd").asText());
        assertTrue(json(r).path("item").path("target_year").isNull());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM INST_BID_TARGET WHERE KIND_CD='WATCH' AND TARGET_YEAR IS NULL AND UI_VALID=1", Integer.class).intValue());
        JsonNode l = json(getAs(SALES, "/bid-targets"));
        assertEquals(0, l.path("items").size());
        assertEquals(1, l.path("watch_items").size());
        assertEquals("WATCH", l.path("watch_items").get(0).path("kind_cd").asText());
    }

    @Test public void 관심에_연도를_보내면_400() throws Exception {
        assertEquals(400, status(send(SALES, PATH, ADD_WATCH, watchBody("target_year", y()))));
        assertEquals(0, rows());
    }

    @Test public void 관심이_있어도_목표_넣기_201_061() throws Exception {   // 061 — 관심과 목표는 서로 막지 않는다
        assertEquals(201, status(send(SALES, PATH, ADD_WATCH, watchBody())));
        assertEquals(201, status(send(SALES, PATH, ADD, body())));
        assertEquals(2, rows());
        JsonNode l = json(getAs(SALES, "/bid-targets"));
        assertEquals(1, l.path("items").size());
        assertEquals(1, l.path("watch_items").size());
    }

    @Test public void 목표가_있어도_관심_넣기_201_061() throws Exception {
        final int Y = y();
        assertEquals(201, status(send(SALES, PATH, ADD, body("target_year", Y + 1))));
        assertEquals(201, status(send(SALES, PATH, ADD_WATCH, watchBody())));
        assertEquals(2, rows());
    }

    @Test public void 관심_두번째_409_ALREADY_WATCH() throws Exception {
        assertEquals(201, status(send(SALES, PATH, ADD_WATCH, watchBody())));
        MvcResult r = send(SALES, PATH, ADD_WATCH, watchBody());
        assertEquals(409, status(r));
        assertEquals("ALREADY_WATCH", code(r));
        assertEquals(1, rows());
    }

    @Test public void 지난해_목표만_있으면_관심_넣기_201() throws Exception {
        jdbc.update("INSERT INTO INST_BID_TARGET (INSTITUTION_ID, TARGET_NO, REV_NO, ACTION_CD, KIND_CD, TARGET_YEAR, TAG_CD, EDITOR_EMP_NO, EDITOR_NAME,"
                + " EMP_VERIFIED, SCREEN_ID, BUTTON_ID, UI_VALID, SAVED_AT) VALUES ('jongno', 1, 1, 'SAVE', 'GOAL', ?, 'NEW', '3918264', '김영업',"
                + " 0, 'bid_board', 'add_bid_target', 1, '2026-01-01T00:00:00+09:00')", y() - 1);
        assertEquals(201, status(send(SALES, PATH, ADD_WATCH, watchBody())));
        assertEquals(2, rows());
    }

    @Test public void 관심을_목표로_옮기기는_같은_번호_한_행_MOVE() throws Exception {
        final int Y = y();
        assertEquals(201, status(send(SALES, PATH, ADD_WATCH, watchBody())));
        MvcResult r = send(SALES, PATH + "/1/move", TO_GOAL, moveBody(1, "GOAL", Y + 1));
        assertEquals(201, status(r));
        assertEquals(2, json(r).path("rev_no").asInt());
        assertEquals("MOVE", json(r).path("action_cd").asText());
        assertEquals(2, rows());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM INST_BID_TARGET WHERE TARGET_NO=1 AND REV_NO=2 AND ACTION_CD='MOVE' AND KIND_CD='GOAL'"
                + " AND TARGET_YEAR=? AND BUTTON_ID='move_to_goal' AND UI_VALID=1", Integer.class, Y + 1).intValue());
        JsonNode l = json(getAs(SALES, "/bid-targets?year=" + (Y + 1)));
        assertEquals(1, l.path("items").size());
        assertEquals(0, l.path("watch_items").size());
        assertEquals("김영업", l.path("items").get(0).path("first_editor_name").asText());
    }

    @Test public void 목표를_관심으로_옮기면_연도_NULL() throws Exception {
        assertEquals(201, status(send(SALES, PATH, ADD, body())));
        MvcResult r = send(SALES, PATH + "/1/move", TO_WATCH, moveBody(1, "WATCH", null));
        assertEquals(201, status(r));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM INST_BID_TARGET WHERE REV_NO=2 AND TARGET_YEAR IS NULL AND KIND_CD='WATCH'"
                + " AND ACTION_CD='MOVE' AND BUTTON_ID='move_to_watch'", Integer.class).intValue());
        assertEquals("bid-target move no=1 rev=2 to=watch other=0", lastDetail());
        JsonNode l = json(getAs(SALES, "/bid-targets"));
        assertEquals(0, l.path("items").size());
        assertEquals(1, l.path("watch_items").size());
    }

    @Test public void 다른_해_목표가_남아도_관심으로_옮기기_201_061() throws Exception {
        final int Y = y();
        assertEquals(201, status(send(SALES, PATH, ADD, body())));
        assertEquals(201, status(send(SALES, PATH, ADD, body("target_year", Y + 1))));
        assertEquals(201, status(send(SALES, PATH + "/1/move", TO_WATCH, moveBody(1, "WATCH", null))));
        assertEquals(3, rows());
        JsonNode l = json(getAs(SALES, "/bid-targets"));
        assertEquals(1, l.path("watch_items").size());
        assertEquals(SALES, jdbc.queryForObject("SELECT WATCH_EMP_NO FROM INST_BID_TARGET WHERE TARGET_NO=1 AND REV_NO=2", String.class));
    }

    @Test public void 옮기기_입력_검사() throws Exception {
        final int Y = y();
        final String M = PATH + "/1/move";
        assertEquals(201, status(send(SALES, PATH, ADD_WATCH, watchBody())));
        assertEquals(400, status(send(SALES, M, TO_GOAL, moveBody(1, "GOAL", null))));
        assertEquals(400, status(send(SALES, M, TO_GOAL, moveBody(1, "GOAL", Y + 3))));
        assertEquals(400, status(send(SALES, M, TO_GOAL, moveBody(1, "GOAL", Y - 1))));
        assertEquals(400, status(send(SALES, M, TO_WATCH, moveBody(1, "WATCH", null))));   // 같은 구분
        assertEquals(400, status(send(SALES, M, TO_GOAL, moveBody(1, "X", Y))));
        assertEquals(400, status(send(SALES, M, TO_GOAL, moveBody(1, null, Y))));
        assertEquals(400, status(send(SALES, M, TO_GOAL, moveBody(null, "GOAL", Y))));
        MvcResult stale = send(SALES, M, TO_GOAL, moveBody(5, "GOAL", Y));
        assertEquals(409, status(stale)); assertEquals("STALE", code(stale));
        assertEquals(404, status(send(SALES, PATH + "/99/move", TO_GOAL, moveBody(1, "GOAL", Y))));
        assertEquals(1, rows());
        // 뺀 기록
        assertEquals(201, status(send(SALES, PATH + "/1/cancel", CANCEL, cancelBody(1, "WRONG"))));
        MvcResult cancelled = send(SALES, M, TO_GOAL, moveBody(2, "GOAL", Y));
        assertEquals(409, status(cancelled)); assertEquals("ALREADY_CANCELLED", code(cancelled));
        // 목표를 관심으로 옮길 때 연도를 보내면 400
        assertEquals(201, status(send(SALES, PATH, ADD, body())));
        assertEquals(400, status(send(SALES, PATH + "/2/move", TO_WATCH, moveBody(1, "WATCH", Y))));
        assertEquals(3, rows());
    }

    @Test public void 옮기기_권한() throws Exception {
        assertEquals(201, status(send(SALES, PATH, ADD_WATCH, watchBody())));
        assertEquals(401, status(send(null, PATH + "/1/move", TO_GOAL, moveBody(1, "GOAL", y() + 1))));
        assertEquals(403, status(send(DESIGNER, PATH + "/1/move", TO_GOAL, moveBody(1, "GOAL", y() + 1))));
        assertEquals(1, rows());
    }

    @Test public void 공고_종료_판정이_올해면_올해_목표_409_INST_BID_CLOSED() throws Exception {
        final int Y = y();
        closedRound();
        MvcResult r = send(SALES, PATH, ADD, body());
        assertEquals(409, status(r));
        assertEquals("INST_BID_CLOSED", code(r));
        JsonNode d = json(r).path("detail");
        assertEquals("NOTICE_CLOSED", d.path("basis").path("basis_cd").asText());
        assertEquals(Times.todayKst(), d.path("basis").path("basis_date").asText());
        assertEquals(2, d.path("next_years").size());
        assertEquals(Y + 1, d.path("next_years").get(0).asInt());
        assertEquals(Y + 2, d.path("next_years").get(1).asInt());
        assertEquals(0, rows());
        assertEquals(201, status(send(SALES, PATH, ADD, body("target_year", Y + 1))));
    }

    @Test public void 입찰_없음으로_닫힌_회차도_409_NOTICE_NO_BID() throws Exception {
        round("NO_BID", thisYearAt(), null);
        jdbc.update("UPDATE NOTICE_ROUND SET CLOSED_AT='2026-11-17T00:00:00+09:00', CLOSE_REASON_CD='NO_BID', CLOSED_BY='3918264'"
                + " WHERE INSTITUTION_ID='jongno' AND ROUND_SEQ=1");
        MvcResult r = send(SALES, PATH, ADD, body());
        assertEquals(409, status(r));
        assertEquals("INST_BID_CLOSED", code(r));
        assertEquals("NOTICE_NO_BID", json(r).path("detail").path("basis").path("basis_cd").asText());
        assertEquals(0, rows());
    }

    @Test public void 기관_자료가_넘어갔으면_막지_않는다() throws Exception {
        round("CLOSED", thisYearAt(), "1999-01-01");
        jdbc.update("UPDATE INSTITUTIONS SET LAST_BID='2099-01-01' WHERE INSTITUTION_ID='jongno'");
        assertEquals(201, status(send(SALES, PATH, ADD, body())));
    }

    @Test public void 지난해_판정은_막지_않는다() throws Exception {
        round("CLOSED", (y() - 1) + "-12-01T09:00:00+09:00", null);
        assertEquals(201, status(send(SALES, PATH, ADD, body())));
    }

    @Test public void 진행_중_제안이_있으면_201_warning() throws Exception {
        closedRound();
        activePrep("IN_PROGRESS");
        MvcResult r = send(SALES, PATH, ADD, body());
        assertEquals(201, status(r));
        assertEquals("INST_BID_CLOSED", json(r).path("warning").path("code").asText());
        assertEquals("IN_PROGRESS", json(r).path("warning").path("prep_state_cd").asText());
        assertTrue(lastDetail().endsWith(" warn=INST_BID_CLOSED"));
        assertEquals(1, rows());
    }

    @Test public void 시작_전_약정이_있으면_409_CONTRACT_DECIDED() throws Exception {
        final int Y = y();
        line(1, "B05", (Y + 1) + "-01-01", (Y + 4) + "-12-31");
        MvcResult r = send(SALES, PATH, ADD, body());
        assertEquals(409, status(r));
        assertEquals("CONTRACT_DECIDED", json(r).path("detail").path("basis").path("basis_cd").asText());
        assertEquals((Y + 1) + "-01-01", json(r).path("detail").path("basis").path("basis_date").asText());
        assertEquals(0, rows());
    }

    @Test public void 관심을_올해_목표로_옮길_때도_INST_BID_CLOSED() throws Exception {
        final int Y = y();
        closedRound();
        assertEquals(201, status(send(SALES, PATH, ADD_WATCH, watchBody())));   // 관심 넣기는 막지 않는다
        MvcResult r = send(SALES, PATH + "/1/move", TO_GOAL, moveBody(1, "GOAL", Y));
        assertEquals(409, status(r));
        assertEquals("INST_BID_CLOSED", code(r));
        assertEquals(1, rows());
        assertEquals(201, status(send(SALES, PATH + "/1/move", TO_GOAL, moveBody(1, "GOAL", Y + 1))));
    }

    @Test public void 목표_연도를_올해로_고치면_검사_그대로_두는_고치기는_통과() throws Exception {
        final int Y = y();
        assertEquals(201, status(send(SALES, PATH, ADD, body())));   // 근거 없을 때 올해 목표
        closedRound();
        assertEquals(201, status(send(SALES, PATH, EDIT, body("target_no", 1, "base_rev_no", 1, "memo", "메모만"))));   // 연도 그대로
        assertEquals(201, status(send(SALES, PATH + "/1/cancel", CANCEL, cancelBody(2, "WRONG"))));
        assertEquals(201, status(send(SALES, PATH, ADD, body("target_year", Y + 1))));   // 번호 2
        MvcResult r = send(SALES, PATH, EDIT, body("target_no", 2, "base_rev_no", 1, "target_year", Y));
        assertEquals(409, status(r));
        assertEquals("INST_BID_CLOSED", code(r));
    }

    @Test public void 목록_next_term_to와_bid_closed() throws Exception {
        final int Y = y();
        line(1, "B05", (Y - 2) + "-01-01", Y + "-12-31");
        assertEquals(201, status(send(SALES, PATH, ADD, body())));
        JsonNode it = json(getAs(SALES, "/bid-targets")).path("items").get(0);
        assertEquals("GOAL", it.path("kind_cd").asText());
        assertEquals(Y + "-12-31", it.path("next_term_to").asText());
        assertTrue(it.path("bid_closed").isNull());
        closedRound();
        it = json(getAs(SALES, "/bid-targets")).path("items").get(0);
        assertEquals("NOTICE_CLOSED", it.path("bid_closed").path("basis_cd").asText());
    }

    @Test public void 고치기에서_kind_cd를_바꾸면_400() throws Exception {
        assertEquals(201, status(send(SALES, PATH, ADD, body())));
        assertEquals(400, status(send(SALES, PATH, EDIT, body("target_no", 1, "base_rev_no", 1, "kind_cd", "WATCH"))));
        assertEquals(1, rows());
    }

    @Test public void 옮기기_접근_이력에_연도_메모_사번이_없다() throws Exception {
        assertEquals(201, status(send(SALES, PATH, ADD_WATCH, watchBody("memo", "비밀스런메모"))));
        assertEquals(201, status(send(SALES, PATH + "/1/move", TO_GOAL, moveBody(1, "GOAL", y() + 1))));
        assertEquals("bid-target move no=1 rev=2 to=goal other=0", lastDetail());
    }

    // ---- 061 관심 기관을 사람별로(지도 ♥ = 내 관심) ----

    private static final String HEART = "toggle_watch_heart";

    /** 지도 ♥ — PUT(켬)·DELETE(끔). body 가 null 이면 본문 없음. */
    private MvcResult heart(boolean on, String emp, String inst, Object content) throws Exception {
        MockHttpServletRequestBuilder b = on ? put("/institutions/" + inst + "/my-watch") : delete("/institutions/" + inst + "/my-watch");
        if (content != null) b = b.contentType(MediaType.APPLICATION_JSON).content(JSON.writeValueAsString(content));
        if (emp != null) b = b.header(Actor.HEADER, emp);
        b = b.header("X-Screen-Id", "map_popover").header("X-Button-Id", HEART);
        return mockMvc.perform(b).andReturn();
    }
    private String lastDetail(String method) {
        List<String> d = jdbc.queryForList("SELECT DETAIL FROM ACCESS_LOG WHERE EVENT_TYPE='API' AND HTTP_METHOD=? ORDER BY LOG_ID DESC", String.class, method);
        return d.isEmpty() ? null : d.get(0);
    }

    @Test public void 관심은_사람별_061() throws Exception {
        assertEquals(201, status(send(SALES, PATH, ADD_WATCH, watchBody())));
        assertEquals(0, json(getAs(LEAD, "/bid-targets")).path("watch_items").size());
        MvcResult r = send(LEAD, PATH, ADD_WATCH, watchBody());
        assertEquals(201, status(r)); assertEquals(2, json(r).path("target_no").asInt());
        assertEquals(1, json(getAs(SALES, "/bid-targets")).path("watch_items").size());
        assertEquals(1, json(getAs(LEAD, "/bid-targets")).path("watch_items").size());
        assertEquals("ALREADY_WATCH", code(send(LEAD, PATH, ADD_WATCH, watchBody())));   // 같은 사람 두 번째만 409
        assertEquals(SALES, jdbc.queryForObject("SELECT WATCH_EMP_NO FROM INST_BID_TARGET WHERE TARGET_NO=1", String.class));
        assertEquals(LEAD, jdbc.queryForObject("SELECT WATCH_EMP_NO FROM INST_BID_TARGET WHERE TARGET_NO=2", String.class));
    }

    @Test public void 남의_관심은_고치기_빼기_옮기기_모두_403_NOT_WATCH_OWNER() throws Exception {
        final int Y = y();
        assertEquals(201, status(send(SALES, PATH, ADD_WATCH, watchBody())));
        MvcResult e = send(LEAD, PATH, EDIT, watchBody("target_no", 1, "base_rev_no", 1, "memo", "남의 것"));
        MvcResult c = send(LEAD, PATH + "/1/cancel", CANCEL, cancelBody(1, "WRONG"));
        MvcResult m = send(LEAD, PATH + "/1/move", TO_GOAL, moveBody(1, "GOAL", Y + 1));
        MvcResult staleMove = send(LEAD, PATH + "/1/move", TO_GOAL, moveBody(9, "GOAL", Y + 1));   // 틀린 REV 여도 STALE 이 아니라 403
        for (MvcResult r : new MvcResult[]{e, c, m, staleMove}) {
            assertEquals(403, status(r));
            assertEquals("NOT_WATCH_OWNER", code(r));
            assertTrue(json(r).path("detail").path("latest").isNull());
            assertFalse(r.getResponse().getContentAsString(StandardCharsets.UTF_8).contains("김영업"));
        }
        assertEquals(1, rows());
        assertTrue(denied(LEAD, PATH) >= 1);
        assertTrue(denied(LEAD, PATH + "/1/cancel") >= 1);
        assertTrue(denied(LEAD, PATH + "/1/move") >= 1);
    }

    @Test public void 남의_관심은_이력에_안_보인다() throws Exception {
        assertEquals(201, status(send(SALES, PATH, ADD_WATCH, watchBody())));
        assertEquals(0, json(getAs(LEAD, PATH + "/history")).path("items").size());
        assertEquals(1, json(getAs(SALES, PATH + "/history")).path("items").size());
    }

    /** security 중-2 — 남의 ♥ 켬/끔이 한도(200)를 넘게 쌓여도 목표 이력은 보인다(남의 관심은 SQL 에서 걸러 한도 앞에서 빠진다). */
    @Test public void 남의_하트_반복이_한도를_넘겨도_목표_이력이_보인다() throws Exception {
        assertEquals(201, status(send(LEAD, PATH, ADD, body())));   // 목표 번호 1
        for (int rev = 1; rev <= 210; rev++) {
            jdbc.update("INSERT INTO INST_BID_TARGET (INSTITUTION_ID, TARGET_NO, REV_NO, ACTION_CD, KIND_CD, TARGET_YEAR, TAG_CD, EDITOR_EMP_NO, EDITOR_NAME,"
                    + " EMP_VERIFIED, SCREEN_ID, BUTTON_ID, UI_VALID, SAVED_AT, WATCH_EMP_NO) VALUES ('jongno', 5, ?, ?, 'WATCH', NULL, 'NEW', '3918264', '김영업',"
                    + " 0, 'map_popover', 'toggle_watch_heart', 1, ?, '3918264')", rev, rev % 2 == 1 ? "SAVE" : "CANCEL",
                    String.format("2999-01-01T00:%02d:%02d+09:00", rev / 60, rev % 60));
        }
        JsonNode lead = json(getAs(LEAD, PATH + "/history"));
        assertEquals(1, lead.path("items").size());
        assertEquals("GOAL", lead.path("items").get(0).path("kind_cd").asText());
        assertFalse(lead.path("truncated").asBoolean());
        JsonNode mine = json(getAs(SALES, PATH + "/history"));
        assertTrue(mine.path("truncated").asBoolean());   // 주인 본인은 자기 기록이 한도를 넘는다
    }

    @Test public void 하트_켬은_멱등_기본_구분_NEW_화면_버튼_기록() throws Exception {
        MvcResult r = heart(true, SALES, "jongno", null);
        assertEquals(201, status(r));
        assertEquals("DEFAULT", json(r).path("tag_source").asText());
        assertEquals("NEW", json(r).path("item").path("tag_cd").asText());
        assertTrue(json(r).path("watching").asBoolean());
        assertEquals(SALES, jdbc.queryForObject("SELECT WATCH_EMP_NO FROM INST_BID_TARGET", String.class));
        assertEquals("map_popover", jdbc.queryForObject("SELECT SCREEN_ID FROM INST_BID_TARGET", String.class));
        assertEquals(1, jdbc.queryForObject("SELECT UI_VALID FROM INST_BID_TARGET", Integer.class).intValue());
        assertEquals("bid-target watch-on no=1 rev=1 tag=default", lastDetail("PUT"));
        MvcResult again = heart(true, SALES, "jongno", null);
        assertEquals(200, status(again)); assertFalse(json(again).path("changed").asBoolean());
        assertEquals(1, rows());
        assertEquals("bid-target watch-on no-change", lastDetail("PUT"));
    }

    @Test public void 하트_끔은_멱등_사유_없는_CANCEL_행() throws Exception {
        assertEquals(200, status(heart(false, SALES, "jongno", null)));   // 켠 적 없음 — 그대로 200
        assertEquals(0, rows());
        assertEquals(201, status(heart(true, SALES, "jongno", null)));
        MvcResult off = heart(false, SALES, "jongno", null);
        assertEquals(200, status(off)); assertTrue(json(off).path("changed").asBoolean());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM INST_BID_TARGET WHERE REV_NO=2 AND ACTION_CD='CANCEL' AND CANCEL_REASON_CD IS NULL"
                + " AND WATCH_EMP_NO='3918264'", Integer.class).intValue());
        assertEquals("bid-target watch-off no=1 rev=2", lastDetail("DELETE"));
        MvcResult again = heart(false, SALES, "jongno", null);
        assertEquals(200, status(again)); assertFalse(json(again).path("changed").asBoolean());
        assertEquals(2, rows());
        assertEquals(0, json(getAs(SALES, "/bid-targets")).path("watch_items").size());
    }

    @Test public void 하트를_다시_켜면_같은_번호_옛_값은_비운다() throws Exception {
        assertEquals(201, status(heart(true, SALES, "jongno", null)));
        // 옛 기록에 메모·주 담당이 남아 있던 경우를 만든다(관심 REV 1 에 직접 넣기)
        assertEquals(1, jdbc.update("UPDATE INST_BID_TARGET SET MEMO='옛메모', OWNER_EMP_NO='3918264', OWNER_NAME='김영업' WHERE REV_NO=1"));
        assertEquals(200, status(heart(false, SALES, "jongno", null)));
        assertEquals(201, status(heart(true, SALES, "jongno", null)));
        assertEquals(1, jdbc.queryForObject("SELECT MAX(TARGET_NO) FROM INST_BID_TARGET", Integer.class).intValue());
        assertEquals(3, jdbc.queryForObject("SELECT MAX(REV_NO) FROM INST_BID_TARGET", Integer.class).intValue());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM INST_BID_TARGET WHERE REV_NO=3 AND MEMO IS NULL AND OWNER_EMP_NO IS NULL AND OWNER_NAME IS NULL",
                Integer.class).intValue());
    }

    /** security 하-2 — 목표에서 옮겨 온 관심 기록은 ♥ 로 껐다 켜도 그 번호를 다시 쓰지 않고 새 번호. */
    @Test public void 목표에서_옮겨온_관심은_하트를_다시_켜면_새_번호() throws Exception {
        assertEquals(201, status(send(SALES, PATH, ADD, body())));
        assertEquals(201, status(send(SALES, PATH + "/1/move", TO_WATCH, moveBody(1, "WATCH", null))));   // 번호 1 = 처음 목표
        assertEquals(200, status(heart(false, SALES, "jongno", null)));                                    // REV 3
        MvcResult on = heart(true, SALES, "jongno", null);
        assertEquals(201, status(on));
        assertEquals(2, json(on).path("target_no").asInt());   // 옛 목표 번호를 재사용하지 않음
        assertEquals(1, json(on).path("rev_no").asInt());
    }

    @Test public void 하트_구분_선택값은_코드표_검사() throws Exception {
        Map<String, Object> bad = new LinkedHashMap<String, Object>(); bad.put("tag_cd", "XX");
        assertEquals(400, status(heart(true, SALES, "jongno", bad)));
        assertEquals(0, rows());
        Map<String, Object> good = new LinkedHashMap<String, Object>(); good.put("tag_cd", "RETAIN");
        MvcResult r = heart(true, SALES, "jongno", good);
        assertEquals(201, status(r)); assertEquals("GIVEN", json(r).path("tag_source").asText());
        assertEquals("RETAIN", json(r).path("item").path("tag_cd").asText());
        assertEquals("bid-target watch-on no=1 rev=1 tag=given", lastDetail("PUT"));
    }

    @Test public void 하트_기본_구분은_지금_국민은행이면_RETAIN() throws Exception {
        line(1, "B02", (y() - 1) + "-01-01", (y() + 1) + "-12-31");
        MvcResult r = heart(true, SALES, "jongno", null);
        assertEquals(201, status(r));
        assertEquals("RETAIN", json(r).path("item").path("tag_cd").asText());
    }

    @Test public void 하트_권한_디자이너도_켜고_사번_없으면_401() throws Exception {
        assertEquals(201, status(heart(true, DESIGNER, "jongno", null)));
        assertEquals(DESIGNER, jdbc.queryForObject("SELECT WATCH_EMP_NO FROM INST_BID_TARGET", String.class));
        assertEquals(401, status(heart(true, null, "jung", null)));
        assertEquals(404, status(heart(true, SALES, "zzz!", null)));
        assertEquals(1, rows());
    }

    @Test public void 하트는_결재_중인_기관에서도_켠다() throws Exception {
        jdbc.update("INSERT INTO APPROVAL_REQUEST (REQ_TYPE, REQUESTER_EMP_NO, TITLE, PAYLOAD, STATUS, CURRENT_STEP, CREATED_AT)"
                + " VALUES ('TARGET_CHANGE', '3918264', 't', '{}', 'PENDING', 1, '2026-11-24T00:00:00+09:00')");
        Long reqId = jdbc.queryForObject("SELECT MAX(REQ_ID) FROM APPROVAL_REQUEST", Long.class);
        jdbc.update("INSERT INTO INST_BID_TARGET_REQ_ITEM (REQ_ID, INSTITUTION_ID, ITEM_NO, OP_CD, REQUESTER_EMP_NO, REQUESTER_NAME, CREATED_AT)"
                + " VALUES (?, 'jongno', 1, 'ADD', '3918264', '김영업', '2026-11-24T00:00:00+09:00')", reqId);
        assertEquals(201, status(heart(true, SALES, "jongno", null)));   // 개인 기록 — 결재 잠금과 무관
    }

    @Test public void 내_관심_목록과_모두의_관심_이름_수() throws Exception {
        assertEquals(201, status(heart(true, SALES, "jongno", null)));
        assertEquals(201, status(heart(true, LEAD, "jongno", null)));
        assertEquals(201, status(heart(true, SALES, "jung", null)));
        MvcResult mine = getAs(SALES, "/my-watch");
        assertEquals(200, status(mine));
        assertEquals(2, json(mine).path("n").asInt());
        MvcResult mineLead = getAs(LEAD, "/my-watch");
        assertEquals(1, json(mineLead).path("n").asInt());
        assertEquals("jongno", json(mineLead).path("items").get(0).path("institution_id").asText());
        // 남의 관심 이름·수를 내주던 GET /watchers 는 없앴다(사용자 11-25)
        assertEquals(404, status(getAs(DESIGNER, "/watchers")));
    }

    /** NEXT 117 P2 — 목표를 관심으로 옮긴 MOVE 행은 팀원 이력에도 보이고(전환점), 그 뒤 주인의 ♥ 끔/켬 행은 안 보인다. */
    @Test public void 목표를_관심으로_옮긴_MOVE_행은_팀원_이력에_보인다() throws Exception {
        assertEquals(201, status(send(SALES, PATH, ADD, body())));
        assertEquals(201, status(send(SALES, PATH + "/1/move", TO_WATCH, moveBody(1, "WATCH", null))));
        assertEquals(200, status(heart(false, SALES, "jongno", null)));
        assertEquals(201, status(heart(true, SALES, "jongno", null)));
        JsonNode items = json(getAs(LEAD, PATH + "/history")).path("items");
        assertEquals(2, items.size());   // 목표 저장 + 옮김. ♥ 끔/켬(CANCEL·SAVE 관심 행)은 없다
        assertEquals("MOVE", items.get(0).path("action_cd").asText());
        assertEquals("SAVE", items.get(1).path("action_cd").asText());
    }

    /** NEXT 117 P3-b — 목표 이력(MOVE)이 섞인 관심 번호는 ♥ 끔→켬에서도 재사용하지 않고 새 번호. */
    @Test public void 옮김이_섞인_번호는_다른_사람이_끄고_켜도_새_번호() throws Exception {
        assertEquals(201, status(heart(true, SALES, "jongno", null)));                                  // 번호 1 = SALES 관심
        assertEquals(201, status(send(SALES, PATH + "/1/move", TO_GOAL, moveBody(1, "GOAL", y()))));    // 목표로 옮김(rev 2)
        assertEquals(201, status(send(LEAD, PATH + "/1/move", TO_WATCH, moveBody(2, "WATCH", null)))); // LEAD 관심으로 옮김(rev 3)
        assertEquals(200, status(heart(false, LEAD, "jongno", null)));                                  // rev 4
        MvcResult on = heart(true, LEAD, "jongno", null);
        assertEquals(201, status(on));
        assertEquals(2, json(on).path("target_no").asInt());
        assertEquals(1, json(on).path("rev_no").asInt());
    }

    /** NEXT 117 P3-a — 내가 올린 TO_WATCH 결재가 진행 중이면 같은 기관 ♥ 켬은 409 CHANGE_PENDING. */
    @Test public void 내_TO_WATCH_결재_중이면_하트_켬_409() throws Exception {
        jdbc.update("INSERT INTO APPROVAL_REQUEST (REQ_TYPE, REQUESTER_EMP_NO, TITLE, PAYLOAD, STATUS, CURRENT_STEP, CREATED_AT)"
                + " VALUES ('TARGET_CHANGE', '3918264', 't', '{}', 'PENDING', 1, '2026-11-24T00:00:00+09:00')");
        Long reqId = jdbc.queryForObject("SELECT MAX(REQ_ID) FROM APPROVAL_REQUEST", Long.class);
        jdbc.update("INSERT INTO INST_BID_TARGET_REQ_ITEM (REQ_ID, INSTITUTION_ID, ITEM_NO, OP_CD, TARGET_NO, REQUESTER_EMP_NO, REQUESTER_NAME, CREATED_AT)"
                + " VALUES (?, 'jongno', 1, 'TO_WATCH', 1, '3918264', '김영업', '2026-11-24T00:00:00+09:00')", reqId);
        MvcResult r = heart(true, SALES, "jongno", null);
        assertEquals(409, status(r));
        assertEquals("CHANGE_PENDING", code(r));
        assertEquals(0, rows());
        assertEquals(201, status(heart(true, LEAD, "jongno", null)));   // 남의 결재는 내 ♥ 와 무관
    }

    /**
     * NEXT 117 시험 공백 2 — 비활성(LOCKED) 사용자의 ♥ 켬은 403 + 접근 이력 DENIED, 행 수 그대로.
     * MenuGuard.require 의 canView 가 ACTIVE 를 먼저 요구해 서비스(WATCH_USER_DENIED)까지 가지 않으므로 code 는 없다.
     * 서비스의 WATCH_USER_DENIED 분기는 HTTP 로 닿는 경로가 없는 방어 코드다(canView 가 미등록·비활성을 모두 거른다).
     */
    @Test public void 비활성_사용자의_하트_켬은_가드에서_403_DENIED() throws Exception {
        jdbc.update("UPDATE USERS SET STATUS='LOCKED' WHERE EMP_NO=?", LEAD);
        MvcResult r = heart(true, LEAD, "jongno", null);
        assertEquals(403, status(r));
        assertEquals("", code(r));
        assertEquals(0, rows());
        assertTrue(denied(LEAD, "/institutions/jongno/my-watch") >= 1);
    }
}
