package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.support.PrepOpenApprovalSwitch;
import com.kbstar.kgi.ggreport.web.support.TestGoals;
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

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
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
    private static final String LEAD2 = "5640327";   // 다른 영업팀장(시드: 아래 팀원 없음)
    private static final String MEMBER = "3918264";
    private static final String MEMBER2 = "3361829";
    private static final String DESIGNER = "7130526";
    private static final String ADMIN = "8203417";
    private static final String INST = "nowon";
    private static final String COL = "FIN_COMMITTEE";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PrepOpenApprovalSwitch openApproval;
    private final ObjectMapper om = new ObjectMapper();

    @Before public void 옛_개설_신청_켜기() { openApproval.setForTest(true); }   // 옛 흐름·남은 대기 건 처리를 본다 — 새 흐름은 PrepStartApiTest
    @After public void 옛_개설_신청_끄기() { openApproval.setForTest(false); }

    @Before
    public void 올해_목표_바탕() {   // NEXT 114 — 제안 확정은 올해 목표 기관만. 시험 트랜잭션 안이라 끝나면 롤백된다
        TestGoals.seedThisYear(jdbc, INST);
        TestGoals.seedThisYear(jdbc, "dobong");
    }

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

    /** 역할을 바꾼 뒤 사용자 캐시를 비운다 — PrepApiTest.flushCache 와 같은 방식(쓰기 호출이 캐시를 비운다). */
    private void flushCache() throws Exception {
        mockMvc.perform(post("/bidcases").contentType(MediaType.APPLICATION_JSON)
                .content("{\"institution_id\":\"dobong\"}").header("X-User-Id", "dave")).andReturn();
    }

    private void setState(String bid, String state) {
        jdbc.update("UPDATE BID_PREP SET STATE_CD = ? WHERE BID_CASE_ID = ?", state, bid);   // PrepFormApiTest 관례 — 승인 흐름 대신 직접 지정
    }

    /** 체크 감사 한 줄 수 — TASK_CD 가 null 이면 IS NULL 로 비교한다. */
    private int actByCol(String bid, String action, String outcome, String taskCd) {
        return taskCd == null
                ? count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD=? AND OUTCOME=? AND TASK_CD IS NULL", bid, action, outcome)
                : count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD=? AND OUTCOME=? AND TASK_CD=?", bid, action, outcome, taskCd);
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
        // 확정 취소(개설 전)는 결재가 없어 팀·부서 작업에 실리지 않고, 확정자 본인의 '내 작업'에만 남는다(사용자 11-24).
        assertNull(row(json(list(MEMBER2, "include_ended=1", "refresh")), bid));
        assertNull(row(json(list(LEAD, "include_ended=1", "refresh")), bid));
        assertNull(row(json(list(HEAD, "include_ended=1&scope=dept", "refresh")), bid));
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

    /** qa T6 — 시험 트랜잭션 안이라 진짜 동시 실행 대신 직렬 재현(다른 표시값·없는 미래 번호까지). 진짜 동시 시험은 별도 비트랜잭션 클래스로 보류. */
    @Test
    public void D11_같은_칸을_낡은_번호나_없는_번호로_연달아_저장하면_먼저_온_것만_남고_409_STALE_CHECK이며_행은_1개다_직렬() throws Exception {
        String bid = opened(INST);
        assertEquals(200, check(MEMBER2, bid, COL, mark("DONE", 0)).getResponse().getStatus());   // 먼저 온 쪽
        MvcResult late = check(MEMBER2, bid, COL, mark("NA", 0));            // 같은 화면을 본 늦은 쪽 — 낡은 번호
        assertEquals(409, late.getResponse().getStatus());
        assertEquals("STALE_CHECK", json(late).path("detail").path("code").asText());
        MvcResult future = check(MEMBER2, bid, COL, mark("IN_PROGRESS", 7)); // 없는 미래 번호도 같은 409
        assertEquals(409, future.getResponse().getStatus());
        assertEquals("STALE_CHECK", json(future).path("detail").path("code").asText());
        assertEquals(1, checkRows(bid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_CHECK WHERE BID_CASE_ID=? AND REV_NO=1 AND MARK_CD='DONE'", bid));
        assertEquals(2, actCount(bid, "DASH_CHECK", "BLOCKED"));
        assertEquals(200, check(MEMBER2, bid, COL, mark("IN_PROGRESS", 1)).getResponse().getStatus());   // 맞는 번호로 다시 하면 저장
        assertEquals(2, checkRows(bid));
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

    @Test
    public void D22_작성_가능_건에서_담당이_체크하면_체크_표와_감사에_화면_버튼_상태가_남는다() throws Exception {
        String bid = opened(INST);
        setState(bid, "WRITABLE");
        MvcResult r = check(MEMBER2, bid, COL, mark("DONE", 0));
        assertEquals(r.getResponse().getContentAsString(), 200, r.getResponse().getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_CHECK WHERE BID_CASE_ID=? AND COL_CD=? AND SCREEN_ID='prep_dashboard'"
                + " AND BUTTON_ID='dash_check' AND UI_VALID=1 AND ACTOR_EMP_NO=?", bid, COL, MEMBER2));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='DASH_CHECK' AND OUTCOME='OK'"
                + " AND STATE_CD='WRITABLE' AND TASK_CD='CK_FIN_COMMITTEE' AND ACTOR_EMP_NO=? AND SCREEN_ID='prep_dashboard'"
                + " AND BUTTON_ID='dash_check' AND UI_VALID=1", bid, MEMBER2));
    }

    @Test
    public void D23_작성_중_건도_체크되고_감사_상태는_WRITING이다() throws Exception {
        String bid = opened(INST);
        setState(bid, "WRITING");
        assertEquals(200, check(MEMBER2, bid, COL, mark("DONE", 0)).getResponse().getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='DASH_CHECK' AND OUTCOME='OK'"
                + " AND STATE_CD='WRITING' AND ACTOR_EMP_NO=?", bid, MEMBER2));
        assertTrue(row(json(list(MEMBER2, null, "refresh")), bid).path("can_check").asBoolean());
    }

    @Test
    public void D24_확정_또는_개설_대기_상태는_활성_담당이_남아도_읽기_전용이다_합성_상태() throws Exception {
        // 합성 시험: 실제 흐름에서는 이 두 상태에 활성 담당이 없다(D31). 담당이 남은 합성 건에서도 상태 규칙이 막는지 고정한다(팀 결정 A).
        String bid = opened(INST);
        for (String st : new String[] {"CONFIRMED", "OPEN_PENDING"}) {
            setState(bid, st);
            assertFalse(st, row(json(list(MEMBER2, null, "refresh")), bid).path("can_check").asBoolean());
            assertEquals(st, "PRE_OPEN", row(json(list(MEMBER2, null, "refresh")), bid).path("check_block").asText());
            MvcResult r = check(MEMBER2, bid, COL, mark("DONE", 0));
            assertEquals(st, 409, r.getResponse().getStatus());
            assertEquals(st, "STATE_CHANGED", json(r).path("detail").path("code").asText());
        }
        assertEquals(0, checkRows(bid));
        assertEquals(2, actCount(bid, "DASH_CHECK", "BLOCKED"));
        assertEquals(0, actCount(bid, "DASH_CHECK", "OK"));
    }

    @Test
    public void D25_화면_버튼_머리글이_없으면_200이고_UNKNOWN_UI_VALID_0이_체크_표와_감사_모두에_남는다() throws Exception {
        String bid = opened(INST);
        MvcResult r = mockMvc.perform(put("/bidcases/" + bid + "/prep/board-checks/" + COL).contentType(MediaType.APPLICATION_JSON)
                .content(mark("DONE", 0)).header("X-Emp-No", MEMBER2)).andReturn();   // X-Screen-Id·X-Button-Id 없음
        assertEquals(r.getResponse().getContentAsString(), 200, r.getResponse().getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_CHECK WHERE BID_CASE_ID=? AND SCREEN_ID='UNKNOWN' AND BUTTON_ID='UNKNOWN' AND UI_VALID=0", bid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='DASH_CHECK' AND OUTCOME='OK'"
                + " AND SCREEN_ID='UNKNOWN' AND BUTTON_ID='UNKNOWN' AND UI_VALID=0", bid));
    }

    @Test
    public void D26_실패_경로는_INVALID_HIDDEN_BLOCKED_감사가_열_코드와_함께_한_줄씩_남고_형식_밖_열은_TASK_CD가_NULL이다() throws Exception {
        String bid = opened(INST);
        assertEquals(400, check(MEMBER2, bid, COL, "{\"mark_cd\":\"FOO\",\"base_rev\":0}").getResponse().getStatus());
        assertEquals(1, actByCol(bid, "DASH_CHECK", "INVALID", "CK_FIN_COMMITTEE"));
        assertEquals(404, check(MEMBER2, bid, "XYZ", mark("DONE", 0)).getResponse().getStatus());   // 형식은 맞고 없는 열
        assertEquals(1, actByCol(bid, "DASH_CHECK", "HIDDEN", "CK_XYZ"));
        assertEquals(404, check(MEMBER2, bid, "fin", mark("DONE", 0)).getResponse().getStatus());   // 형식 밖 → NULL
        assertEquals(1, actByCol(bid, "DASH_CHECK", "HIDDEN", null));
        assertEquals(409, check(MEMBER2, bid, "PROPOSAL", mark("DONE", 0)).getResponse().getStatus());
        assertEquals(1, actByCol(bid, "DASH_CHECK", "BLOCKED", "CK_PROPOSAL"));
        assertEquals(0, checkRows(bid));
    }

    private int rowsOf(JsonNode body, String inst) {
        int n = 0;
        for (JsonNode r : body.path("rows")) {
            if (inst.equals(r.path("institution_id").asText())) { n++; }
        }
        return n;
    }

    @Test
    public void D27_include_ended_목록은_활성_1줄과_끝난_건_각_1줄이고_끄면_기관당_활성_1줄이다() throws Exception {
        String old = opened(INST);   // nowon: 중단된 건 + 다시 확정한 활성 건
        assertEquals(200, postJson("/bidcases/" + old + "/prep/cancel", LEAD, "{\"reason\":\"미참여 결정\"}").getResponse().getStatus());
        String active = confirm(MEMBER, INST);   // PrepApiTest 관례 — 중단 뒤 확정은 새 건
        String ended1 = confirm(MEMBER, "dobong");   // dobong: 끝난 건만(확정 취소 뒤 재확정은 같은 건을 되살리므로 끝난 건은 1건)
        assertEquals(200, postJson("/bidcases/" + ended1 + "/prep/unconfirm", LEAD, "{\"reason\":\"가상 취소\"}").getResponse().getStatus());
        JsonNode on = json(list(MEMBER, "include_ended=true", "refresh"));
        assertEquals(2, rowsOf(on, INST));
        assertEquals(1, rowsOf(on, "dobong"));
        assertFalse(row(on, active).path("ended").asBoolean());
        assertTrue("같은 기관의 옛 중단 건도 줄로 나온다(P3-6)", row(on, old).path("ended").asBoolean());
        assertTrue(row(on, ended1).path("ended").asBoolean());
        JsonNode off = json(list(MEMBER, null, "refresh"));
        assertEquals(1, rowsOf(off, INST));
        assertEquals(0, rowsOf(off, "dobong"));
        assertNull(row(off, old));
        assertNotNull(row(off, active));
    }

    @Test
    public void D28_담당_배정이_남은_채_역할이_영업_밖으로_바뀐_사용자는_체크가_403이고_거부_감사가_남는다() throws Exception {
        String bid = opened(INST);
        jdbc.update("UPDATE USERS SET ROLE='디자이너' WHERE EMP_NO=?", MEMBER2);
        flushCache();
        assertEquals(403, check(MEMBER2, bid, COL, mark("DONE", 0)).getResponse().getStatus());
        assertEquals(0, checkRows(bid));
        assertEquals(1, actByCol(bid, "DASH_CHECK", "DENIED", "CK_FIN_COMMITTEE"));
        assertEquals(0, actCount(bid, "DASH_CHECK", "OK"));
    }

    @Test
    public void D29_사전준비가_시작된_건이_표에_실리면_목록_감사에_건마다_한_줄이_같은_시각_화면_버튼으로_남는다() throws Exception {
        String done = opened(INST);
        setState(done, "WRITABLE");
        String other = opened("dobong");   // IN_PROGRESS — 11-25 패치 B 로 건 줄이 남는다(이전에는 없었다)
        assertEquals(200, list(MEMBER, null, "open").getResponse().getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='DASH_LIST_ROW' AND OUTCOME='OK'"
                + " AND STATE_CD='WRITABLE' AND TASK_CD IS NULL AND ACTOR_EMP_NO=? AND SCREEN_ID='prep_dashboard' AND BUTTON_ID='open'"
                + " AND UI_VALID=1", done, MEMBER));
        assertEquals("IN_PROGRESS 도 건 줄이 남는다(패치 B)", 1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='DASH_LIST_ROW'"
                + " AND OUTCOME='OK' AND STATE_CD='IN_PROGRESS' AND ACTOR_EMP_NO=?", other, MEMBER));
        assertEquals("요약 줄은 그대로 한 줄", 1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE ACTION_CD='DASH_LIST' AND BID_CASE_ID='NONE' AND ACTOR_EMP_NO=?", MEMBER));
        assertEquals("건 줄은 요약 줄과 같은 LOGGED_AT", 1, count("SELECT COUNT(*) FROM BID_PREP_ACT a WHERE a.ACTION_CD='DASH_LIST_ROW' AND a.BID_CASE_ID=?"
                + " AND a.LOGGED_AT = (SELECT b.LOGGED_AT FROM BID_PREP_ACT b WHERE b.ACTION_CD='DASH_LIST' AND b.BID_CASE_ID='NONE' AND b.ACTOR_EMP_NO=?)", done, MEMBER));
        setState(other, "WRITING");
        assertEquals(200, list(LEAD, "include_ended=true", "refresh").getResponse().getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='DASH_LIST_ROW' AND OUTCOME='OK'"
                + " AND STATE_CD='WRITING' AND ACTOR_EMP_NO=? AND BUTTON_ID='refresh'", other, LEAD));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='DASH_LIST_ROW' AND ACTOR_EMP_NO=?", done, LEAD));
        assertEquals(403, list(DESIGNER, null, "open").getResponse().getStatus());   // 거부면 건 줄 없음
        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE ACTION_CD='DASH_LIST_ROW' AND ACTOR_EMP_NO=?", DESIGNER));
    }

    @Test
    public void D30_상세를_못_여는_끝난_건은_확정자_담당자_체크자_이름을_모두_가리고_칸_값은_그대로다() throws Exception {
        String bid = opened(INST);
        assertEquals(200, check(MEMBER2, bid, COL, mark("DONE", 0)).getResponse().getStatus());
        assertEquals(200, postJson("/bidcases/" + bid + "/prep/cancel", LEAD, "{\"reason\":\"미참여 결정\"}").getResponse().getStatus());
        // 김영업은 확정자지만 개설 뒤 중단 건의 상세는 옛 담당·팀장·부장만 연다(canSee).
        JsonNode hidden = row(json(list(MEMBER, "include_ended=true", "refresh")), bid);
        assertTrue(hidden.path("ended").asBoolean());
        assertFalse(hidden.path("can_view").asBoolean());
        assertTrue(hidden.path("confirmed_by_name").isNull());
        assertEquals(0, hidden.path("assignee_names").size());
        assertTrue(hidden.path("cells").path(COL).path("by_name").isNull());
        assertEquals("DONE", hidden.path("cells").path(COL).path("mark_cd").asText());
        assertEquals(1, hidden.path("cells").path(COL).path("rev_no").asInt());
        for (String emp : new String[]{MEMBER2, LEAD}) {   // 옛 담당·영업팀장은 상세를 열므로 이름이 보인다
            JsonNode shown = row(json(list(emp, "include_ended=true", "refresh")), bid);
            assertTrue(emp, shown.path("can_view").asBoolean());
            assertFalse(emp, shown.path("confirmed_by_name").isNull());
            assertFalse(emp, shown.path("cells").path(COL).path("by_name").isNull());
        }
    }

    @Test
    public void D31_실제_흐름에서_확정만_한_건은_활성_담당이_없어_확정자도_체크가_403이다() throws Exception {
        String bid = confirm(MEMBER, INST);
        assertFalse(row(json(list(MEMBER, null, "open")), bid).path("can_check").asBoolean());
        assertEquals(403, check(MEMBER, bid, COL, mark("DONE", 0)).getResponse().getStatus());
        assertEquals(0, checkRows(bid));
        assertEquals(1, actByCol(bid, "DASH_CHECK", "DENIED", "CK_FIN_COMMITTEE"));
    }

    @Test
    public void D32_취소_중단_상태는_담당_배정이_남아_있어도_409_STATE_CHANGED이고_can_check가_거짓이다() throws Exception {
        String bid = opened(INST);
        setState(bid, "CANCELLED");   // 합성: 배정은 활성으로 남는다(실제 중단은 배정을 해제한다 — D20)
        assertFalse(row(json(list(MEMBER2, "include_ended=true", "refresh")), bid).path("can_check").asBoolean());
        MvcResult r = check(MEMBER2, bid, COL, mark("DONE", 0));
        assertEquals(409, r.getResponse().getStatus());
        assertEquals("STATE_CHANGED", json(r).path("detail").path("code").asText());
        assertEquals(0, checkRows(bid));
        assertEquals(1, actByCol(bid, "DASH_CHECK", "BLOCKED", "CK_FIN_COMMITTEE"));
    }

    /** 외부 확인 한 줄(가상 값) — CHECK_KEY 32자, 같은 배치 안 CHECK_ID 유일. */
    private void extCheck(int n, String inst, String checkedAt, String status, String deadline) {
        jdbc.update("INSERT INTO EXT_CHECK (CHECK_KEY, INSTITUTION_ID, BATCH_ID, CHECK_ID, CHECKED_AT, SOURCE_KIND, SOURCE_SLUG, STATUS_CD,"
                + " DEADLINE_AT, IMPORTED_AT) VALUES (?, ?, '2026-11-23_0700_test102', ?, ?, 'notice', 'eminwon', ?, ?, ?)",
                String.format("d102%028d", n), inst, "c-102-" + n, checkedAt, status, deadline, checkedAt);
    }

    @Test
    public void D33_입찰_예정일은_공고_마감일이_있으면_그_날짜와_notice_없으면_약정_만료일과_expiry이고_그_순서로_정렬된다() throws Exception {
        String withNotice = confirm(MEMBER, INST);
        String expiryOnly = confirm(MEMBER, "dobong");
        jdbc.update("UPDATE INSTITUTIONS SET CONTRACT_END=? WHERE INSTITUTION_ID=?", "2027-06-30", INST);
        jdbc.update("UPDATE INSTITUTIONS SET CONTRACT_END=? WHERE INSTITUTION_ID=?", "2027-01-31", "dobong");
        extCheck(1, INST, "2026-11-01T07:00:00+09:00", "found", "2026-12-31");        // 더 오래된 found — 밀린다
        extCheck(2, INST, "2026-11-10T07:00:00+09:00", "found", "2025-12-10");        // 최신 found+마감일 — 지난 날짜도 그대로
        extCheck(3, INST, "2026-11-15T07:00:00+09:00", "found", null);                // 마감일 없는 더 새 found — 제외
        extCheck(4, INST, "2026-11-20T07:00:00+09:00", "not_found", "2026-12-01");    // found 아님 — 제외
        extCheck(5, "dobong", "2026-11-20T07:00:00+09:00", "error", "2026-11-25");    // error — 제외
        JsonNode body = json(list(MEMBER, null, "open"));
        JsonNode n = row(body, withNotice);
        assertEquals("2025-12-10", n.path("bid_expected_date").asText());
        assertEquals("notice", n.path("bid_expected_basis").asText());
        JsonNode d = row(body, expiryOnly);
        assertEquals("2027-01-31", d.path("bid_expected_date").asText());
        assertEquals("expiry", d.path("bid_expected_basis").asText());
        int iN = -1, iD = -1, i = 0;
        for (JsonNode r : body.path("rows")) {
            if (withNotice.equals(r.path("bid_case_id").asText())) { iN = i; }
            if (expiryOnly.equals(r.path("bid_case_id").asText())) { iD = i; }
            i++;
        }
        assertTrue("공고 마감일(2025-12-10)이 약정 만료일(2027-01-31)보다 앞선다: " + iN + "," + iD, iN >= 0 && iD >= 0 && iN < iD);
    }

    // ── 현재 금고 약정(current_banks) ────────────────────────────────

    private String ymd(int plusDays) {
        return LocalDate.parse(Times.todayKst()).plusDays(plusDays).toString();
    }

    private void bankRev(String inst, int no, int rev, String action, String rank, String bankCd, String etcName, String termTo) {
        jdbc.update("INSERT INTO INST_BANK_CONTRACT (INSTITUTION_ID, CONTRACT_NO, REV_NO, ACTION_CD, ORIGIN_CD, RANK_CD, BANK_CD, BANK_NAME_ETC,"
                + " TERM_TO, SRC_KIND, CHECKED_DATE, EDITOR_EMP_NO, EDITOR_NAME, SCREEN_ID, BUTTON_ID, SAVED_AT)"
                + " VALUES (?, ?, ?, ?, 'MANUAL', ?, ?, ?, ?, 'STAFF', '2026-11-23', '3918264', '김영업', 'bank_contract', 'seed', '2026-11-23T00:00:00+09:00')",
                inst, no, rev, action, rank, bankCd, etcName, termTo);
    }

    private void clearBanks() {
        jdbc.update("DELETE FROM INST_BANK_CONTRACT WHERE INSTITUTION_ID IN (?, ?)", INST, "dobong");
    }

    private JsonNode banksOf(String emp, String bid) throws Exception {
        return row(json(list(emp, null, "refresh")), bid).path("current_banks");
    }

    @Test
    public void D34_같은_줄은_최신_개정만_현재_약정으로_나온다() throws Exception {
        clearBanks();
        String bid = confirm(MEMBER, INST);
        bankRev(INST, 1, 1, "SAVE", "FIRST", "B02", null, ymd(365));
        bankRev(INST, 1, 2, "SAVE", "SECOND", "B03", null, ymd(400));
        JsonNode b = banksOf(MEMBER, bid);
        assertEquals(1, b.size());
        assertEquals("신한은행", b.get(0).path("bank_name").asText());
        assertEquals("SECOND", b.get(0).path("rank_cd").asText());
        assertEquals(ymd(400), b.get(0).path("term_to").asText());
    }

    @Test
    public void D35_최신_개정이_CANCEL인_줄은_빠지고_아래_SAVE가_되살아나지_않는다() throws Exception {
        clearBanks();
        String bid = confirm(MEMBER, INST);
        bankRev(INST, 1, 1, "SAVE", "FIRST", "B02", null, ymd(365));
        bankRev(INST, 2, 1, "SAVE", "SECOND", "B04", null, ymd(365));
        bankRev(INST, 2, 2, "CANCEL", "SECOND", "B04", null, ymd(365));
        JsonNode b = banksOf(MEMBER, bid);
        assertEquals(1, b.size());
        assertEquals("KB국민은행", b.get(0).path("bank_name").asText());
    }

    @Test
    public void D36_코드표에_없는_은행코드는_직접_입력_이름으로_나온다() throws Exception {
        clearBanks();
        String bid = confirm(MEMBER, INST);
        bankRev(INST, 1, 1, "SAVE", "FIRST", "Z99", "가상저축", ymd(365));
        JsonNode b = banksOf(MEMBER, bid);
        assertEquals(1, b.size());
        assertEquals("가상저축", b.get(0).path("bank_name").asText());
    }

    @Test
    public void D37_어제_만료된_줄은_빠지고_오늘_만료와_내일_만료는_남는다() throws Exception {
        clearBanks();
        String bid = confirm(MEMBER, INST);
        bankRev(INST, 1, 1, "SAVE", "FIRST", "B02", null, ymd(-1));
        bankRev(INST, 2, 1, "SAVE", "SECOND", "B03", null, ymd(1));
        bankRev(INST, 3, 1, "SAVE", "FIRST", "B05", null, ymd(0));   // 경계: 오늘 만료는 아직 유효(qa P3-1)
        JsonNode b = banksOf(MEMBER, bid);
        assertEquals(2, b.size());
        assertEquals("신한은행", b.get(0).path("bank_name").asText());
        assertEquals("하나은행", b.get(1).path("bank_name").asText());
    }

    @Test
    public void D38_약정은_기관별로_나뉜다_줄_번호가_겹쳐도_섞이지_않는다() throws Exception {
        clearBanks();
        String nowon = confirm(MEMBER, INST);
        String dobong = confirm(MEMBER, "dobong");
        bankRev(INST, 1, 1, "SAVE", "FIRST", "B02", null, ymd(365));
        bankRev(INST, 2, 1, "SAVE", "SECOND", "B03", null, ymd(365));
        bankRev("dobong", 1, 1, "SAVE", "FIRST", "B05", null, ymd(365));
        JsonNode body = json(list(MEMBER, null, "refresh"));
        assertEquals(2, row(body, nowon).path("current_banks").size());
        JsonNode d = row(body, dobong).path("current_banks");
        assertEquals(1, d.size());
        assertEquals("하나은행", d.get(0).path("bank_name").asText());
    }

    @Test
    public void D39_현재_약정은_줄_번호_순으로_나온다() throws Exception {
        clearBanks();
        String bid = confirm(MEMBER, INST);
        // 은행 이름 순서와 다르게 둔다(qa P3-2). 단 MySQL InnoDB는 PK 순서로 읽어 ORDER BY 누락은 Oracle에서만 드러난다.
        bankRev(INST, 3, 1, "SAVE", "FIRST", "B03", null, ymd(365));
        bankRev(INST, 1, 1, "SAVE", "FIRST", "B05", "가상", ymd(365));   // 코드 이름이 직접 입력 이름보다 먼저(qa P3-3)
        bankRev(INST, 2, 1, "SAVE", "FIRST", "B02", null, ymd(365));
        JsonNode b = banksOf(MEMBER, bid);
        assertEquals(3, b.size());
        assertEquals("하나은행", b.get(0).path("bank_name").asText());
        assertEquals("KB국민은행", b.get(1).path("bank_name").asText());
        assertEquals("신한은행", b.get(2).path("bank_name").asText());
    }

    @Test
    public void D40_약정_끝이_연_또는_연월이면_그_해_그_달_말일까지_유효하고_지난해_지난달_깨진_값은_빠진다() throws Exception {
        clearBanks();
        String bid = confirm(MEMBER, INST);
        LocalDate today = LocalDate.parse(Times.todayKst());
        bankRev(INST, 1, 1, "SAVE", "FIRST", "B02", null, String.valueOf(today.getYear()));              // 올해 → 12-31 까지 유효
        bankRev(INST, 2, 1, "SAVE", "SECOND", "B03", null, today.toString().substring(0, 7));            // 이번 달 → 말일까지 유효
        bankRev(INST, 3, 1, "SAVE", "FIRST", "B05", null, String.valueOf(today.getYear() - 1));          // 지난해 → 제외
        bankRev(INST, 4, 1, "SAVE", "FIRST", "B04", null, "abc");                                         // 깨진 값 → 제외
        bankRev(INST, 5, 1, "SAVE", "FIRST", "B05", null, today.minusMonths(1).toString().substring(0, 7));   // 지난달 → 제외
        JsonNode b = banksOf(MEMBER, bid);
        assertEquals(2, b.size());
        assertEquals("KB국민은행", b.get(0).path("bank_name").asText());
        assertEquals("신한은행", b.get(1).path("bank_name").asText());
    }

    @Test
    public void D41_은행이_기타이면_직접_입력_이름이_나오고_이름이_없으면_코드표_이름_그것도_없으면_코드값이다() throws Exception {
        clearBanks();
        String bid = confirm(MEMBER, INST);
        bankRev(INST, 1, 1, "SAVE", "FIRST", "ETC", "가상조합", ymd(365));
        bankRev(INST, 2, 1, "SAVE", "SECOND", "ETC", null, ymd(365));
        bankRev(INST, 3, 1, "SAVE", "FIRST", "Z99", null, ymd(365));
        bankRev(INST, 4, 1, "SAVE", "SECOND", "ETC", "   ", ymd(365));   // 공백만 → 이름 없음으로 본다
        JsonNode b = banksOf(MEMBER, bid);
        assertEquals(4, b.size());
        assertEquals("기타(직접 입력)", b.get(3).path("bank_name").asText());
        assertEquals("가상조합", b.get(0).path("bank_name").asText());
        assertEquals("기타(직접 입력)", b.get(1).path("bank_name").asText());
        assertEquals("Z99", b.get(2).path("bank_name").asText());
    }

    @Test
    public void D42_check_block은_상태_먼저_담당_나중이고_can_check와_짝이다() throws Exception {
        String pre = confirm(MEMBER, "dobong");          // CONFIRMED — 승인 전
        String open = opened(INST);                       // IN_PROGRESS, 담당 MEMBER2
        JsonNode asMember2 = json(list(MEMBER2, "include_ended=true", "refresh"));
        assertNull("남이 확정만 한 건은 내 작업에 없다", row(asMember2, pre));   // PRE_OPEN 검사는 아래 MEMBER(확정자)가 맡는다
        assertTrue(row(asMember2, open).path("check_block").isNull());
        assertTrue(row(asMember2, open).path("can_check").asBoolean());
        JsonNode asMember = json(list(MEMBER, "include_ended=true", "refresh"));
        assertEquals("NOT_MINE", row(asMember, open).path("check_block").asText());
        assertEquals("PRE_OPEN", row(asMember, pre).path("check_block").asText());   // 상태가 먼저 — 담당이 아니어도 PRE_OPEN
        setState(open, "CANCELLED");                      // 합성: 배정은 활성으로 남는다
        assertEquals("ENDED", row(json(list(MEMBER2, "include_ended=true", "refresh")), open).path("check_block").asText());
        JsonNode endedAsMember = row(json(list(MEMBER, "include_ended=true", "refresh")), open);   // 담당이 아닌 사람 눈에도 ENDED
        assertEquals("ENDED", endedAsMember.path("check_block").asText());
        assertFalse(endedAsMember.path("is_mine").asBoolean());
        assertFalse(endedAsMember.path("can_check").asBoolean());
        for (JsonNode r : json(list(MEMBER2, "include_ended=true", "refresh")).path("rows")) {
            assertEquals(r.path("check_block").isNull(), r.path("can_check").asBoolean());
        }
    }

    @Test
    public void D43_담당이_아닌_사용자가_승인_전_줄이나_남의_줄을_PUT하면_403이다() throws Exception {
        String pre = confirm(MEMBER, "dobong");
        assertEquals(403, check(MEMBER2, pre, COL, mark("DONE", 0)).getResponse().getStatus());
        String open = opened(INST);
        assertEquals(403, check(MEMBER, open, COL, mark("DONE", 0)).getResponse().getStatus());
        assertEquals(0, checkRows(pre));
        assertEquals(0, checkRows(open));
    }

    // ── 조회 범위(scope=mine|team|dept, 사용자 11-24) ─────────────────

    private JsonNode body(String emp, String query) throws Exception {
        MvcResult r = list(emp, query, "refresh");
        assertEquals(r.getResponse().getContentAsString(), 200, r.getResponse().getStatus());
        return json(r);
    }

    private int summaryTag(String action, String emp, String tag) {
        return tag == null
                ? count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE ACTION_CD=? AND BID_CASE_ID='NONE' AND ACTOR_EMP_NO=? AND TASK_CD IS NULL", action, emp)
                : count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE ACTION_CD=? AND BID_CASE_ID='NONE' AND ACTOR_EMP_NO=? AND TASK_CD=?", action, emp, tag);
    }

    @Test
    public void D44_scope가_없으면_역할_기본값_팀원_mine_팀장_team_부장_dept다() throws Exception {
        opened(INST);
        String[][] cases = {{MEMBER2, "mine"}, {LEAD, "team"}, {HEAD, "dept"}};
        for (String[] c : cases) {
            JsonNode b = body(c[0], null);
            assertEquals(c[0], c[1], b.path("scope").asText());
            assertEquals(c[0], c[1], b.path("scope_default").asText());
            assertTrue(c[0], b.path("team_resolved").asBoolean());
        }
    }

    @Test
    public void D45_scope가_형식_밖이면_400_BAD_SCOPE이고_입력값을_싣지_않으며_감사는_TASK_CD_없이_INVALID다() throws Exception {
        opened(INST);
        for (String q : new String[]{"scope=all", "scope=MINE", "scope="}) {
            MvcResult r = list(MEMBER, q, "refresh");
            assertEquals(q, 400, r.getResponse().getStatus());
            JsonNode d = json(r).path("detail");
            assertEquals(q, "BAD_SCOPE", d.path("code").asText());
            assertFalse(q, d.path("message").asText().contains("MINE") || d.path("message").asText().contains("all"));
        }
        assertEquals(3, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE ACTION_CD='DASH_LIST' AND OUTCOME='INVALID' AND BID_CASE_ID='NONE'"
                + " AND ACTOR_EMP_NO=? AND TASK_CD IS NULL", MEMBER));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE ACTION_CD='DASH_LIST_ROW' AND ACTOR_EMP_NO=?", MEMBER));
    }

    @Test
    public void D46_mine은_확정자_본인과_활성_담당의_건이고_개설_전도_포함한다() throws Exception {
        String pre = confirm(MEMBER, "dobong");
        String open = opened(INST);
        JsonNode m2 = body(MEMBER2, null);
        assertNotNull(row(m2, open));
        assertNull(row(m2, pre));
        JsonNode m1 = body(MEMBER, null);
        assertNotNull(row(m1, open));
        assertFalse(row(m1, open).path("is_mine").asBoolean());
        assertNotNull(row(m1, pre));
        JsonNode lead = body(LEAD, "scope=mine");
        assertNull(row(lead, open));
        assertNull(row(lead, pre));
    }

    @Test
    public void D47_팀_부서_작업은_개설_승인_전_건을_싣지_않고_mine에는_싣는다() throws Exception {
        String pre = confirm(MEMBER, "dobong");   // CONFIRMED
        String pend = confirm(MEMBER, INST);
        MvcResult r = postJson("/bidcases/" + pend + "/prep/open-requests", MEMBER, "{\"emp_nos\":[\"" + MEMBER2 + "\"]}");
        assertEquals(r.getResponse().getContentAsString(), 201, r.getResponse().getStatus());   // OPEN_PENDING, 승인 안 함
        JsonNode[] views = {body(MEMBER, "scope=team"), body(LEAD, null), body(HEAD, null), body(HEAD, "scope=dept")};
        for (JsonNode v : views) {
            assertNull(row(v, pre));
            assertNull(row(v, pend));
        }
        JsonNode mine = body(MEMBER, null);
        assertNotNull(row(mine, pre));
        assertNotNull(row(mine, pend));
    }

    @Test
    public void D48_팀은_결재선_기준이고_다른_팀장은_못_보며_수동_지정이_풀리면_나_혼자로_좁힌다() throws Exception {
        String open = opened(INST);   // 담당 MEMBER2
        assertNotNull(row(body(LEAD, null), open));
        assertNotNull(row(body(MEMBER, "scope=team"), open));
        JsonNode other = body(LEAD2, null);
        assertEquals("team", other.path("scope").asText());
        assertTrue(other.path("team_resolved").asBoolean());
        assertNull(row(other, open));
        assertNotNull(row(body(LEAD2, "scope=dept"), open));
        jdbc.update("UPDATE USERS SET APPROVER_MANUAL=0 WHERE EMP_NO=?", MEMBER);
        flushCache();
        JsonNode narrowed = body(MEMBER, "scope=team");
        assertFalse(narrowed.path("team_resolved").asBoolean());
        assertNull(row(narrowed, open));
    }

    // D52~D55: 테스트 트랜잭션이 끝나면 USERS·배정 변경은 롤백된다(D48 과 같은 방식) — 별도 원복 불필요.

    @Test
    public void D52_부장의_team은_dept와_같은_행이고_team_resolved는_true다() throws Exception {
        opened(INST);
        confirm(MEMBER, "dobong");
        JsonNode team = body(HEAD, "scope=team");
        JsonNode dept = body(HEAD, "scope=dept");
        assertEquals("team", team.path("scope").asText());
        assertTrue(team.path("team_resolved").asBoolean());
        assertEquals(dept.path("rows").size(), team.path("rows").size());
        for (JsonNode r : dept.path("rows")) {
            assertNotNull(row(team, r.path("bid_case_id").asText()));
        }
    }

    @Test
    public void D53_결재선에_영업팀장이_없는_팀원은_team이_나_혼자로_좁혀진다() throws Exception {
        String open = opened(INST);   // 담당 MEMBER2
        jdbc.update("UPDATE USERS SET APPROVER_EMP_NO=? WHERE EMP_NO=?", HEAD, MEMBER);   // 수동 지정, 결재자 = 부장 직결
        flushCache();
        JsonNode b = body(MEMBER, "scope=team");
        assertFalse(b.path("team_resolved").asBoolean());
        assertNull(row(b, open));
    }

    @Test
    public void D54_결재선의_첫_팀장이_비활성이면_그_팀원의_team은_나_혼자로_좁혀진다() throws Exception {
        String open = opened(INST);
        jdbc.update("UPDATE USERS SET STATUS='LOCKED' WHERE EMP_NO=?", LEAD);
        flushCache();
        JsonNode b = body(MEMBER, "scope=team");
        assertFalse(b.path("team_resolved").asBoolean());
        assertNull(row(b, open));
    }

    @Test
    public void D55_팀장_본인만_담당인_건도_같은_팀_팀원의_team에는_보인다() throws Exception {
        String open = opened(INST);
        jdbc.update("UPDATE BID_ASSIGNMENT SET EMP_NO=? WHERE BID_CASE_ID=? AND EMP_NO=?", LEAD, open, MEMBER2);
        JsonNode b = body(MEMBER, "scope=team");
        assertTrue(b.path("team_resolved").asBoolean());
        assertNotNull(row(b, open));
    }

    @Test
    public void D49_끝난_건은_개설_뒤_중단만_팀_부서에_실리고_확정_취소는_확정자_mine에만_남는다() throws Exception {
        String stopped = opened(INST);
        assertEquals(200, postJson("/bidcases/" + stopped + "/prep/cancel", LEAD, "{\"reason\":\"미참여 결정\"}").getResponse().getStatus());
        String unconfirmed = confirm(MEMBER, "dobong");
        assertEquals(200, postJson("/bidcases/" + unconfirmed + "/prep/unconfirm", LEAD, "{\"reason\":\"가상 취소\"}").getResponse().getStatus());
        for (String emp : new String[]{LEAD, HEAD, MEMBER2, MEMBER}) {
            JsonNode v = body(emp, "include_ended=true");
            assertNotNull(emp, row(v, stopped));
            if (!MEMBER.equals(emp)) { assertNull(emp, row(v, unconfirmed)); }
        }
        assertNotNull(row(body(MEMBER, "include_ended=true"), unconfirmed));
        assertNull(row(body(LEAD2, "include_ended=true"), stopped));
        assertNull(row(body(LEAD2, "include_ended=true"), unconfirmed));
    }

    @Test
    public void D50_목록_요약_감사_줄의_TASK_CD는_실제_적용_범위이고_건_줄은_NULL이다() throws Exception {
        String done = opened(INST);
        setState(done, "WRITABLE");
        assertEquals(200, list(MEMBER, null, "open").getResponse().getStatus());
        assertEquals(200, list(MEMBER2, "scope=dept", "open").getResponse().getStatus());
        assertEquals(200, list(LEAD, "include_ended=true", "refresh").getResponse().getStatus());
        assertEquals(1, summaryTag("DASH_LIST", MEMBER, "SCOPE_MINE"));
        assertEquals(1, summaryTag("DASH_LIST", MEMBER2, "SCOPE_DEPT"));
        assertEquals(1, summaryTag("DASH_LIST_ENDED", LEAD, "SCOPE_TEAM"));
        assertEquals(3, actByCol(done, "DASH_LIST_ROW", "OK", null));
    }

    @Test
    public void D51_영업부서_밖은_범위_값과_무관하게_403이고_거부_감사의_TASK_CD는_형식이_맞을_때만_남는다() throws Exception {
        assertEquals(403, list(DESIGNER, "scope=team", "open").getResponse().getStatus());
        assertEquals(403, list(DESIGNER, "scope=bad", "open").getResponse().getStatus());
        assertEquals(1, summaryTag("DASH_LIST", DESIGNER, "SCOPE_TEAM"));
        assertEquals(1, summaryTag("DASH_LIST", DESIGNER, null));
    }
}
