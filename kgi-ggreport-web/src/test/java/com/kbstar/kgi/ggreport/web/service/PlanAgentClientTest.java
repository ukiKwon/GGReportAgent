package com.kbstar.kgi.ggreport.web.service;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** PlanAgentClient — 설정 검증·리다이렉트 거부·재시도 없음·4KB 상한·job_id 형식·쿠키 없음·토큰 비노출. 토큰은 가상 값. */
public class PlanAgentClientTest {

    interface Reply { void handle(HttpExchange ex) throws IOException; }

    private static final String TOKEN = "test-token-0123456789abcdef";
    private HttpServer server;
    private PlanAgentClient client;
    private volatile Reply reply;
    private final AtomicInteger jobs = new AtomicInteger();
    private final AtomicInteger other = new AtomicInteger();
    private final AtomicReference<String> auth = new AtomicReference<>();
    private final AtomicReference<String> cookie = new AtomicReference<>();
    private final AtomicReference<String> body = new AtomicReference<>();

    @Before
    public void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/plan-jobs", ex -> {
            jobs.incrementAndGet();
            auth.set(ex.getRequestHeaders().getFirst("Authorization"));
            cookie.set(ex.getRequestHeaders().getFirst("Cookie"));
            body.set(readAll(ex.getRequestBody()));
            reply.handle(ex);
        });
        server.createContext("/elsewhere", ex -> {
            other.incrementAndGet();
            send(ex, 202, "application/json", "{\"job_id\":\"redirected\"}");
        });
        server.start();
        client = new PlanAgentClient(base(), "127.0.0.1", TOKEN, true);
    }

    @After
    public void stop() {
        client.destroy();
        server.stop(0);
    }

    private String base() { return "http://127.0.0.1:" + server.getAddress().getPort(); }

    private PlanAgentClient.Result call() {
        return client.send("0b8f6c1e-1a2b-4c3d-8e9f-001122334455", "jongno", "종로구(가상)", Arrays.asList("example.kr"));
    }

    private static void send(HttpExchange ex, int code, String type, String text) throws IOException {
        byte[] b = text.getBytes(StandardCharsets.UTF_8);
        if (type != null) ex.getResponseHeaders().add("Content-Type", type);
        ex.sendResponseHeaders(code, b.length == 0 ? -1 : b.length);
        try (OutputStream o = ex.getResponseBody()) { o.write(b); }
    }

    private static String readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[1024];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    @Test
    public void 설정이_비면_꺼지고_BLOCKED_NO_URL이다() {
        PlanAgentClient off = new PlanAgentClient("", "", "", false);
        assertEquals(PlanAgentClient.State.OFF, off.state());
        assertEquals(PlanAgentClient.NO_URL, off.send("k", "jongno", "x", null).getCode());
    }

    @Test
    public void 잘못된_설정은_막힌다() {
        assertEquals(PlanAgentClient.State.BAD_CONFIG, PlanAgentClient.check("http://agent.example", "agent.example", TOKEN, false).state);
        assertEquals(PlanAgentClient.State.BAD_CONFIG, PlanAgentClient.check("https://u:p@agent.example", "agent.example", TOKEN, false).state);
        assertEquals(PlanAgentClient.State.BAD_CONFIG, PlanAgentClient.check("https://agent.example?a=1", "agent.example", TOKEN, false).state);
        assertEquals(PlanAgentClient.State.BAD_CONFIG, PlanAgentClient.check("https://agent.example/other", "agent.example", TOKEN, false).state);
        assertEquals(PlanAgentClient.State.BAD_CONFIG, PlanAgentClient.check("https://evil.example", "agent.example", TOKEN, false).state);
        assertEquals(PlanAgentClient.State.BAD_CONFIG, PlanAgentClient.check("https://agent.example", "agent.example", "short", false).state);
        assertEquals(PlanAgentClient.State.BAD_CONFIG, PlanAgentClient.check("https://agent.example", "agent.example", "", false).state);
        assertEquals("로컬 http 는 스위치가 켜져야만", PlanAgentClient.State.BAD_CONFIG,
                PlanAgentClient.check("http://127.0.0.1:1", "127.0.0.1", TOKEN, false).state);
        assertEquals(PlanAgentClient.State.READY, PlanAgentClient.check("https://agent.example:8443/", "AGENT.example", TOKEN, false).state);
    }

    @Test
    public void 접수되면_job_id만_읽고_Bearer로_보내고_쿠키를_되보내지_않는다() {
        reply = ex -> {
            ex.getResponseHeaders().add("Set-Cookie", "s=1");
            send(ex, 202, "application/json; charset=utf-8", "{\"job_id\":\"job-123\",\"accepted\":\"<script>\"}");
        };
        PlanAgentClient.Result r = call();
        assertEquals(PlanAgentClient.SENT, r.getCode());
        assertEquals("job-123", r.getJobId());
        assertEquals("Bearer " + TOKEN, auth.get());
        String b = body.get();
        assertTrue(b, b.contains("\"req_key\"") && b.contains("\"institution_id\":\"jongno\"") && b.contains("\"prev_domains\":[\"example.kr\"]"));
        assertFalse("토큰은 본문에 없다", b.contains(TOKEN));
        call();
        assertNull("받은 쿠키를 다음 요청에 싣지 않는다", cookie.get());
        assertFalse(client.toString().contains(TOKEN));
    }

    @Test
    public void 리다이렉트는_따라가지_않고_거절로_본다() {
        reply = ex -> {
            ex.getResponseHeaders().add("Location", base() + "/elsewhere");
            send(ex, 302, null, "");
        };
        assertEquals(PlanAgentClient.REJECTED, call().getCode());
        assertEquals(0, other.get());
    }

    @Test
    public void 서버_오류와_끊김은_재시도하지_않는다() {
        reply = ex -> send(ex, 500, "application/json", "{}");
        assertEquals(PlanAgentClient.REJECTED, call().getCode());
        assertEquals(1, jobs.get());
        reply = HttpExchange::close;   // 응답 없이 연결을 끊는다
        assertEquals(PlanAgentClient.UNREACHABLE, call().getCode());
        assertEquals("자동 재시도 없음", 2, jobs.get());
    }

    @Test
    public void 응답이_4KB를_넘으면_버린다_길이를_알때도_모를때도() {
        StringBuilder big = new StringBuilder("{\"job_id\":\"j1\",\"pad\":\"");
        for (int i = 0; i < 5000; i++) big.append('x');
        String text = big.append("\"}").toString();
        reply = ex -> send(ex, 202, "application/json", text);
        assertEquals(PlanAgentClient.BAD_RESPONSE, call().getCode());
        reply = ex -> {
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(202, 0);   // chunked
            try (OutputStream o = ex.getResponseBody()) { o.write(text.getBytes(StandardCharsets.UTF_8)); }
        };
        assertEquals(PlanAgentClient.BAD_RESPONSE, call().getCode());
    }

    @Test
    public void job_id_형식과_Content_Type을_검사한다() {
        reply = ex -> send(ex, 202, "application/json", "{\"job_id\":\"../etc\"}");
        assertEquals(PlanAgentClient.BAD_RESPONSE, call().getCode());
        StringBuilder longId = new StringBuilder();
        for (int i = 0; i < 65; i++) longId.append('a');
        reply = ex -> send(ex, 202, "application/json", "{\"job_id\":\"" + longId + "\"}");
        assertEquals(PlanAgentClient.BAD_RESPONSE, call().getCode());
        reply = ex -> send(ex, 202, "application/json", "{\"job_id\":123}");
        assertEquals(PlanAgentClient.BAD_RESPONSE, call().getCode());
        reply = ex -> send(ex, 202, "text/html", "{\"job_id\":\"ok-1\"}");
        assertEquals(PlanAgentClient.BAD_RESPONSE, call().getCode());
    }

    @Test
    public void 닫힌_포트는_UNREACHABLE이다() throws IOException {
        int port;
        try (ServerSocket s = new ServerSocket(0)) { port = s.getLocalPort(); }
        PlanAgentClient c = new PlanAgentClient("http://127.0.0.1:" + port, "127.0.0.1", TOKEN, true);
        try {
            assertEquals(PlanAgentClient.UNREACHABLE, c.send("k", "jongno", "x", null).getCode());
        } finally {
            c.destroy();
        }
    }

    @Test
    public void 동시_1건() {
        assertTrue(client.tryAcquire());
        try {
            assertFalse(client.tryAcquire());
        } finally {
            client.release();
        }
    }
}
