package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.support.TestGoals;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * NEXT 125 1단계 — 사전준비 응답 세 곳(/preps, /bidcases/{id}/prep, /prep-board)에 입찰 대상(bid_subject_cd·bid_subject_name)과
 * 공고명(bid_title)이 실린다. 시드: 영업팀 3918264, 영업부장 2674805. 가상 데이터만. X-Emp-No 는 자기신고다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class BidSubjectApiTest {

    private static final String MEMBER = "3918264";
    private static final String INST = "nowon";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    private final ObjectMapper om = new ObjectMapper();

    @Before
    public void 올해_목표_바탕() {
        TestGoals.seedThisYear(jdbc, INST);
    }

    private JsonNode json(MvcResult r) throws Exception {
        return om.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private String confirm() throws Exception {
        MvcResult r = mockMvc.perform(post("/preps").contentType(MediaType.APPLICATION_JSON)
                .content("{\"institution_id\":\"" + INST + "\"}").header("X-Emp-No", MEMBER)
                .header("X-Screen-Id", "bid_board").header("X-Button-Id", "confirm")).andReturn();
        assertEquals(r.getResponse().getContentAsString(), 201, r.getResponse().getStatus());
        return json(r).path("bid_case_id").asText();
    }

    private JsonNode listRow(String bid) throws Exception {
        MvcResult r = mockMvc.perform(get("/preps").header("X-Emp-No", MEMBER)).andReturn();
        assertEquals(200, r.getResponse().getStatus());
        for (JsonNode n : json(r)) {
            if (bid.equals(n.path("bid_case_id").asText())) return n;
        }
        throw new AssertionError("목록에 " + bid + " 가 없다");
    }

    private JsonNode detail(String bid) throws Exception {
        MvcResult r = mockMvc.perform(get("/bidcases/" + bid + "/prep").header("X-Emp-No", MEMBER)
                .header("X-Screen-Id", "prep_detail").header("X-Button-Id", "open")).andReturn();
        assertEquals(200, r.getResponse().getStatus());
        return json(r);
    }

    /** 현황판은 개설(승인)된 건만 팀·부서 범위에 싣는다(inScope). 확정만 한 건은 확정자 본인의 scope=mine 에만 나온다. */
    private JsonNode boardRow(String bid) throws Exception {
        MvcResult r = mockMvc.perform(get("/prep-board?scope=mine").header("X-Emp-No", MEMBER)
                .header("X-Screen-Id", "prep_dashboard").header("X-Button-Id", "refresh")).andReturn();
        assertEquals(200, r.getResponse().getStatus());
        for (JsonNode n : json(r).path("rows")) {
            if (bid.equals(n.path("bid_case_id").asText())) return n;
        }
        throw new AssertionError("현황판에 " + bid + " 가 없다");
    }

    private static void assertSubject(JsonNode n, String cd, String name) {
        assertEquals(cd, n.path("bid_subject_cd").asText());
        assertEquals(name, n.path("bid_subject_name").asText());
    }

    /** 확정으로 만든 건은 제목 칸이 비어 있거나 건의 제목과 같다. 응답 키는 항상 있다. */
    private void assertTitle(JsonNode n, String bid) {
        assertTrue("bid_title 키가 없다", n.has("bid_title"));
        String db = jdbc.queryForObject("SELECT TITLE FROM BID_CASES WHERE BID_CASE_ID=?", String.class, bid);
        if (db == null || db.trim().isEmpty()) {
            assertTrue(n.path("bid_title").isNull());
        } else {
            assertEquals(db, n.path("bid_title").asText());
        }
    }

    @Test
    public void 확정하면_기본값_MAIN_BANK가_세_응답에_실린다() throws Exception {
        String bid = confirm();
        assertEquals("MAIN_BANK", jdbc.queryForObject("SELECT BID_SUBJECT_CD FROM BID_CASES WHERE BID_CASE_ID=?", String.class, bid));
        JsonNode l = listRow(bid), d = detail(bid), b = boardRow(bid);
        assertSubject(l, "MAIN_BANK", "주거래은행·금고");
        assertSubject(d, "MAIN_BANK", "주거래은행·금고");
        assertSubject(b, "MAIN_BANK", "주거래은행·금고");
        assertTitle(l, bid);
        assertTitle(d, bid);
        assertTitle(b, bid);
    }

    @Test
    public void 기타는_손_이름을_보이고_공고명이_있으면_그대로_싣는다() throws Exception {
        String bid = confirm();
        jdbc.update("UPDATE BID_CASES SET BID_SUBJECT_CD='ETC', BID_SUBJECT_ETC='가상 운용기관 선정', TITLE='가상 공고명' WHERE BID_CASE_ID=?", bid);
        JsonNode l = listRow(bid);
        assertSubject(l, "ETC", "가상 운용기관 선정");
        assertEquals("가상 공고명", l.path("bid_title").asText());
        assertEquals("가상 공고명", detail(bid).path("bid_title").asText());
        assertEquals("가상 공고명", boardRow(bid).path("bid_title").asText());
    }

    @Test
    public void 코드표_이름이_상세에_실린다() throws Exception {
        String bid = confirm();
        jdbc.update("UPDATE BID_CASES SET BID_SUBJECT_CD='FUND_MGMT' WHERE BID_CASE_ID=?", bid);
        assertSubject(detail(bid), "FUND_MGMT", "자금관리 금융기관");
        assertNotNull(listRow(bid));
    }
}
