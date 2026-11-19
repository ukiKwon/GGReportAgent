package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * 디자인 검토 흐름(051)의 동시 경합 — 커밋해야 보이는 것(security M1, PlanCollectTxTest 방식).
 * ⓐ [다시 수정] ∥ 의견 ⓑ 영업팀장 승인(부장께 올림) ∥ 의견: 닫힌 회차에 의견이 남지 않는다(의견은 회차를 닫은 시각 이전이거나 409 ROUND_CLOSED).
 * ⓒ 같은 사람 29건 상태에서 동시에 2건: 정확히 1건만 들어간다(30건 상한).
 * ⚠️ 일부러 {@code @Transactional} 을 붙이지 않는다 — 건마다 입찰 건·작업을 커밋해 넣고 뒤에서 지운다(접근 이력은 시험 전 번호 이후만 지운다).
 */
@RunWith(SpringRunner.class)
@AppTest
public class DesignReviewTxTest {

    private static final String DESIGNER = "7130526";
    private static final String LEAD = "5047192";
    private static final String LEAD2 = "5640327";
    private static final String SALES = "3918264";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    private final ObjectMapper json = new ObjectMapper();
    private long accessLogBase;
    private final List<String> bids = new ArrayList<String>();

    @Before
    public void 앞정리() {
        accessLogBase = jdbc.queryForObject("SELECT COALESCE(MAX(LOG_ID), 0) FROM ACCESS_LOG", Long.class);
    }

    @After
    public void 뒤정리() {
        for (String b : bids) {
            String ids = "(SELECT TASK_ID FROM TASKS WHERE BID_CASE_ID=?)";
            jdbc.update("DELETE FROM NOTIFICATIONS WHERE TASK_ID IN " + ids, b);
            jdbc.update("DELETE FROM DESIGN_COMMENT WHERE TASK_ID IN " + ids, b);
            jdbc.update("DELETE FROM DESIGN_ACK WHERE TASK_ID IN " + ids, b);
            jdbc.update("DELETE FROM DESIGN_ROUND_RECIP WHERE TASK_ID IN " + ids, b);
            jdbc.update("DELETE FROM DESIGN_ROUND WHERE BID_CASE_ID=?", b);
            jdbc.update("DELETE FROM BID_PREP_ACT WHERE BID_CASE_ID=?", b);
            jdbc.update("DELETE FROM TASKS WHERE BID_CASE_ID=?", b);
            jdbc.update("DELETE FROM BID_ASSIGNMENT WHERE BID_CASE_ID=?", b);
            jdbc.update("DELETE FROM BID_CASES WHERE BID_CASE_ID=?", b);
        }
        jdbc.update("DELETE FROM ACCESS_LOG WHERE LOG_ID > ?", accessLogBase);
    }

    private int count(String sql, Object... a) {
        return jdbc.queryForObject(sql, Integer.class, a);
    }

    /** 커밋된 새 건 + 회차 1 이 열린 디자이너 작업(1차완료). 작업 번호를 돌려준다. */
    private String openedRound() throws Exception {
        String k = UUID.randomUUID().toString().substring(0, 8);
        String bid = "bc-dsntx-" + k;
        bids.add(bid);
        jdbc.update("INSERT INTO BID_CASES (BID_CASE_ID, INSTITUTION_ID) VALUES (?, ?)", bid, "nowon");
        jdbc.update("INSERT INTO TASKS (TASK_ID, BID_CASE_ID, TEAM, STATUS, ASSIGNEE) VALUES (?,?,?,?,?)", "task-dsntx-s-" + k, bid, "영업", "2차완료", "김영업");
        jdbc.update("INSERT INTO TASKS (TASK_ID, BID_CASE_ID, TEAM, STATUS, ASSIGNEE) VALUES (?,?,?,?,?)", "task-dsntx-i-" + k, bid, "전산", "2차완료", "오전산");
        jdbc.update("INSERT INTO TASKS (TASK_ID, BID_CASE_ID, TEAM, STATUS, ASSIGNEE) VALUES (?,?,?,?,?)", "task-dsntx-b-" + k, bid, "예산", "2차완료", "한예산");
        String tid = "task-dsntx-d-" + k;
        jdbc.update("INSERT INTO TASKS (TASK_ID, BID_CASE_ID, TEAM, STATUS, ASSIGNEE) VALUES (?,?,?,?,?)", tid, bid, "디자이너", "작성중", "최디자이너");
        jdbc.update("INSERT INTO BID_ASSIGNMENT (BID_CASE_ID, EMP_NO, ACTIVE_YN, ASSIGNED_BY, ASSIGNED_AT) VALUES (?,?,1,?,?)",
                bid, SALES, LEAD, "2026-11-19T00:00:00.000000+00:00");
        assertEquals(200, call("/tasks/" + tid + "/design/complete", DESIGNER, null).getStatus());
        return tid;
    }

    private MockHttpServletResponse call(String path, String emp, String body) throws Exception {
        return mockMvc.perform(MockMvcRequestBuilders.post(path).header("X-User-Id", "web-user").header("X-Emp-No", emp)
                .contentType(MediaType.APPLICATION_JSON).content(body == null ? "" : body)).andReturn().getResponse();
    }

    private Callable<MockHttpServletResponse> after(final CountDownLatch go, final String path, final String emp, final String body) {
        return new Callable<MockHttpServletResponse>() {
            @Override
            public MockHttpServletResponse call() throws Exception {
                go.await();
                return DesignReviewTxTest.this.call(path, emp, body);
            }
        };
    }

    /** 두 요청을 같은 순간에 시작한다. */
    private List<MockHttpServletResponse> race(String p1, String e1, String b1, String p2, String e2, String b2) throws Exception {
        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<MockHttpServletResponse> a = pool.submit(after(go, p1, e1, b1));
            Future<MockHttpServletResponse> b = pool.submit(after(go, p2, e2, b2));
            go.countDown();
            return Arrays.asList(a.get(30, TimeUnit.SECONDS), b.get(30, TimeUnit.SECONDS));
        } finally {
            pool.shutdownNow();
        }
    }

    private String code(MockHttpServletResponse r) throws Exception {
        return json.readTree(r.getContentAsString(StandardCharsets.UTF_8)).path("detail").path("code").asText();
    }

    /** 의견이 들어갔다면 회차를 닫은 시각 이전이어야 하고, 안 들어갔다면 409 ROUND_CLOSED 여야 한다. */
    private void assertNoCommentOnClosedRound(String tid, MockHttpServletResponse comment) throws Exception {
        int rows = count("SELECT COUNT(*) FROM DESIGN_COMMENT WHERE TASK_ID=? AND ROUND_NO=1", tid);
        String closedAt = jdbc.queryForObject("SELECT CLOSED_AT FROM DESIGN_ROUND WHERE TASK_ID=? AND ROUND_NO=1", String.class, tid);
        assertTrue("회차가 닫혔다", closedAt != null);
        if (comment.getStatus() == 201) {
            assertEquals(1, rows);
            String createdAt = jdbc.queryForObject("SELECT CREATED_AT FROM DESIGN_COMMENT WHERE TASK_ID=? AND ROUND_NO=1", String.class, tid);
            assertTrue("의견은 회차를 닫기 전에 들어갔다: " + createdAt + " / " + closedAt, createdAt.compareTo(closedAt) <= 0);
        } else {
            assertEquals(409, comment.getStatus());
            assertEquals("ROUND_CLOSED", code(comment));
            assertEquals("닫힌 회차에는 의견이 없다", 0, rows);
        }
    }

    @Test
    public void 다시_수정과_의견이_동시에_와도_닫힌_회차에_의견이_남지_않는다() throws Exception {
        for (int i = 0; i < 5; i++) {
            String tid = openedRound();
            List<MockHttpServletResponse> r = race("/tasks/" + tid + "/design/revise", DESIGNER, null,
                    "/tasks/" + tid + "/design/comments", LEAD, "{\"round_no\":1,\"body\":\"동시 의견\"}");
            assertEquals("다시 수정은 항상 성공", 200, r.get(0).getStatus());
            assertEquals("작성중", jdbc.queryForObject("SELECT STATUS FROM TASKS WHERE TASK_ID=?", String.class, tid));
            assertEquals("REVISE", jdbc.queryForObject("SELECT CLOSE_CD FROM DESIGN_ROUND WHERE TASK_ID=? AND ROUND_NO=1", String.class, tid));
            assertNoCommentOnClosedRound(tid, r.get(1));
        }
    }

    @Test
    public void 부장께_올림과_의견이_동시에_와도_닫힌_회차에_의견이_남지_않는다() throws Exception {
        for (int i = 0; i < 3; i++) {
            String tid = openedRound();
            List<MockHttpServletResponse> r = race("/tasks/" + tid + "/approve", LEAD, "{\"approved\":true}",
                    "/tasks/" + tid + "/design/comments", LEAD2, "{\"round_no\":1,\"body\":\"동시 의견\"}");
            assertEquals("영업팀장 승인은 항상 성공", 200, r.get(0).getStatus());
            assertEquals("2차완료", jdbc.queryForObject("SELECT STATUS FROM TASKS WHERE TASK_ID=?", String.class, tid));
            assertEquals("FORWARD", jdbc.queryForObject("SELECT CLOSE_CD FROM DESIGN_ROUND WHERE TASK_ID=? AND ROUND_NO=1", String.class, tid));
            assertNoCommentOnClosedRound(tid, r.get(1));
        }
    }

    @Test
    public void 같은_사람의_29건_상태에서_동시에_둘이_오면_한_건만_들어간다() throws Exception {
        String tid = openedRound();
        for (int seq = 1; seq <= 29; seq++) {
            jdbc.update("INSERT INTO DESIGN_COMMENT (TASK_ID, ROUND_NO, EMP_NO, SEQ_NO, BODY, EMP_VERIFIED, CREATED_AT) VALUES (?,?,?,?,?,0,?)",
                    tid, 1, LEAD, seq, "의견 " + seq, "2026-11-19T00:00:00.000000+00:00");
        }
        List<MockHttpServletResponse> r = race("/tasks/" + tid + "/design/comments", LEAD, "{\"round_no\":1,\"body\":\"서른 번째 후보 가\"}",
                "/tasks/" + tid + "/design/comments", LEAD, "{\"round_no\":1,\"body\":\"서른 번째 후보 나\"}");
        List<Integer> st = new ArrayList<Integer>(Arrays.asList(r.get(0).getStatus(), r.get(1).getStatus()));
        Collections.sort(st);
        assertEquals("한 건만 들어간다", Arrays.asList(201, 409), st);
        MockHttpServletResponse loser = r.get(0).getStatus() == 409 ? r.get(0) : r.get(1);
        assertEquals("TOO_MANY_COMMENTS", code(loser));
        assertEquals(30, count("SELECT COUNT(*) FROM DESIGN_COMMENT WHERE TASK_ID=? AND EMP_NO=?", tid, LEAD));
    }
}
