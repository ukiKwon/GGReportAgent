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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
        Map<String, Object> b = body(); b.remove("tag_cd");
        assertEquals(400, status(send(SALES, PATH, ADD, b)));
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
        assertEquals(2, json(r).path("codes").path("tags").size());
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
}
