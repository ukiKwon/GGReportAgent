package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.config.BidTargetSettings;
import com.kbstar.kgi.ggreport.web.support.Times;
import org.junit.After;
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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 목표 기관 변경 결재·자동 이월·협약 개시일(NEXT 105, 056). 사람: 영업 3918264 김영업 · 영업팀장 5047192 · 영업부장 2674805(HEAD)·1473958(HEAD2)
 * · 다른 영업팀장 5640327 · 전산 4482971 · 디자이너 7130526. 기관 jongno·jung·jungnang·mapo·nowon.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class TargetChangeApiTest {
    private static final String SALES = "3918264", LEAD = "5047192", LEAD2 = "5640327", HEAD = "2674805", HEAD2 = "1473958",
            IT = "4482971", DESIGNER = "7130526";
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private BidTargetSettings settings;

    @Before public void 스위치_켬() {   // 코드 기본값은 둘 다 false(화면 적용 커밋에서 true) — 이 시험은 켠 상태가 바탕
        settings.setApprovalRequired(true);
        settings.setCarryEnabled(true);
    }
    @After public void 설정_복구() {
        settings.setApprovalRequired(false);
        settings.setCarryEnabled(false);
        settings.setCarryDefaultStart(java.time.MonthDay.of(1, 1));
    }

    private static int y() { return Integer.parseInt(Times.todayKst().substring(0, 4)); }

    private MvcResult send(String emp, String path, String screen, String button, Object content) throws Exception {
        MockHttpServletRequestBuilder b = post(path).contentType(MediaType.APPLICATION_JSON).content(content == null ? "" : JSON.writeValueAsString(content));
        if (emp != null) b = b.header(Actor.HEADER, emp);
        if (screen != null) b = b.header("X-Screen-Id", screen);
        if (button != null) b = b.header("X-Button-Id", button);
        return mockMvc.perform(b).andReturn();
    }
    private MvcResult change(String emp, Object content) throws Exception { return send(emp, "/bid-targets/changes", "bid_board", "submit_target_change", content); }
    private MvcResult decide(String emp, long id, String decision, String comment) throws Exception {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("decision", decision); if (comment != null) m.put("comment", comment);
        return send(emp, "/approval-requests/" + id + "/decide", "approvals_inbox", "APPROVE".equals(decision) ? "approve" : "reject", m);
    }
    private MvcResult cancelReq(String emp, long id) throws Exception { return send(emp, "/approval-requests/" + id + "/cancel", "approvals_inbox", "cancel_request", null); }
    private MvcResult getAs(String emp, String url) throws Exception {
        MockHttpServletRequestBuilder b = get(url); if (emp != null) b = b.header(Actor.HEADER, emp); return mockMvc.perform(b).andReturn();
    }
    private static JsonNode json(MvcResult r) throws Exception { return JSON.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8)); }
    private static int status(MvcResult r) { return r.getResponse().getStatus(); }
    private static String raw(MvcResult r) throws Exception { return r.getResponse().getContentAsString(StandardCharsets.UTF_8); }
    private int count(String sql, Object... args) { return jdbc.queryForObject(sql, Integer.class, args); }
    private void userPerm(String emp, String menu, int view, int edit) {
        jdbc.update("DELETE FROM USER_MENU_PERMS WHERE EMP_NO=? AND MENU_KEY=?", emp, menu);
        jdbc.update("INSERT INTO USER_MENU_PERMS (EMP_NO, MENU_KEY, CAN_VIEW, CAN_WRITE, CAN_EDIT, CAN_APPROVE, UPDATED_AT)"
                + " VALUES (?,?,?,0,?,0,'2026-11-17T00:00:00+00:00')", emp, menu, view, edit);
    }

    private static Map<String, Object> item(String inst, String op, Object... kv) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("institution_id", inst); m.put("op_cd", op);
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }
    private static Map<String, Object> req(String reason, Map<String, Object>... items) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        if (reason != null) m.put("reason", reason);
        List<Object> l = new ArrayList<Object>();
        for (Map<String, Object> it : items) l.add(it);
        m.put("items", l);
        return m;
    }

    private void target(String inst, int no, int rev, String action, String kind, Integer year, String reason) {
        jdbc.update("INSERT INTO INST_BID_TARGET (INSTITUTION_ID, TARGET_NO, REV_NO, ACTION_CD, KIND_CD, TARGET_YEAR, TAG_CD, MEMO, OWNER_EMP_NO, OWNER_NAME,"
                + " CANCEL_REASON_CD, CANCEL_REASON_ETC, EDITOR_EMP_NO, EDITOR_NAME, EMP_VERIFIED, SCREEN_ID, BUTTON_ID, UI_VALID, SAVED_AT)"
                + " VALUES (?,?,?,?,?,?,'NEW',NULL,NULL,NULL,?,NULL,'3918264','김영업',0,'bid_board','seed',1,'2026-11-18T00:00:00+09:00')",
                inst, no, rev, action, kind, year, reason);
    }
    private void line(String inst, int no, String bank, String from) {
        jdbc.update("INSERT INTO INST_BANK_CONTRACT (INSTITUTION_ID, CONTRACT_NO, REV_NO, ACTION_CD, ORIGIN_CD, RANK_CD, BANK_CD, TERM_FROM, TERM_TO,"
                + " SRC_KIND, CHECKED_DATE, OVERLAP_CONFIRMED, EDITOR_EMP_NO, EDITOR_NAME, EMP_VERIFIED, SCREEN_ID, BUTTON_ID, UI_VALID, SAVED_AT)"
                + " VALUES (?,?,1,'SAVE','MANUAL','FIRST',?,?,?,'STAFF','2026-11-18',0,'3918264','김영업',0,'bank_contract','seed',1,'2026-11-18T00:00:00+09:00')",
                inst, no, bank, from, (y() + 3) + "-12-31");
    }
    /** jung 올해 목표 · jungnang 올해 목표 · mapo 올해 목표 · nowon 관심 — 일괄 5종 시험의 바탕. */
    private void baseSeed() {
        final int Y = y();
        target("jung", 1, 1, "SAVE", "GOAL", Y, null);
        target("jungnang", 1, 1, "SAVE", "GOAL", Y, null);
        target("mapo", 1, 1, "SAVE", "GOAL", Y, null);
        target("nowon", 1, 1, "SAVE", "WATCH", null, null);
    }
    @SuppressWarnings("unchecked")
    private Map<String, Object> fiveOps(String reason) {
        final int Y = y();
        return req(reason,
                item("jongno", "ADD", "tag_cd", "NEW", "target_year", Y),
                item("jung", "EDIT", "target_no", 1, "base_rev_no", 1, "target_year", Y, "tag_cd", "RETAIN"),
                item("jungnang", "CANCEL", "target_no", 1, "base_rev_no", 1, "cancel_reason_cd", "DROPPED"),
                item("mapo", "TO_WATCH", "target_no", 1, "base_rev_no", 1),
                item("nowon", "TO_GOAL", "target_no", 1, "base_rev_no", 1, "target_year", Y + 1));
    }
    private long submitFive() throws Exception {
        MvcResult r = change(SALES, fiveOps("올해 전략 조정"));
        assertEquals(raw(r), 200, status(r));
        return json(r).path("request").path("req_id").asLong();
    }

    @Test public void 영업팀원의_단건_목표_쓰기는_403_APPROVAL_REQUIRED_관심은_바로() throws Exception {
        userPerm(HEAD, "map", 1, 1);
        Map<String, Object> goal = new LinkedHashMap<String, Object>();
        goal.put("target_year", y()); goal.put("tag_cd", "NEW");
        MvcResult r = send(SALES, "/institutions/jongno/bid-targets", "bid_board", "add_bid_target", goal);
        assertEquals(403, status(r));
        assertEquals("APPROVAL_REQUIRED", json(r).path("detail").path("code").asText());
        assertEquals(0, count("SELECT COUNT(*) FROM INST_BID_TARGET"));
        assertTrue(count("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE='DENIED' AND EMP_NO=? AND REQ_PATH=?", SALES, "/institutions/jongno/bid-targets") >= 1);
        Map<String, Object> watch = new LinkedHashMap<String, Object>();
        watch.put("kind_cd", "WATCH"); watch.put("tag_cd", "NEW");
        assertEquals(201, status(send(SALES, "/institutions/jongno/bid-targets", "bid_board", "add_watch_target", watch)));
        assertEquals(201, status(send(HEAD, "/institutions/jung/bid-targets", "bid_board", "add_bid_target", goal)));
    }

    @Test public void 스위치를_켠_상태에서_영업팀장의_단건_목표_넣기도_403_APPROVAL_REQUIRED() throws Exception {
        userPerm(LEAD, "map", 1, 1);
        Map<String, Object> goal = new LinkedHashMap<String, Object>();
        goal.put("target_year", y()); goal.put("tag_cd", "NEW");
        MvcResult r = send(LEAD, "/institutions/jongno/bid-targets", "bid_board", "add_bid_target", goal);
        assertEquals(raw(r), 403, status(r));
        assertEquals("APPROVAL_REQUIRED", json(r).path("detail").path("code").asText());
        assertEquals(0, count("SELECT COUNT(*) FROM INST_BID_TARGET"));
    }

    @Test public void 영업부장_반려_뒤_그_기관_관심_기록_저장은_201_잠금_풀림() throws Exception {
        userPerm(SALES, "map", 1, 1);
        final int Y = y();
        MvcResult r1 = change(SALES, req("반려 시험", item("jongno", "ADD", "tag_cd", "NEW", "target_year", Y)));
        assertEquals(raw(r1), 200, status(r1));
        long id = json(r1).path("request").path("req_id").asLong();
        Map<String, Object> watch = new LinkedHashMap<String, Object>();
        watch.put("kind_cd", "WATCH"); watch.put("tag_cd", "NEW");
        assertEquals(409, status(send(SALES, "/institutions/jongno/bid-targets", "bid_board", "add_watch_target", watch)));   // 결재 중 = 잠금
        assertEquals(200, status(decide(HEAD2, id, "REJECT", "보류")));
        MvcResult w = send(SALES, "/institutions/jongno/bid-targets", "bid_board", "add_watch_target", watch);
        assertEquals(raw(w), 201, status(w));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jongno' AND KIND_CD='WATCH'"));
    }

    @Test public void TO_GOAL_승인은_MOVE_행_KIND_GOAL_결재번호를_남긴다() throws Exception {
        baseSeed();
        final int Y = y();
        MvcResult r = change(SALES, req("관심을 목표로", item("nowon", "TO_GOAL", "target_no", 1, "base_rev_no", 1, "target_year", Y + 1)));
        assertEquals(raw(r), 200, status(r));
        long id = json(r).path("request").path("req_id").asLong();
        MvcResult d = decide(LEAD, id, "APPROVE", null);
        assertEquals(raw(d), 200, status(d));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='nowon' AND TARGET_NO=1 AND REV_NO=2"
                + " AND ACTION_CD='MOVE' AND KIND_CD='GOAL' AND TARGET_YEAR=? AND APPROVAL_REQ_ID=?", Y + 1, id));
    }

    @Test public void 일괄_5종_상신은_결재를_만들고_목표_표는_그대로() throws Exception {
        baseSeed();
        int before = count("SELECT COUNT(*) FROM INST_BID_TARGET");
        MvcResult r = change(SALES, fiveOps("올해 전략 조정"));
        assertEquals(raw(r), 200, status(r));
        JsonNode j = json(r);
        assertEquals("APPROVAL", j.path("mode").asText());
        assertEquals("TARGET_CHANGE", j.path("request").path("req_type").asText());
        assertEquals(LEAD, j.path("request").path("steps").get(0).path("approver_emp_no").asText());
        assertEquals("올해 전략 조정", j.path("request").path("payload").path("reason").asText());
        assertFalse(j.path("request").path("payload").toString().contains("memo"));
        assertEquals(5, j.path("request").path("target_items").size());
        assertEquals(before, count("SELECT COUNT(*) FROM INST_BID_TARGET"));
        assertEquals(5, count("SELECT COUNT(*) FROM INST_BID_TARGET_REQ_ITEM WHERE REQUESTER_NAME='김영업'"));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET_REQ_ACT WHERE ACT_CD='SUBMIT' AND SCREEN_ID='bid_board'"
                + " AND BUTTON_ID='submit_target_change' AND UI_VALID=1 AND ACTOR_EMP_NO=?", SALES));
        assertEquals("bid-target change mode=approval n=5 req=" + j.path("request").path("req_id").asLong(),
                jdbc.queryForList("SELECT DETAIL FROM ACCESS_LOG WHERE EVENT_TYPE='API' AND HTTP_METHOD='POST' ORDER BY LOG_ID DESC", String.class).get(0));
    }

    @Test @SuppressWarnings("unchecked")
    public void 입력_오류는_400_422_409_404이고_요청_행이_남지_않는다() throws Exception {
        baseSeed();
        final int Y = y();
        assertEquals(400, status(change(SALES, req("사유"))));   // 0개
        List<Map<String, Object>> many = new ArrayList<Map<String, Object>>();
        for (int i = 0; i < 21; i++) many.add(item("jongno", "ADD", "tag_cd", "NEW"));
        assertEquals(400, status(change(SALES, req("사유", many.toArray(new Map[0])))));
        MvcResult dup = change(SALES, req("사유", item("jongno", "ADD", "tag_cd", "NEW"), item("jongno", "ADD", "tag_cd", "NEW")));
        assertEquals(400, status(dup)); assertEquals(2, json(dup).path("detail").path("item_no").asInt());
        assertEquals(400, status(change(SALES, req("사유", item("jongno", "XX")))));
        assertEquals(400, status(change(SALES, req("사유", item("jongno", "ADD", "target_no", 1)))));
        assertEquals(400, status(change(SALES, req("사유", item("jung", "CANCEL", "target_no", 1, "base_rev_no", 1, "tag_cd", "NEW")))));
        assertEquals(400, status(change(SALES, req("사유", item("jung", "TO_WATCH", "target_no", 1, "base_rev_no", 1, "target_year", Y)))));
        assertEquals(400, status(change(SALES, req(null, item("jongno", "ADD", "tag_cd", "NEW")))));   // 사유 없음
        MvcResult pii = change(SALES, req("전화 010-1234-5678", item("jongno", "ADD", "tag_cd", "NEW")));
        assertEquals(422, status(pii)); assertFalse(raw(pii).contains("1234-5678"));
        assertEquals(400, status(change(SALES, req("사유", item("jung", "EDIT", "target_no", 1, "base_rev_no", 1, "target_year", Y, "tag_cd", "NEW")))));   // 바뀐 내용 없음
        assertEquals(404, status(change(SALES, req("사유", item("zzz", "ADD", "tag_cd", "NEW")))));
        MvcResult stale = change(SALES, req("사유", item("jung", "EDIT", "target_no", 1, "base_rev_no", 9, "target_year", Y, "tag_cd", "RETAIN")));
        assertEquals(409, status(stale)); assertEquals("STALE", json(stale).path("detail").path("code").asText());
        assertEquals(0, count("SELECT COUNT(*) FROM INST_BID_TARGET_REQ_ITEM"));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_BID_TARGET_REQ_ACT"));
        assertEquals(0, count("SELECT COUNT(*) FROM APPROVAL_REQUEST WHERE REQ_TYPE='TARGET_CHANGE'"));
    }

    @Test public void 결재_중인_기관은_모든_쓰기가_409_CHANGE_PENDING() throws Exception {
        baseSeed();
        userPerm(HEAD, "map", 1, 1);
        submitFive();
        MvcResult again = change(SALES, req("또", item("jung", "CANCEL", "target_no", 1, "base_rev_no", 1, "cancel_reason_cd", "WRONG")));
        assertEquals(409, status(again)); assertEquals("CHANGE_PENDING", json(again).path("detail").path("code").asText());
        Map<String, Object> watchEdit = new LinkedHashMap<String, Object>();
        watchEdit.put("target_no", 1); watchEdit.put("base_rev_no", 1); watchEdit.put("kind_cd", "WATCH"); watchEdit.put("tag_cd", "RETAIN");
        MvcResult w = send(SALES, "/institutions/nowon/bid-targets", "bid_board", "edit_bid_target", watchEdit);
        assertEquals(409, status(w)); assertEquals("CHANGE_PENDING", json(w).path("detail").path("code").asText());
        Map<String, Object> goalEdit = new LinkedHashMap<String, Object>();
        goalEdit.put("target_no", 1); goalEdit.put("base_rev_no", 1); goalEdit.put("target_year", y()); goalEdit.put("tag_cd", "RETAIN");
        assertEquals(409, status(send(HEAD, "/institutions/jung/bid-targets", "bid_board", "edit_bid_target", goalEdit)));
        JsonNode sales = null, designer = null;
        for (JsonNode it : json(getAs(SALES, "/bid-targets")).path("items")) if ("jung".equals(it.path("institution_id").asText())) sales = it;
        for (JsonNode it : json(getAs(DESIGNER, "/bid-targets")).path("items")) if ("jung".equals(it.path("institution_id").asText())) designer = it;
        assertTrue(sales.path("change_pending").asBoolean());
        assertEquals("김영업", sales.path("change_pending_info").path("requested_by_name").asText());
        assertTrue(designer.path("change_pending").asBoolean());
        assertFalse(designer.has("change_pending_info"));
    }

    @Test public void 영업팀장_승인은_5건_반영_감사_잠금_풀림() throws Exception {
        baseSeed();
        long id = submitFive();
        MvcResult d = decide(LEAD, id, "APPROVE", null);
        assertEquals(raw(d), 200, status(d));
        assertEquals("APPROVED", json(d).path("status").asText());
        assertEquals("목표 기관 변경 반영: 5건", json(d).path("result_note").asText());
        assertEquals(5, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE APPROVAL_REQ_ID=? AND EDITOR_EMP_NO=? AND SCREEN_ID='approvals_inbox'", id, LEAD));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET_REQ_ACT WHERE REQ_ID=? AND ACT_CD='APPROVE' AND ACTOR_BASIS='LINE'", id));
        JsonNode h = json(getAs(SALES, "/institutions/jongno/bid-targets/history")).path("items").get(0);
        assertEquals("김영업", h.path("requested_by_name").asText());
        assertEquals(0, count("SELECT COUNT(*) FROM INST_BID_TARGET_REQ_ITEM x JOIN APPROVAL_REQUEST r ON r.REQ_ID=x.REQ_ID WHERE r.STATUS='PENDING'"));
    }

    @Test public void 승인_전_기록이_바뀌면_409_ITEM_CHANGED_하나도_반영_안_됨() throws Exception {
        baseSeed();
        long id = submitFive();
        target("jung", 1, 2, "SAVE", "GOAL", y(), null);   // 결재 중에 끼어든 REV
        MvcResult d = decide(LEAD, id, "APPROVE", null);
        assertEquals(409, status(d));
        assertEquals("ITEM_CHANGED", json(d).path("detail").path("code").asText());
        assertTrue(json(d).path("detail").has("item_no"));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE APPROVAL_REQ_ID IS NOT NULL"));
        assertEquals("PENDING", jdbc.queryForObject("SELECT STATUS FROM APPROVAL_REQUEST WHERE REQ_ID=?", String.class, id));
    }

    @Test public void 요청자가_비활성이면_409_REQUESTER_INACTIVE() throws Exception {
        baseSeed();
        long id = submitFive();
        jdbc.update("UPDATE USERS SET STATUS='RETIRED' WHERE EMP_NO=?", SALES);
        MvcResult d = decide(LEAD, id, "APPROVE", null);
        assertEquals(409, status(d));
        assertEquals("REQUESTER_INACTIVE", json(d).path("detail").path("code").asText());
    }

    @Test public void 팀장_상신은_영업부장_결재_부장은_바로_반영() throws Exception {
        userPerm(HEAD, "map", 1, 1);
        final int Y = y();
        MvcResult r = change(LEAD, req("팀장 요청", item("jongno", "ADD", "tag_cd", "NEW", "target_year", Y)));
        assertEquals(raw(r), 200, status(r));
        long id = json(r).path("request").path("req_id").asLong();
        assertEquals(HEAD, json(r).path("request").path("steps").get(0).path("approver_emp_no").asText());
        assertEquals(403, status(decide(LEAD2, id, "APPROVE", null)));
        assertEquals(200, status(decide(HEAD, id, "APPROVE", null)));
        MvcResult direct = change(HEAD, req(null, item("jung", "ADD", "tag_cd", "NEW", "target_year", Y)));
        assertEquals(raw(direct), 200, status(direct));
        assertEquals("DIRECT", json(direct).path("mode").asText());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jung' AND BUTTON_ID='submit_target_change' AND EDITOR_EMP_NO=?", HEAD));
        assertEquals(1, count("SELECT COUNT(*) FROM APPROVAL_REQUEST WHERE REQ_TYPE='TARGET_CHANGE'"));   // 부장 바로 반영은 요청을 만들지 않는다
    }

    @Test public void 전산_관리자는_목표_변경_요청을_취소할_수_없다() throws Exception {
        baseSeed();
        long id = submitFive();
        assertEquals(403, status(cancelReq(IT, id)));
        assertEquals("PENDING", jdbc.queryForObject("SELECT STATUS FROM APPROVAL_REQUEST WHERE REQ_ID=?", String.class, id));
    }

    @Test public void 결재선_밖_영업부장은_반려와_취소만_할_수_있다() throws Exception {
        final int Y = y();
        target("mapo", 1, 1, "SAVE", "GOAL", Y, null);
        MvcResult r1 = change(SALES, req("보류 시험", item("jongno", "ADD", "tag_cd", "NEW", "target_year", Y)));
        long id1 = json(r1).path("request").path("req_id").asLong();
        MvcResult r2 = change(SALES, req("취소 시험", item("mapo", "ADD", "tag_cd", "NEW", "target_year", Y + 1)));
        long id2 = json(r2).path("request").path("req_id").asLong();
        boolean inInbox = false;
        for (JsonNode it : json(getAs(HEAD2, "/approval-requests?box=inbox")).path("items")) if (it.path("req_id").asLong() == id1) inInbox = true;
        assertTrue(inInbox);
        assertEquals(403, status(decide(HEAD2, id2, "APPROVE", null)));
        MvcResult rej = decide(HEAD2, id1, "REJECT", "보류");
        assertEquals(raw(rej), 200, status(rej));
        assertEquals("REJECTED", json(rej).path("status").asText());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET_REQ_ACT WHERE REQ_ID=? AND ACT_CD='REJECT' AND ACTOR_BASIS='HEAD' AND ACTOR_EMP_NO=?", id1, HEAD2));
        MvcResult c = cancelReq(HEAD2, id2);
        assertEquals(raw(c), 200, status(c));
        assertEquals("영업부장이 취소", json(c).path("result_note").asText());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET_REQ_ACT WHERE REQ_ID=? AND ACT_CD='CANCEL' AND ACTOR_BASIS='HEAD'", id2));
        // 반려·취소 뒤 같은 기관 다시 요청
        assertEquals(200, status(change(SALES, req("다시", item("jongno", "ADD", "tag_cd", "NEW", "target_year", Y)))));
    }

    @Test public void 요청자_본인_취소는_REQUESTER_근거() throws Exception {
        baseSeed();
        long id = submitFive();
        assertEquals(200, status(cancelReq(SALES, id)));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET_REQ_ACT WHERE REQ_ID=? AND ACT_CD='CANCEL' AND ACTOR_BASIS='REQUESTER'", id));
    }

    @Test public void 자동_이월과_자동_취소() throws Exception {
        final int Y = y();
        target("jongno", 1, 1, "SAVE", "GOAL", Y - 1, null);
        target("jung", 1, 1, "SAVE", "GOAL", Y - 1, null);
        line("jung", 1, "B02", Y + "-01-01");
        target("mapo", 1, 1, "SAVE", "GOAL", Y - 1, null);
        line("mapo", 1, "B03", Y + "-01-01");
        target("nowon", 1, 1, "SAVE", "GOAL", Y - 1, null);
        target("nowon", 2, 1, "SAVE", "WATCH", null, null);
        assertEquals(2, json(getAs(SALES, "/bid-targets")).path("carry_due").asInt());
        assertEquals(0, json(getAs(DESIGNER, "/bid-targets")).path("carry_due").asInt());
        MvcResult c = send(SALES, "/bid-targets/carry", "bid_board", "carry_targets", null);
        assertEquals(raw(c), 200, status(c));
        assertEquals(2, json(c).path("carried").asInt()); assertEquals(0, json(c).path("revoked").asInt());
        assertEquals("bid-target carry carried=2 revoked=0 skipped=0",
                jdbc.queryForList("SELECT DETAIL FROM ACCESS_LOG WHERE EVENT_TYPE='API' AND HTTP_METHOD='POST' ORDER BY LOG_ID DESC", String.class).get(0));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jongno' AND TARGET_NO=2 AND REV_NO=1 AND ACTION_CD='CARRY'"
                + " AND KIND_CD='GOAL' AND TARGET_YEAR=? AND CARRY_FROM_NO=1 AND CARRY_BASIS_CD='UNREGISTERED' AND BUTTON_ID='carry_targets'", Y));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='mapo' AND TARGET_NO=2 AND KIND_CD='WATCH'"
                + " AND TARGET_YEAR IS NULL AND ACTION_CD='CARRY' AND CARRY_BASIS_CD='FAIL'"));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID IN ('jung') AND TARGET_NO=2"));
        boolean carried = false;
        for (JsonNode it : json(getAs(SALES, "/bid-targets")).path("items")) {
            if ("jongno".equals(it.path("institution_id").asText())) carried = it.path("carried").asBoolean();
        }
        assertTrue(carried);
        MvcResult again = send(SALES, "/bid-targets/carry", "bid_board", "carry_targets", null);
        assertEquals(0, json(again).path("carried").asInt());
        // 판정이 바뀌면(국민은행 약정 등록) 손 안 탄 이월을 거둔다
        line("jongno", 1, "B02", Y + "-01-01");
        assertEquals(1, json(getAs(SALES, "/bid-targets")).path("carry_due").asInt());
        MvcResult rv = send(SALES, "/bid-targets/carry", "bid_board", "carry_targets", null);
        assertEquals(1, json(rv).path("revoked").asInt()); assertEquals(0, json(rv).path("carried").asInt());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jongno' AND TARGET_NO=2 AND REV_NO=2"
                + " AND ACTION_CD='CANCEL' AND CANCEL_REASON_CD='CARRY_REVOKED'"));
        assertEquals(0, json(getAs(SALES, "/bid-targets")).path("carry_due").asInt());
    }

    @Test public void 결재_중인_기관은_이월을_건너뛴다() throws Exception {
        final int Y = y();
        target("jongno", 1, 1, "SAVE", "GOAL", Y - 1, null);
        target("jung", 1, 1, "SAVE", "GOAL", Y, null);
        MvcResult r = change(SALES, req("대기", item("jongno", "CANCEL", "target_no", 1, "base_rev_no", 1, "cancel_reason_cd", "DROPPED")));
        assertEquals(raw(r), 200, status(r));
        assertEquals(0, json(getAs(SALES, "/bid-targets")).path("carry_due").asInt());
        MvcResult c = send(SALES, "/bid-targets/carry", "bid_board", "carry_targets", null);
        assertEquals(0, json(c).path("carried").asInt());
    }

    @Test public void 이월을_끄면_409_CARRY_DISABLED_디자이너는_403() throws Exception {
        settings.setCarryEnabled(false);
        MvcResult c = send(SALES, "/bid-targets/carry", "bid_board", "carry_targets", null);
        assertEquals(409, status(c)); assertEquals("CARRY_DISABLED", json(c).path("detail").path("code").asText());
        assertEquals(403, status(send(DESIGNER, "/bid-targets/carry", "bid_board", "carry_targets", null)));
    }

    @Test public void 결재_스위치를_끄면_영업팀원도_바로_쓴다() throws Exception {
        settings.setApprovalRequired(false);
        Map<String, Object> goal = new LinkedHashMap<String, Object>();
        goal.put("target_year", y()); goal.put("tag_cd", "NEW");
        assertEquals(201, status(send(SALES, "/institutions/jongno/bid-targets", "bid_board", "add_bid_target", goal)));
    }

    @Test public void 협약_개시일_저장_검증_판정_기준일() throws Exception {
        final int Y = y();
        final String D = Y + "-03-01";
        target("jongno", 1, 1, "SAVE", "GOAL", Y - 1, null);
        Map<String, Object> b = new LinkedHashMap<String, Object>();
        b.put("target_year", Y - 1); b.put("term_start", D); b.put("base_rev_no", 0);
        MvcResult r = send(SALES, "/institutions/jongno/bid-terms", "bid_board", "set_term_start", b);
        assertEquals(raw(r), 201, status(r));
        assertEquals("bid-target term rev=1", jdbc.queryForList("SELECT DETAIL FROM ACCESS_LOG WHERE EVENT_TYPE='API' AND HTTP_METHOD='POST' ORDER BY LOG_ID DESC", String.class).get(0));
        // 개시일 전이면 보류, 뒤이면 약정 없음 = 미달성 이월 후보
        boolean due = !LocalDate.parse(Times.todayKst()).isBefore(LocalDate.parse(D));
        assertEquals(due ? 1 : 0, json(getAs(SALES, "/bid-targets")).path("carry_due").asInt());
        // 같은 날 시작 국민은행 약정 = 그 목표 연도 달성 → 이월 없음
        line("jongno", 1, "B02", D);
        assertEquals(0, json(getAs(SALES, "/bid-targets")).path("carry_due").asInt());
        MvcResult list = getAs(DESIGNER, "/bid-targets?year=" + (Y - 1));
        JsonNode it = json(list).path("items").get(0);
        assertEquals(D, it.path("term_start").asText());
        assertEquals(D, it.path("judge_from").asText());
        assertFalse(it.path("judge_from_assumed").asBoolean());
        assertFalse(raw(list).contains(SALES));
        // 검증
        b.put("term_start", "2030/03/01");
        assertEquals(400, status(send(SALES, "/institutions/jongno/bid-terms", "bid_board", "set_term_start", b)));
        b.put("term_start", (Y + 1) + "-01-01"); b.put("base_rev_no", 1);
        assertEquals(400, status(send(SALES, "/institutions/jongno/bid-terms", "bid_board", "set_term_start", b)));
        b.put("term_start", D); b.put("base_rev_no", 5);
        MvcResult stale = send(SALES, "/institutions/jongno/bid-terms", "bid_board", "set_term_start", b);
        assertEquals(409, status(stale)); assertEquals("STALE", json(stale).path("detail").path("code").asText());
        b.put("base_rev_no", 1);
        MvcResult same = send(SALES, "/institutions/jongno/bid-terms", "bid_board", "set_term_start", b);
        assertEquals(200, status(same)); assertEquals("NO_CHANGE", json(same).path("code").asText());
        b.put("term_start", "");
        assertEquals(201, status(send(SALES, "/institutions/jongno/bid-terms", "bid_board", "set_term_start", b)));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TERM WHERE INSTITUTION_ID='jongno' AND REV_NO=2 AND ACTION_CD='CANCEL' AND TERM_START IS NULL"));
        assertEquals(403, status(send(DESIGNER, "/institutions/jongno/bid-terms", "bid_board", "set_term_start", b)));
        Map<String, Object> noYear = new LinkedHashMap<String, Object>();
        noYear.put("term_start", D);
        assertEquals(400, status(send(SALES, "/institutions/jongno/bid-terms", "bid_board", "set_term_start", noYear)));
    }

    @Test public void 일괄_본문_40KB는_413() throws Exception {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 40000; i++) sb.append('가');
        MvcResult r = change(SALES, req(sb.toString(), item("jongno", "ADD", "tag_cd", "NEW")));
        assertEquals(413, status(r));
        assertEquals("BODY_TOO_LARGE", json(r).path("detail").path("code").asText());
    }
}
