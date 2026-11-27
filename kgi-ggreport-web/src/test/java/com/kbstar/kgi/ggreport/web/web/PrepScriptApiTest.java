package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.support.PrepOpenApprovalSwitch;
import com.kbstar.kgi.ggreport.web.support.TestGoals;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * NEXT 113 ⑤ — 발표 대본 Word(POST /bidcases/{id}/prep/board-script-docx) + 보안 검토(11-26) 반영 네 건.
 * ⚠️ X-Emp-No 는 자기신고 — 여기서 고정하는 것은 업무 규칙이지 사칭 방지가 아니다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class PrepScriptApiTest {

    private static final String LEAD = "5047192";
    private static final String HEAD = "2674805";
    private static final String MEMBER = "3918264";
    private static final String ASSIGNEE = "3361829";
    private static final String DESIGNER = "7130526";
    private static final String IT = "4482971";
    private static final String INST = "nowon";
    private static final String VALUES = "{'tables':{'A':{'r1_c2':'5.00','r2_c2':'1.00','r4_c2':'6.00'},'B':{'r1_c8':'10.14'}}}";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PrepOpenApprovalSwitch openApproval;
    private final ObjectMapper om = new ObjectMapper();

    @Before public void 옛_개설_신청_켜기() { openApproval.setForTest(true); }
    @After public void 옛_개설_신청_끄기() { openApproval.setForTest(false); }
    @Before public void 올해_목표_바탕() { TestGoals.seedThisYear(jdbc, INST); }

    private JsonNode json(MvcResult r) throws Exception {
        return om.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private MvcResult call(HttpMethod m, String path, String emp, String body, String screen, String button) throws Exception {
        MockHttpServletRequestBuilder b = MockMvcRequestBuilders.request(m, path);
        if (body != null) {
            b = b.contentType(MediaType.APPLICATION_JSON).content(body.replace('\'', '"').getBytes(StandardCharsets.UTF_8));
        } else if (m == HttpMethod.POST || m == HttpMethod.PUT) {
            b = b.content(new byte[0]);   // 본문 없는 쓰기 — 브라우저처럼 Content-Length: 0 (길이 없으면 쓰기 크기 필터가 411)
        }
        if (emp != null) {
            b = b.header("X-Emp-No", emp);
        }
        if (screen != null) {
            b = b.header("X-Screen-Id", screen);
        }
        if (button != null) {
            b = b.header("X-Button-Id", button);
        }
        return mockMvc.perform(b).andReturn();
    }

    private MvcResult script(String bid, String emp, String body) throws Exception {
        return call(HttpMethod.POST, "/bidcases/" + bid + "/prep/board-script-docx", emp, body, "prep_detail", "script_docx");
    }

    private String opened() throws Exception {
        MvcResult c = call(HttpMethod.POST, "/preps", MEMBER, "{'institution_id':'" + INST + "'}", null, null);
        assertEquals(201, c.getResponse().getStatus());
        String bid = json(c).path("bid_case_id").asText();
        MvcResult o = call(HttpMethod.POST, "/bidcases/" + bid + "/prep/open-requests", MEMBER, "{'emp_nos':['" + ASSIGNEE + "']}", null, null);
        assertEquals(o.getResponse().getContentAsString(), 201, o.getResponse().getStatus());
        long req = json(o).path("req_id").asLong();
        assertEquals(200, call(HttpMethod.POST, "/approval-requests/" + req + "/decide", LEAD, "{'decision':'APPROVE','comment':null}", null, null).getResponse().getStatus());
        return bid;
    }

    /** MyBatis 쓰기 한 번으로 1차 캐시를 비운다(JdbcTemplate 으로 행을 바꾼 뒤 호출 — BoardMaterialApiTest 와 같은 방법). */
    private void flushCache() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post("/bidcases").contentType(MediaType.APPLICATION_JSON)
                .content("{\"institution_id\":\"nowon\"}").header("X-User-Id", "dave")).andReturn();
    }

    /** 이사회 자료를 만들고(담당자) 표 A·B 값을 직접 심는다. confirmed 면 확정(CONFIRMED, 확정 판 1)으로 바꾼다. */
    private long board(String bid, boolean confirmed) throws Exception {
        return board(bid, confirmed, 2026);
    }

    private long board(String bid, boolean confirmed, int year) throws Exception {
        MvcResult r = call(HttpMethod.POST, "/board-materials", ASSIGNEE, "{'bid_case_id':'" + bid + "','year':" + year + "}", "board_write", "save_version");
        assertEquals(r.getResponse().getContentAsString(), 201, r.getResponse().getStatus());
        long id = json(r).path("material_id").asLong();
        jdbc.update("INSERT INTO BOARD_MATERIAL_SNAP (MATERIAL_ID, SNAP_NO, VALUES_JSON, NOTE, SAVED_BY, SAVED_AT) VALUES (?,?,?,?,?,?)",
                id, 1, VALUES.replace('\'', '"'), null, ASSIGNEE, "2026-11-10T09:00:00+09:00");
        jdbc.update("UPDATE BOARD_MATERIAL SET CUR_SNAP=1 WHERE MATERIAL_ID=?", id);
        if (confirmed) {
            jdbc.update("UPDATE BOARD_MATERIAL SET STATUS_CD='CONFIRMED', CONFIRMED_SNAP=1, CONFIRMED_BY=?, CONFIRMED_AT=? WHERE MATERIAL_ID=?",
                    LEAD, "2026-11-10T09:00:00+09:00", id);
        }
        flushCache();
        return id;
    }

    private void term(int year, String start) {
        jdbc.update("INSERT INTO INST_BID_TERM (INSTITUTION_ID, TARGET_YEAR, REV_NO, ACTION_CD, TERM_START, EDITOR_EMP_NO, EDITOR_NAME,"
                + " EMP_VERIFIED, SCREEN_ID, BUTTON_ID, UI_VALID, SAVED_AT) VALUES (?,?,1,'SAVE',?,?,?,0,'x','x',0,?)",
                INST, year, start, LEAD, "가상팀장", "2026-11-10T09:00:00+09:00");
    }

    private static String text(byte[] bytes) throws Exception {
        try (XWPFDocument d = new XWPFDocument(new ByteArrayInputStream(bytes))) {
            StringBuilder sb = new StringBuilder();
            for (XWPFParagraph p : d.getParagraphs()) {
                sb.append(p.getText()).append('\n');
            }
            return sb.toString();
        }
    }

    private String body(MvcResult r) throws Exception {
        assertEquals(r.getResponse().getContentAsString(), 200, r.getResponse().getStatus());
        return text(r.getResponse().getContentAsByteArray());
    }

    private int boardActs(long id, String where) {
        return count("SELECT COUNT(*) FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=? AND ACTION_CD='SCRIPT_DOCX' " + where, id);
    }

    private String lastDetail(String bid) {
        List<String> d = jdbc.queryForList("SELECT DETAIL FROM ACCESS_LOG WHERE EVENT_TYPE='API' AND HTTP_METHOD='POST' AND REQ_PATH=? ORDER BY LOG_ID DESC",
                String.class, "/bidcases/" + bid + "/prep/board-script-docx");
        return d.isEmpty() ? "" : d.get(0);
    }

    @Test
    public void 담당자는_손_칸_없이도_받고_빈_자리는_괄호이며_초안_표시와_감사_한_줄() throws Exception {
        String bid = opened();
        MvcResult r = script(bid, ASSIGNEE, null);
        assertEquals(200, r.getResponse().getStatus());
        byte[] bytes = r.getResponse().getContentAsByteArray();
        assertEquals('P', bytes[0]);
        assertEquals('K', bytes[1]);
        assertTrue(r.getResponse().getContentType().contains("wordprocessingml"));
        assertTrue(r.getResponse().getHeader("Content-Disposition").startsWith("attachment"));
        assertEquals("no-store", r.getResponse().getHeader("Cache-Control"));
        assertEquals("nosniff", r.getResponse().getHeader("X-Content-Type-Options"));
        assertEquals("Y", r.getResponse().getHeader("X-Script-Draft"));
        String t = text(bytes);
        assertTrue(t, t.startsWith("[확정 전 초안] "));
        assertTrue(t, t.contains("〔의안번호 입력 필요〕"));
        assertTrue(t, t.contains("〔이사회 자료 없음 — 확인 필요〕"));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='SCRIPT_DOCX' AND OUTCOME='OK'"
                + " AND TASK_CD='T6' AND ACTOR_EMP_NO=? AND SCREEN_ID='prep_detail' AND BUTTON_ID='script_docx' AND UI_VALID=1", bid, ASSIGNEE));
        String d = lastDetail(bid);
        assertTrue(d, d.contains("code=SCRIPT_DOCX") && d.endsWith(" board=- snap=- form_ver=- draft=Y"));
        assertEquals("이사회 자료가 없으면 이사회 감사 줄도 없다", 0, count("SELECT COUNT(*) FROM BOARD_MATERIAL_ACT WHERE ACTION_CD='SCRIPT_DOCX'"));
    }

    @Test
    public void 손_칸이_문장에_들어가고_본문은_감사에_남지_않는다() throws Exception {
        String bid = opened();
        MvcResult r = script(bid, ASSIGNEE, "{'meeting':'COMMITTEE','round':'10','agenda_no':'제 2026-10-03호','speaker_dept':'기관영업부',"
                + "'speaker_name':'가상발표자','speaker_title':'부장','term_years':4,'review_when':'10월 중','amount_mode':'TOTAL',"
                + "'intro':'가상 첫 줄\\n가상 둘째 줄','unknown_key':'무시'}");
        assertEquals(200, r.getResponse().getStatus());
        String t = text(r.getResponse().getContentAsByteArray());
        assertTrue(t, t.contains("제10차 출연금심의위원회 시나리오"));
        assertTrue(t, t.contains("안녕하십니까? 기관영업부 가상발표자 부장입니다."));
        assertTrue(t, t.contains("의안번호 제 2026-10-03호"));
        assertTrue(t, t.contains("가상 첫 줄\n가상 둘째 줄\n"));
        assertTrue(t, t.contains("총 4년이며"));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND (ACTION_CD LIKE '%가상%' OR TASK_CD LIKE '%가상%')", bid));
        assertFalse(lastDetail(bid), lastDetail(bid).contains("가상"));
    }

    @Test
    public void 발표자_이름을_비우면_내려받는_사람이_기본이다() throws Exception {
        String bid = opened();
        String name = jdbc.queryForObject("SELECT NAME FROM USERS WHERE EMP_NO=?", String.class, ASSIGNEE);
        String t = text(script(bid, ASSIGNEE, "{'speaker_dept':'기관영업부'}").getResponse().getContentAsByteArray());
        assertTrue(t, t.contains("안녕하십니까? 기관영업부 " + name));
    }

    @Test
    public void 영업팀장_부장은_받고_전산_디자이너는_404이며_HIDDEN_줄() throws Exception {
        String bid = opened();
        assertEquals(200, script(bid, LEAD, null).getResponse().getStatus());
        assertEquals(404, script(bid, IT, null).getResponse().getStatus());
        assertEquals(404, script(bid, DESIGNER, null).getResponse().getStatus());
        assertEquals(2, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='SCRIPT_DOCX' AND OUTCOME='HIDDEN'", bid));
    }

    @Test
    public void 없는_건은_404이고_사번이_없으면_401() throws Exception {
        assertEquals(404, script("no-such-case", ASSIGNEE, null).getResponse().getStatus());
        String bid = opened();
        assertEquals(401, call(HttpMethod.POST, "/bidcases/" + bid + "/prep/board-script-docx", null, null, "prep_detail", "script_docx").getResponse().getStatus());
    }

    @Test
    public void 잘못된_입력은_400_BAD_VALUE이고_입력값을_싣지_않으며_INVALID_줄() throws Exception {
        String bid = opened();
        String[][] bad = {
                {"{'round':'열'}", "round"},
                {"{'term_years':0}", "term_years"},
                {"{'term_years':31}", "term_years"},
                {"{'meeting':'기타'}", "meeting"},
                {"{'amount_mode':'ALL'}", "amount_mode"},
                {"{'agenda_no':'a\\u0007b'}", "agenda_no"},                          // 제어문자
                {"{'speaker_name':'a\\u202eb'}", "speaker_name"},                    // 방향 바꿈(서식 문자)
                {"{'speaker_dept':'" + rep("가", 41) + "'}", "speaker_dept"},        // 길이
                {"{'intro':'" + rep("가", 301) + "'}", "intro"},                     // 줄당 300자
                {"{'effect':'a\\tb'}", "effect"},                                    // 탭
        };
        for (String[] c : bad) {
            MvcResult r = script(bid, ASSIGNEE, c[0]);
            assertEquals(c[0], 400, r.getResponse().getStatus());
            assertEquals("BAD_VALUE", json(r).path("detail").path("code").asText());
            assertEquals(c[1], json(r).path("detail").path("key").asText());
            assertFalse(r.getResponse().getContentAsString(StandardCharsets.UTF_8).contains("열"));
        }
        assertEquals(bad.length, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='SCRIPT_DOCX' AND OUTCOME='INVALID'", bid));
    }

    @Test
    public void 여러_줄_칸은_12줄_1000자_이내() throws Exception {
        String bid = opened();
        StringBuilder many = new StringBuilder();
        for (int i = 0; i < 13; i++) {
            many.append("줄").append(i).append("\\n");
        }
        assertEquals(400, script(bid, ASSIGNEE, "{'intro':'" + many + "'}").getResponse().getStatus());
        StringBuilder wide = new StringBuilder();
        for (int i = 0; i < 4; i++) {
            wide.append(rep("가", 280)).append("\\n");
        }
        assertEquals(400, script(bid, ASSIGNEE, "{'intro':'" + wide + "'}").getResponse().getStatus());   // 합계 1,120자
    }

    // ── 'AI 초안을 넣은 칸' 기록(사용자 결정 11-27: 넣은 뒤 고쳐 써도 AI 초안을 쓴 칸으로 남긴다) ──────────

    private int aiActs(String bid, String action) {
        return count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD=? AND OUTCOME='OK' AND TASK_CD='T6'"
                + " AND ACTOR_EMP_NO=? AND SCREEN_ID='prep_detail' AND BUTTON_ID='script_docx' AND UI_VALID=1", bid, action, ASSIGNEE);
    }

    @Test
    public void ai_fields의_칸이_채워져_있으면_그_칸의_AI_감사_한_줄과_DETAIL_꼬리표가_남는다() throws Exception {
        String bid = opened();
        MvcResult r = script(bid, ASSIGNEE, "{'intro':'가','ai_fields':['intro']}");
        assertEquals(200, r.getResponse().getStatus());
        assertEquals(1, aiActs(bid, "SCRIPT_DOCX_AI_INTRO"));
        assertEquals(0, aiActs(bid, "SCRIPT_DOCX_AI_EFFECT"));
        String d = lastDetail(bid);
        assertTrue(d, d.endsWith(" ai=intro"));
        assertFalse(d, d.contains("가"));   // 본문은 싣지 않는다
    }

    @Test
    public void ai_fields에_모르는_키가_있으면_400_INVALID_이고_AI_줄은_없다() throws Exception {
        String bid = opened();
        MvcResult r = script(bid, ASSIGNEE, "{'intro':'가','ai_fields':['x']}");
        assertEquals(400, r.getResponse().getStatus());
        assertEquals("BAD_VALUE", json(r).path("detail").path("code").asText());
        assertEquals("ai_fields", json(r).path("detail").path("key").asText());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='SCRIPT_DOCX' AND OUTCOME='INVALID'", bid));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD LIKE 'SCRIPT_DOCX_AI_%'", bid));
    }

    @Test
    public void ai_fields의_칸이_비어_있으면_AI_감사_줄은_없다() throws Exception {
        String bid = opened();
        MvcResult r = script(bid, ASSIGNEE, "{'intro':'가','ai_fields':['effect']}");   // effect 는 빈 칸 — AI 글이 들어가지 않았다
        assertEquals(200, r.getResponse().getStatus());
        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD LIKE 'SCRIPT_DOCX_AI_%'", bid));
        assertTrue(lastDetail(bid), lastDetail(bid).endsWith(" ai=effect"));   // 화면이 보낸 목록 그대로
    }

    @Test
    public void 화면_버튼_식별자가_틀려도_받되_UNKNOWN으로_감사한다() throws Exception {
        String bid = opened();
        MvcResult r = call(HttpMethod.POST, "/bidcases/" + bid + "/prep/board-script-docx", ASSIGNEE, null, "evil_screen", "evil_button");
        assertEquals(200, r.getResponse().getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='SCRIPT_DOCX' AND OUTCOME='OK'"
                + " AND SCREEN_ID='UNKNOWN' AND BUTTON_ID='UNKNOWN' AND UI_VALID=0", bid));
    }

    // ── 보안 검토 11-26 ① 반영 네 건 ─────────────────────────────────────

    @Test
    public void 확정_이사회_자료로_만들면_이사회_감사_한_줄과_근거가_남고_숫자가_채워진다() throws Exception {
        String bid = opened();
        long id = board(bid, true);
        MvcResult r = script(bid, ASSIGNEE, "{'amount_mode':'EXCL_IT'}");
        String t = body(r);
        assertTrue(t, t.startsWith("[확정 전 초안] 2026년"));          // 요약 양식이 확정이 아니라 초안
        assertTrue(t, t.contains("승인받고자 하는 총 금액은 6억원입니다."));   // 5.00 + 1.00
        assertTrue(t, t.contains("순이익은 명목가치 기준 10.14억원입니다."));
        assertFalse(t, t.contains("〔이사회 자료"));
        assertEquals(1, boardActs(id, "AND OUTCOME='OK' AND SNAP_NO=1 AND ACTOR_EMP_NO='" + ASSIGNEE + "' AND SCREEN_ID='prep_detail'"
                + " AND BUTTON_ID='script_docx' AND UI_VALID=1"));
        String d = lastDetail(bid);
        assertTrue(d, d.contains(" board=" + id + " snap=1 form_ver=- draft=Y"));
        assertTrue(d, d.matches(".*board=[0-9]+ snap=[0-9]+ form_ver=(?:[0-9]+|-) draft=[YN]$"));   // 숫자·Y/N 만
        // 영업부장도 받으며 한 줄 더
        assertEquals(200, script(bid, HEAD, null).getResponse().getStatus());
        assertEquals(2, boardActs(id, "AND OUTCOME='OK'"));
    }

    @Test
    public void 합계가_출연금_예비비_합과_다르면_amount_mode가_문서_금액을_가른다() throws Exception {
        String bid = opened();
        long id = board(bid, true);
        // 합계 9 ≠ 출연금 5 + 예비비 1 (전산비 3 가정)
        jdbc.update("UPDATE BOARD_MATERIAL_SNAP SET VALUES_JSON=? WHERE MATERIAL_ID=? AND SNAP_NO=1",
                "{'tables':{'A':{'r1_c2':'5.00','r2_c2':'1.00','r3_c2':'3.00','r4_c2':'9.00'},'B':{'r1_c8':'10.14'}}}".replace('\'', '"'), id);
        flushCache();
        String none = body(script(bid, ASSIGNEE, null));
        assertTrue(none, none.contains("승인받고자 하는 총 금액은 9억원입니다."));
        String excl = body(script(bid, ASSIGNEE, "{'amount_mode':'EXCL_IT'}"));
        assertTrue(excl, excl.contains("승인받고자 하는 총 금액은 6억원입니다."));
        MvcResult bad = script(bid, ASSIGNEE, "{'amount_mode':'X'}");
        assertEquals(400, bad.getResponse().getStatus());
        assertEquals("amount_mode", json(bad).path("detail").path("key").asText());
    }

    @Test
    public void 다른_화면_짝이면_두_감사_줄_모두_ui_valid_0이다() throws Exception {
        String bid = opened();
        long id = board(bid, true);
        MvcResult r = call(HttpMethod.POST, "/bidcases/" + bid + "/prep/board-script-docx", ASSIGNEE, null, "prep_list", "script_docx");
        assertEquals(200, r.getResponse().getStatus());
        assertEquals(1, boardActs(id, "AND OUTCOME='OK' AND SCREEN_ID='UNKNOWN' AND BUTTON_ID='UNKNOWN' AND UI_VALID=0"));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='SCRIPT_DOCX' AND OUTCOME='OK' AND UI_VALID=0", bid));
        // 첨부 목록 같은 다른 사전준비 주소에서 script_docx 는 UNKNOWN
        assertEquals(200, call(HttpMethod.GET, "/bidcases/" + bid + "/prep/attachments", ASSIGNEE, null, "prep_detail", "script_docx").getResponse().getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='ATTACH_LIST' AND BUTTON_ID='UNKNOWN' AND UI_VALID=0", bid));
    }

    @Test
    public void 같은_건에_자료가_여럿이면_가장_최근_연도_하나만_쓰고_옛_확정본으로_넘어가지_않는다() throws Exception {
        String bid = opened();
        long old = board(bid, true, 2025);
        long cur = board(bid, false, 2026);
        MvcResult r = script(bid, ASSIGNEE, null);
        body(r);
        assertEquals("Y", r.getResponse().getHeader("X-Script-Draft"));
        String d = lastDetail(bid);
        assertTrue(d, d.contains(" board=" + cur + " snap=1 "));
        assertEquals("최신이 확정 전이면 옛 확정본의 감사 줄은 없다", 0, boardActs(old, ""));
        assertEquals(0, boardActs(cur, ""));
        // 최신(2026)이 확정이면 확정 판 감사 한 줄, 옛 연도 초안은 쓰지 않는다
        jdbc.update("UPDATE BOARD_MATERIAL SET STATUS_CD='CONFIRMED', CONFIRMED_SNAP=1, CONFIRMED_BY=?, CONFIRMED_AT=? WHERE MATERIAL_ID=?",
                LEAD, "2026-11-10T09:00:00+09:00", cur);
        jdbc.update("UPDATE BOARD_MATERIAL SET STATUS_CD='DRAFT', CONFIRMED_SNAP=NULL, CONFIRMED_BY=NULL, CONFIRMED_AT=NULL WHERE MATERIAL_ID=?", old);
        flushCache();
        body(script(bid, ASSIGNEE, null));
        assertTrue(lastDetail(bid), lastDetail(bid).contains(" board=" + cur + " snap=1 "));
        assertEquals(1, boardActs(cur, "AND OUTCOME='OK'"));
        assertEquals(0, boardActs(old, ""));
    }

    @Test
    public void 이사회_감사_줄도_다른_화면_짝이면_UNKNOWN이다_board_list_open() throws Exception {
        String bid = opened();
        long id = board(bid, true);
        MvcResult r = call(HttpMethod.POST, "/bidcases/" + bid + "/prep/board-script-docx", ASSIGNEE, null, "board_list", "open");
        assertEquals(200, r.getResponse().getStatus());
        assertEquals(1, boardActs(id, "AND OUTCOME='OK' AND SCREEN_ID='UNKNOWN' AND BUTTON_ID='UNKNOWN' AND UI_VALID=0"));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='SCRIPT_DOCX' AND OUTCOME='OK' AND UI_VALID=0", bid));
    }

    @Test
    public void 확정_전_이사회_자료는_숫자는_쓰되_이사회_감사_줄은_없고_초안이다() throws Exception {
        String bid = opened();
        long id = board(bid, false);
        String t = body(script(bid, ASSIGNEE, null));
        assertTrue(t, t.startsWith("[확정 전 초안] "));
        assertTrue(t, t.contains("6억원입니다."));
        assertEquals(0, boardActs(id, ""));
        String d = lastDetail(bid);
        assertTrue(d, d.contains(" board=" + id + " snap=1 "));
    }

    @Test
    public void 이사회_자료를_볼_수_없는_사람에게는_금액이_괄호이고_이사회_감사도_없다() throws Exception {
        String bid = opened();
        long id = board(bid, true);
        String t = body(script(bid, LEAD, null));   // 영업팀장 — 사전준비는 보지만 이사회 자료 열람 대상(담당자·부장)이 아니다
        assertTrue(t, t.contains("〔이사회 자료 없음 — 확인 필요〕"));
        assertFalse(t, t.contains("6억원"));
        assertEquals(0, boardActs(id, ""));
        assertTrue(lastDetail(bid), lastDetail(bid).contains(" board=- snap=- "));
    }

    @Test
    public void 양식을_볼_수_없는_사람에게는_요약_양식_값이_괄호다() throws Exception {
        String bid = opened();
        MvcResult pf = call(HttpMethod.POST, "/bidcases/" + bid + "/prep/forms/INST_SUMMARY/prefill", ASSIGNEE, "{'base_ver':0}", "prep_form", "form_prefill");
        assertEquals(pf.getResponse().getContentAsString(), 200, pf.getResponse().getStatus());
        MvcResult sv = call(HttpMethod.PUT, "/bidcases/" + bid + "/prep/forms/INST_SUMMARY/draft", ASSIGNEE,
                "{'base_ver':1,'fields':{'staff':{'val':'999명'},'budget':{'val':'9,999억원'}}}", "prep_form", "form_save");
        assertEquals(sv.getResponse().getContentAsString(), 200, sv.getResponse().getStatus());
        String own = body(script(bid, ASSIGNEE, null));
        assertTrue(own, own.contains("임직원 수 999명, 예산규모는 9,999억원으로"));
        assertTrue(lastDetail(bid), lastDetail(bid).contains(" form_ver=2 "));
        assertTrue(body(script(bid, LEAD, null)).contains("임직원 수 999명"));   // 영업팀장은 양식을 본다

        // 확정 상태가 되면 영업팀 전원이 사전준비를 보지만 양식은 담당자·팀장·부장만 본다 — 비담당 영업팀원
        jdbc.update("UPDATE BID_PREP SET STATE_CD = 'CONFIRMED' WHERE BID_CASE_ID = ?", bid);
        flushCache();
        String other = body(script(bid, MEMBER, null));
        assertTrue(other, other.contains("〔임직원 수 확인 필요〕"));
        assertTrue(other, other.contains("〔예산 확인 필요〕"));
        assertFalse(other, other.contains("999명") || other.contains("9,999억원"));
        assertTrue(lastDetail(bid), lastDetail(bid).contains(" form_ver=- draft=Y"));
    }

    @Test
    public void 약정_시작일은_이사회_연도의_행만_쓰고_연도를_모르면_괄호다() throws Exception {
        String bid = opened();
        jdbc.update("DELETE FROM INST_BID_TERM WHERE INSTITUTION_ID = ?", INST);
        term(2099, "2100-01-01");
        // 이사회 자료가 없으면 '가장 큰 목표 연도'를 쓰지 않는다
        String none = body(script(bid, ASSIGNEE, null));
        assertTrue(none, none.contains("〔약정 시작일 확인 필요〕"));
        assertFalse(none, none.contains("2100년"));
        // 이사회 연도(2026)의 행이 없으면 역시 괄호
        board(bid, true);
        String other = body(script(bid, ASSIGNEE, null));
        assertTrue(other, other.contains("〔약정 시작일 확인 필요〕"));
        assertFalse(other, other.contains("2100년"));
        // 같은 목표 연도 행이 있으면 그 날짜
        term(2026, "2027-03-01");
        String ok = body(script(bid, ASSIGNEE, null));
        assertTrue(ok, ok.contains("2027년 3월 1일부터"));
        assertFalse(ok, ok.contains("2100년"));
        // 이사회 자료를 볼 수 없는 사람은 연도를 모르므로 날짜도 괄호
        String lead = body(script(bid, LEAD, null));
        assertTrue(lead, lead.contains("〔약정 시작일 확인 필요〕"));
        assertFalse(lead, lead.contains("2027년 3월 1일"));
    }

    private static String rep(String s, int n) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < n; i++) {
            b.append(s);
        }
        return b.toString();
    }
}
