package com.kbstar.kgi.ggreport.web.llm;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * 로컬 Ollama 를 켜도 되는가 — 판정은 여기 한 곳. 사유 코드만 돌려준다(이 판정의 결과·로그에는 주소·모델명을 싣지 않는다).
 * 참고: 호출 단계에서는 모델명이 호출 로그와 초안 응답의 model 에 실린다. 주소·프롬프트·응답 본문은 어디에도 싣지 않는다.
 * 내부망 신호: 데이터소스가 JNDI 이거나 MySQL·H2 가 아니면(=Oracle) enabled=true 여도 BAD_CONFIG(INTERNAL_ENV).
 * 주소: http + 127.0.0.1|localhost + 명시 포트, 경로·쿼리·계정정보 금지. localhost 는 127.0.0.1 로 고정해 이름 해석을 타지 않는다.
 */
public final class OllamaGuard {

    public enum State { OFF, READY, BAD_CONFIG }

    static final int MIN_TIMEOUT_MS = 500;
    static final int MAX_CONNECT_MS = 10_000;
    static final int MAX_READ_MS = 600_000;
    static final int MIN_BODY = 1_024;
    static final int MAX_BODY = 1_048_576;
    static final int MAX_NUM_CTX = 131_072;
    static final int MAX_COOLDOWN_S = 600;
    private static final Pattern MODEL = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}");

    public static final class Check {
        private final State state;
        private final String reason;
        private final URI chat;
        private final URI tags;

        Check(State state, String reason, URI chat, URI tags) {
            this.state = state;
            this.reason = reason;
            this.chat = chat;
            this.tags = tags;
        }

        public State getState() { return state; }
        public String getReason() { return reason; }
        URI getChat() { return chat; }
        URI getTags() { return tags; }

        @Override
        public String toString() { return "Check[" + state + "," + reason + "]"; }   // 주소 없음
    }

    private OllamaGuard() {
    }

    public static Check check(OllamaProperties p, String datasourceUrl, String jndiName) {
        if (p == null || !p.isEnabled()) {
            return new Check(State.OFF, "DISABLED", null, null);
        }
        String ds = trim(datasourceUrl).toLowerCase(Locale.ROOT);
        if (!trim(jndiName).isEmpty() || !(ds.startsWith("jdbc:mysql:") || ds.startsWith("jdbc:h2:"))) {
            return bad("INTERNAL_ENV");
        }
        String model = trim(p.getModel());
        if (model.isEmpty()) return bad("NO_MODEL");
        if (!MODEL.matcher(model).matches()) return bad("MODEL_FORMAT");
        if (p.getConnectTimeoutMs() < MIN_TIMEOUT_MS || p.getConnectTimeoutMs() > MAX_CONNECT_MS
                || p.getReadTimeoutMs() < MIN_TIMEOUT_MS || p.getReadTimeoutMs() > MAX_READ_MS) {
            return bad("TIMEOUT_RANGE");
        }
        if (p.getCooldownSeconds() < 0 || p.getCooldownSeconds() > MAX_COOLDOWN_S) return bad("COOLDOWN_RANGE");
        if (p.getMaxResponseBytes() < MIN_BODY || p.getMaxResponseBytes() > MAX_BODY) return bad("BODY_RANGE");
        if (p.getNumCtx() < 0 || p.getNumCtx() > MAX_NUM_CTX) return bad("NUM_CTX_RANGE");
        URI uri;
        try {
            uri = new URI(trim(p.getBaseUrl()));
        } catch (URISyntaxException e) {
            return bad("URL_SYNTAX");
        }
        if (!"http".equals(lower(uri.getScheme()))) return bad("URL_SCHEME");
        if (uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null) return bad("URL_EXTRA");
        String path = uri.getRawPath();
        if (path != null && !path.isEmpty() && !"/".equals(path)) return bad("URL_PATH");
        String host = lower(uri.getHost());
        if (!"127.0.0.1".equals(host) && !"localhost".equals(host)) return bad("NOT_LOOPBACK");
        int port = uri.getPort();
        if (port < 1 || port > 65535) return bad("URL_PORT");
        try {
            return new Check(State.READY, null,
                    new URI("http", null, "127.0.0.1", port, "/api/chat", null, null),
                    new URI("http", null, "127.0.0.1", port, "/api/tags", null, null));
        } catch (URISyntaxException e) {
            return bad("URL_SYNTAX");
        }
    }

    private static Check bad(String reason) { return new Check(State.BAD_CONFIG, reason, null, null); }
    private static String trim(String s) { return s == null ? "" : s.trim(); }
    private static String lower(String s) { return s == null ? "" : s.toLowerCase(Locale.ROOT); }
}
