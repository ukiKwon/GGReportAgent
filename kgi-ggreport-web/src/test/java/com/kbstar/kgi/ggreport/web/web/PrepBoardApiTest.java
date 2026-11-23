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

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * NEXT 102 대시보드 서버 — GET /prep-board(열·행·열람 범위·감사)와 PUT 칸 체크(담당·개정 번호·감사). PrepApiTest 의 도우미 틀을 따른다.
 * 시드: 영업팀 김영업 3918264·윤서준 3361829, 영업팀장 이영업 5047192, 영업부장 박영업 2674805, 관리자 8203417, 디자이너 7130526.
 * ⚠️ X-Emp-No 는 자기신고다 — 여기서 고정하는 것은 업무 규칙이지 사칭 방지가 아니다.
 * 테스트 트랜잭션이 하나라 서비스가 던진 409 앞에서 쓴 행은 롤백되지 않는다 — 실패 케이스는 그 앞에서 쓴 것이 없는 순서로만 단언한다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class PrepBoardApiTest {

    private static final String LEAD = "5047192";
    private static final String HEAD = "2674805";
    private static final String MEMBER = "3918264";
    private static final String MEMBER2 = "3361829";
    private static final String DESIGNER = "7130526";
    private static final String ADMIN = "8203417";
    private static final String INST = "nowon";
    private static final String COL = "FIN_COMMITTEE";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    private final ObjectMapper om = new ObjectMapper();

    // ── 도우미 ───────────────────────────────────────────────────────

    private JsonNode json(MvcResult r) throws Exception {
        return om.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private MvcResult postJson(String path, String emp, String body) throws Exception {
        return mockMvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body).header("X-Emp-No", emp)).andReturn();
    }

    private String confirm(String emp, String inst) throws Exception {
        MvcResult r = postJson("/preps", emp, "{\"institution_id\":\"" + inst + "\"}");
        assertEquals(201, r.getResponse().getStatus());
        return json(r).path("bid_case_id").asText();
    }

    /** 확정(김영업) → 개설 신청(윤서준 지명) → 영업팀장 승인. 담당자는 윤서준이다. */
    private String opened(String inst) throws Exception {
        String bid = confirm(MEMBER, inst);
        MvcResult r = postJson("/bidcases/" + bid + "/prep/open-requests", MEMBER, "{\"emp_nos\":[\"" + MEMBER2 + "\"]}");
        assertEquals(r.getResponse().getContentAsString(), 201, r.getResponse().getStatus());
        long req = json(r).path("req_id").asLong();
        assertEquals(200, postJson("/approval-requests/" + req + "/decide", LEAD, "{\"decision\":\"APPROVE\",\"comment\":null}").getResponse().getStatus());
        return bid;
    }

    private MvcResult list(String emp, String query, String button) throws Exception {
        MockHttpServletRequestBuilder b = get("/prep-board" + (query == null ? "" : "?" + query)).header("X-Emp-No", emp);
        if (button != null) { b = b.header("X-Screen-Id", "prep_dashboard").header("X-Button-Id", button); }
        return mockMvc.perform(b).andReturn();
    }

    private MvcResult check(String emp, String bid, String col, String body) throws Exception {
        return mockMvc.perform(put("/bidcases/" + bid + "/prep/board-checks/" + col).contentType(MediaType.APPLICATION_JSON)
                .content(body == null ? "" : body).header("X-Emp-No", emp)
                .header("X-Screen-Id", "prep_dashboard").header("X-Button-Id", "dash_check")).andReturn();
    }

    private static String mark(String m, int base) {
        return "{\"mark_cd\":\"" + m + "\",\"base_rev\":" + base + "}";
    }

    private JsonNode row(JsonNode listBody, String bid) {
        for (JsonNode r : listBody.path("rows")) {
            if (bid.equals(r.path("bid_case_id").asText())) { return r; }
        }
        return null;
    }

    private int actCount(String bid, String action, String outcome) {
        return count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD=? AND OUTCOME=?", bid, action, outcome);
    }

    private int checkRows(String bid) {
        return count("SELECT COUNT(*) FROM BID_PREP_CHECK WHERE BID_CASE_ID=?", bid);
    }

    // ── 목록 ─────────────────────────────────────────────────────────

    @Test
    public void D1_목록은_엑셀_27칸과_아이콘_4값을_주고_행에_가결_부결_키가_없다() throws Exception {
        String bid = opened(INST);
        MvcResult r = list(MEMBER, null, "open");
        assertEquals(200, r.getResponse().getStatus());
        JsonNode b = json(r);
        assertEquals(27, b.path("columns").size());
        JsonNode first = b.path("columns").get(0);
        assertEquals("NOTICE_CHECK", first.path("col_cd").asText());
        assertEquals("NOTICE", first.path("kind").asText());
        assertFalse(first.path("editable").asBoolean());
        boolean atmEditable = false;
        for (JsonNode c : b.path("columns")) {
            assertFalse("BOARD 칸(T5)은 없다", "BOARD".equals(c.path("col_cd").asText()));
            assertFalse("묶음 머리는 칸이 아니다", "SUBMIT_APPR".equals(c.path("col_cd").asText()));
            if ("ATM".equals(c.path("col_cd").asText())) { atmEditable = c.path("editable").asBoolean(); }
        }
        assertTrue(atmEditable);
        assertEquals(3, b.path("groups").size());
        assertEquals(4, b.path("marks").size());
        assertEquals("V", b.path("marks").get(0).path("symbol").asText());
        assertEquals("△", b.path("marks").get(1).path("symbol").asText());
        assertEquals("-", b.path("marks").get(2).path("symbol").asText());
        assertEquals("", b.path("marks").get(3).path("symbol").asText());
        JsonNode row = row(b, bid);
        assertNotNull(row);
        assertFalse(row.path("can_check").asBoolean());   // 김영업은 담당이 아니다
        assertFalse(row.path("is_mine").asBoolean());
        assertFalse("개설 승인 뒤(IN_PROGRESS) 상세는 담당·팀장·부장만 — 담당 아닌 영업팀원은 칸 값만 본다(canSee)", row.path("can_view").asBoolean());
        assertTrue(row.path("assignee_names").size() == 1);
        assertFalse(row.has("board_result"));
        assertFalse(row.has("detail_cd"));
        assertEquals(27, row.path("cells").size());
        JsonNode fin = row.path("cells").path(COL);
        assertEquals("NONE", fin.path("mark_cd").asText());
        assertTrue(fin.path("marked_on").isNull());
        assertEquals(0, fin.path("rev_no").asInt());
        assertEquals("NOTICE", row.path("cells").path("NOTICE_CHECK").path("source").asText());
    }

    @Test
    public void D2_목록을_열면_DASH_LIST_감사_한_줄이_누가_어느_화면_어느_버튼으로_남는다() throws Exception {
        opened(INST);
        assertEquals(200, list(MEMBER, null, "open").getResponse().getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE ACTION_CD='DASH_LIST' AND OUTCOME='OK' AND BID_CASE_ID='NONE'"
                + " AND ACTOR_EMP_NO=? AND SCREEN_ID='prep_dashboard' AND BUTTON_ID='open' AND UI_VALID=1", MEMBER));
    }

    @Test
    public void D3_담당자_본인의_행만_is_mine_이고_can_check_가_참이다() throws Exception {
        String bid = opened(INST);
        JsonNode mine = row(json(list(MEMBER2, null, "open")), bid);
        assertTrue(mine.path("is_mine").asBoolean());
        assertTrue(mine.path("can_check").asBoolean());
        JsonNode other = row(json(list(MEMBER, null, "open")), bid);
        assertFalse(other.path("is_mine").asBoolean());
    }

    @Test
    public void D4_영업팀장과_영업부장은_열람은_되고_담당이_아니면_체크는_안_된다() throws Exception {
        String bid = opened(INST);
        for (String emp : new String[]{LEAD, HEAD}) {
            MvcResult r = list(emp, null, "open");
            assertEquals(200, r.getResponse().getStatus());
            JsonNode row = row(json(r), bid);
            assertFalse(row.path("can_check").asBoolean());
            assertFalse(row.path("is_mine").asBoolean());
            assertTrue(row.path("can_view").asBoolean());
        }
    }

    @Test
    public void D5_디자이너와_관리자는_403이고_거부_감사가_남는다() throws Exception {
        for (String emp : new String[]{DESIGNER, ADMIN}) {
            assertEquals(403, list(emp, null, "open").getResponse().getStatus());
            assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE ACTION_CD='DASH_LIST' AND OUTCOME='DENIED' AND ACTOR_EMP_NO=?", emp));
        }
    }

    @Test
    public void D6_담당이_T1을_끝내면_기관_정보_분석_칸이_V와_오늘_날짜가_된다() throws Exception {
        String bid = opened(INST);
        assertEquals(200, postJson("/bidcases/" + bid + "/prep/tasks/T1/check", MEMBER2, "").getResponse().getStatus());
        JsonNode cells = row(json(list(MEMBER, null, "refresh")), bid).path("cells");
        JsonNode t1 = cells.path("INST_ANALYSIS");
        assertEquals("DONE", t1.path("mark_cd").asText());
        assertEquals(Times.todayKst(), t1.path("marked_on").asText());
        assertEquals("AUTO", t1.path("source").asText());
        assertEquals("NONE", cells.path("PROFIT").path("mark_cd").asText());
    }

    @Test
    public void D7_확정만_한_건은_자동_칸이_모두_빈칸이고_체크할_수_없다() throws Exception {
        String bid = confirm(MEMBER, INST);
        JsonNode row = row(json(list(MEMBER, null, "open")), bid);
        assertFalse(row.path("can_check").asBoolean());
        for (String c : new String[]{"INST_ANALYSIS", "PROFIT", "PROPOSAL"}) {
            assertEquals(c, "NONE", row.path("cells").path(c).path("mark_cd").asText());
        }
    }

    @Test
    public void D21_끝난_건은_기본_목록에_없고_include_ended는_ended와_감사_DASH_LIST_ENDED를_남긴다() throws Exception {
        String bid = confirm(MEMBER, INST);
        assertEquals(200, postJson("/bidcases/" + bid + "/prep/unconfirm", LEAD, "{\"reason\":\"가상 취소\"}").getResponse().getStatus());
        assertEquals(null, row(json(list(MEMBER, null, "open")), bid));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE ACTION_CD='DASH_LIST_ENDED'"));
        JsonNode with = row(json(list(MEMBER, "include_ended=true", "refresh")), bid);
        assertNotNull(with);
        assertTrue(with.path("ended").asBoolean());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE ACTION_CD='DASH_LIST_ENDED' AND OUTCOME='OK' AND BID_CASE_ID='NONE'"
                + " AND ACTOR_EMP_NO=? AND SCREEN_ID='prep_dashboard' AND BUTTON_ID='refresh' AND UI_VALID=1", MEMBER));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE ACTION_CD='DASH_LIST' AND OUTCOME='OK'"));   // 앞의 기본 목록 한 줄은 그대로
        // F3 기본값: 상세를 못 여는 끝난 건은 확정자 이름을 싣지 않는다 — 상세를 열 수 있으면 싣는다.
        JsonNode other = row(json(list(MEMBER2, "include_ended=1", "refresh")), bid);
        assertEquals(other.path("can_view").asBoolean(), !other.path("confirmed_by_name").isNull());
        assertFalse(with.path("confirmed_by_name").isNull());   // 확정자 본인은 상세를 볼 수 있다
    }

    // ── 체크 ─────────────────────────────────────────────────────────

    @Test
    public void D8_담당이_체크하면_저장되고_오늘_날짜_감사_두_곳에_남는다() throws Exception {
        String bid = opened(INST);
        MvcResult r = check(MEMBER2, bid, COL, mark("DONE", 0));
        assertEquals(r.getResponse().getContentAsString(), 200, r.getResponse().getStatus());
        JsonNode b = json(r);
        assertTrue(b.path("saved").asBoolean());
        assertEquals(1, b.path("cell").path("rev_no").asInt());
        assertEquals(Times.todayKst(), b.path("cell").path("marked_on").asText());
        assertFalse(b.path("cell").path("by_name").isNull());
        assertFalse(b.path("cell").path("emp_verified").asBoolean());   // 자기신고
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_CHECK WHERE BID_CASE_ID=? AND COL_CD=? AND MARK_CD='DONE' AND MARK_DATE=?"
                + " AND PREV_MARK_CD IS NULL AND UI_VALID=1 AND SCREEN_ID='prep_dashboard' AND BUTTON_ID='dash_check'", bid, COL, Times.todayKst()));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='DASH_CHECK' AND OUTCOME='OK'"
                + " AND TASK_CD='CK_FIN_COMMITTEE' AND ACTOR_EMP_NO=?", bid, MEMBER2));
    }

    @Test
    public void D9_같은_값을_다시_저장하면_행은_그대로고_DASH_CHECK_SAME_감사가_남는다() throws Exception {
        String bid = opened(INST);
        assertEquals(200, check(MEMBER2, bid, COL, mark("DONE", 0)).getResponse().getStatus());
        MvcResult r = check(MEMBER2, bid, COL, mark("DONE", 1));
        assertEquals(200, r.getResponse().getStatus());
        assertFalse(json(r).path("saved").asBoolean());
        assertEquals(1, checkRows(bid));
        assertEquals(1, actCount(bid, "DASH_CHECK_SAME", "OK"));
    }

    @Test
    public void D10_낡은_개정_번호는_409_STALE_CHECK이고_행은_그대로다() throws Exception {
        String bid = opened(INST);
        assertEquals(200, check(MEMBER2, bid, COL, mark("DONE", 0)).getResponse().getStatus());
        MvcResult r = check(MEMBER2, bid, COL, mark("IN_PROGRESS", 0));
        assertEquals(409, r.getResponse().getStatus());
        assertEquals("STALE_CHECK", json(r).path("detail").path("code").asText());
        assertEquals(1, checkRows(bid));
        assertEquals(1, actCount(bid, "DASH_CHECK", "BLOCKED"));
    }

    @Test
    public void D12_담당이_아닌_사람은_영업팀장과_부장도_403이고_행이_늘지_않는다() throws Exception {
        String bid = opened(INST);
        for (String emp : new String[]{MEMBER, LEAD, HEAD}) {
            assertEquals(emp, 403, check(emp, bid, COL, mark("DONE", 0)).getResponse().getStatus());
        }
        assertEquals(0, checkRows(bid));
        assertEquals(3, actCount(bid, "DASH_CHECK", "DENIED"));
    }

    @Test
    public void D13_없는_건은_남의_건과_같은_403이다() throws Exception {
        opened(INST);
        MvcResult none = check(MEMBER2, "NOPE-1", COL, mark("DONE", 0));
        assertEquals(403, none.getResponse().getStatus());
    }

    @Test
    public void D14_모르는_열이나_형식_밖_열은_404다() throws Exception {
        String bid = opened(INST);
        assertEquals(404, check(MEMBER2, bid, "XYZ", mark("DONE", 0)).getResponse().getStatus());
        assertEquals(404, check(MEMBER2, bid, "fin", mark("DONE", 0)).getResponse().getStatus());
        assertEquals(404, check(MEMBER2, bid, "BOARD", mark("DONE", 0)).getResponse().getStatus());        // 27칸 — 이사회 칸(T5)은 없다
        assertEquals(404, check(MEMBER2, bid, "SUBMIT_APPR", mark("DONE", 0)).getResponse().getStatus());  // 묶음 머리
        assertEquals(0, checkRows(bid));
    }

    @Test
    public void D15_자동_칸과_공고_칸은_409_NOT_MANUAL이다() throws Exception {
        String bid = opened(INST);
        for (String c : new String[]{"INST_ANALYSIS", "NOTICE_CHECK", "PROPOSAL"}) {
            MvcResult r = check(MEMBER2, bid, c, mark("DONE", 0));
            assertEquals(c, 409, r.getResponse().getStatus());
            assertEquals("NOT_MANUAL", json(r).path("detail").path("code").asText());
        }
        assertEquals(0, checkRows(bid));
    }

    @Test
    public void D16_표시와_개정_번호가_틀리면_400이고_저장되지_않는다() throws Exception {
        String bid = opened(INST);
        assertEquals("BAD_MARK", json(check(MEMBER2, bid, COL, "{\"mark_cd\":\"FOO\",\"base_rev\":0}")).path("detail").path("code").asText());
        assertEquals("BAD_MARK", json(check(MEMBER2, bid, COL, "{\"base_rev\":0}")).path("detail").path("code").asText());
        assertEquals("BAD_MARK", json(check(MEMBER2, bid, COL, null)).path("detail").path("code").asText());
        assertEquals("BAD_VALUE", json(check(MEMBER2, bid, COL, "{\"mark_cd\":\"DONE\"}")).path("detail").path("code").asText());
        assertEquals("BAD_VALUE", json(check(MEMBER2, bid, COL, "{\"mark_cd\":\"DONE\",\"base_rev\":-1}")).path("detail").path("code").asText());
        assertEquals(0, checkRows(bid));
    }

    @Test
    public void D17_본문의_날짜는_무시하고_서버가_오늘로_정한다() throws Exception {
        String bid = opened(INST);
        MvcResult r = check(MEMBER2, bid, COL, "{\"mark_cd\":\"DONE\",\"base_rev\":0,\"done_date\":\"2020-01-01\"}");
        assertEquals(200, r.getResponse().getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_CHECK WHERE BID_CASE_ID=? AND MARK_DATE=?", bid, Times.todayKst()));
    }

    @Test
    public void D18_뒤쪽_열_ATM도_체크할_수_있다() throws Exception {
        String bid = opened(INST);
        assertEquals(200, check(MEMBER2, bid, "ATM", mark("IN_PROGRESS", 0)).getResponse().getStatus());
    }

    @Test
    public void D19_시작_전으로_되돌리면_날짜가_빠지고_이전_값이_남는다() throws Exception {
        String bid = opened(INST);
        assertEquals(200, check(MEMBER2, bid, COL, mark("DONE", 0)).getResponse().getStatus());
        MvcResult r = check(MEMBER2, bid, COL, mark("NONE", 1));
        assertEquals(200, r.getResponse().getStatus());
        assertEquals("NONE", json(r).path("cell").path("mark_cd").asText());
        assertTrue(json(r).path("cell").path("marked_on").isNull());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_CHECK WHERE BID_CASE_ID=? AND REV_NO=2 AND PREV_MARK_CD='DONE'", bid));
    }

    @Test
    public void D20_중단된_건은_담당이어도_체크할_수_없다() throws Exception {
        String bid = opened(INST);
        assertEquals(200, postJson("/bidcases/" + bid + "/prep/cancel", LEAD, "{\"reason\":\"미참여 결정\"}").getResponse().getStatus());
        int s = check(MEMBER2, bid, COL, mark("DONE", 0)).getResponse().getStatus();
        assertTrue("403(담당 해제) 또는 409(상태 바뀜): " + s, s == 403 || s == 409);
        assertEquals(0, checkRows(bid));
    }
}
