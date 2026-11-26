package com.kbstar.kgi.ggreport.web.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import org.junit.After;
import org.junit.Test;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * NEXT 129 ⑤ — 이 PC 로컬 Ollama 어댑터. JDK 내장 HttpServer 를 127.0.0.1:0 에 띄워 네이티브 /api/chat 응답을 흉내 낸다.
 * 모델 이름은 가상(test-model) — 실제 모델에 기대지 않는다.
 */
public class OllamaLlmClientTest {

    private static final String DS = "jdbc:mysql://localhost:3306/x";
    private final ObjectMapper om = new ObjectMapper();
    private HttpServer server;
    private OllamaLlmClient client;
    private final AtomicReference<String> lastBody = new AtomicReference<String>();
    private final AtomicInteger hits = new AtomicInteger();

    @After
    public void 정리() {
        if (client != null) {
            client.destroy();
        }
        if (server != null) {
            server.stop(0);
        }
    }

    private void serve(String path, HttpHandler h) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(path, h);
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();
    }

    private int port() { return server.getAddress().getPort(); }

    private OllamaProperties props(int port) {
        OllamaProperties p = new OllamaProperties();
        p.setEnabled(true);
        p.setModel("test-model");
        p.setBaseUrl("http://127.0.0.1:" + port);
        p.setConnectTimeoutMs(1_000);
        p.setReadTimeoutMs(5_000);
        p.setMaxResponseBytes(65_536);
        return p;
    }

    private OllamaLlmClient make(OllamaProperties p) {
        client = new OllamaLlmClient(p, OllamaGuard.check(p, DS, ""));
        return client;
    }

    private void reply(HttpExchange x, int status, String body) throws IOException {
        byte[] b = body.getBytes(StandardCharsets.UTF_8);
        x.getResponseHeaders().add("Content-Type", "application/json");
        x.sendResponseHeaders(status, b.length);
        try (OutputStream o = x.getResponseBody()) {
            o.write(b);
        }
    }

    private String chatBody(String content, String doneReason) throws Exception {
        ObjectNode n = om.createObjectNode();
        n.putObject("message").put("role", "assistant").put("content", content);
        n.put("done_reason", doneReason);
        return om.writeValueAsString(n);
    }

    private HttpHandler okHandler(final String content) {
        return new HttpHandler() {
            @Override public void handle(HttpExchange x) throws IOException {
                hits.incrementAndGet();
                lastBody.set(new String(readAll(x), StandardCharsets.UTF_8));
                try {
                    reply(x, 200, chatBody(content, "stop"));
                } catch (Exception e) {
                    throw new IOException(e);
                }
            }
        };
    }

    private static byte[] readAll(HttpExchange x) throws IOException {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[1024];
        int n;
        while ((n = x.getRequestBody().read(buf)) > 0) {
            out.write(buf, 0, n);
        }
        return out.toByteArray();
    }

    /** 시험용 응답 모양 — 실제 ScriptDraftOut 과 같은 두 칸. */
    @LlmJsonSchema("{\"type\":\"object\",\"properties\":{\"intro\":{\"type\":\"string\"},\"effect\":{\"type\":\"string\"}},"
            + "\"required\":[\"intro\",\"effect\"]}")
    public static class ScriptDraftOutForTest {
        public String intro;
        public String effect;
    }

    private static LlmRequest<ScriptDraftOutForTest> req() {
        return LlmRequest.of("가상 프롬프트", ScriptDraftOutForTest.class);
    }

    private LlmCallException expectCode(LlmRequest<ScriptDraftOutForTest> r) {
        try {
            client.draft(r);
        } catch (LlmCallException e) {
            return e;
        }
        fail("예외가 나야 한다");
        return null;
    }

    @Test
    public void 정상_응답은_값이_파싱되고_본문_계약을_지킨다() throws Exception {
        serve("/api/chat", okHandler("{\"intro\":\"가\",\"effect\":\"나\"}"));
        make(props(port()));
        LlmResponse<ScriptDraftOutForTest> r = client.draft(req());
        assertEquals("가", r.getValue().intro);
        assertEquals("나", r.getValue().effect);
        assertEquals("test-model", r.getModel());
        assertFalse(r.isFellBack());
        JsonNode sent = om.readTree(lastBody.get());
        assertEquals("test-model", sent.path("model").asText());
        assertFalse(sent.path("stream").asBoolean(true));
        assertEquals(0.0, sent.path("options").path("temperature").asDouble(-1), 0.0);
        assertEquals(0, sent.path("options").path("seed").asInt(-1));
        assertTrue(sent.path("format").isObject());
        assertTrue(sent.path("think").isMissingNode());
        assertTrue(sent.path("options").path("num_ctx").isMissingNode());
    }

    @Test
    public void thinkOff_와_numCtx를_켜면_본문에_실린다() throws Exception {
        serve("/api/chat", okHandler("{\"intro\":\"\",\"effect\":\"\"}"));
        OllamaProperties p = props(port());
        p.setThinkOff(true);
        p.setNumCtx(8192);
        make(p);
        client.draft(req());
        JsonNode sent = om.readTree(lastBody.get());
        assertTrue(sent.has("think"));
        assertFalse(sent.path("think").asBoolean(true));
        assertEquals(8192, sent.path("options").path("num_ctx").asInt());
    }

    @Test
    public void 모델이_코드_울타리를_붙여도_JSON을_뽑는다() throws Exception {
        serve("/api/chat", okHandler("```json\n{\"intro\":\"가\",\"effect\":\"나\"}\n```"));
        make(props(port()));
        assertEquals("가", client.draft(req()).getValue().intro);
    }

    @Test
    public void 모델이_없으면_404_모델없음_예외이고_두번째_요청은_없다() throws Exception {
        serve("/api/chat", new HttpHandler() {
            @Override public void handle(HttpExchange x) throws IOException {
                hits.incrementAndGet();
                readAll(x);
                reply(x, 404, "{\"error\":\"model not found\"}");
            }
        });
        make(props(port()));
        try {
            client.draft(req());
            fail("예외가 나야 한다");
        } catch (LlmModelUnavailableException e) {
            assertEquals(404, e.getStatusCode());
        }
        assertEquals(1, hits.get());
    }

    @Test
    public void 서버_오류는_HTTP_코드이고_재시도하지_않는다() throws Exception {
        serve("/api/chat", new HttpHandler() {
            @Override public void handle(HttpExchange x) throws IOException {
                hits.incrementAndGet();
                readAll(x);
                reply(x, 500, "{\"error\":\"boom\"}");
            }
        });
        make(props(port()));
        LlmCallException e = expectCode(req());
        assertEquals(LlmCallException.HTTP, e.getCode());
        assertEquals(500, e.getStatusCode());
        assertEquals(1, hits.get());
    }

    @Test
    public void 본문이_상한을_넘으면_BAD_OUTPUT() throws Exception {
        final StringBuilder big = new StringBuilder();
        for (int i = 0; i < 3000; i++) {
            big.append('x');
        }
        serve("/api/chat", new HttpHandler() {
            @Override public void handle(HttpExchange x) throws IOException {
                readAll(x);
                reply(x, 200, big.toString());
            }
        });
        OllamaProperties p = props(port());
        p.setMaxResponseBytes(1_024);
        make(p);
        assertEquals(LlmCallException.BAD_OUTPUT, expectCode(req()).getCode());
    }

    @Test
    public void 출력이_잘리면_TRUNCATED() throws Exception {
        serve("/api/chat", new HttpHandler() {
            @Override public void handle(HttpExchange x) throws IOException {
                readAll(x);
                try {
                    reply(x, 200, chatBody("{\"intro\":\"가", "length"));
                } catch (Exception e) {
                    throw new IOException(e);
                }
            }
        });
        make(props(port()));
        assertEquals(LlmCallException.TRUNCATED, expectCode(req()).getCode());
    }

    @Test
    public void 응답이_너무_늦으면_TIMEOUT() throws Exception {
        serve("/api/chat", new HttpHandler() {
            @Override public void handle(HttpExchange x) throws IOException {
                readAll(x);
                try {
                    Thread.sleep(2_000);
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
                try {
                    reply(x, 200, "{}");
                } catch (IOException ignored) {
                    // 클라이언트가 이미 끊음
                }
            }
        });
        OllamaProperties p = props(port());
        p.setConnectTimeoutMs(500);
        p.setReadTimeoutMs(500);
        make(p);
        assertEquals(LlmCallException.TIMEOUT, expectCode(req()).getCode());
    }

    @Test
    public void 서버가_몇_바이트씩_보내며_끌어도_전체_마감에서_TIMEOUT() throws Exception {
        serve("/api/chat", new HttpHandler() {
            @Override public void handle(HttpExchange x) throws IOException {
                readAll(x);
                x.sendResponseHeaders(200, 0);   // 청크 응답
                try (OutputStream o = x.getResponseBody()) {
                    for (int i = 0; i < 14; i++) {
                        o.write('x');
                        o.flush();
                        Thread.sleep(500);
                    }
                } catch (IOException | InterruptedException ignored) {
                    // 감시 타이머가 끊음
                }
            }
        });
        OllamaProperties p = props(port());
        p.setConnectTimeoutMs(500);
        p.setReadTimeoutMs(5_000);   // 소켓 읽기 제한(5초)은 안 걸리고 전체 마감(5.5초)만 걸린다
        make(p);
        assertEquals(LlmCallException.TIMEOUT, expectCode(req()).getCode());
    }

    @Test
    public void 닫힌_포트는_UNREACHABLE이고_메시지에_주소가_없다() throws Exception {
        serve("/api/chat", okHandler("{}"));
        int closed = port();
        server.stop(0);
        make(props(closed));
        LlmCallException e = expectCode(req());
        // Windows 는 닫힌 포트를 즉시 거절하지 않고 연결 제한에 걸릴 수 있다 — 어느 경로든 UNREACHABLE
        assertEquals(LlmCallException.UNREACHABLE, e.getCode());
        assertFalse(e.getMessage(), e.getMessage().contains("127.0.0.1") || e.getMessage().contains(String.valueOf(closed)));
    }

    @Test
    public void 첫_호출이_막힌_동안_두번째_호출은_BUSY() throws Exception {
        final CountDownLatch inside = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        serve("/api/chat", new HttpHandler() {
            @Override public void handle(HttpExchange x) throws IOException {
                readAll(x);
                inside.countDown();
                try {
                    release.await(10, TimeUnit.SECONDS);
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
                try {
                    reply(x, 200, chatBody("{\"intro\":\"가\",\"effect\":\"나\"}", "stop"));
                } catch (Exception e) {
                    throw new IOException(e);
                }
            }
        });
        make(props(port()));
        ExecutorService ex = Executors.newSingleThreadExecutor();
        try {
            Future<LlmResponse<ScriptDraftOutForTest>> first = ex.submit(new java.util.concurrent.Callable<LlmResponse<ScriptDraftOutForTest>>() {
                @Override public LlmResponse<ScriptDraftOutForTest> call() {
                    return client.draft(req());
                }
            });
            assertTrue(inside.await(5, TimeUnit.SECONDS));
            assertEquals(LlmCallException.BUSY, expectCode(req()).getCode());
            release.countDown();
            assertEquals("가", first.get(10, TimeUnit.SECONDS).getValue().intro);
        } finally {
            release.countDown();
            ex.shutdownNow();
        }
    }

    @Test
    public void 막힌_설정이면_네트워크_없이_OFF() {
        OllamaProperties p = new OllamaProperties();
        p.setEnabled(true);
        p.setModel("test-model");
        p.setBaseUrl("http://10.0.0.5:11434");   // NOT_LOOPBACK
        make(p);
        assertEquals(OllamaGuard.State.BAD_CONFIG, client.state());
        assertEquals(LlmCallException.OFF, expectCode(req()).getCode());
        assertFalse(client.probe().isReachable());
    }

    @Test
    public void probe는_태그_없는_설정이면_latest를_같은_모델로_보고_꺼진_서버는_reachable_false() throws Exception {
        serve("/api/tags", new HttpHandler() {
            @Override public void handle(HttpExchange x) throws IOException {
                reply(x, 200, "{\"models\":[{\"name\":\"test-model:latest\"},{\"name\":\"other:1b\"}]}");
            }
        });
        make(props(port()));
        OllamaLlmClient.Probe p = client.probe();
        assertTrue(p.isReachable());
        assertTrue(p.isModelReady());
        server.stop(0);
        OllamaLlmClient.Probe off = client.probe();
        assertFalse(off.isReachable());
        assertFalse(off.isModelReady());
    }

    @Test
    public void probe는_완전_일치만_model_ready_접두사만_같으면_아니다() throws Exception {
        serve("/api/tags", new HttpHandler() {
            @Override public void handle(HttpExchange x) throws IOException {
                reply(x, 200, "{\"models\":[{\"name\":\"test-model-big:1b\"},{\"name\":\"test-model:13b\"}]}");
            }
        });
        make(props(port()));                          // 설정 "test-model"(태그 없음) — :latest 가 없으니 아니다
        OllamaLlmClient.Probe p = client.probe();
        assertTrue(p.isReachable());
        assertFalse(p.isModelReady());
        client.destroy();
        OllamaProperties tagged = props(port());
        tagged.setModel("test-model:7b");             // 태그가 있으면 :latest 를 인정하지 않고 13b 도 아니다
        make(tagged);
        assertFalse(client.probe().isModelReady());
        client.destroy();
        OllamaProperties exact = props(port());
        exact.setModel("test-model:13b");
        make(exact);
        assertTrue(client.probe().isModelReady());
    }

    @Test
    public void probe는_동시_1건_겹치면_null() throws Exception {
        final CountDownLatch inside = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        serve("/api/tags", new HttpHandler() {
            @Override public void handle(HttpExchange x) throws IOException {
                inside.countDown();
                try {
                    release.await(10, TimeUnit.SECONDS);
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
                reply(x, 200, "{\"models\":[{\"name\":\"test-model:latest\"}]}");
            }
        });
        make(props(port()));
        ExecutorService ex = Executors.newSingleThreadExecutor();
        try {
            Future<OllamaLlmClient.Probe> first = ex.submit(new java.util.concurrent.Callable<OllamaLlmClient.Probe>() {
                @Override public OllamaLlmClient.Probe call() {
                    return client.probe();
                }
            });
            assertTrue(inside.await(5, TimeUnit.SECONDS));
            assertEquals("겹치면 '닿지 않음'이 아니라 모름(null)", null, client.probe());
            release.countDown();
            assertTrue(first.get(10, TimeUnit.SECONDS).isModelReady());
            assertTrue("끝나면 다시 확인할 수 있다", client.probe().isReachable());
        } finally {
            release.countDown();
            ex.shutdownNow();
        }
    }

    @Test
    public void 어댑터는_전역_LlmClient가_아니다() {
        assertFalse(LlmClient.class.isAssignableFrom(OllamaLlmClient.class));
    }
}
