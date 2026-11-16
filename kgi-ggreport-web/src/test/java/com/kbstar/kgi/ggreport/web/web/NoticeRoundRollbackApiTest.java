package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
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

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 공고 상태 기록(037) 롤백 — <b>트랜잭션 없는</b> 시험이다(@Transactional 없음). 회차를 닫은 UPDATE 가 같은 저장이 409 로 끝날 때
 * 함께 되돌려지는지(서비스 @Transactional + ApiException=RuntimeException)를 실제 커밋 경계에서 본다. NoticeRoundApiTest 는 시험 전체가
 * 한 트랜잭션이라 이 롤백을 볼 수 없다(보안 검토 qa P2-1).
 *
 * <p>다른 시험이 쓰는 jongno 가 아니라 시드의 다른 기관 하나를 골라 쓰고, @After 에서 이 시험이 만든 행과 LAST_BID 를 원복한다.
 */
@RunWith(SpringRunner.class)
@AppTest
public class NoticeRoundRollbackApiTest {

    private static final String SALES = "3918264";
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcTemplate jdbc;

    private String inst;
    private String originalLastBid;

    @Before
    public void pick() {
        List<String> ids = jdbc.queryForList("SELECT INSTITUTION_ID FROM INSTITUTIONS WHERE INSTITUTION_ID <> 'jongno' ORDER BY INSTITUTION_ID", String.class);
        assertTrue("시드 기관이 없다", !ids.isEmpty());
        inst = ids.get(0);
        List<String> lb = jdbc.queryForList("SELECT LAST_BID FROM INSTITUTIONS WHERE INSTITUTION_ID = ?", String.class, inst);
        originalLastBid = lb.get(0);
        clean();
        jdbc.update("UPDATE INSTITUTIONS SET LAST_BID = ? WHERE INSTITUTION_ID = ?", "2022-10-18", inst);
    }

    @After
    public void restore() {
        clean();
        jdbc.update("UPDATE INSTITUTIONS SET LAST_BID = ? WHERE INSTITUTION_ID = ?", originalLastBid, inst);
    }

    private void clean() {
        jdbc.update("DELETE FROM NOTICE_ROUND_LOG WHERE INSTITUTION_ID = ?", inst);
        jdbc.update("DELETE FROM NOTICE_ROUND WHERE INSTITUTION_ID = ?", inst);
    }

    private MvcResult save(String content) throws Exception {
        return mockMvc.perform(post("/institutions/" + inst + "/notice-rounds/judgments")
                .header(Actor.HEADER, SALES).header("X-Screen-Id", "bid_notice").header("X-Button-Id", "save")
                .contentType(MediaType.APPLICATION_JSON).content(content)).andReturn();
    }

    private static JsonNode json(MvcResult r) throws Exception {
        return JSON.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    @Test
    public void 회차_변경_409는_닫힘을_함께_되돌리고_다음_저장이_닫고_새_회차를_연다() throws Exception {
        String tomorrow = LocalDate.parse(Times.todayKst()).plusDays(1).toString();
        MvcResult first = save("{\"round_seq\":null,\"base_rev_no\":0,\"status_cd\":\"DELAYED\",\"opinion\":\"게시판 공고 없음\","
                + "\"next_check_date\":\"" + tomorrow + "\"}");
        assertEquals(201, first.getResponse().getStatus());
        assertEquals(1, json(first).path("round_seq").asInt());

        jdbc.update("UPDATE INSTITUTIONS SET LAST_BID = ? WHERE INSTITUTION_ID = ?", "2026-10-20", inst);

        MvcResult changed = save("{\"round_seq\":1,\"base_rev_no\":1,\"status_cd\":\"IN_PROGRESS\"}");
        assertEquals(409, changed.getResponse().getStatus());
        assertEquals("ROUND_CHANGED", json(changed).path("detail").path("code").asText());
        // 409 로 끝난 저장의 회차 닫힘은 되돌려져야 한다.
        assertNull(jdbc.queryForObject("SELECT CLOSED_AT FROM NOTICE_ROUND WHERE INSTITUTION_ID = ? AND ROUND_SEQ = 1", String.class, inst));
        assertNull(jdbc.queryForObject("SELECT CLOSE_REASON_CD FROM NOTICE_ROUND WHERE INSTITUTION_ID = ? AND ROUND_SEQ = 1", String.class, inst));
        assertEquals(1, (int) jdbc.queryForObject("SELECT COUNT(*) FROM NOTICE_ROUND WHERE INSTITUTION_ID = ?", Integer.class, inst));

        MvcResult second = save("{\"round_seq\":null,\"base_rev_no\":0,\"status_cd\":\"IN_PROGRESS\"}");
        assertEquals(201, second.getResponse().getStatus());
        assertEquals(1, json(second).path("closed_round_seq").asInt());
        assertEquals(2, json(second).path("round_seq").asInt());
        assertNotNull(jdbc.queryForObject("SELECT CLOSED_AT FROM NOTICE_ROUND WHERE INSTITUTION_ID = ? AND ROUND_SEQ = 1", String.class, inst));
        assertEquals("SOURCE_ADVANCED", jdbc.queryForObject("SELECT CLOSE_REASON_CD FROM NOTICE_ROUND WHERE INSTITUTION_ID = ? AND ROUND_SEQ = 1", String.class, inst));
        assertEquals(1, (int) jdbc.queryForObject("SELECT COUNT(*) FROM NOTICE_ROUND WHERE INSTITUTION_ID = ? AND CLOSED_AT IS NULL", Integer.class, inst));
    }
}
