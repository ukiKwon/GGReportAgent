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

    @Before public void 스위치_켬() {   // 코드 기본값은 둘 다 true — 이 시험은 켠 상태가 바탕(명시)
        settings.setApprovalRequired(true);
        settings.setCarryEnabled(true);
    }
    @After public void 설정_복구() {
        settings.setApprovalRequired(true);
        settings.setCarryEnabled(true);
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
                + " CANCEL_REASON_CD, CANCEL_REASON_ETC, EDITOR_EMP_NO, EDITOR_NAME, EMP_VERIFIED, SCREEN_ID, BUTTON_ID, UI_VALID, SAVED_AT, WATCH_EMP_NO)"
                + " VALUES (?,?,?,?,?,?,'NEW',NULL,NULL,NULL,?,NULL,'3918264','김영업',0,'bid_board','seed',1,'2026-11-18T00:00:00+09:00',?)",
                inst, no, rev, action, kind, year, reason, "WATCH".equals(kind) ? SALES : null);   // 061 — 관심 행은 주인 필수(시험 관심 = 김영업 것)
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

    private MvcResult confirmPrep(String emp, String inst) throws Exception {
        Map<String, Object> m = new LinkedHashMap<String, Object>(); m.put("institution_id", inst);
        return send(emp, "/preps", "bid_board", "confirm", m);
    }
    private static boolean hasInst(JsonNode arr, String inst) {
        for (JsonNode n : arr) if (inst.equals(n.path("institution_id").asText())) return true;
        return false;
    }

    @Test public void 목표_넣기_결재_중이면_제안_확정은_409_GOAL_CHANGE_PENDING_목록_pending_goal_items에_보이고_승인되면_201() throws Exception {
        final int Y = y();
        MvcResult r1 = change(SALES, req("올해 목표로", item("jongno", "ADD", "tag_cd", "NEW", "target_year", Y)));
        assertEquals(raw(r1), 200, status(r1));
        long id = json(r1).path("request").path("req_id").asLong();
        for (String emp : new String[]{SALES, HEAD}) {   // 팀 공유 — 영업부장도 같은 목록
            JsonNode l = json(getAs(emp, "/bid-targets?year=" + Y));
            assertFalse(hasInst(l.path("items"), "jongno"));
            assertTrue(emp, hasInst(l.path("pending_goal_items"), "jongno"));
        }
        JsonNode p = json(getAs(HEAD, "/bid-targets?year=" + Y)).path("pending_goal_items").get(0);
        assertEquals(2, p.size());                        // institution_id·target_year 만(요청자·사유·번호 없음)
        assertEquals(Y, p.path("target_year").asInt());
        assertFalse(hasInst(json(getAs(SALES, "/bid-targets?year=" + (Y + 1))).path("pending_goal_items"), "jongno"));
        MvcResult c = confirmPrep(SALES, "jongno");
        assertEquals(raw(c), 409, status(c));
        assertEquals("GOAL_CHANGE_PENDING", json(c).path("detail").path("code").asText());
        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP WHERE INSTITUTION_ID='jongno'"));
        assertEquals(200, status(decide(LEAD, id, "APPROVE", null)));
        assertFalse(hasInst(json(getAs(SALES, "/bid-targets?year=" + Y)).path("pending_goal_items"), "jongno"));
        assertEquals(201, status(confirmPrep(SALES, "jongno")));
    }

    @Test public void 올해_목표에_빼기_결재가_걸리면_GOAL_CHANGE_PENDING_관심_목표_옮기기_결재도_같고_내년_넣기만_있으면_NOT_GOAL_TARGET() throws Exception {
        final int Y = y();
        target("jung", 1, 1, "SAVE", "GOAL", Y, null);
        assertEquals(200, status(change(SALES, req("뺌", item("jung", "CANCEL", "target_no", 1, "base_rev_no", 1, "cancel_reason_cd", "DROPPED")))));
        MvcResult a = confirmPrep(SALES, "jung");
        assertEquals(409, status(a)); assertEquals("GOAL_CHANGE_PENDING", json(a).path("detail").path("code").asText());
        target("jongno", 1, 1, "SAVE", "WATCH", null, null);   // 김영업 관심(061 — 주인 = SALES)
        assertEquals(200, status(change(SALES, req("목표로", item("jongno", "TO_GOAL", "target_no", 1, "base_rev_no", 1, "target_year", Y)))));
        assertTrue(hasInst(json(getAs(SALES, "/bid-targets?year=" + Y)).path("pending_goal_items"), "jongno"));
        MvcResult b = confirmPrep(SALES, "jongno");
        assertEquals(409, status(b)); assertEquals("GOAL_CHANGE_PENDING", json(b).path("detail").path("code").asText());
        assertEquals(200, status(change(SALES, req("내년", item("mapo", "ADD", "tag_cd", "NEW", "target_year", Y + 1)))));
        MvcResult c = confirmPrep(SALES, "mapo");
        assertEquals(409, status(c)); assertEquals("NOT_GOAL_TARGET", json(c).path("detail").path("code").asText());
    }

    @Test public void 영업부장이_바로_넣은_올해_목표는_곧바로_제안_확정된다() throws Exception {
        MvcResult r = change(HEAD, req(null, item("jongno", "ADD", "tag_cd", "NEW", "target_year", y())));
        assertEquals(raw(r), 200, status(r));
        assertEquals("DIRECT", json(r).path("mode").asText());
        assertEquals(201, status(confirmPrep(SALES, "jongno")));
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

    @Test public void 태그_REGAIN_ADD_EDIT_승인은_반영_모르는_태그는_400() throws Exception {
        baseSeed();
        final int Y = y();
        assertEquals(400, status(change(SALES, req("사유", item("jongno", "ADD", "tag_cd", "ZZ", "target_year", Y)))));
        MvcResult r = change(SALES, req("되찾기 도전",
                item("jongno", "ADD", "tag_cd", "REGAIN", "target_year", Y),
                item("jung", "EDIT", "target_no", 1, "base_rev_no", 1, "target_year", Y, "tag_cd", "REGAIN")));
        assertEquals(raw(r), 200, status(r));
        long id = json(r).path("request").path("req_id").asLong();
        MvcResult d = decide(LEAD, id, "APPROVE", null);
        assertEquals(raw(d), 200, status(d));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jongno' AND TAG_CD='REGAIN'"));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jung' AND REV_NO=2 AND TAG_CD='REGAIN'"));
    }

    // ---- NEXT 114 — 구분·메모만 고치기는 결재 없이 ----

    private Map<String, Object> single(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("target_no", 1); m.put("base_rev_no", 1);
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    @Test public void 구분만_단건은_결재_없이_201_VALUE_EDIT_이력_남김() throws Exception {
        baseSeed();
        MvcResult r = send(SALES, "/institutions/jung/bid-targets", "bid_board", "change_target_tag", single("target_year", y(), "tag_cd", "RETAIN"));
        assertEquals(raw(r), 201, status(r));
        assertEquals("DIRECT", json(r).path("mode").asText());
        assertEquals("VALUE_EDIT", json(r).path("direct_basis").asText());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jung' AND TARGET_NO=1 AND REV_NO=2 AND TAG_CD='RETAIN'"
                + " AND EDITOR_EMP_NO=? AND BUTTON_ID='change_target_tag' AND UI_VALID=1 AND APPROVAL_REQ_ID IS NULL", SALES));
        assertEquals(0, count("SELECT COUNT(*) FROM APPROVAL_REQUEST"));
        assertEquals("bid-target save no=1 rev=2 basis=value",
                jdbc.queryForList("SELECT DETAIL FROM ACCESS_LOG WHERE EVENT_TYPE='API' AND HTTP_METHOD='POST' ORDER BY LOG_ID DESC", String.class).get(0));
    }

    @Test public void 메모만_단건은_결재_없이_201_수정자_이름_남김() throws Exception {
        baseSeed();
        MvcResult r = send(SALES, "/institutions/jung/bid-targets", "bid_board", "edit_bid_target", single("target_year", y(), "tag_cd", "NEW", "memo", "설명회 참석"));
        assertEquals(raw(r), 201, status(r));
        assertEquals("VALUE_EDIT", json(r).path("direct_basis").asText());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jung' AND REV_NO=2 AND MEMO='설명회 참석'"
                + " AND EDITOR_NAME='김영업' AND APPROVAL_REQ_ID IS NULL"));
    }

    @Test public void 연도_또는_주_담당_변경_단건은_403_APPROVAL_REQUIRED() throws Exception {
        baseSeed();
        MvcResult a = send(SALES, "/institutions/jung/bid-targets", "bid_board", "edit_bid_target", single("target_year", y() + 1, "tag_cd", "NEW"));
        assertEquals(raw(a), 403, status(a));
        assertEquals("APPROVAL_REQUIRED", json(a).path("detail").path("code").asText());
        MvcResult b = send(SALES, "/institutions/jung/bid-targets", "bid_board", "edit_bid_target", single("target_year", y(), "tag_cd", "NEW", "owner_emp_no", LEAD));
        assertEquals(raw(b), 403, status(b));
        assertEquals("APPROVAL_REQUIRED", json(b).path("detail").path("code").asText());
        assertEquals(0, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jung' AND REV_NO=2"));
        assertTrue(count("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE='DENIED' AND EMP_NO=? AND REQ_PATH=?", SALES, "/institutions/jung/bid-targets") >= 1);
    }

    @Test public void 지난해_목표_구분_고치기는_403_APPROVAL_REQUIRED() throws Exception {
        baseSeed();
        jdbc.update("UPDATE INST_BID_TARGET SET TARGET_YEAR=? WHERE INSTITUTION_ID='jung' AND TARGET_NO=1", y() - 1);   // 시드를 지난해 목표로
        MvcResult r = send(SALES, "/institutions/jung/bid-targets", "bid_board", "change_target_tag", single("target_year", y() - 1, "tag_cd", "RETAIN"));
        assertEquals(raw(r), 403, status(r));
        assertEquals("APPROVAL_REQUIRED", json(r).path("detail").path("code").asText());
        assertEquals(0, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jung' AND REV_NO=2"));
    }

    @Test public void 결재_중이면_구분_고치기도_409_CHANGE_PENDING_단건_일괄_모두() throws Exception {
        baseSeed();
        submitFive();
        MvcResult s = send(SALES, "/institutions/jung/bid-targets", "bid_board", "change_target_tag", single("target_year", y(), "tag_cd", "REGAIN"));
        assertEquals(409, status(s)); assertEquals("CHANGE_PENDING", json(s).path("detail").path("code").asText());
        MvcResult b = send(SALES, "/bid-targets/changes", "bid_board", "save_target_values",
                req(null, item("jung", "EDIT", "target_no", 1, "base_rev_no", 1, "target_year", y(), "tag_cd", "REGAIN")));
        assertEquals(409, status(b)); assertEquals("CHANGE_PENDING", json(b).path("detail").path("code").asText());
        assertEquals(1, json(b).path("detail").path("item_no").asInt());
    }

    @Test public void 일괄_구분_메모만은_사유_없이_바로_save_target_values() throws Exception {
        baseSeed();
        final int Y = y();
        MvcResult r = send(SALES, "/bid-targets/changes", "bid_board", "save_target_values",
                req(null, item("jung", "EDIT", "target_no", 1, "base_rev_no", 1, "target_year", Y, "tag_cd", "RETAIN"),
                        item("jungnang", "EDIT", "target_no", 1, "base_rev_no", 1, "target_year", Y, "tag_cd", "NEW", "memo", "메모")));
        assertEquals(raw(r), 200, status(r));
        assertEquals("DIRECT", json(r).path("mode").asText());
        assertEquals("VALUE_EDIT", json(r).path("direct_basis").asText());
        assertEquals(2, json(r).path("applied").asInt());
        assertEquals(0, count("SELECT COUNT(*) FROM APPROVAL_REQUEST WHERE REQ_TYPE='TARGET_CHANGE'"));
        assertEquals(2, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE REV_NO=2 AND BUTTON_ID='save_target_values' AND UI_VALID=1 AND APPROVAL_REQ_ID IS NULL"));
        assertEquals("bid-target change mode=direct n=2 basis=value",
                jdbc.queryForList("SELECT DETAIL FROM ACCESS_LOG WHERE EVENT_TYPE='API' AND HTTP_METHOD='POST' ORDER BY LOG_ID DESC", String.class).get(0));
    }

    @Test public void 일괄_섞임은_사유_없으면_400_있으면_결재() throws Exception {
        baseSeed();
        final int Y = y();
        Map<String, Object> e = item("jung", "EDIT", "target_no", 1, "base_rev_no", 1, "target_year", Y, "tag_cd", "RETAIN");
        Map<String, Object> c = item("jungnang", "CANCEL", "target_no", 1, "base_rev_no", 1, "cancel_reason_cd", "DROPPED");
        assertEquals(400, status(change(SALES, req(null, e, c))));
        assertEquals(0, count("SELECT COUNT(*) FROM APPROVAL_REQUEST WHERE REQ_TYPE='TARGET_CHANGE'"));
        MvcResult r = change(SALES, req("정리", e, c));
        assertEquals(raw(r), 200, status(r));
        assertEquals("APPROVAL", json(r).path("mode").asText());
    }

    @Test public void 일괄_연도_변경_EDIT는_사유_없으면_400() throws Exception {
        baseSeed();
        MvcResult r = change(SALES, req(null, item("jung", "EDIT", "target_no", 1, "base_rev_no", 1, "target_year", y() + 1, "tag_cd", "NEW")));
        assertEquals(raw(r), 400, status(r));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE REV_NO=2"));
    }

    // ---- NEXT 114 · 063 — '금고 방식'(TARGET_AIM_RANK) : 고르기·바꾸기·지우기는 구분처럼 결재 없이 바로 + REV 이력 ----

    private static final String AIM_BTN = "set_target_aim_rank";
    private MvcResult aimSingle(String emp, String inst, Object... kv) throws Exception {
        return send(emp, "/institutions/" + inst + "/bid-targets", "bid_board", AIM_BTN, single(kv));
    }
    private String lastPostDetail() {
        return jdbc.queryForList("SELECT DETAIL FROM ACCESS_LOG WHERE EVENT_TYPE='API' AND HTTP_METHOD='POST' ORDER BY LOG_ID DESC", String.class).get(0);
    }

    @Test public void 금고_방식_고르기_바꾸기_지우기는_결재_없이_201_이력과_접근기록에는_종류만() throws Exception {
        baseSeed();
        final int Y = y();
        MvcResult r1 = aimSingle(SALES, "jung", "target_year", Y, "tag_cd", "NEW", "aim_rank_cd", "FIRST");
        assertEquals(raw(r1), 201, status(r1));
        assertEquals("VALUE_EDIT", json(r1).path("direct_basis").asText());
        assertEquals("FIRST", json(r1).path("aim_edit").asText());
        assertEquals("1금고", json(r1).path("item").path("aim_rank_name").asText());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jung' AND TARGET_NO=1 AND REV_NO=2 AND AIM_RANK_CD='FIRST'"
                + " AND BUTTON_ID='set_target_aim_rank' AND UI_VALID=1 AND APPROVAL_REQ_ID IS NULL AND EDITOR_EMP_NO=?", SALES));
        assertEquals(0, count("SELECT COUNT(*) FROM APPROVAL_REQUEST"));
        assertEquals("bid-target save no=1 rev=2 basis=value aim=first", lastPostDetail());
        MvcResult r2 = aimSingle(SALES, "jung", "base_rev_no", 2, "target_year", Y, "tag_cd", "NEW", "aim_rank_cd", "SECOND");   // 바꾸기
        assertEquals(raw(r2), 201, status(r2));
        assertEquals("bid-target save no=1 rev=3 basis=value aim=change", lastPostDetail());
        MvcResult r3 = aimSingle(SALES, "jung", "base_rev_no", 3, "target_year", Y, "tag_cd", "NEW", "aim_rank_cd", "");            // 지우기
        assertEquals(raw(r3), 201, status(r3));
        assertEquals("bid-target save no=1 rev=4 basis=value aim=clear", lastPostDetail());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jung' AND REV_NO=4 AND AIM_RANK_CD IS NULL"));
        assertEquals(0, count("SELECT COUNT(*) FROM APPROVAL_REQUEST"));
        assertEquals(400, status(aimSingle(SALES, "jung", "base_rev_no", 4, "target_year", Y, "tag_cd", "NEW", "aim_rank_cd", "THIRD")));   // 코드표 밖
    }

    @Test public void 일괄_금고_방식도_사유_없이_바로_set_target_aim_rank() throws Exception {
        baseSeed();
        MvcResult r = send(SALES, "/bid-targets/changes", "bid_board", AIM_BTN,
                req(null, item("jung", "EDIT", "target_no", 1, "base_rev_no", 1, "target_year", y(), "tag_cd", "NEW", "aim_rank_cd", "SINGLE")));
        assertEquals(raw(r), 200, status(r));
        assertEquals("DIRECT", json(r).path("mode").asText());
        assertEquals("VALUE_EDIT", json(r).path("direct_basis").asText());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jung' AND REV_NO=2 AND AIM_RANK_CD='SINGLE'"
                + " AND BUTTON_ID='set_target_aim_rank' AND UI_VALID=1 AND APPROVAL_REQ_ID IS NULL"));
        assertEquals(0, count("SELECT COUNT(*) FROM APPROVAL_REQUEST WHERE REQ_TYPE='TARGET_CHANGE'"));
        assertEquals("bid-target change mode=direct n=1 basis=value aim=1", lastPostDetail());
    }

    @Test public void 목표로_처음_넣을_때_금고_방식이_있으면_400_단건_일괄() throws Exception {
        final int Y = y();
        Map<String, Object> b = new LinkedHashMap<String, Object>();
        b.put("target_year", Y); b.put("tag_cd", "NEW"); b.put("aim_rank_cd", "FIRST");
        MvcResult s = send(HEAD, "/institutions/jongno/bid-targets", "bid_board", "add_bid_target", b);   // 영업부장이어도(역할과 무관)
        assertEquals(raw(s), 400, status(s));
        MvcResult t = send(SALES, "/institutions/jongno/bid-targets", "bid_board", "add_bid_target", b);   // 팀원도 403 보다 400 이 먼저
        assertEquals(raw(t), 400, status(t));
        MvcResult c = change(HEAD, req("새 목표", item("jongno", "ADD", "tag_cd", "NEW", "target_year", Y, "aim_rank_cd", "FIRST")));
        assertEquals(raw(c), 400, status(c));
        assertEquals(1, json(c).path("detail").path("item_no").asInt());
        MvcResult a = change(SALES, req("새 목표", item("jongno", "ADD", "tag_cd", "NEW", "target_year", Y, "aim_rank_cd", "FIRST")));
        assertEquals(raw(a), 400, status(a));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_BID_TARGET"));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_BID_TARGET_REQ_ITEM"));
        // 빈 값("")은 '비움'이라 통과한다
        MvcResult ok = change(HEAD, req(null, item("jongno", "ADD", "tag_cd", "NEW", "target_year", Y, "aim_rank_cd", "")));
        assertEquals(raw(ok), 200, status(ok));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jongno' AND REV_NO=1 AND AIM_RANK_CD IS NULL"));
    }

    @Test public void 목표로_넣을_때_구분을_비우면_NULL_영업부장_바로_일괄_결재_승인_모두() throws Exception {
        final int Y = y();
        MvcResult h = change(HEAD, req(null, item("jongno", "ADD", "target_year", Y)));   // 영업부장 바로 — 구분 없음
        assertEquals(raw(h), 200, status(h));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jongno' AND REV_NO=1 AND TAG_CD IS NULL"));
        MvcResult r = change(SALES, req("새 목표", item("jung", "ADD", "target_year", Y, "tag_cd", "")));   // 팀원 결재 — 빈 값도 구분 없음
        assertEquals(raw(r), 200, status(r));
        assertEquals("APPROVAL", json(r).path("mode").asText());
        long id = json(r).path("request").path("req_id").asLong();
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET_REQ_ITEM WHERE REQ_ID=? AND TAG_CD IS NULL AND AIM_RANK_CD IS NULL", id));
        assertTrue(json(r).path("request").path("target_items").get(0).path("tag_name").isNull());
        MvcResult d = decide(LEAD, id, "APPROVE", null);
        assertEquals(raw(d), 200, status(d));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jung' AND REV_NO=1 AND TAG_CD IS NULL AND APPROVAL_REQ_ID=?", id));
        JsonNode items = json(getAs(SALES, "/bid-targets")).path("items");
        boolean found = false;
        for (JsonNode n : items) if ("jung".equals(n.path("institution_id").asText())) { found = true; assertTrue(n.path("tag_cd").isNull()); }
        assertTrue(found);
    }

    @Test public void 결재_EDIT_주_담당_변경을_승인해도_금고_방식은_유지() throws Exception {
        baseSeed();
        final int Y = y();
        jdbc.update("UPDATE INST_BID_TARGET SET AIM_RANK_CD='FIRST' WHERE INSTITUTION_ID='jung' AND TARGET_NO=1");
        MvcResult r = change(SALES, req("담당 변경", item("jung", "EDIT", "target_no", 1, "base_rev_no", 1, "target_year", Y, "tag_cd", "NEW", "owner_emp_no", LEAD)));
        assertEquals(raw(r), 200, status(r));
        assertEquals("APPROVAL", json(r).path("mode").asText());
        long id = json(r).path("request").path("req_id").asLong();
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET_REQ_ITEM WHERE REQ_ID=? AND AIM_RANK_CD='FIRST'", id));   // 요청 때 값이 실린다
        JsonNode card = json(r).path("request").path("target_items").get(0);
        assertEquals("1금고", card.path("before").path("aim_rank_name").asText());
        assertEquals("1금고", card.path("aim_rank_name").asText());
        MvcResult d = decide(LEAD, id, "APPROVE", null);
        assertEquals(raw(d), 200, status(d));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jung' AND REV_NO=2 AND AIM_RANK_CD='FIRST'"
                + " AND OWNER_EMP_NO=? AND APPROVAL_REQ_ID=?", LEAD, id));
    }

    @Test public void 결재_카드의_TO_WATCH_이후_금고_방식은_이전_값() throws Exception {
        baseSeed();
        jdbc.update("UPDATE INST_BID_TARGET SET AIM_RANK_CD='SECOND' WHERE INSTITUTION_ID='mapo' AND TARGET_NO=1");
        MvcResult r = change(SALES, req("관심으로", item("mapo", "TO_WATCH", "target_no", 1, "base_rev_no", 1)));
        assertEquals(raw(r), 200, status(r));
        JsonNode card = json(r).path("request").path("target_items").get(0);
        assertEquals("2금고", card.path("before").path("aim_rank_name").asText());
        assertEquals("2금고", card.path("aim_rank_name").asText());   // '이후'가 비어 보이지 않는다(실제 반영도 그대로 둠)
    }

    @Test public void 지난해_목표의_금고_방식만_고쳐도_403_APPROVAL_REQUIRED() throws Exception {
        baseSeed();
        final int Y = y();
        jdbc.update("UPDATE INST_BID_TARGET SET TARGET_YEAR=? WHERE INSTITUTION_ID='jung' AND TARGET_NO=1", Y - 1);
        MvcResult r = aimSingle(SALES, "jung", "target_year", Y - 1, "tag_cd", "NEW", "aim_rank_cd", "FIRST");
        assertEquals(raw(r), 403, status(r));
        assertEquals("APPROVAL_REQUIRED", json(r).path("detail").path("code").asText());
        assertEquals(0, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jung' AND REV_NO=2"));
        JsonNode items = json(getAs(SALES, "/bid-targets?year=" + (Y - 1))).path("items");
        assertEquals("APPROVAL", items.get(0).path("aim_mode").asText());
    }

    @Test public void 관심_줄에_금고_방식은_400_결재_중이면_409() throws Exception {
        baseSeed();
        MvcResult w = aimSingle(SALES, "nowon", "tag_cd", "NEW", "aim_rank_cd", "FIRST");
        assertEquals(raw(w), 400, status(w));
        submitFive();
        MvcResult p = aimSingle(SALES, "jung", "target_year", y(), "tag_cd", "NEW", "aim_rank_cd", "FIRST");
        assertEquals(raw(p), 409, status(p));
        assertEquals("CHANGE_PENDING", json(p).path("detail").path("code").asText());
    }

    @Test public void 메모와_금고_방식을_보내지_않으면_지금_값을_잇고_빈_문자열이면_지운다() throws Exception {
        baseSeed();
        final int Y = y();
        jdbc.update("UPDATE INST_BID_TARGET SET MEMO='옛 메모', AIM_RANK_CD='FIRST' WHERE INSTITUTION_ID='jung' AND TARGET_NO=1");
        MvcResult r = send(SALES, "/institutions/jung/bid-targets", "bid_board", "change_target_tag", single("target_year", Y, "tag_cd", "RETAIN"));
        assertEquals(raw(r), 201, status(r));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jung' AND REV_NO=2 AND TAG_CD='RETAIN' AND MEMO='옛 메모' AND AIM_RANK_CD='FIRST'"));
        MvcResult c = send(SALES, "/institutions/jung/bid-targets", "bid_board", "edit_bid_target", single("base_rev_no", 2, "target_year", Y, "tag_cd", "RETAIN", "memo", ""));
        assertEquals(raw(c), 201, status(c));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jung' AND REV_NO=3 AND MEMO IS NULL AND AIM_RANK_CD='FIRST'"));
        // 일괄도 같다
        jdbc.update("UPDATE INST_BID_TARGET SET MEMO='옛2', AIM_RANK_CD='SINGLE' WHERE INSTITUTION_ID='jungnang' AND TARGET_NO=1");
        MvcResult b = send(SALES, "/bid-targets/changes", "bid_board", "save_target_values",
                req(null, item("jungnang", "EDIT", "target_no", 1, "base_rev_no", 1, "target_year", Y, "tag_cd", "RETAIN")));
        assertEquals(raw(b), 200, status(b));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jungnang' AND REV_NO=2 AND MEMO='옛2' AND AIM_RANK_CD='SINGLE'"));
    }

    @Test public void 목록에_금고_방식_칸과_모드_코드표() throws Exception {
        baseSeed();
        JsonNode j = json(getAs(SALES, "/bid-targets"));
        JsonNode first = j.path("items").get(0);
        assertTrue(first.has("aim_rank_cd")); assertTrue(first.path("aim_rank_cd").isNull());
        assertTrue(first.path("aim_rank_name").isNull());
        assertEquals("DIRECT", first.path("aim_mode").asText());
        assertEquals(4, j.path("codes").path("aim_ranks").size());
        assertEquals("FIRST", j.path("codes").path("aim_ranks").get(0).path("code").asText());
        assertEquals("1금고", j.path("codes").path("aim_ranks").get(0).path("name").asText());
        assertEquals("주거래", j.path("codes").path("aim_ranks").get(3).path("name").asText());
        jdbc.update("UPDATE INST_BID_TARGET SET AIM_RANK_CD='SINGLE' WHERE INSTITUTION_ID='jung' AND TARGET_NO=1");
        for (JsonNode n : json(getAs(SALES, "/bid-targets")).path("items")) {
            if ("jung".equals(n.path("institution_id").asText())) assertEquals("단수금고", n.path("aim_rank_name").asText());
        }
        JsonNode d = json(getAs(DESIGNER, "/bid-targets")).path("items").get(0);
        assertTrue(d.path("aim_mode").isNull());   // 쓰기 자격 없음
    }

    @Test public void 목표를_관심으로_옮겼다_돌아와도_금고_방식을_이어받는다() throws Exception {
        baseSeed();
        final int Y = y();
        jdbc.update("UPDATE INST_BID_TARGET SET AIM_RANK_CD='MAIN_BANK' WHERE INSTITUTION_ID='jung' AND TARGET_NO=1");
        Map<String, Object> toWatch = new LinkedHashMap<String, Object>(); toWatch.put("base_rev_no", 1); toWatch.put("to_kind_cd", "WATCH");
        MvcResult w = send(HEAD, "/institutions/jung/bid-targets/1/move", "bid_board", "move_to_watch", toWatch);
        assertEquals(raw(w), 201, status(w));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jung' AND REV_NO=2 AND KIND_CD='WATCH' AND AIM_RANK_CD='MAIN_BANK'"));
        Map<String, Object> toGoal = new LinkedHashMap<String, Object>(); toGoal.put("base_rev_no", 2); toGoal.put("to_kind_cd", "GOAL"); toGoal.put("target_year", Y);
        MvcResult g = send(HEAD, "/institutions/jung/bid-targets/1/move", "bid_board", "move_to_goal", toGoal);
        assertEquals(raw(g), 201, status(g));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jung' AND REV_NO=3 AND KIND_CD='GOAL' AND AIM_RANK_CD='MAIN_BANK'"));
    }

    @Test public void 결재로_승인된_TO_WATCH_TO_GOAL도_금고_방식을_이어받는다() throws Exception {
        baseSeed();
        jdbc.update("UPDATE INST_BID_TARGET SET AIM_RANK_CD='SECOND' WHERE INSTITUTION_ID='mapo' AND TARGET_NO=1");    // 목표 → 관심
        jdbc.update("UPDATE INST_BID_TARGET SET AIM_RANK_CD='SINGLE' WHERE INSTITUTION_ID='nowon' AND TARGET_NO=1");   // 관심 → 목표(옮겨 오며 이어받은 값을 흉내)
        long id = submitFive();
        MvcResult d = decide(LEAD, id, "APPROVE", null);
        assertEquals(raw(d), 200, status(d));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='mapo' AND REV_NO=2 AND KIND_CD='WATCH'"
                + " AND AIM_RANK_CD='SECOND' AND APPROVAL_REQ_ID=?", id));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='nowon' AND REV_NO=2 AND KIND_CD='GOAL'"
                + " AND AIM_RANK_CD='SINGLE' AND APPROVAL_REQ_ID=?", id));
    }

    @Test public void 자동_이월은_관심_이월만_금고_방식을_이어받는다() throws Exception {
        final int Y = y();
        target("jongno", 1, 1, "SAVE", "GOAL", Y - 1, null);   // 약정 없음(미달성) → 이월 없음
        target("mapo", 1, 1, "SAVE", "GOAL", Y - 1, null);
        line("mapo", 1, "B03", Y + "-01-01");                  // 다른 은행 약정 → 관심으로 이월
        jdbc.update("UPDATE INST_BID_TARGET SET AIM_RANK_CD='FIRST' WHERE INSTITUTION_ID='jongno' AND TARGET_NO=1");
        jdbc.update("UPDATE INST_BID_TARGET SET AIM_RANK_CD='SECOND' WHERE INSTITUTION_ID='mapo' AND TARGET_NO=1");
        MvcResult c = send(SALES, "/bid-targets/carry", "bid_board", "carry_targets", null);
        assertEquals(raw(c), 200, status(c));
        assertEquals(1, json(c).path("carried").asInt());
        assertEquals(0, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jongno' AND TARGET_NO=2"));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='mapo' AND TARGET_NO=2 AND REV_NO=1"
                + " AND ACTION_CD='CARRY' AND KIND_CD='WATCH' AND AIM_RANK_CD='SECOND'"));
    }

    @Test public void 결재_카드에_금고_방식_바뀜이_이전_이후로_실리고_승인되면_반영된다() throws Exception {
        baseSeed();
        final int Y = y();
        jdbc.update("UPDATE INST_BID_TARGET SET AIM_RANK_CD='FIRST' WHERE INSTITUTION_ID='jung' AND TARGET_NO=1");
        MvcResult r = change(SALES, req("담당과 금고 방식 변경",
                item("jung", "EDIT", "target_no", 1, "base_rev_no", 1, "target_year", Y, "tag_cd", "NEW", "owner_emp_no", LEAD, "aim_rank_cd", "SECOND")));
        assertEquals(raw(r), 200, status(r));
        assertEquals("APPROVAL", json(r).path("mode").asText());   // 주 담당이 섞였으니 결재
        long id = json(r).path("request").path("req_id").asLong();
        JsonNode card = json(r).path("request").path("target_items").get(0);
        assertEquals("FIRST", card.path("before").path("aim_rank_cd").asText());
        assertEquals("1금고", card.path("before").path("aim_rank_name").asText());
        assertEquals("SECOND", card.path("aim_rank_cd").asText());
        assertEquals("2금고", card.path("aim_rank_name").asText());
        assertEquals(200, status(decide(LEAD, id, "APPROVE", null)));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jung' AND REV_NO=2 AND AIM_RANK_CD='SECOND'"
                + " AND OWNER_EMP_NO=? AND APPROVAL_REQ_ID=?", LEAD, id));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET_REQ_ACT WHERE REQ_ID=? AND ACT_CD='APPROVE'", id));   // 누가 승인했는지 감사 행(기존 경로 그대로)
    }

    @Test public void 코드표_금고_방식_이름은_4자_이하_92px_칸_가정() throws Exception {
        baseSeed();
        JsonNode names = json(getAs(SALES, "/bid-targets")).path("codes").path("aim_ranks");
        assertEquals(4, names.size());
        for (JsonNode n : names) {
            String nm = n.path("name").asText();
            assertTrue(nm, nm.codePointCount(0, nm.length()) <= 4);   // 서버는 길이를 제한하지 않는다 — 시드가 4자 이하임을 고정(화면 칸 폭 가정)
        }
    }

    @Test public void 디자이너는_구분_고치기_403_목록의_value_edit_mode() throws Exception {
        baseSeed();
        MvcResult d = send(DESIGNER, "/institutions/jung/bid-targets", "bid_board", "change_target_tag", single("target_year", y(), "tag_cd", "RETAIN"));
        assertEquals(403, status(d));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jung' AND REV_NO=2"));
        assertEquals("DIRECT", json(getAs(SALES, "/bid-targets")).path("value_edit_mode").asText());
        assertTrue(json(getAs(DESIGNER, "/bid-targets")).path("value_edit_mode").isNull());
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
        target("jongno", 1, 1, "SAVE", "GOAL", Y - 1, null);   // 미달성 — 이월 없음(11-26)
        target("jung", 1, 1, "SAVE", "GOAL", Y - 1, null);
        line("jung", 1, "B02", Y + "-01-01");
        target("mapo", 1, 1, "SAVE", "GOAL", Y - 1, null);
        line("mapo", 1, "B03", Y + "-01-01");
        target("nowon", 1, 1, "SAVE", "GOAL", Y - 1, null);
        target("nowon", 2, 1, "SAVE", "GOAL", Y, null);
        assertEquals(1, json(getAs(SALES, "/bid-targets")).path("carry_due").asInt());   // mapo 하나
        assertEquals(0, json(getAs(DESIGNER, "/bid-targets")).path("carry_due").asInt());
        MvcResult c = send(SALES, "/bid-targets/carry", "bid_board", "carry_targets", null);
        assertEquals(raw(c), 200, status(c));
        assertEquals(1, json(c).path("carried").asInt()); assertEquals(0, json(c).path("revoked").asInt());
        assertEquals("bid-target carry carried=1 revoked=0 skipped=0",
                jdbc.queryForList("SELECT DETAIL FROM ACCESS_LOG WHERE EVENT_TYPE='API' AND HTTP_METHOD='POST' ORDER BY LOG_ID DESC", String.class).get(0));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='jongno' AND TARGET_NO=2"));   // 미달성 → 다음 해 목표 없음
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='mapo' AND TARGET_NO=2 AND KIND_CD='WATCH'"
                + " AND TARGET_YEAR IS NULL AND ACTION_CD='CARRY' AND CARRY_BASIS_CD='FAIL' AND WATCH_EMP_NO='3918264' AND BUTTON_ID='carry_targets'"));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID IN ('jung') AND TARGET_NO=2"));
        MvcResult again = send(SALES, "/bid-targets/carry", "bid_board", "carry_targets", null);
        assertEquals(0, json(again).path("carried").asInt());
        // 판정이 바뀌면(국민은행 약정 등록 — 같은 시작일·더 큰 번호가 이긴다) 손 안 탄 관심 이월을 거둔다
        line("mapo", 2, "B02", Y + "-01-01");
        assertEquals(1, json(getAs(SALES, "/bid-targets")).path("carry_due").asInt());
        MvcResult rv = send(SALES, "/bid-targets/carry", "bid_board", "carry_targets", null);
        assertEquals(1, json(rv).path("revoked").asInt()); assertEquals(0, json(rv).path("carried").asInt());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='mapo' AND TARGET_NO=2 AND REV_NO=2"
                + " AND ACTION_CD='CANCEL' AND CANCEL_REASON_CD='CARRY_REVOKED'"));
        assertEquals(0, json(getAs(SALES, "/bid-targets")).path("carry_due").asInt());
    }

    @Test public void 결재_중인_기관은_이월을_건너뛴다() throws Exception {
        final int Y = y();
        target("jongno", 1, 1, "SAVE", "GOAL", Y - 1, null);
        line("jongno", 1, "B03", Y + "-01-01");   // 결재가 없으면 관심 이월 후보(미달성 이월은 11-26 폐지)
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
        // 약정 없음(미달성)은 이월 후보가 아니다(11-26)
        assertEquals(0, json(getAs(SALES, "/bid-targets")).path("carry_due").asInt());
        // 같은 날 시작 다른 은행 약정 = 개시일 전이면 보류, 뒤이면 관심 이월 후보
        line("jongno", 1, "B03", D);
        boolean due = !LocalDate.parse(Times.todayKst()).isBefore(LocalDate.parse(D));
        assertEquals(due ? 1 : 0, json(getAs(SALES, "/bid-targets")).path("carry_due").asInt());
        // 같은 날 시작 국민은행 약정(번호 큰 쪽이 이김) = 그 목표 연도 달성 → 이월 없음
        line("jongno", 2, "B02", D);
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

    /** 061 security 중-1 — 남의 관심 기록은 REV 가 틀려도 STALE(latest 에 남의 이름)이 아니라 403 이고 latest 가 없다. 승인 쪽(replan)도 같은 검사. */
    @Test public void 남의_관심에_TO_GOAL은_틀린_REV여도_403_NOT_WATCH_OWNER_latest_없음() throws Exception {
        baseSeed();   // nowon 관심 = 김영업(SALES) 것
        final int Y = y();
        MvcResult bad = change(LEAD, req("남의 관심", item("nowon", "TO_GOAL", "target_no", 1, "base_rev_no", 9, "target_year", Y + 1)));
        assertEquals(raw(bad), 403, status(bad));
        assertEquals("NOT_WATCH_OWNER", json(bad).path("detail").path("code").asText());
        assertTrue(json(bad).path("detail").path("latest").isNull());
        assertFalse(raw(bad).contains("김영업"));
        MvcResult ok = change(LEAD, req("남의 관심", item("nowon", "TO_GOAL", "target_no", 1, "base_rev_no", 1, "target_year", Y + 1)));
        assertEquals(403, status(ok));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_BID_TARGET_REQ_ITEM"));
        assertTrue(count("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE='DENIED' AND EMP_NO=? AND REQ_PATH=?", LEAD, "/bid-targets/changes") >= 1);
        // 주인은 같은 요청이 통과한다(결재 요청 200)
        assertEquals(200, status(change(SALES, req("내 관심", item("nowon", "TO_GOAL", "target_no", 1, "base_rev_no", 1, "target_year", Y + 1)))));
    }

    /** 061 security 하-1 — 결재 중인 항목의 바로 그 관심 기록을 ♥ 로 끄면 409 CHANGE_PENDING(승인 때 ITEM_CHANGED 로 요청이 끼어 남지 않게). */
    @Test public void 결재_중인_관심을_하트로_끄면_409_CHANGE_PENDING() throws Exception {
        baseSeed();
        final int Y = y();
        assertEquals(200, status(change(SALES, req("관심을 목표로", item("nowon", "TO_GOAL", "target_no", 1, "base_rev_no", 1, "target_year", Y + 1)))));
        MvcResult off = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/institutions/nowon/my-watch")
                .header(Actor.HEADER, SALES).header("X-Screen-Id", "map_popover").header("X-Button-Id", "toggle_watch_heart")).andReturn();
        assertEquals(raw(off), 409, status(off));
        assertEquals("CHANGE_PENDING", json(off).path("detail").path("code").asText());
        assertEquals(0, count("SELECT COUNT(*) FROM INST_BID_TARGET WHERE INSTITUTION_ID='nowon' AND REV_NO=2"));
    }

    /** NEXT 117 P3-a — 내가 올린 TO_WATCH 결재가 진행 중이면 같은 기관 ♥ 켬은 409 CHANGE_PENDING(승인 때 ALREADY_WATCH 로 막히지 않게). */
    @Test public void 내_TO_WATCH_결재_중_하트_켬은_409_CHANGE_PENDING() throws Exception {
        baseSeed();
        assertEquals(200, status(change(SALES, req("목표를 관심으로", item("mapo", "TO_WATCH", "target_no", 1, "base_rev_no", 1)))));
        MvcResult on = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/institutions/mapo/my-watch")
                .header(Actor.HEADER, SALES).header("X-Screen-Id", "map_popover").header("X-Button-Id", "toggle_watch_heart")).andReturn();
        assertEquals(raw(on), 409, status(on));
        assertEquals("CHANGE_PENDING", json(on).path("detail").path("code").asText());
    }

    /** NEXT 117 시험 공백 1 — TO_WATCH 승인 결과의 관심 주인은 요청자(결재자 아님). */
    @Test public void TO_WATCH_승인_관심_주인은_요청자() throws Exception {
        baseSeed();
        MvcResult r = change(SALES, req("목표를 관심으로", item("mapo", "TO_WATCH", "target_no", 1, "base_rev_no", 1)));
        assertEquals(raw(r), 200, status(r));
        long id = json(r).path("request").path("req_id").asLong();
        MvcResult d = decide(LEAD, id, "APPROVE", null);
        assertEquals(raw(d), 200, status(d));
        assertEquals(SALES, jdbc.queryForObject("SELECT WATCH_EMP_NO FROM INST_BID_TARGET WHERE INSTITUTION_ID='mapo' AND TARGET_NO=1 AND REV_NO=2"
                + " AND ACTION_CD='MOVE' AND KIND_CD='WATCH'", String.class));
    }
}
