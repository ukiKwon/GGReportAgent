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
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * NEXT 125 S2 — 목표 = 입찰 건: 기타 금고 방식 이름·건 키(1금고+2금고 쌍·기타 혼자)·금고 밖 대상·펼침 줄 값·/link 입구.
 * 사람: 영업 3918264 김영업 · 디자이너 7130526. 기관 jongno. 결재 스위치는 끄고(바로 반영) multi-subject 스위치를 켠다(시험 뒤 되돌린다).
 * 결재 중 건 단위 잠금·SLOT_PENDING 은 TargetChangeApiTest 의 결재 흐름 도우미가 필요해 그쪽에서 이어서 본다(보고서 참조).
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class BidTargetCaseApiTest {
    private static final String SALES = "3918264", DESIGNER = "7130526";
    private static final String PATH = "/institutions/jongno/bid-targets";
    private static final String ADD = "add_bid_target", EDIT = "edit_bid_target", TAG = "change_target_tag";
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private BidTargetSettings settings;

    @Before public void 스위치() { settings.setApprovalRequired(false); settings.setMultiSubject(true); }
    @After public void 스위치_복구() { settings.setApprovalRequired(true); settings.setMultiSubject(false); }

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
    private static String raw(MvcResult r) throws Exception { return r.getResponse().getContentAsString(StandardCharsets.UTF_8); }
    private static JsonNode json(MvcResult r) throws Exception { return JSON.readTree(raw(r)); }
    private static int status(MvcResult r) { return r.getResponse().getStatus(); }
    private static String code(MvcResult r) throws Exception { return json(r).path("detail").path("code").asText(); }

    private JsonNode row(int targetNo) throws Exception {
        for (JsonNode it : json(getAs(SALES, "/bid-targets")).path("items")) {
            if ("jongno".equals(it.path("institution_id").asText()) && it.path("target_no").asInt() == targetNo) return it;
        }
        fail("줄이 없다: " + targetNo);
        return null;
    }

    // ---- 기타 금고 방식 ----

    @Test public void 기타를_고르면_이름이_저장되고_줄에_label과_정렬값_5가_나온다() throws Exception {
        MvcResult r = send(SALES, PATH, ADD, body("aim_rank_cd", "OTHER", "aim_rank_etc", " 가상　공동금고 "));
        assertEquals(raw(r), 201, status(r));
        assertEquals("가상 공동금고", jdbc.queryForObject("SELECT AIM_RANK_ETC FROM INST_BID_TARGET WHERE REV_NO=1", String.class));
        JsonNode item = json(r).path("item");
        assertEquals("OTHER", item.path("aim_rank_cd").asText());
        assertEquals("가상 공동금고", item.path("aim_rank_label").asText());
        assertEquals(5, item.path("aim_rank_sort").asInt());
        JsonNode listed = row(1);
        assertEquals("가상 공동금고", listed.path("aim_rank_label").asText());
        assertEquals(5, listed.path("aim_rank_sort").asInt());
    }

    @Test public void 기타인데_이름이_없거나_기타가_아닌데_이름이_오면_400() throws Exception {
        assertEquals(400, status(send(SALES, PATH, ADD, body("aim_rank_cd", "OTHER"))));
        assertEquals(400, status(send(SALES, PATH, ADD, body("aim_rank_cd", "OTHER", "aim_rank_etc", "   "))));
        assertEquals(400, status(send(SALES, PATH, ADD, body("aim_rank_cd", "FIRST", "aim_rank_etc", "가상"))));
        assertEquals(400, status(send(SALES, PATH, ADD, body("aim_rank_etc", "가상"))));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM INST_BID_TARGET", Integer.class).intValue());
    }

    @Test public void 기타_이름만_고쳐도_저장되고_금고_방식을_안_보내면_이름이_그대로다() throws Exception {
        assertEquals(201, status(send(SALES, PATH, ADD, body("aim_rank_cd", "OTHER", "aim_rank_etc", "가상 가"))));
        MvcResult rename = send(SALES, PATH, EDIT, body("target_no", 1, "base_rev_no", 1, "aim_rank_cd", "OTHER", "aim_rank_etc", "가상 나"));
        assertEquals(raw(rename), 201, status(rename));
        assertEquals("가상 나", jdbc.queryForObject("SELECT AIM_RANK_ETC FROM INST_BID_TARGET WHERE REV_NO=2", String.class));
        MvcResult tag = send(SALES, PATH, TAG, body("target_no", 1, "base_rev_no", 2, "tag_cd", "RETAIN"));   // 금고 방식·이름을 안 보냄 → 그대로
        assertEquals(raw(tag), 201, status(tag));
        assertEquals("가상 나", jdbc.queryForObject("SELECT AIM_RANK_ETC FROM INST_BID_TARGET WHERE REV_NO=3", String.class));
        assertEquals("OTHER", jdbc.queryForObject("SELECT AIM_RANK_CD FROM INST_BID_TARGET WHERE REV_NO=3", String.class));
        MvcResult clear = send(SALES, PATH, EDIT, body("target_no", 1, "base_rev_no", 3, "aim_rank_cd", ""));   // 지움 → 이름도 비움
        assertEquals(raw(clear), 201, status(clear));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM INST_BID_TARGET WHERE REV_NO=4 AND AIM_RANK_CD IS NULL AND AIM_RANK_ETC IS NULL", Integer.class).intValue());
    }

    @Test public void 코드표에_기타가_5번째로_있다() throws Exception {
        JsonNode ranks = json(getAs(SALES, "/bid-targets")).path("codes").path("aim_ranks");
        assertEquals("OTHER", ranks.get(ranks.size() - 1).path("code").asText());
    }

    // ---- 건 키 ----

    @Test public void 스위치가_켜지면_1금고와_2금고를_같은_해에_함께_두고_정렬값이_1_2다() throws Exception {
        assertEquals(201, status(send(SALES, PATH, ADD, body("aim_rank_cd", "FIRST"))));
        assertEquals(201, status(send(SALES, PATH, ADD, body("aim_rank_cd", "SECOND"))));
        assertEquals(1, row(1).path("aim_rank_sort").asInt());
        assertEquals(2, row(2).path("aim_rank_sort").asInt());
        MvcResult dup = send(SALES, PATH, ADD, body("aim_rank_cd", "FIRST"));
        assertEquals(409, status(dup)); assertEquals("DUP_TARGET", code(dup));
        MvcResult none = send(SALES, PATH, ADD, body());   // 미정이 이미 있는 1·2금고와 같은 칸에 들어오면 쌍이 깨진다
        assertEquals(409, status(none)); assertEquals("DUP_TARGET", code(none));
    }

    @Test public void 기타는_혼자라서_같은_칸의_1금고와_기타_두_건은_409() throws Exception {
        assertEquals(201, status(send(SALES, PATH, ADD, body("aim_rank_cd", "OTHER", "aim_rank_etc", "가상 공동금고"))));
        MvcResult first = send(SALES, PATH, ADD, body("aim_rank_cd", "FIRST"));
        assertEquals(409, status(first)); assertEquals("DUP_TARGET", code(first));
        MvcResult other2 = send(SALES, PATH, ADD, body("aim_rank_cd", "OTHER", "aim_rank_etc", "가상 다른 금고"));
        assertEquals(409, status(other2)); assertEquals("DUP_TARGET", code(other2));
        assertEquals(201, status(send(SALES, PATH, ADD, body("target_year", y() + 1, "aim_rank_cd", "FIRST"))));   // 다른 해는 다른 칸
    }

    @Test public void 스위치가_꺼지면_넣을_때_금고_방식은_400이고_쌍도_못_둔다() throws Exception {
        settings.setMultiSubject(false);
        assertEquals(400, status(send(SALES, PATH, ADD, body("aim_rank_cd", "FIRST"))));
        assertEquals(201, status(send(SALES, PATH, ADD, body())));
        MvcResult dup = send(SALES, PATH, ADD, body());
        assertEquals(409, status(dup)); assertEquals("DUP_TARGET", code(dup));
    }

    // ---- 입찰 대상(금고 밖) ----

    @Test public void 금고_밖_대상은_스위치가_켜져야_넣고_금고_순위는_400_줄은_해당_없음_99다() throws Exception {
        settings.setMultiSubject(false);
        MvcResult off = send(SALES, PATH, ADD, body("bid_subject_cd", "CORP_CARD"));
        assertEquals(raw(off), 400, status(off));
        settings.setMultiSubject(true);
        assertEquals(400, status(send(SALES, PATH, ADD, body("bid_subject_cd", "CORP_CARD", "aim_rank_cd", "FIRST"))));
        MvcResult on = send(SALES, PATH, ADD, body("bid_subject_cd", "CORP_CARD"));
        assertEquals(raw(on), 201, status(on));
        JsonNode item = json(on).path("item");
        assertEquals("CORP_CARD", item.path("bid_subject_cd").asText());
        assertEquals("NA", item.path("rank_state").asText());
        assertEquals(99, item.path("aim_rank_sort").asInt());
        assertEquals("CORP_CARD", jdbc.queryForObject("SELECT BID_SUBJECT_CD FROM INST_BID_TARGET WHERE REV_NO=1", String.class));
        assertEquals(201, status(send(SALES, PATH, ADD, body())));   // 같은 해라도 대상이 다르면 다른 칸
    }

    @Test public void 고치기에서_대상을_바꾸면_400() throws Exception {
        assertEquals(201, status(send(SALES, PATH, ADD, body())));
        MvcResult r = send(SALES, PATH, EDIT, body("target_no", 1, "base_rev_no", 1, "bid_subject_cd", "CORP_CARD"));
        assertEquals(raw(r), 400, status(r));
    }

    // ---- 펼침 줄 ----

    @Test public void 금고_건_줄에는_공고_값_금고_밖_줄에는_모두_null이다() throws Exception {
        jdbc.update("INSERT INTO EXT_CHECK (CHECK_KEY, INSTITUTION_ID, BATCH_ID, CHECK_ID, CHECKED_AT, SOURCE_KIND, SOURCE_SLUG, STATUS_CD, TITLE, POSTED_AT, DEADLINE_AT, IMPORTED_AT) "
                + "VALUES ('k125a', 'jongno', 'b125', 'c125', '2026-03-01T00:00:00+09:00', 'notice', 'g2b', 'found', '가상 금고 지정 공고', '2026-03-02', '2026-03-20', '2026-03-01T00:00:00+09:00')");
        assertEquals(201, status(send(SALES, PATH, ADD, body("owner_emp_no", SALES))));
        assertEquals(201, status(send(SALES, PATH, ADD, body("bid_subject_cd", "CORP_CARD"))));
        JsonNode main = row(1), card = row(2);
        assertEquals("2026-03-02", main.path("notice_posted_at").asText());
        assertEquals("2026-03-20", main.path("notice_deadline_at").asText());
        assertEquals("INST_NOTICE", main.path("notice_basis").asText());
        assertEquals("가상 금고 지정 공고", main.path("bid_title").asText());
        assertEquals("김영업", main.path("owner_name").asText());
        for (String k : new String[]{"notice_posted_at", "notice_deadline_at", "notice_basis", "bid_title", "bank", "next_term_to", "bid_closed", "term_start", "judge_from"}) {
            assertTrue(k, card.path(k).isNull());
        }
        assertFalse(card.path("judge_from_assumed").asBoolean());
    }

    @Test public void 목록_머리_숫자와_스위치_값이_나온다() throws Exception {
        assertEquals(201, status(send(SALES, PATH, ADD, body("aim_rank_cd", "FIRST"))));
        assertEquals(201, status(send(SALES, PATH, ADD, body("aim_rank_cd", "SECOND"))));
        JsonNode l = json(getAs(SALES, "/bid-targets"));
        assertTrue(l.path("multi_subject").asBoolean());
        assertEquals(l.path("items").size(), l.path("goal_case_n").asInt());
        assertEquals(1, l.path("goal_institution_n").asInt());
        assertTrue(l.path("codes").path("subjects").size() >= 1);
    }

    @Test public void 제안_건_값은_영업_계열에만_나가고_개발부서에는_null이다() throws Exception {
        assertEquals(201, status(send(SALES, PATH, ADD, body())));
        JsonNode sales = row(1);
        assertTrue(sales.has("case_status"));
        assertEquals("NONE", sales.path("case_status").asText());
        assertEquals("BEFORE", sales.path("stage5_cd").asText());
        JsonNode it = null;
        for (JsonNode n : json(getAs("4482971", "/bid-targets")).path("items")) if ("jongno".equals(n.path("institution_id").asText())) it = n;
        assertNotNull(it);
        assertTrue(it.path("case_status").isNull());
        assertTrue(it.path("stage5_cd").isNull());
        assertTrue(it.path("bid_case_id").isNull());
        assertFalse(it.path("rank_locked").asBoolean());
    }

    // ---- /link 입구 ----

    @Test public void link_는_추정이_아니면_409_NOT_INFERRED_없는_건은_404_형식은_400_디자이너는_403() throws Exception {
        assertEquals(201, status(send(SALES, PATH, ADD, body())));
        Map<String, Object> ok = new LinkedHashMap<String, Object>(); ok.put("base_rev_no", 1); ok.put("bid_case_id", "case-none-1");
        MvcResult notInferred = send(SALES, PATH + "/1/link", "link_bid_case", ok);
        assertEquals(raw(notInferred), 409, status(notInferred)); assertEquals("NOT_INFERRED", code(notInferred));
        assertEquals(404, status(send(SALES, PATH + "/99/link", "link_bid_case", ok)));
        Map<String, Object> badId = new LinkedHashMap<String, Object>(); badId.put("base_rev_no", 1); badId.put("bid_case_id", "../x");
        assertEquals(400, status(send(SALES, PATH + "/1/link", "link_bid_case", badId)));
        Map<String, Object> noRev = new LinkedHashMap<String, Object>(); noRev.put("bid_case_id", "case-none-1");
        assertEquals(400, status(send(SALES, PATH + "/1/link", "link_bid_case", noRev)));
        Map<String, Object> stale = new LinkedHashMap<String, Object>(); stale.put("base_rev_no", 7); stale.put("bid_case_id", "case-none-1");
        MvcResult st = send(SALES, PATH + "/1/link", "link_bid_case", stale);
        assertEquals(409, status(st)); assertEquals("STALE", code(st));
        assertEquals(403, status(send(DESIGNER, PATH + "/1/link", "link_bid_case", ok)));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM INST_BID_TARGET", Integer.class).intValue());   // 어느 것도 쓰지 않았다
    }
}
