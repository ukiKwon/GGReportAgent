package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.http.Header;
import org.apache.http.HttpEntity;
import org.apache.http.HttpHeaders;
import org.apache.http.client.config.CookieSpecs;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.conn.ssl.SSLConnectionSocketFactory;
import org.apache.http.entity.ByteArrayEntity;
import org.apache.http.entity.ContentType;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClientBuilder;
import org.apache.http.ssl.SSLContexts;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.net.ssl.SSLContext;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Semaphore;
import java.util.regex.Pattern;

/**
 * 사업계획 수집 agent 직접 호출 — <b>시험용(인터넷 PC)</b>. SCHEMA ⑩-6 예외 1종. 내부망 설정은 키를 비워 둔다(꺼짐 = 503 BLOCKED_NO_URL).
 * security 11-17 필수: 주소는 설정 하나(plan-agent.url = https://호스트[:포트] 까지, 경로·쿼리·계정정보 금지)이고 allowed-host 와 같아야 한다.
 * 경로는 서버 상수 {@value #PATH}. 리다이렉트·재시도·쿠키·압축 끔, 시스템 프록시를 따르지 않음(useSystemProperties 미사용). 연결 3s/응답 10s/풀 2s, 전체 15s.
 * 응답은 2xx + application/json + 4KB 이하일 때만 읽고 job_id([A-Za-z0-9-]{1,64}) 하나만 쓴다 — 다른 값은 DB·화면·로그에 쓰지 않는다.
 * 토큰은 Authorization: Bearer 헤더로만. 토큰·주소·본문은 어떤 수준의 로그에도 남기지 않는다(org.apache.http.wire/headers 는 설정 파일에서 WARN).
 * 동시 1건(gate) — 호출부(PlanCollectService.runAgent)가 묶음 전체에 잡는다.
 */
@Component
public class PlanAgentClient implements DisposableBean {

    private static final Logger LOG = LoggerFactory.getLogger(PlanAgentClient.class);

    public enum State { OFF, READY, BAD_CONFIG }

    public static final String SENT = "SENT";
    public static final String UNREACHABLE = "AGENT_UNREACHABLE";
    public static final String REJECTED = "AGENT_REJECTED";
    public static final String BAD_RESPONSE = "BAD_RESPONSE";
    public static final String NO_URL = "BLOCKED_NO_URL";
    public static final String BAD_CONFIG = "BLOCKED_BAD_CONFIG";

    static final String PATH = "/v1/plan-jobs";
    static final int CONNECT_MS = 3000;
    static final int READ_MS = 10000;
    static final int POOL_MS = 2000;
    static final long TOTAL_MS = 15000L;
    static final int MAX_BODY = 4096;
    static final Pattern JOB_ID = Pattern.compile("[A-Za-z0-9-]{1,64}");
    private static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9._~+/=-]{16,512}");

    public static final class Result {
        private final String code;
        private final String jobId;

        Result(String code, String jobId) {
            this.code = code;
            this.jobId = jobId;
        }

        public String getCode() { return code; }
        public String getJobId() { return jobId; }
        public boolean isSent() { return SENT.equals(code); }
    }

    static final class Check {
        final State state;
        final String reason;
        final URI endpoint;
        final String token;

        Check(State state, String reason, URI endpoint, String token) {
            this.state = state;
            this.reason = reason;
            this.endpoint = endpoint;
            this.token = token;
        }

        @Override
        public String toString() { return "Check[" + state + "," + reason + "]"; }   // 토큰·주소 없음
    }

    private static final class Target {
        final URI endpoint;
        final String token;
        final CloseableHttpClient http;

        Target(URI endpoint, String token, CloseableHttpClient http) {
            this.endpoint = endpoint;
            this.token = token;
            this.http = http;
        }

        @Override
        public String toString() { return "Target[set]"; }
    }

    private final Semaphore gate = new Semaphore(1);
    private final ObjectMapper json = new ObjectMapper();
    private volatile State state = State.OFF;
    private volatile Target target;

    public PlanAgentClient(@Value("${plan-agent.url:}") String url,
                           @Value("${plan-agent.allowed-host:}") String allowedHost,
                           @Value("${plan-agent.token:}") String token,
                           @Value("${plan-agent.allow-http-localhost:false}") boolean httpLocalhost) {
        configure(url, allowedHost, token, httpLocalhost);
    }

    /** 기동 때 한 번 검증한다. 시험이 같은 컨텍스트에서 켜고 끌 때도 쓴다(패키지 안에서만 — HTTP 로는 닿지 않는다). */
    synchronized void configure(String url, String allowedHost, String token, boolean httpLocalhost) {
        Target old = target;
        Check c = check(url, allowedHost, token, httpLocalhost);
        target = c.state == State.READY ? new Target(c.endpoint, c.token, build()) : null;
        state = c.state;
        close(old);
        if (c.state == State.READY) {
            LOG.info("plan-agent: 설정됨 — [수집 실행] 사용 가능");
        } else if (c.state == State.OFF) {
            LOG.info("plan-agent: 주소 미설정 — [수집 실행]은 막히고 요청·내보내기·반영은 그대로 동작");
        } else {
            LOG.warn("plan-agent: 설정 오류로 [수집 실행]을 막음(사유 {})", c.reason);   // 값(주소·토큰)은 남기지 않는다
        }
    }

    static Check check(String url, String allowedHost, String token, boolean httpLocalhost) {
        String u = trim(url), h = trim(allowedHost), t = trim(token);
        if (u.isEmpty()) return new Check(State.OFF, "NO_URL", null, null);
        if (h.isEmpty()) return bad("NO_ALLOWED_HOST");
        if (t.isEmpty()) return bad("NO_TOKEN");
        if (!TOKEN.matcher(t).matches()) return bad("TOKEN_FORMAT");
        URI uri;
        try {
            uri = new URI(u);
        } catch (URISyntaxException e) {
            return bad("URL_SYNTAX");
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        String host = uri.getHost();
        if (host == null) return bad("URL_HOST");
        if (uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null) return bad("URL_EXTRA");
        String path = uri.getRawPath();
        if (path != null && !path.isEmpty() && !"/".equals(path)) return bad("URL_PATH");
        host = host.toLowerCase(Locale.ROOT);
        boolean local = "localhost".equals(host) || "127.0.0.1".equals(host);
        if (!"https".equals(scheme) && !(httpLocalhost && local && "http".equals(scheme))) return bad("URL_SCHEME");
        if (!host.equals(h.toLowerCase(Locale.ROOT))) return bad("HOST_MISMATCH");
        try {
            return new Check(State.READY, null, new URI(scheme, null, host, uri.getPort(), PATH, null, null), t);
        } catch (URISyntaxException e) {
            return bad("URL_SYNTAX");
        }
    }

    public State state() { return state; }

    /** 동시 1건. 잡았으면 반드시 {@link #release()}. */
    public boolean tryAcquire() { return gate.tryAcquire(); }

    public void release() { gate.release(); }

    /** 보내는 값은 4개뿐 — 요청 키·기관 ID·기관명·이전 도메인. 사번·이름·메모는 받지도 않는다. */
    public Result send(String reqKey, String institutionId, String institutionName, List<String> prevDomains) {
        Target t = target;
        if (t == null) {
            return new Result(state == State.BAD_CONFIG ? BAD_CONFIG : NO_URL, null);
        }
        byte[] payload;
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("req_key", reqKey);
            body.put("institution_id", institutionId);
            body.put("institution_name", institutionName);
            body.put("prev_domains", prevDomains == null ? Collections.<String>emptyList() : prevDomains);
            payload = json.writeValueAsBytes(body);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("plan-agent payload");
        }
        HttpPost post = new HttpPost(t.endpoint);
        post.setHeader(HttpHeaders.AUTHORIZATION, "Bearer " + t.token);
        post.setHeader(HttpHeaders.ACCEPT, "application/json");
        post.setEntity(new ByteArrayEntity(payload, ContentType.APPLICATION_JSON));
        long deadline = System.nanoTime() + TOTAL_MS * 1_000_000L;
        String code;
        String jobId = null;
        int http = -1;
        try (CloseableHttpResponse res = t.http.execute(post)) {
            http = res.getStatusLine().getStatusCode();
            HttpEntity e = res.getEntity();
            if (http < 200 || http >= 300) {            // 3xx 포함 — 리다이렉트를 따라가지 않는다
                post.abort();
                code = REJECTED;
            } else if (e == null || !isJson(res.getFirstHeader(HttpHeaders.CONTENT_TYPE)) || e.getContentLength() > MAX_BODY) {
                post.abort();
                code = BAD_RESPONSE;
            } else {
                byte[] raw = readCapped(e.getContent(), deadline);
                if (raw == null) {
                    post.abort();                       // 남은 본문을 읽지 않고 끊는다
                    code = BAD_RESPONSE;
                } else {
                    jobId = jobIdOf(raw);
                    code = jobId == null ? BAD_RESPONSE : SENT;
                }
            }
        } catch (IOException | RuntimeException ex) {
            code = UNREACHABLE;                          // 예외 메시지는 남기지 않는다(주소가 섞일 수 있다)
        }
        LOG.info("plan-agent call result={} http={}", code, http);
        return new Result(code, jobId);
    }

    private String jobIdOf(byte[] raw) {
        try {
            JsonNode n = json.readTree(raw);
            JsonNode id = n == null ? null : n.get("job_id");
            if (id == null || !id.isTextual()) return null;
            String v = id.asText();
            return JOB_ID.matcher(v).matches() ? v : null;
        } catch (IOException e) {
            return null;
        }
    }

    /** 4KB 를 넘으면 null(호출자가 abort). 스트림을 닫지 않는다 — 닫으면 남은 본문을 끝까지 읽는다. */
    static byte[] readCapped(InputStream in, long deadlineNanos) throws IOException {
        if (in == null) return new byte[0];
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[1024];
        int total = 0;
        int n;
        while ((n = in.read(buf)) > 0) {
            total += n;
            if (total > MAX_BODY) return null;
            if (System.nanoTime() - deadlineNanos > 0) throw new IOException("deadline");
            out.write(buf, 0, n);
        }
        return out.toByteArray();
    }

    private static boolean isJson(Header h) {
        return h != null && h.getValue() != null && h.getValue().trim().toLowerCase(Locale.ROOT).startsWith("application/json");
    }

    private static CloseableHttpClient build() {
        RequestConfig rc = RequestConfig.custom()
                .setConnectTimeout(CONNECT_MS).setSocketTimeout(READ_MS).setConnectionRequestTimeout(POOL_MS)
                .setRedirectsEnabled(false).setCookieSpec(CookieSpecs.IGNORE_COOKIES).build();
        SSLContext ctx = SSLContexts.createSystemDefault();   // JVM 신뢰 저장소(javax.net.ssl.trustStore). 모든 인증서 신뢰·호스트 검증 끄기 없음
        SSLConnectionSocketFactory ssl = new SSLConnectionSocketFactory(ctx, tlsProtocols(ctx), null,
                SSLConnectionSocketFactory.getDefaultHostnameVerifier());
        return HttpClientBuilder.create()                     // useSystemProperties() 를 부르지 않는다 — 시스템 프록시를 몰래 따르지 않는다
                .setSSLSocketFactory(ssl)
                .setDefaultRequestConfig(rc)
                .disableRedirectHandling()
                .disableAutomaticRetries()
                .disableCookieManagement()
                .disableAuthCaching()
                .disableContentCompression()
                .disableConnectionState()
                .setMaxConnTotal(1)
                .setMaxConnPerRoute(1)
                .setUserAgent("ggreport-plan-collect/1")
                .build();
    }

    static String[] tlsProtocols(SSLContext ctx) {
        Set<String> sup = new HashSet<>(Arrays.asList(ctx.getSupportedSSLParameters().getProtocols()));
        List<String> out = new ArrayList<>();
        for (String p : new String[]{"TLSv1.3", "TLSv1.2"}) {
            if (sup.contains(p)) out.add(p);
        }
        if (out.isEmpty()) out.add("TLSv1.2");
        return out.toArray(new String[0]);
    }

    private static Check bad(String reason) { return new Check(State.BAD_CONFIG, reason, null, null); }
    private static String trim(String s) { return s == null ? "" : s.trim(); }

    private static void close(Target t) {
        if (t == null) return;
        try {
            t.http.close();
        } catch (IOException ignored) {
            // 닫기 실패는 기능에 영향 없음
        }
    }

    @Override
    public void destroy() { close(target); }

    @Override
    public String toString() { return "PlanAgentClient[state=" + state + "]"; }   // 토큰·주소 없음
}
