package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.service.BankContractService;
import com.kbstar.kgi.ggreport.web.service.NoticeRoundService;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** 금고 약정 기록(039) API. 사람: 영업팀 3918264 김영업 · 영업팀장 5047192 · 영업부장 2674805 · 전산팀 4482971(열람만) · 디자이너 7130526 · 미등록 9999999. 기관 jongno(TYPE=지자체로 맞춤). */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class BankContractApiTest {
    private static final String SALES = "3918264", LEAD = "5047192", HEAD = "2674805", IT = "4482971", DESIGNER = "7130526";
    private static final String PATH = "/institutions/jongno/bank-contracts";
    private static final String SAVE = "save_bank_contract", CANCEL = "cancel_bank_contract";
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private BankContractService contracts;
    @Autowired private NoticeRoundService rounds;

    @Before public void tipo() { setType("지자체"); }

    private void setType(String t) { jdbc.update("UPDATE INSTITUTIONS SET TYPE = ? WHERE INSTITUTION_ID = ?", t, "jongno"); }

    private static Map<String, Object> body() {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("rank_cd", "FIRST"); m.put("bank_cd", "B04"); m.put("term_from", "2023"); m.put("term_to", "2026-12-31");
        m.put("src_kind", "DOC_NO"); m.put("src_no", "제2023-154호"); m.put("checked_date", Times.todayKst());
        return m;
    }
    private static Map<String, Object> with(Object... kv) { Map<String, Object> m = body(); for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]); return m; }

    private MvcResult send(String emp, String path, String button, Object content) throws Exception {
        MockHttpServletRequestBuilder b = post(path).contentType(MediaType.APPLICATION_JSON).content(JSON.writeValueAsString(content));
        if (emp != null) b = b.header(Actor.HEADER, emp);
        b = b.header("X-Screen-Id", "institution_edit");
        if (button != null) b = b.header("X-Button-Id", button);
        return mockMvc.perform(b).andReturn();
    }
    private MvcResult save(String emp, Object content) throws Exception { return send(emp, PATH, SAVE, content); }
    private MvcResult getAs(String emp, String url) throws Exception {
        MockHttpServletRequestBuilder b = get(url); if (emp != null) b = b.header(Actor.HEADER, emp); return mockMvc.perform(b).andReturn();
    }
    private static JsonNode json(MvcResult r) throws Exception { return JSON.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8)); }
    private int status(MvcResult r) { return r.getResponse().getStatus(); }
    private int rows() { return jdbc.queryForObject("SELECT COUNT(*) FROM INST_BANK_CONTRACT WHERE INSTITUTION_ID='jongno'", Integer.class); }
    private int rowsWithRank(String r) { return jdbc.queryForObject("SELECT COUNT(*) FROM INST_BANK_CONTRACT WHERE INSTITUTION_ID='jongno' AND RANK_CD=?", Integer.class, r); }
    private String lastDetail() {
        List<String> d = jdbc.queryForList("SELECT DETAIL FROM ACCESS_LOG WHERE EVENT_TYPE='API' AND HTTP_METHOD='POST' ORDER BY LOG_ID DESC", String.class);
        return d.isEmpty() ? null : d.get(0);
    }

    @Test public void 새_줄_저장은_서버가_수정자를_채운다() throws Exception {
        Map<String, Object> b = body(); b.put("editor_name", "가짜"); b.put("editor_emp_no", "0000000");
        MvcResult r = save(SALES, b);
        assertEquals(201, status(r));
        JsonNode line = json(r).path("line");
        assertEquals(1, json(r).path("contract_no").asInt());
        assertEquals("김영업", line.path("editor_name").asText());
        assertFalse(line.path("emp_verified").asBoolean());
        assertEquals("3918264", jdbc.queryForObject("SELECT EDITOR_EMP_NO FROM INST_BANK_CONTRACT WHERE INSTITUTION_ID='jongno'", String.class));
        assertEquals(1, jdbc.queryForObject("SELECT UI_VALID FROM INST_BANK_CONTRACT WHERE INSTITUTION_ID='jongno'", Integer.class).intValue());
        assertEquals("bank-contract save no=1 rev=1", lastDetail());
    }

    @Test public void 고치기_취소_감사_추가전용() throws Exception {
        assertEquals(201, status(save(SALES, body())));
        MvcResult e = save(SALES, with("contract_no", 1, "base_rev_no", 1, "bank_cd", "B02"));
        assertEquals(201, status(e)); assertEquals(2, json(e).path("rev_no").asInt());
        assertEquals("B04", jdbc.queryForObject("SELECT BANK_CD FROM INST_BANK_CONTRACT WHERE CONTRACT_NO=1 AND REV_NO=1", String.class));
        assertEquals(200, status(save(SALES, with("contract_no", 1, "base_rev_no", 2, "bank_cd", "B02"))));   // NO_CHANGE
        MvcResult stale = save(SALES, with("contract_no", 1, "base_rev_no", 1, "bank_cd", "B03"));
        assertEquals(409, status(stale)); assertEquals("STALE", json(stale).path("detail").path("code").asText());
        Map<String, Object> cb = new LinkedHashMap<String, Object>(); cb.put("base_rev_no", 2);
        assertEquals(400, status(send(SALES, PATH + "/1/cancel", CANCEL, cb)));                       // 사유 없음
        cb.put("cancel_reason_cd", "DUP");
        MvcResult c = send(SALES, PATH + "/1/cancel", CANCEL, cb);
        assertEquals(201, status(c)); assertEquals("CANCEL", json(c).path("action_cd").asText());
        assertEquals(0, json(getAs(SALES, PATH)).path("lines").size());
        assertEquals("중복으로 입력함", json(getAs(SALES, PATH + "/history")).path("items").get(0).path("cancel_reason_name").asText());
        cb.put("base_rev_no", 3);
        assertEquals("ALREADY_CANCELLED", json(send(SALES, PATH + "/1/cancel", CANCEL, cb)).path("detail").path("code").asText());
    }

    @Test public void 취소_사유_기타는_글이_필요하고_개인정보는_막는다() throws Exception {
        assertEquals(201, status(save(SALES, body())));
        Map<String, Object> cb = new LinkedHashMap<String, Object>(); cb.put("base_rev_no", 1); cb.put("cancel_reason_cd", "ETC");
        assertEquals(400, status(send(SALES, PATH + "/1/cancel", CANCEL, cb)));
        cb.put("cancel_reason_etc", "010-1234-5678");
        MvcResult r = send(SALES, PATH + "/1/cancel", CANCEL, cb);
        assertEquals(422, status(r));
        assertFalse(r.getResponse().getContentAsString(StandardCharsets.UTF_8).contains("1234-5678"));
        cb.put("cancel_reason_etc", "원문 확인 결과 다른 기관 자료");
        assertEquals(201, status(send(SALES, PATH + "/1/cancel", CANCEL, cb)));
    }

    @Test public void S2_같은_순위_기간_겹침은_409_확인하면_저장() throws Exception {
        assertEquals(201, status(save(SALES, body())));                                                     // 1금고 2023~2026-12-31
        assertEquals(201, status(save(SALES, with("term_from", "2026", "term_to", "2029"))));               // 같은 해 맞닿음 → 겹침 아님
        MvcResult dup = save(SALES, with("term_from", "2025", "term_to", "2027"));
        assertEquals(409, status(dup));
        JsonNode d = json(dup).path("detail");
        assertEquals("DUP_RANK", d.path("code").asText());
        assertEquals(2, d.path("overlaps").size());
        assertEquals("우리은행", d.path("overlaps").get(0).path("bank_name").asText());
        assertEquals("김영업", d.path("overlaps").get(0).path("editor_name").asText());
        assertEquals("bank-contract save 409 DUP_RANK", lastDetail());
        assertEquals(2, rows());
        MvcResult okc = save(SALES, with("term_from", "2025", "term_to", "2027", "confirm_overlap", true));
        assertEquals(201, status(okc));
        assertTrue(json(okc).path("line").path("overlap_confirmed").asBoolean());
        JsonNode lines = json(getAs(SALES, PATH)).path("lines");
        boolean any = false;
        for (JsonNode l : lines) if (l.path("contract_no").asInt() == 3) any = l.path("overlap_with").size() == 2;
        assertTrue(any);
    }

    @Test public void S2_자기_줄과_취소한_줄은_겹침에서_제외() throws Exception {
        assertEquals(201, status(save(SALES, body())));                                                   // 1금고 줄1
        assertEquals(201, status(save(SALES, with("contract_no", 1, "base_rev_no", 1, "term_to", "2027"))));   // 자기 줄과는 겹침 아님
        Map<String, Object> cb = new LinkedHashMap<String, Object>(); cb.put("base_rev_no", 2); cb.put("cancel_reason_cd", "WRONG");
        assertEquals(201, status(send(SALES, PATH + "/1/cancel", CANCEL, cb)));
        assertEquals(201, status(save(SALES, body())));                                                   // 취소된 줄은 빠짐
    }

    @Test public void 법원_순위없음은_검사_안_하고_공동은_같은_은행만_겹침_확인() throws Exception {
        setType("법원");
        assertEquals(201, status(save(SALES, with("rank_cd", "NONE"))));
        assertEquals(201, status(save(SALES, with("rank_cd", "NONE"))));                                   // 순위 없음은 겹침 검사 안 함
        assertEquals(201, status(save(SALES, with("rank_cd", "JOINT", "bank_cd", "B04"))));
        assertEquals(201, status(save(SALES, with("rank_cd", "JOINT", "bank_cd", "B02"))));                // 다른 은행은 겹쳐도 통과
        MvcResult dup = save(SALES, with("rank_cd", "JOINT", "bank_cd", "B04"));                           // 같은 은행·겹침
        assertEquals(409, status(dup));
        assertEquals("DUP_RANK", json(dup).path("detail").path("code").asText());
        assertEquals(1, json(dup).path("detail").path("overlaps").size());
        assertEquals(201, status(save(SALES, with("rank_cd", "JOINT", "bank_cd", "B04", "confirm_overlap", true))));
    }

    @Test public void 기관_종류별_순위() throws Exception {
        setType("법원");
        assertEquals(400, status(save(SALES, with("rank_cd", "FIRST"))));
        setType("지자체");
        assertEquals(400, status(save(SALES, with("rank_cd", "JOINT"))));
        assertEquals(400, status(save(SALES, with("rank_cd", "NONE"))));
        setType("교육청");
        assertEquals(201, status(save(SALES, with("rank_cd", "SECOND"))));
        setType("공공기관");
        assertEquals(201, status(save(SALES, with("rank_cd", "JOINT"))));
        assertEquals(0, rowsWithRank("FIRST"));
    }

    @Test public void 맡는_회계() throws Exception {
        MvcResult r = save(SALES, with("account_cd", "GENERAL"));
        assertEquals(201, status(r));
        assertEquals("일반회계", json(r).path("line").path("account_name").asText());
        assertEquals(201, status(save(SALES, with("rank_cd", "SECOND", "term_from", "2010", "term_to", "2012", "account_cd", "ETC", "account_etc", "상수도 사업"))));
        boolean found = false;
        for (JsonNode l : json(getAs(SALES, PATH)).path("lines")) if ("상수도 사업".equals(l.path("account_name").asText())) found = true;
        assertTrue(found);
        assertEquals(400, status(save(SALES, with("rank_cd", "SECOND", "term_from", "2005", "term_to", "2006", "account_cd", "ETC"))));
        assertEquals(400, status(save(SALES, with("rank_cd", "SECOND", "term_from", "2005", "term_to", "2006", "account_cd", "NOPE"))));
        assertEquals(422, status(save(SALES, with("rank_cd", "SECOND", "term_from", "2005", "term_to", "2006", "account_cd", "ETC", "account_etc", "010-1234-5678"))));
        assertEquals(400, status(save(SALES, with("rank_cd", "SECOND", "term_from", "2005", "term_to", "2006", "account_cd", "ETC", "account_etc", "수‮입"))));
        setType("법원");
        assertEquals(400, status(save(SALES, with("rank_cd", "NONE", "account_cd", "GENERAL"))));          // 법원은 칸을 받지 않음
        assertEquals(0, json(getAs(SALES, PATH)).path("codes").path("accounts").size());
    }

    @Test public void S3_S4_S5_S7_입력_검사() throws Exception {
        assertEquals(400, status(save(SALES, with("bank_cd", "ETC", "bank_name_etc", "국민은행"))));
        assertEquals(201, status(save(SALES, with("bank_cd", "ETC", "bank_name_etc", "SC제일은행", "rank_cd", "SECOND"))));
        assertEquals(400, status(save(SALES, with("bank_cd", "X01"))));                                      // ENABLED=0
        MvcResult nm = save(SALES, with("src_kind", "STAFF", "checked_dept", "재정과 홍길동 주무관"));
        assertEquals(422, status(nm));
        assertEquals("NAME", json(nm).path("detail").path("kinds").get(0).path("kind").asText());
        assertEquals(201, status(save(SALES, with("src_kind", "STAFF", "checked_dept", "재정과장실", "rank_cd", "SECOND", "term_from", "2010", "term_to", "2012"))));
        assertEquals(400, status(save(SALES, with("note", "비‮고"))));
        assertEquals(422, status(save(SALES, with("src_no", "010 1234 5678"))));
        assertEquals(201, status(save(SALES, with("src_no", "제2023-154호", "rank_cd", "SECOND", "term_from", "2015", "term_to", "2016"))));
    }

    @Test public void S6_a_취소는_줄을_처음_만든_사람만_최신_수정자는_안_됨() throws Exception {
        final String B = "7742059";   // 영업팀 다른 팀원
        assertEquals(201, status(save(SALES, body())));                                                   // A(SALES)가 만든 줄1
        assertEquals(201, status(save(B, with("contract_no", 1, "base_rev_no", 1, "bank_cd", "B02"))));  // B가 고침(최신 수정자 = B)
        Map<String, Object> cb = new LinkedHashMap<String, Object>(); cb.put("base_rev_no", 2); cb.put("cancel_reason_cd", "WRONG");
        assertEquals(403, status(send(B, PATH + "/1/cancel", CANCEL, cb)));                               // 최신 수정자 B → 403
        assertEquals(201, status(send(SALES, PATH + "/1/cancel", CANCEL, cb)));                           // 처음 만든 A → OK
        assertEquals(201, status(save(SALES, with("term_from", "2060", "term_to", "2062"))));             // 줄2
        assertEquals(201, status(send(LEAD, PATH + "/2/cancel", CANCEL, with("base_rev_no", 1, "cancel_reason_cd", "WRONG")))); // 팀장 OK
        assertEquals(201, status(save(SALES, with("term_from", "2070", "term_to", "2072"))));             // 줄3
        assertEquals(201, status(send(HEAD, PATH + "/3/cancel", CANCEL, with("base_rev_no", 1, "cancel_reason_cd", "WRONG")))); // 부장 OK
    }

    @Test public void 응답에_처음_입력자가_실리고_남이_고쳐도_그대로() throws Exception {
        final String B = "7742059";
        MvcResult a = save(SALES, body());
        assertEquals(201, status(a));
        assertEquals("김영업", json(a).path("line").path("first_editor_name").asText());
        MvcResult e = save(B, with("contract_no", 1, "base_rev_no", 1, "bank_cd", "B02"));
        assertEquals(201, status(e));
        JsonNode line = json(e).path("line");
        assertEquals("김영업", line.path("first_editor_name").asText());          // 최신 수정자가 B 여도 처음 입력자는 A
        assertFalse(line.path("editor_name").asText().equals(line.path("first_editor_name").asText()));
        assertTrue(line.path("first_saved_at").asText().length() > 0);
        JsonNode cur = json(getAs(SALES, PATH)).path("lines").get(0);
        assertEquals("김영업", cur.path("first_editor_name").asText());
        for (JsonNode it : json(getAs(SALES, PATH + "/history")).path("items")) {
            assertEquals("김영업", it.path("first_editor_name").asText());
            assertFalse(it.has("first_editor_emp_no"));                              // 사번은 내보내지 않는다
        }
        assertFalse(json(getAs(SALES, PATH)).toString().contains("3918264"));
    }

    @Test public void 겹침_확인은_비고만_고치면_이어받고_기간이나_은행이_바뀌면_다시_409() throws Exception {
        assertEquals(201, status(save(SALES, body())));                                                          // 줄1 1금고 2023~2026-12-31
        assertEquals(201, status(save(SALES, with("term_from", "2025", "term_to", "2027", "confirm_overlap", true))));   // 줄2, 겹침 확인
        MvcResult n = save(SALES, with("contract_no", 2, "base_rev_no", 1, "term_from", "2025", "term_to", "2027", "note", "비고만 고침"));
        assertEquals(201, status(n));                                                                            // 다시 묻지 않음
        assertTrue(json(n).path("line").path("overlap_confirmed").asBoolean());
        assertEquals(1, jdbc.queryForObject("SELECT OVERLAP_CONFIRMED FROM INST_BANK_CONTRACT WHERE CONTRACT_NO=2 AND REV_NO=2", Integer.class).intValue());
        MvcResult term = save(SALES, with("contract_no", 2, "base_rev_no", 2, "term_from", "2025", "term_to", "2028", "note", "비고만 고침"));
        assertEquals(409, status(term));                                                                         // 기간 바뀌고 여전히 겹침
        assertEquals("DUP_RANK", json(term).path("detail").path("code").asText());
        MvcResult bank = save(SALES, with("contract_no", 2, "base_rev_no", 2, "term_from", "2025", "term_to", "2027", "bank_cd", "B02"));
        assertEquals(409, status(bank));                                                                         // 은행 바뀜(1금고는 은행 무관 겹침)
        assertEquals(3, rows());                                                                                 // 줄1 + 줄2 rev1·rev2
    }

    @Test public void 겹침_확인_없이_저장된_줄을_고칠_때는_이어받을_것이_없다() throws Exception {
        assertEquals(201, status(save(SALES, body())));                                                          // 줄1
        assertEquals(201, status(save(SALES, with("term_from", "2060", "term_to", "2062"))));                    // 줄2, 겹침 아님
        MvcResult e = save(SALES, with("contract_no", 2, "base_rev_no", 1, "term_from", "2025", "term_to", "2027"));   // 이제 겹침인데 확인 없음
        assertEquals(409, status(e));
    }

    @Test public void S6_고치기는_영업팀_누구나_취소는_본인_또는_팀장_부장() throws Exception {
        final String SALES2 = "7742059";   // 영업팀 다른 팀원(시드에 없으면 시험의 사번만 맞춘다)
        assertEquals(201, status(save(SALES, body())));                                                   // 김영업이 입력한 줄1
        assertEquals(201, status(save(SALES2, with("contract_no", 1, "base_rev_no", 1, "bank_cd", "B02"))));   // 다른 팀원이 고치기 OK
        Map<String, Object> cb = new LinkedHashMap<String, Object>(); cb.put("base_rev_no", 2); cb.put("cancel_reason_cd", "WRONG");
        assertEquals(403, status(send(SALES2, PATH + "/1/cancel", CANCEL, cb)));                          // 최신 수정자여도 처음 만든 사람이 아니면 403
        assertEquals(201, status(send(SALES, PATH + "/1/cancel", CANCEL, cb)));                           // 처음 만든 사람 OK
        assertEquals(201, status(save(SALES, with("term_from", "2030", "term_to", "2032"))));             // 줄2, 입력자 SALES
        cb.put("base_rev_no", 1);
        assertEquals(403, status(send(SALES2, PATH + "/2/cancel", CANCEL, cb)));                          // 다른 팀원 → 403
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM INST_BANK_CONTRACT WHERE CONTRACT_NO=2 AND ACTION_CD='CANCEL'", Integer.class).intValue());
        assertEquals(201, status(send(LEAD, PATH + "/2/cancel", CANCEL, cb)));                            // 영업팀장 OK
        assertEquals(201, status(save(SALES, with("term_from", "2040", "term_to", "2042"))));             // 줄3, 입력자 SALES
        assertEquals(201, status(send(SALES, PATH + "/3/cancel", CANCEL, cb)));                           // 본인 OK
        assertEquals(201, status(save(SALES, with("term_from", "2050", "term_to", "2052"))));             // 줄4
        assertEquals(201, status(send(HEAD, PATH + "/4/cancel", CANCEL, cb)));                            // 영업부장 OK
    }

    @Test public void 권한_403_401과_DENIED_이력() throws Exception {
        assertEquals(403, status(save(IT, body())));
        assertEquals(403, status(save(DESIGNER, body())));
        assertEquals(401, status(save(null, body())));
        assertEquals(403, status(save("9999999", body())));
        assertEquals(0, rows());
        assertTrue(jdbc.queryForObject("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE='DENIED' AND EMP_NO=? AND REQ_PATH=? AND STATUS_CODE=403", Integer.class, IT, PATH) >= 1);
    }

    @Test public void 조회_코드표와_can_edit() throws Exception {
        JsonNode it = json(getAs(IT, PATH));
        assertFalse(it.path("can_edit").asBoolean());
        assertTrue(json(getAs(SALES, PATH)).path("can_edit").asBoolean());
        boolean b13 = false, x01 = false;
        for (JsonNode c : it.path("codes").path("banks")) { if ("B13".equals(c.path("code").asText())) b13 = true; if ("X01".equals(c.path("code").asText())) x01 = true; }
        assertTrue(b13); assertFalse(x01);
        assertEquals(4, it.path("codes").path("cancel_reasons").size());
        assertEquals(2, it.path("codes").path("ranks").size());                                               // 지자체: FIRST·SECOND
        assertEquals(5, it.path("codes").path("accounts").size());
        assertEquals(400, status(save(SALES, with("rank_cd", "JOINT"))));
        setType("법원");
        JsonNode court = json(getAs(SALES, PATH)).path("codes");
        assertEquals(2, court.path("ranks").size());                                                          // NONE·JOINT 만
        assertEquals(0, court.path("accounts").size());
        assertEquals(400, status(save(SALES, with("rank_cd", "FIRST"))));
        assertEquals(201, status(save(SALES, with("rank_cd", "JOINT"))));
    }

    @Test public void 버튼_머리글이_다르면_UNKNOWN으로_기록() throws Exception {
        assertEquals(201, status(send(SALES, PATH, "open_edit", body())));
        assertEquals("UNKNOWN", jdbc.queryForObject("SELECT BUTTON_ID FROM INST_BANK_CONTRACT WHERE INSTITUTION_ID='jongno'", String.class));
        assertEquals(0, jdbc.queryForObject("SELECT UI_VALID FROM INST_BANK_CONTRACT WHERE INSTITUTION_ID='jongno'", Integer.class).intValue());
    }

    @Test public void 접근_이력에_은행_비고_번호가_없다() throws Exception {
        assertEquals(201, status(save(SALES, with("note", "특이사항"))));
        String d = lastDetail();
        assertFalse(d.contains("B04")); assertFalse(d.contains("제2023")); assertFalse(d.contains("특이사항"));
    }

    @Test public void 없는_기관_줄_404() throws Exception {
        assertEquals(404, status(send(SALES, "/institutions/nope/bank-contracts", SAVE, body())));
        assertEquals(404, status(send(SALES, PATH + "/99/cancel", CANCEL, with("base_rev_no", 1, "cancel_reason_cd", "DUP"))));
        assertEquals(404, status(send(SALES, PATH + "/abc/cancel", CANCEL, with("base_rev_no", 1, "cancel_reason_cd", "DUP"))));
    }

    @Test public void 공고_판정_권한과_일치한다() {
        for (String emp : new String[]{SALES, LEAD, HEAD, IT, DESIGNER, "9999999"}) {
            assertEquals(emp, rounds.canJudge(emp), contracts.canEdit(emp));
        }
    }
}
