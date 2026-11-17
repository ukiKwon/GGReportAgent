package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.sun.net.httpserver.HttpServer;
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
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * ③ 시험용 agent 실행 흐름 — 같은 스프링 컨텍스트에서 PlanAgentClient.configure(패키지 전용)로 로컬 가짜 수신기에 켰다가 @After 에 끈다
 * (컨텍스트를 쪼개면 DDL 이 두 번 돈다 — AppTest 규칙). 서비스 패키지에 두는 이유가 그것이다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class PlanCollectRunApiTest {

    private static final String ADMIN = "8203417";
    private static final String SALES = "3918264";
    private static final String INST = "jongno";
    private static final String TOKEN = "test-token-0123456789abcdef";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlanAgentClient agent;
    private final ObjectMapper json = new ObjectMapper();
    private HttpServer server;
    private volatile int status = 202;
    private volatile String reply = "{\"job_id\":\"job-123\"}";
    private final AtomicInteger hits = new AtomicInteger();
    private final AtomicReference<String> sent = new AtomicReference<>();

    @Before
    public void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/plan-jobs", ex -> {
            hits.incrementAndGet();
            sent.set(readAll(ex.getRequestBody()));
            byte[] b = reply.getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(status, b.length);
            try (OutputStream o = ex.getResponseBody()) { o.write(b); }
        });
        server.start();
        agent.configure("http://127.0.0.1:" + server.getAddress().getPort(), "127.0.0.1", TOKEN, true);
    }

    @After
    public void stop() {
        agent.configure("", "", "", false);
        server.stop(0);
    }

    private static String readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[1024];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    private MockHttpServletResponse run(String body) throws Exception {
        MockHttpServletResponse r = mockMvc.perform(post("/plan-collect/run").header("X-Emp-No", ADMIN)
                .contentType(MediaType.APPLICATION_JSON).content(body)).andReturn().getResponse();
        r.setCharacterEncoding("UTF-8");
        return r;
    }

    private String requestKey() throws Exception {
        assertEquals(201, mockMvc.perform(post("/institutions/" + INST + "/plan-collect").header("X-Emp-No", SALES))
                .andReturn().getResponse().getStatus());
        return jdbc.queryForObject("SELECT REQ_KEY FROM PLAN_COLLECT_REQ WHERE OPEN_INST_ID=?", String.class, INST);
    }

    private int count(String sql, Object... a) { return jdbc.queryForObject(sql, Integer.class, a); }

    @Test
    public void 접수되면_수집_중이_되고_job_id와_시작_결과_감사가_남는다() throws Exception {
        String k = requestKey();
        MockHttpServletResponse r = run("{\"req_keys\":[\"" + k + "\"]}");
        assertEquals(r.getContentAsString(), 200, r.getStatus());
        JsonNode b = json.readTree(r.getContentAsString());
        assertEquals("SENT", b.path("results").get(0).path("result_cd").asText());
        assertEquals(1, count("SELECT COUNT(*) FROM PLAN_COLLECT_REQ WHERE REQ_KEY=? AND STATUS_CD='RUNNING' AND RUN_MODE='AGENT'"
                + " AND JOB_ID='job-123' AND RUN_RESULT_CD='SENT'", k));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='COLLECT_RUN' AND OUTCOME='STARTED' AND BUTTON_ID='plan_collect_run'"));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='COLLECT_RUN' AND OUTCOME='SENT'"));
        String s = sent.get();
        assertTrue(s, s.contains(k) && s.contains("\"institution_id\":\"jongno\""));
        assertFalse("사번·이름·토큰은 보내지 않는다", s.contains(SALES) || s.contains("김영업") || s.contains(TOKEN));
    }

    @Test
    public void 거절되면_요청됨으로_돌아가고_다시_실행할_수_있다() throws Exception {
        status = 500;
        String k = requestKey();
        assertEquals("AGENT_REJECTED", json.readTree(run("{\"req_keys\":[\"" + k + "\"]}").getContentAsString())
                .path("results").get(0).path("result_cd").asText());
        assertEquals(1, count("SELECT COUNT(*) FROM PLAN_COLLECT_REQ WHERE REQ_KEY=? AND STATUS_CD='REQUESTED' AND RUN_RESULT_CD='AGENT_REJECTED'", k));
        assertNull(jdbc.queryForObject("SELECT JOB_ID FROM PLAN_COLLECT_REQ WHERE REQ_KEY=?", String.class, k));
        assertEquals(1, hits.get());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='COLLECT_RUN' AND OUTCOME='AGENT_REJECTED'"));
        status = 202;
        assertEquals("SENT", json.readTree(run("{\"req_keys\":[\"" + k + "\"]}").getContentAsString())
                .path("results").get(0).path("result_cd").asText());
    }

    @Test
    public void 다른_실행_중이면_409_BUSY이고_호출하지_않는다() throws Exception {
        String k = requestKey();
        assertTrue(agent.tryAcquire());
        try {
            MockHttpServletResponse r = run("{\"req_keys\":[\"" + k + "\"]}");
            assertEquals(409, r.getStatus());
            assertEquals("BUSY", json.readTree(r.getContentAsString()).path("detail").path("code").asText());
        } finally {
            agent.release();
        }
        assertEquals(0, hits.get());
        assertEquals(1, count("SELECT COUNT(*) FROM PLAN_COLLECT_REQ WHERE REQ_KEY=? AND STATUS_CD='REQUESTED'", k));
    }

    @Test
    public void 한번에_11건은_400이고_수집_중인_건은_NOT_REQUESTED() throws Exception {
        StringBuilder many = new StringBuilder("{\"req_keys\":[");
        for (int i = 0; i < 11; i++) many.append(i > 0 ? "," : "").append('"').append(UUID.randomUUID()).append('"');
        assertEquals(400, run(many.append("]}").toString()).getStatus());
        String k = requestKey();
        mockMvc.perform(post("/plan-collect/mark-running").header("X-Emp-No", ADMIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"req_keys\":[\"" + k + "\"]}"));
        assertEquals("NOT_REQUESTED", json.readTree(run("{\"req_keys\":[\"" + k + "\"]}").getContentAsString())
                .path("results").get(0).path("result_cd").asText());
        assertEquals(0, hits.get());
    }
}
