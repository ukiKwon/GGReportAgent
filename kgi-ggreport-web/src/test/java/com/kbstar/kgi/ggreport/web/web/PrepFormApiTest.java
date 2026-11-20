package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
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

import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * NEXT 100 S2 — 사전준비 양식 '기관 정보 요약'(049) API. PrepApiTest 와 같은 방식(건 확정 → 개설 → 승인으로 IN_PROGRESS)으로 건을 만든다.
 * 시드: 영업팀 김영업 3918264(확정자, 담당 아님)·윤서준 3361829(담당), 영업팀장 이영업 5047192, 영업부장 박영업 2674805,
 * 디자이너 최디자이너 7130526·신유나 1625983, 전산팀 권전산 4482971. 기관 nowon 의 기관장·약정·사업계획은 이 시험이 직접 넣는다(롤백된다).
 * ⚠️ X-Emp-No 는 자기신고다 — 여기서 고정하는 것은 업무 규칙이지 사칭 방지가 아니다.
 * 한 테스트 트랜잭션이라 서비스가 던진 409 앞에서 쓴 행은 롤백되지 않는다 — 실패 케이스는 그 앞에서 쓴 것이 없는 순서로 단언한다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class PrepFormApiTest {

    private static final String LEAD = "5047192";
    private static final String HEAD = "2674805";
    private static final String MEMBER = "3918264";
    private static final String ASSIGNEE = "3361829";
    private static final String DESIGNER = "7130526";
    private static final String DESIGNER2 = "1625983";
    private static final String IT = "4482971";
    private static final String INST = "nowon";
    private static final String BIRTH = "1971-02-03";

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

    private MvcResult call(HttpMethod m, String path, String emp, String body, String button) throws Exception {
        MockHttpServletRequestBuilder b = MockMvcRequestBuilders.request(m, path);
        if (body != null) {
            b = b.contentType(MediaType.APPLICATION_JSON).content(body.replace('\'', '"'));
        }
        if (emp != null) {
            b = b.header("X-Emp-No", emp);
        }
        if (button != null) {
            b = b.header("X-Screen-Id", "prep_form").header("X-Button-Id", button);
        }
        return mockMvc.perform(b).andReturn();
    }

    private String url(String bid, String tail) {
        return "/bidcases/" + bid + "/prep/forms/INST_SUMMARY" + tail;
    }

    private String confirmCase(String emp) throws Exception {
        MvcResult r = call(HttpMethod.POST, "/preps", emp, "{'institution_id':'" + INST + "'}", null);
        assertEquals(201, r.getResponse().getStatus());
        return json(r).path("bid_case_id").asText();
    }

    /** 확정(김영업) → 개설 신청(윤서준 지명) → 영업팀장 승인. 담당자는 윤서준이다. */
    private String opened() throws Exception {
        String bid = confirmCase(MEMBER);
        MvcResult o = call(HttpMethod.POST, "/bidcases/" + bid + "/prep/open-requests", MEMBER, "{'emp_nos':['" + ASSIGNEE + "']}", null);
        assertEquals(o.getResponse().getContentAsString(), 201, o.getResponse().getStatus());
        long req = json(o).path("req_id").asLong();
        MvcResult d = call(HttpMethod.POST, "/approval-requests/" + req + "/decide", LEAD, "{'decision':'APPROVE','comment':null}", null);
        assertEquals(200, d.getResponse().getStatus());
        return bid;
    }

    /** 기관 nowon 에 현 기관장(이름 확정 칸 + 생년월일 칸)·약정 1줄·사업계획 반입 1건(사업 2개)을 넣는다. */
    private void seedSources() {
        jdbc.update("DELETE FROM INST_HEAD_ITEM WHERE INSTITUTION_ID = ?", INST);
        jdbc.update("DELETE FROM INST_HEAD WHERE INSTITUTION_ID = ?", INST);
        jdbc.update("INSERT INTO INST_HEAD (INSTITUTION_ID, STATUS_CD, ORIGIN_CD, CREATED_BY, CREATED_AT) VALUES (?,?,?,?,?)",
                INST, "CURRENT", "MANUAL", LEAD, "2026-11-19T00:00:00.000000+00:00");
        long head = jdbc.queryForObject("SELECT MAX(HEAD_ID) FROM INST_HEAD WHERE INSTITUTION_ID = ?", Long.class, INST);
        jdbc.update("INSERT INTO INST_HEAD_ITEM (HEAD_ID, INSTITUTION_ID, FIELD_CD, STATE_CD, ORIGIN_CD, VAL_TEXT, SRC_KIND_CD, SRC_TITLE,"
                + " CHECKED_ON, CREATED_BY, CREATED_AT) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                head, INST, "NAME", "CONFIRMED", "MANUAL", "가상기관장", "OFFICIAL", "가상 누리집", "2026-11-01", LEAD, "2026-11-19T00:00:00.000000+00:00");
        jdbc.update("INSERT INTO INST_HEAD_ITEM (HEAD_ID, INSTITUTION_ID, FIELD_CD, STATE_CD, ORIGIN_CD, VAL_DATE, SRC_KIND_CD, SRC_TITLE,"
                + " CHECKED_ON, CREATED_BY, CREATED_AT) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                head, INST, "BIRTH_DATE", "CONFIRMED", "MANUAL", BIRTH, "OFFICIAL", "가상 누리집", "2026-11-01", LEAD, "2026-11-19T00:00:00.000000+00:00");
        jdbc.update("DELETE FROM INST_BANK_CONTRACT WHERE INSTITUTION_ID = ?", INST);
        jdbc.update("INSERT INTO INST_BANK_CONTRACT (INSTITUTION_ID, CONTRACT_NO, REV_NO, ACTION_CD, ORIGIN_CD, RANK_CD, BANK_CD, TERM_FROM, TERM_TO,"
                + " SRC_KIND, CHECKED_DATE, EDITOR_EMP_NO, EDITOR_NAME, EMP_VERIFIED, SCREEN_ID, BUTTON_ID, UI_VALID, SAVED_AT)"
                + " VALUES (?,1,1,'SAVE','MANUAL','FIRST','B02','2085','2090','OFFICIAL','2026-01-01',?,?,0,'x','x',0,?)",
                INST, LEAD, "이영업", "2026-11-19T00:00:00.000000+00:00");
        jdbc.update("INSERT INTO INST_PLAN_IMPORT (INSTITUTION_ID, ORIGIN_CD, FILE_DATE, FILE_SHA256, FILE_BYTES, ITEM_COUNT, DOC_COUNT, IMPORTED_BY, IMPORTED_AT)"
                + " VALUES (?,?,?,?,?,?,?,?,?)", INST, "IMPORT", "2026-10-30", "00", 1, 2, 1, LEAD, "2026-11-19T00:00:00.000000+00:00");
        long imp = jdbc.queryForObject("SELECT MAX(IMPORT_ID) FROM INST_PLAN_IMPORT WHERE INSTITUTION_ID = ?", Long.class, INST);
        jdbc.update("INSERT INTO INST_PLAN_DOC (IMPORT_ID, INSTITUTION_ID, DOC_SEQ, TITLE, SRC_KIND_CD, PERIOD_FROM, PERIOD_TO, CHECKED_ON, COLLECTOR_AGENT)"
                + " VALUES (?,?,1,'가상 계획','FOUR_YEAR',2024,2027,'2026-10-30','test/1')", imp, INST);
        long doc = jdbc.queryForObject("SELECT MAX(DOC_ID) FROM INST_PLAN_DOC WHERE IMPORT_ID = ?", Long.class, imp);
        String[][] items = {{"1", "복지", "1-1", "노인 일자리", "일자리 확대"}, {"2", "복지", "1-2", "청년 지원", "청년 수당"}};
        int row = 1;
        for (String[] it : items) {
            jdbc.update("INSERT INTO INST_PLAN_ITEM (DOC_ID, IMPORT_ID, INSTITUTION_ID, ROW_NO, FIELD_NAME, ITEM_NO, ITEM_NAME, CONTENT,"
                    + " BUDGET_STATE_CD, CHECK_CD) VALUES (?,?,?,?,?,?,?,?,'UNVERIFIED','NOT_CHECKED')",
                    doc, imp, INST, row++, it[1], it[2], it[3], it[4]);
        }
    }

    private void designerTask(String bid, String assignee) {
        jdbc.update("INSERT INTO TASKS (TASK_ID, BID_CASE_ID, TEAM, STATUS, ASSIGNEE) VALUES (?,?,?,?,?)",
                "task-form-d-" + bid, bid, "디자이너", "작성중", assignee);
    }

    private int acts(String bid, String action, String outcome) {
        return count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD=? AND OUTCOME=?", bid, action, outcome);
    }

    private String prefill(String bid, int base) throws Exception {
        MvcResult r = call(HttpMethod.POST, url(bid, "/prefill"), ASSIGNEE, "{'base_ver':" + base + "}", "form_prefill");
        assertEquals(r.getResponse().getContentAsString(), 200, r.getResponse().getStatus());
        return r.getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    private MvcResult save(String bid, int base, String emp) throws Exception {
        return call(HttpMethod.PUT, url(bid, "/draft"), emp, "{'base_ver':" + base + ",'fields':{'bid_kind':{'val':'금고 지정'}},"
                + "'lists':{'overview':['현황 1']}}", "form_save");
    }

    // ── 열람 ─────────────────────────────────────────────────────────

    @Test
    public void 열람은_활성_담당_팀장_부장_배정된_디자이너만_그_밖은_404_사번_없으면_401() throws Exception {
        String bid = opened();
        MvcResult a = call(HttpMethod.GET, url(bid, ""), ASSIGNEE, null, null);
        assertEquals(200, a.getResponse().getStatus());
        assertEquals(0, json(a).path("cur_ver").asInt());
        assertTrue(json(a).path("content").isNull());
        assertEquals(1, acts(bid, "FORM_VIEW", "OK"));
        assertEquals("식별자가 없어도 열람은 되고 UNKNOWN 으로 남는다", 1,
                count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='FORM_VIEW' AND SCREEN_ID='UNKNOWN' AND FORM_VER IS NULL", bid));
        assertEquals(404, call(HttpMethod.GET, url(bid, ""), MEMBER, null, null).getResponse().getStatus());
        assertEquals(1, acts(bid, "FORM_VIEW", "HIDDEN"));
        assertEquals(200, call(HttpMethod.GET, url(bid, ""), LEAD, null, null).getResponse().getStatus());
        assertEquals(200, call(HttpMethod.GET, url(bid, ""), HEAD, null, null).getResponse().getStatus());
        assertEquals("전산은 404", 404, call(HttpMethod.GET, url(bid, ""), IT, null, null).getResponse().getStatus());
        assertEquals("디자이너 작업이 없으면 404", 404, call(HttpMethod.GET, url(bid, ""), DESIGNER, null, null).getResponse().getStatus());
        assertEquals(401, call(HttpMethod.GET, url(bid, ""), null, null, null).getResponse().getStatus());
        assertEquals(404, call(HttpMethod.GET, "/bidcases/" + bid + "/prep/forms/OTHER", ASSIGNEE, null, null).getResponse().getStatus());
    }

    @Test
    public void 디자이너는_그_건_디자이너_작업이_본인에게_배정됐을_때만_열람한다_빈_담당_선점은_쓰지_않는다() throws Exception {
        String bid = opened();
        designerTask(bid, DESIGNER);
        assertEquals(200, call(HttpMethod.GET, url(bid, ""), DESIGNER, null, null).getResponse().getStatus());
        assertEquals("다른 디자이너", 404, call(HttpMethod.GET, url(bid, ""), DESIGNER2, null, null).getResponse().getStatus());
        jdbc.update("UPDATE TASKS SET ASSIGNEE = NULL WHERE BID_CASE_ID = ? AND TEAM = '디자이너'", bid);
        assertEquals("미배정이면 선점 없이 404", 404, call(HttpMethod.GET, url(bid, ""), DESIGNER, null, null).getResponse().getStatus());
        assertEquals("디자이너는 쓰기 403", 403, call(HttpMethod.POST, url(bid, "/prefill"), DESIGNER, "{'base_ver':0}", "form_prefill").getResponse().getStatus());
    }

    // ── 미리 채움·저장 ───────────────────────────────────────────────

    @Test
    public void 미리_채움은_원본에서_사실_칸을_채우고_생년월일은_싣지_않으며_같은_요청은_새_판을_만들지_않는다() throws Exception {
        seedSources();
        String bid = opened();
        MvcResult noIds = call(HttpMethod.POST, url(bid, "/prefill"), ASSIGNEE, "{'base_ver':0}", null);
        assertEquals(400, noIds.getResponse().getStatus());
        assertEquals("UI_ID_REQUIRED", json(noIds).path("detail").path("code").asText());
        assertEquals(1, acts(bid, "FORM_PREFILL", "INVALID"));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP_FORM_VER WHERE BID_CASE_ID=?", bid));

        String body = prefill(bid, 0);
        JsonNode r = om.readTree(body);
        assertEquals(1, r.path("cur_ver").asInt());
        JsonNode f = r.path("content").path("fields");
        assertEquals("가상기관장", f.path("head_name").path("val").asText());
        assertTrue(f.path("head_name").path("src").path("ref").asText().startsWith("HEAD_ITEM:"));
        assertEquals("2026-11-01", f.path("head_name").path("src").path("checked_on").asText());
        assertTrue(f.path("current_bank").path("val").asText().contains("1금고"));
        assertEquals(2, r.path("content").path("tables").path("biz").path("rows").size());
        assertEquals(2091, r.path("content").path("tables").path("years").path("from").asInt());
        assertFalse("생년월일은 양식에 새지 않는다", body.contains("1971") || body.contains(BIRTH));
        assertFalse(count("SELECT COUNT(*) FROM BID_PREP_FORM_VER WHERE BID_CASE_ID=? AND CONTENT_JSON LIKE '%1971%'", bid) > 0);
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='FORM_PREFILL' AND OUTCOME='OK'"
                + " AND FORM_VER=1 AND SCREEN_ID='prep_form' AND BUTTON_ID='form_prefill' AND UI_VALID=1 AND STATE_CD='IN_PROGRESS'", bid));

        MvcResult again = call(HttpMethod.POST, url(bid, "/prefill"), ASSIGNEE, "{'base_ver':1}", "form_prefill");
        assertEquals(200, again.getResponse().getStatus());
        assertFalse(json(again).path("changed").asBoolean());
        assertEquals(1, json(again).path("cur_ver").asInt());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_FORM_VER WHERE BID_CASE_ID=?", bid));
    }

    @Test
    public void 저장은_전체_교체이고_판_번호가_다르면_409_같은_내용은_새_판이_없다() throws Exception {
        seedSources();
        String bid = opened();
        prefill(bid, 0);
        MvcResult s = save(bid, 1, ASSIGNEE);
        assertEquals(s.getResponse().getContentAsString(), 200, s.getResponse().getStatus());
        assertEquals(2, json(s).path("cur_ver").asInt());
        assertTrue(json(s).path("changed").asBoolean());
        assertEquals("FACT 칸은 그대로", "가상기관장", json(s).path("content").path("fields").path("head_name").path("val").asText());
        assertEquals("금고 지정", json(s).path("content").path("fields").path("bid_kind").path("val").asText());

        MvcResult stale = save(bid, 1, ASSIGNEE);
        assertEquals(409, stale.getResponse().getStatus());
        assertEquals("VER_CHANGED", json(stale).path("detail").path("code").asText());

        MvcResult same = save(bid, 2, ASSIGNEE);
        assertEquals(200, same.getResponse().getStatus());
        assertFalse(json(same).path("changed").asBoolean());
        assertEquals(2, count("SELECT COUNT(*) FROM BID_PREP_FORM_VER WHERE BID_CASE_ID=?", bid));
        assertEquals("첫 저장과 같은 내용 저장 각 1줄(409 는 BLOCKED 라 제외)", 2,
                count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='FORM_SAVE' AND OUTCOME='OK' AND FORM_VER=2"
                + " AND BUTTON_ID='form_save'", bid));
    }

    @Test
    public void 저장_입력_검사는_사실_칸_모르는_키_개인정보를_막고_응답에_입력_값이_없다() throws Exception {
        String bid = opened();
        prefill(bid, 0);
        MvcResult ro = call(HttpMethod.PUT, url(bid, "/draft"), ASSIGNEE, "{'base_ver':1,'fields':{'head_name':{'val':'x'}}}", "form_save");
        assertEquals(400, ro.getResponse().getStatus());
        assertEquals("FIELD_READONLY", json(ro).path("detail").path("code").asText());
        MvcResult unk = call(HttpMethod.PUT, url(bid, "/draft"), ASSIGNEE, "{'base_ver':1,'fields':{'foo<b>':{'val':'x'}}}", "form_save");
        assertEquals(400, unk.getResponse().getStatus());
        String ub = unk.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertTrue(ub, ub.contains("UNKNOWN_KEY") && !ub.contains("foo"));
        MvcResult pii = call(HttpMethod.PUT, url(bid, "/draft"), ASSIGNEE, "{'base_ver':1,'lists':{'overview':['900101-1234567']}}", "form_save");
        assertEquals(422, pii.getResponse().getStatus());
        assertFalse(pii.getResponse().getContentAsString(StandardCharsets.UTF_8).contains("900101"));
        MvcResult yrs = call(HttpMethod.PUT, url(bid, "/draft"), ASSIGNEE,
                "{'base_ver':1,'tables':{'years':{'unit':'억원','from':2027,'to':2040,'end':null}}}", "form_save");
        assertEquals("BAD_YEARS", json(yrs).path("detail").path("code").asText());
        MvcResult typ = call(HttpMethod.PUT, url(bid, "/draft"), ASSIGNEE,
                "{'base_ver':1,'tables':{'years':{'unit':'억원','from':'2027','to':2028,'end':null}}}", "form_save");
        assertEquals("BAD_TYPE", json(typ).path("detail").path("code").asText());
        assertEquals("거부된 저장은 판을 만들지 않는다", 1, count("SELECT COUNT(*) FROM BID_PREP_FORM_VER WHERE BID_CASE_ID=?", bid));
    }

    @Test
    public void 쓰기는_영업_활성_담당만_가능하다_디자이너_부장_비담당_팀장_403_사번_없으면_401() throws Exception {
        String bid = opened();
        designerTask(bid, DESIGNER);
        for (String emp : new String[]{DESIGNER, HEAD, LEAD, MEMBER, IT}) {
            MvcResult r = save(bid, 0, emp);
            assertEquals(emp, 403, r.getResponse().getStatus());
        }
        assertEquals("403 다섯 명 모두 DENIED 줄", 5, acts(bid, "FORM_SAVE", "DENIED"));
        assertEquals(401, save(bid, 0, null).getResponse().getStatus());
        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP_FORM WHERE BID_CASE_ID=?", bid));
    }

    // ── 확정·확정 취소 ───────────────────────────────────────────────

    @Test
    public void 확정_필수_칸이_비면_409_채우면_확정되고_고치려면_확정_취소가_먼저다() throws Exception {
        seedSources();
        String bid = opened();
        prefill(bid, 0);
        MvcResult inc = call(HttpMethod.POST, url(bid, "/confirm"), ASSIGNEE, "{'base_ver':1}", "form_confirm");
        assertEquals(409, inc.getResponse().getStatus());
        assertEquals("FORM_INCOMPLETE", json(inc).path("detail").path("code").asText());
        assertTrue(json(inc).path("detail").path("missing_keys").toString().contains("bid_kind"));

        assertEquals(200, save(bid, 1, ASSIGNEE).getResponse().getStatus());
        MvcResult ok = call(HttpMethod.POST, url(bid, "/confirm"), ASSIGNEE, "{'base_ver':2}", "form_confirm");
        assertEquals(ok.getResponse().getContentAsString(), 200, ok.getResponse().getStatus());
        assertEquals(2, json(ok).path("confirmed").path("ver").asInt());
        String sha = jdbc.queryForObject("SELECT CONFIRMED_SHA256 FROM BID_PREP_FORM WHERE BID_CASE_ID=?", String.class, bid);
        assertEquals(sha, json(ok).path("confirmed").path("sha256").asText());
        assertEquals(sha, jdbc.queryForObject("SELECT CONTENT_SHA256 FROM BID_PREP_FORM_VER WHERE BID_CASE_ID=? AND VER_NO=2", String.class, bid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='FORM_CONFIRM' AND TASK_CD='T1' AND FORM_VER=2", bid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='FORM_CONFIRM' AND OUTCOME='OK' AND FORM_VER=2", bid));

        MvcResult locked = save(bid, 2, ASSIGNEE);
        assertEquals(409, locked.getResponse().getStatus());
        assertEquals("FORM_CONFIRMED", json(locked).path("detail").path("code").asText());
        assertEquals("ALREADY_CONFIRMED", json(call(HttpMethod.POST, url(bid, "/confirm"), ASSIGNEE, "{'base_ver':2}", "form_confirm"))
                .path("detail").path("code").asText());

        assertEquals("사유가 비면 400", 400, call(HttpMethod.POST, url(bid, "/unconfirm"), ASSIGNEE, "{'reason':''}", "form_unconfirm").getResponse().getStatus());
        MvcResult un = call(HttpMethod.POST, url(bid, "/unconfirm"), ASSIGNEE, "{'reason':'수정 필요'}", "form_unconfirm");
        assertEquals(un.getResponse().getContentAsString(), 200, un.getResponse().getStatus());
        assertEquals(2, json(un).path("unconfirmed_ver").asInt());
        assertTrue(json(un).path("confirmed").isNull());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='FORM_UNCONFIRM' AND REASON='수정 필요' AND FORM_VER=2", bid));
        assertEquals("NOT_CONFIRMED", json(call(HttpMethod.POST, url(bid, "/unconfirm"), ASSIGNEE, "{'reason':'다시'}", "form_unconfirm"))
                .path("detail").path("code").asText());

        // 다시 확정한 뒤 비담당 영업팀장도 확정을 취소할 수 있다
        assertEquals(200, call(HttpMethod.POST, url(bid, "/confirm"), ASSIGNEE, "{'base_ver':2}", "form_confirm").getResponse().getStatus());
        assertEquals(403, call(HttpMethod.POST, url(bid, "/unconfirm"), HEAD, "{'reason':'x'}", "form_unconfirm").getResponse().getStatus());
        assertEquals(200, call(HttpMethod.POST, url(bid, "/unconfirm"), LEAD, "{'reason':'팀장 취소'}", "form_unconfirm").getResponse().getStatus());
    }

    @Test
    public void 원본이_바뀌면_확정은_FORM_STALE_그_칸만_다시_불러오면_확정된다() throws Exception {
        seedSources();
        String bid = opened();
        prefill(bid, 0);
        assertEquals(200, save(bid, 1, ASSIGNEE).getResponse().getStatus());
        jdbc.update("UPDATE INST_HEAD_ITEM SET VAL_TEXT = '새기관장' WHERE INSTITUTION_ID = ? AND FIELD_CD = 'NAME'", INST);
        MvcResult stale = call(HttpMethod.POST, url(bid, "/confirm"), ASSIGNEE, "{'base_ver':2}", "form_confirm");
        assertEquals(409, stale.getResponse().getStatus());
        assertEquals("FORM_STALE", json(stale).path("detail").path("code").asText());
        assertTrue(json(stale).path("detail").path("stale_keys").toString().contains("head_name"));
        assertTrue(json(call(HttpMethod.GET, url(bid, ""), ASSIGNEE, null, "form_open")).path("stale_keys").toString().contains("head_name"));

        MvcResult re = call(HttpMethod.POST, url(bid, "/prefill"), ASSIGNEE, "{'base_ver':2,'keys':['head_name']}", "form_refill");
        assertEquals(re.getResponse().getContentAsString(), 200, re.getResponse().getStatus());
        assertEquals(3, json(re).path("cur_ver").asInt());
        assertEquals("새기관장", json(re).path("content").path("fields").path("head_name").path("val").asText());
        assertEquals("편집 칸은 보존", "금고 지정", json(re).path("content").path("fields").path("bid_kind").path("val").asText());
        assertEquals(200, call(HttpMethod.POST, url(bid, "/confirm"), ASSIGNEE, "{'base_ver':3}", "form_confirm").getResponse().getStatus());
    }

    @Test
    public void 저장본을_DB에서_직접_고치면_확정과_내려받기가_FORM_INTEGRITY로_막힌다() throws Exception {
        seedSources();
        String bid = opened();
        prefill(bid, 0);
        assertEquals(200, save(bid, 1, ASSIGNEE).getResponse().getStatus());
        jdbc.update("UPDATE BID_PREP_FORM_VER SET CONTENT_JSON = ? WHERE BID_CASE_ID = ? AND VER_NO = 2", "{\"v\":1}", bid);
        MvcResult c = call(HttpMethod.POST, url(bid, "/confirm"), ASSIGNEE, "{'base_ver':2}", "form_confirm");
        assertEquals(409, c.getResponse().getStatus());
        assertEquals("FORM_INTEGRITY", json(c).path("detail").path("code").asText());
        MvcResult d = call(HttpMethod.GET, url(bid, "/draft-docx"), ASSIGNEE, null, "form_draft_docx");
        assertEquals(409, d.getResponse().getStatus());
    }

    @Test
    public void 사전준비_승인_중에는_쓰기가_FORM_LOCKED_이고_열람은_된다() throws Exception {
        String bid = opened();
        prefill(bid, 0);
        jdbc.update("UPDATE BID_PREP SET STATE_CD = 'APPROVAL_PENDING' WHERE BID_CASE_ID = ?", bid);
        MvcResult r = save(bid, 1, ASSIGNEE);
        assertEquals(409, r.getResponse().getStatus());
        assertEquals("FORM_LOCKED", json(r).path("detail").path("code").asText());
        assertEquals("APPROVAL_PENDING", json(r).path("detail").path("state_cd").asText());
        assertEquals(409, call(HttpMethod.POST, url(bid, "/unconfirm"), LEAD, "{'reason':'x'}", "form_unconfirm").getResponse().getStatus());
        MvcResult v = call(HttpMethod.GET, url(bid, ""), ASSIGNEE, null, "form_open");
        assertEquals(200, v.getResponse().getStatus());
        assertFalse(json(v).path("viewer").path("can_edit").asBoolean());
        assertEquals("STATE", json(v).path("viewer").path("lock_reason").asText());
    }

    // ── 내려받기·판 목록 ─────────────────────────────────────────────

    @Test
    public void 내려받기_확정_전_초안과_확정본_헤더_식별자_열람_권한() throws Exception {
        seedSources();
        String bid = opened();
        designerTask(bid, DESIGNER);
        prefill(bid, 0);
        assertEquals(200, save(bid, 1, ASSIGNEE).getResponse().getStatus());

        assertEquals("식별자가 없으면 400", 400, call(HttpMethod.GET, url(bid, "/draft-docx"), ASSIGNEE, null, null).getResponse().getStatus());
        assertEquals("확정 전 확정본은 409", 409, call(HttpMethod.GET, url(bid, "/confirmed-docx"), ASSIGNEE, null, "form_docx").getResponse().getStatus());
        MvcResult draft = call(HttpMethod.GET, url(bid, "/draft-docx"), ASSIGNEE, null, "form_draft_docx");
        assertEquals(200, draft.getResponse().getStatus());
        byte[] bytes = draft.getResponse().getContentAsByteArray();
        assertEquals('P', bytes[0]);
        assertEquals('K', bytes[1]);
        assertTrue(draft.getResponse().getHeader("Content-Disposition").startsWith("attachment"));
        assertEquals("no-store", draft.getResponse().getHeader("Cache-Control"));
        assertEquals("nosniff", draft.getResponse().getHeader("X-Content-Type-Options"));
        assertTrue(draft.getResponse().getContentType().contains("wordprocessingml"));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='FORM_DRAFT_DOCX' AND OUTCOME='OK' AND FORM_VER=2", bid));

        assertEquals(200, call(HttpMethod.POST, url(bid, "/confirm"), ASSIGNEE, "{'base_ver':2}", "form_confirm").getResponse().getStatus());
        for (String emp : new String[]{ASSIGNEE, LEAD, HEAD, DESIGNER}) {
            assertEquals(emp, 200, call(HttpMethod.GET, url(bid, "/confirmed-docx"), emp, null, "form_docx").getResponse().getStatus());
        }
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='FORM_DOCX' AND OUTCOME='OK' AND FORM_VER=2 AND ACTOR_EMP_NO=?", bid, DESIGNER));
        assertEquals(404, call(HttpMethod.GET, url(bid, "/confirmed-docx"), IT, null, "form_docx").getResponse().getStatus());
        assertEquals(404, call(HttpMethod.GET, url(bid, "/confirmed-docx"), MEMBER, null, "form_docx").getResponse().getStatus());
    }

    @Test
    public void 판_목록은_최신_먼저이고_저장한_사람은_이름만_내용은_없다() throws Exception {
        seedSources();
        String bid = opened();
        prefill(bid, 0);
        assertEquals(200, save(bid, 1, ASSIGNEE).getResponse().getStatus());
        MvcResult r = call(HttpMethod.GET, url(bid, "/versions"), ASSIGNEE, null, "form_history");
        assertEquals(200, r.getResponse().getStatus());
        JsonNode a = json(r);
        assertEquals(2, a.size());
        assertEquals(2, a.get(0).path("ver_no").asInt());
        assertEquals("DRAFT", a.get(0).path("kind_cd").asText());
        assertEquals("PREFILL", a.get(1).path("kind_cd").asText());
        assertEquals("윤서준", a.get(0).path("saved_by_name").asText());
        String raw = r.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertFalse(raw.contains(ASSIGNEE));
        assertFalse(raw.contains("content"));
        assertEquals(1, acts(bid, "FORM_HISTORY", "OK"));
    }
}
