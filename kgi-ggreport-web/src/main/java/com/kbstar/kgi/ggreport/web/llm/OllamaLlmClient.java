package com.kbstar.kgi.ggreport.web.llm;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.http.HttpEntity;
import org.apache.http.HttpHeaders;
import org.apache.http.conn.ConnectTimeoutException;
import org.apache.http.conn.ConnectionPoolTimeoutException;
import org.apache.http.client.config.CookieSpecs;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.entity.ByteArrayEntity;
import org.apache.http.entity.ContentType;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClientBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.net.SocketTimeoutException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * <b>이 PC 시범 전용</b> 로컬 Ollama 어댑터(NEXT 129 ⑤). 사내 LLM 어댑터(Task 4.4)가 아니다 — 운영은 사내 AI 연결 전까지 끈다.
 * 앱 전역 {@link LlmClient} 가 아니다 — 주입 경로는 ScriptDraftService 의 ObjectProvider&lt;OllamaLlmClient&gt; 하나(security 중-2).
 * 이 PC 기본 모델 gemma4:12b(설정 키로 바꿈).
 * 호출: 네이티브 {@code POST /api/chat}(stream=false, format=JSON 스키마, options.temperature·seed=0) — 저장소 실측 기록(항목 5, 2026-08-06·08-10)과 같은 방식.
 * 동시 1건(넘치면 LLM_BUSY). 리다이렉트·재시도·쿠키·압축·시스템 프록시 없음. 폴백 모델 없음.
 * 전체 마감(connect+read)을 넘기면 감시 타이머가 요청을 끊는다. 주소·프롬프트·응답 본문은 어떤 로그에도 남기지 않는다(모델명·HTTP 상태·소요 ms만 — 모델명은 호출 로그에 남는다).
 */
public class OllamaLlmClient implements DisposableBean {

    private static final Logger LOG = LoggerFactory.getLogger(OllamaLlmClient.class);
    static final int POOL_MS = 1_000;
    static final int PROBE_MS = 2_000;
    static final int PROBE_MAX_BODY = 65_536;

    /** 상태 조회 결과 — 설치 목록 자체는 내보내지 않는다. */
    public static final class Probe {
        private final boolean reachable;
        private final boolean modelReady;

        public Probe(boolean reachable, boolean modelReady) {   // 다른 패키지의 컨트롤러 시험이 만든다(값 두 개뿐 — 위험 없음)
            this.reachable = reachable;
            this.modelReady = modelReady;
        }

        public boolean isReachable() { return reachable; }
        public boolean isModelReady() { return modelReady; }
    }

    private final OllamaGuard.Check check;
    private final String model;
    private final int connectMs;
    private final int readMs;
    private final int maxBody;
    private final int numCtx;
    private final boolean thinkOff;
    private final CloseableHttpClient http;
    private final ScheduledExecutorService watchdog;   // 전체 마감(connect+read)을 넘기면 abort (security 하-2)
    private final ObjectMapper json = new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    private final Semaphore gate = new Semaphore(1);
    private final Semaphore probeGate = new Semaphore(1);   // 상태 조회 동시 1건 — 겹치면 probe() 가 null

    public OllamaLlmClient(OllamaProperties p, OllamaGuard.Check check) {
        this.check = check;
        this.model = trim(p.getModel());
        this.connectMs = p.getConnectTimeoutMs();
        this.readMs = p.getReadTimeoutMs();
        this.maxBody = p.getMaxResponseBytes();
        this.numCtx = p.getNumCtx();
        this.thinkOff = p.isThinkOff();
        boolean ready = check.getState() == OllamaGuard.State.READY;
        this.http = ready ? build(connectMs, readMs) : null;
        ScheduledThreadPoolExecutor dog = null;
        if (ready) {
            dog = new ScheduledThreadPoolExecutor(1, r -> {
                Thread t = new Thread(r, "local-llm-watchdog");
                t.setDaemon(true);
                return t;
            });
            dog.setRemoveOnCancelPolicy(true);      // 취소한 감시 작업이 큐에 마감 시각까지 남지 않게
        }
        this.watchdog = dog;
        if (ready) {
            LOG.info("local-llm: 이 PC 시범 모드로 켜짐(루프백 전용)");
        } else {
            LOG.warn("local-llm: 켜기 설정이 있으나 막음(사유 {})", check.getReason());
        }
    }

    public OllamaGuard.State state() { return check.getState(); }

    public <T> LlmResponse<T> draft(LlmRequest<T> request) {
        if (http == null) {
            throw new LlmCallException(LlmCallException.OFF, 0);
        }
        if (!gate.tryAcquire()) {                       // 마지막 방어선 — 바깥 문은 ScriptDraftService.reserve
            throw new LlmCallException(LlmCallException.BUSY, 0);
        }
        try {
            return new LlmResponse<T>(call(model, request), model, false);
        } finally {
            gate.release();
        }
    }

    private <T> T call(String name, LlmRequest<T> req) {
        byte[] payload = payload(name, req);
        final HttpPost post = new HttpPost(check.getChat());
        post.setHeader(HttpHeaders.ACCEPT, "application/json");
        post.setEntity(new ByteArrayEntity(payload, ContentType.APPLICATION_JSON));
        final AtomicBoolean fired = new AtomicBoolean(false);
        ScheduledFuture<?> dog = watchdog.schedule(() -> {
            fired.set(true);
            post.abort();
        }, (long) connectMs + readMs, TimeUnit.MILLISECONDS);
        long t0 = System.nanoTime();
        long deadline = t0 + (long) (connectMs + readMs) * 1_000_000L;
        int status = -1;
        byte[] raw;
        try (CloseableHttpResponse res = http.execute(post)) {
            status = res.getStatusLine().getStatusCode();
            HttpEntity e = res.getEntity();
            if (status == 404) {
                post.abort();
                throw new LlmModelUnavailableException(LlmCallException.MODEL_MISSING, 404, name);
            }
            if (status == 401 || status == 403) {
                post.abort();
                throw new LlmAuthException(LlmCallException.AUTH, status);
            }
            if (status < 200 || status >= 300) {
                post.abort();
                throw new LlmCallException(LlmCallException.HTTP, status);
            }
            if (e == null || e.getContentLength() > maxBody) {
                post.abort();
                throw new LlmCallException(LlmCallException.BAD_OUTPUT, status);
            }
            raw = readCapped(e.getContent(), maxBody, deadline);
            if (raw == null) {
                post.abort();
                throw new LlmCallException(LlmCallException.BAD_OUTPUT, status);
            }
        } catch (LlmException ex) {
            throw ex;
        } catch (ConnectionPoolTimeoutException ex) {    // ConnectTimeoutException 의 하위형 — 먼저 잡는다. 연결 풀이 차서 기다리다 포기 = 다른 요청이 쓰는 중(BUSY)
            post.abort();
            throw new LlmCallException(LlmCallException.BUSY, 0);
        } catch (ConnectTimeoutException ex) {          // Windows 닫힌 포트는 거절 대신 연결 제한에 걸릴 수 있다 → 연결 안 됨
            post.abort();
            throw new LlmCallException(LlmCallException.UNREACHABLE, 0);
        } catch (InterruptedIOException ex) {           // 연결·응답 시간 초과(ConnectTimeout·SocketTimeout·풀 대기)
            post.abort();
            throw new LlmCallException(LlmCallException.TIMEOUT, 0);
        } catch (IOException | RuntimeException ex) {    // 연결 거부 등 — 예외 메시지는 남기지 않는다(주소가 섞일 수 있다). 감시가 울렸으면 TIMEOUT
            post.abort();
            throw new LlmCallException(fired.get() ? LlmCallException.TIMEOUT : LlmCallException.UNREACHABLE, 0);
        } finally {
            dog.cancel(false);
            LOG.info("local-llm call model={} http={} ms={}", name, status, (System.nanoTime() - t0) / 1_000_000L);
        }
        return parse(raw, req.getSchema(), status);
    }

    private byte[] payload(String name, LlmRequest<?> req) {
        ObjectNode body = json.createObjectNode();
        body.put("model", name);
        ObjectNode msg = body.putArray("messages").addObject();
        msg.put("role", "user");
        msg.put("content", req.getPrompt());
        body.put("stream", false);
        JsonNode format = formatOf(req.getSchema());
        if (format != null) {
            body.set("format", format);
        }
        if (thinkOff) {
            body.put("think", false);
        }
        ObjectNode opt = body.putObject("options");
        opt.put("temperature", req.getTemperature());
        opt.put("seed", 0);
        if (numCtx > 0) {
            opt.put("num_ctx", numCtx);
        }
        try {
            return json.writeValueAsBytes(body);
        } catch (IOException e) {
            throw new LlmCallException(LlmCallException.BAD_REQUEST, 0);
        }
    }

    private JsonNode formatOf(Class<?> schema) {
        LlmJsonSchema a = schema == null ? null : schema.getAnnotation(LlmJsonSchema.class);
        if (a == null) {
            return null;
        }
        try {
            JsonNode n = json.readTree(a.value());
            return n != null && n.isObject() ? n : null;
        } catch (IOException e) {
            throw new LlmCallException(LlmCallException.BAD_REQUEST, 0);
        }
    }

    private <T> T parse(byte[] raw, Class<T> schema, int status) {
        JsonNode root;
        try {
            root = json.readTree(raw);
        } catch (IOException e) {
            throw new LlmCallException(LlmCallException.BAD_OUTPUT, status);
        }
        if (root == null || !root.isObject() || root.hasNonNull("error")) {
            throw new LlmCallException(LlmCallException.BAD_OUTPUT, status);
        }
        if ("length".equals(root.path("done_reason").asText(""))) {   // 출력이 잘림 — 반쪽 JSON 을 쓰지 않는다
            throw new LlmCallException(LlmCallException.TRUNCATED, status);
        }
        JsonNode content = root.path("message").path("content");        // ⚠️ 경로는 실측 확인 필요(보고서 ⑥)
        if (!content.isTextual()) {
            throw new LlmCallException(LlmCallException.BAD_OUTPUT, status);
        }
        String text = content.asText();
        if (schema == String.class) {
            return schema.cast(text);
        }
        String block = jsonBlock(text);
        if (block == null) {
            throw new LlmCallException(LlmCallException.BAD_OUTPUT, status);
        }
        try {
            return json.readValue(block, schema);
        } catch (IOException e) {
            throw new LlmCallException(LlmCallException.BAD_OUTPUT, status);
        }
    }

    /** 응답 글에서 첫 '{' ~ 마지막 '}' — 모델이 ```json 울타리·앞뒤 말을 붙여도 받는다. */
    static String jsonBlock(String text) {
        int a = text.indexOf('{');
        int b = text.lastIndexOf('}');
        return a >= 0 && b > a ? text.substring(a, b + 1) : null;
    }

    /**
     * GET /api/tags — 2초 제한. 설치 목록은 돌려주지 않고 "닿는가·설정 모델이 있는가" 둘만. 동시 1건 —
     * 다른 확인이 진행 중이면 <b>null</b>(직전 결과도 '닿지 않음'도 아닌 '모름' — 호출자가 키를 생략한다).
     */
    public Probe probe() {
        if (http == null) {
            return new Probe(false, false);
        }
        if (!probeGate.tryAcquire()) {
            return null;
        }
        try {
            return doProbe();
        } finally {
            probeGate.release();
        }
    }

    private Probe doProbe() {
        HttpGet get = new HttpGet(check.getTags());
        get.setConfig(RequestConfig.custom().setConnectTimeout(PROBE_MS).setSocketTimeout(PROBE_MS)
                .setConnectionRequestTimeout(POOL_MS).setRedirectsEnabled(false)
                .setCookieSpec(CookieSpecs.IGNORE_COOKIES).build());
        try (CloseableHttpResponse res = http.execute(get)) {
            int st = res.getStatusLine().getStatusCode();
            HttpEntity e = res.getEntity();
            if (st < 200 || st >= 300 || e == null) {
                get.abort();
                return new Probe(true, false);
            }
            byte[] raw = readCapped(e.getContent(), PROBE_MAX_BODY, System.nanoTime() + PROBE_MS * 1_000_000L);
            if (raw == null) {
                get.abort();
                return new Probe(true, false);
            }
            boolean ready = false;
            for (JsonNode m : json.readTree(raw).path("models")) {     // agent/model_select.py installed_models 와 같은 모양
                String n = m.path("name").asText("");
                // 완전 일치. 설정에 태그가 없을 때만 ':latest' 를 같은 모델로 본다("gemma4" 가 "gemma4:12b" 를 맞는 것으로 보지 않는다)
                if (n.equals(model) || (model.indexOf(':') < 0 && n.equals(model + ":latest"))) {
                    ready = true;
                    break;
                }
            }
            return new Probe(true, ready);
        } catch (IOException | RuntimeException ex) {
            get.abort();
            return new Probe(false, false);
        }
    }

    /** max 를 넘으면 null(호출자가 abort). 마감을 넘으면 SocketTimeoutException(→ TIMEOUT). */
    static byte[] readCapped(InputStream in, int max, long deadlineNanos) throws IOException {
        if (in == null) {
            return new byte[0];
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int total = 0;
        int n;
        while ((n = in.read(buf)) > 0) {
            total += n;
            if (total > max) {
                return null;
            }
            if (System.nanoTime() - deadlineNanos > 0) {
                throw new SocketTimeoutException("deadline");
            }
            out.write(buf, 0, n);
        }
        return out.toByteArray();
    }

    private static CloseableHttpClient build(int connectMs, int readMs) {
        RequestConfig rc = RequestConfig.custom()
                .setConnectTimeout(connectMs).setSocketTimeout(readMs).setConnectionRequestTimeout(POOL_MS)
                .setRedirectsEnabled(false).setCookieSpec(CookieSpecs.IGNORE_COOKIES).build();
        return HttpClientBuilder.create()          // useSystemProperties() 미사용 — 시스템 프록시를 따르지 않는다
                .setDefaultRequestConfig(rc)
                .disableRedirectHandling()
                .disableAutomaticRetries()
                .disableCookieManagement()
                .disableAuthCaching()
                .disableContentCompression()
                .disableConnectionState()
                .setMaxConnTotal(2)                  // 초안 1 + 상태 조회 1
                .setMaxConnPerRoute(2)
                .setUserAgent("ggreport-local-llm/1")
                .build();
    }

    private static String trim(String s) { return s == null ? "" : s.trim(); }

    @Override
    public void destroy() {
        if (watchdog != null) {
            watchdog.shutdownNow();
        }
        if (http != null) {
            try {
                http.close();
            } catch (IOException ignored) {
                // 닫기 실패는 기능에 영향 없음
            }
        }
    }

    @Override
    public String toString() { return "OllamaLlmClient[state=" + check.getState() + "]"; }   // 주소·모델 없음
}
