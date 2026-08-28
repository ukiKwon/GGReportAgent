package com.kbstar.kgi.ggreport.web.llm;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * LLM 설정. Python {@code agent/llm.py} 의 환경변수 자리
 * ({@code LLM_MODEL}·{@code LLM_FALLBACK_MODEL}·{@code LLM_BASE_URL}).
 *
 * <p>기본값은 <b>비워 둔다.</b> 파이썬은 {@code gpt-oss-120b} 를 코드에 기본값으로
 * 박아 두었는데, 그 탓에 설정을 빠뜨린 환경에서 <b>있지도 않은 모델을 부르다 404</b> 로
 * 실패했다(2026-08-04 실측). 여기서는 값이 없으면 기동 시점에 대고 말한다
 * ({@link #requirePrimaryModel}) — 조용히 엉뚱한 이름을 부르지 않는다.
 *
 * <p>엔드포인트는 <b>경유지 주소</b>가 된다(직접 부르는 경로가 없다, 설계 §3).
 */
@Component
@ConfigurationProperties(prefix = "ggreport.llm")
public class LlmProperties {

    /** 1순위 모델. 문의 1 회신의 "사용 가능한 모델 이름 목록"에서 고른다. */
    private String model = "";

    /**
     * 2순위 모델. 비우면 폴백을 <b>쓰지 않는다</b>.
     *
     * <p>⚠️ 1순위와 <b>같은 값</b>을 넣어도 폴백은 없는 것과 같다
     * ({@link #hasFallback}) — 원본도 같은 판정을 한다. 같은 모델로 한 번 더
     * 부르는 것은 재시도이지 폴백이 아니고, 404 갈래에서는 반드시 또 404 다.
     */
    private String fallbackModel = "";

    /** 경유지 엔드포인트. 예: {@code https://gateway.내부도메인/llm/v1}. */
    private String baseUrl = "";

    /** 연결 타임아웃(ms). */
    private int connectTimeoutMs = 10_000;

    /**
     * 응답 타임아웃(ms). 기본 5분.
     *
     * <p>CPU 추론은 실제로 이만큼 걸린다 — 2026-08-10 실측에서 배점표 1건에
     * {@code qwen3.5:9b} 249초, {@code exaone3.5:7.8b} 152초였다. 짧게 잡으면
     * 모델이 멀쩡한데 타임아웃으로 실패한다.
     */
    private int readTimeoutMs = 300_000;

    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }

    public String getFallbackModel() { return fallbackModel; }
    public void setFallbackModel(String fallbackModel) { this.fallbackModel = fallbackModel; }

    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }

    public int getConnectTimeoutMs() { return connectTimeoutMs; }
    public void setConnectTimeoutMs(int connectTimeoutMs) { this.connectTimeoutMs = connectTimeoutMs; }

    public int getReadTimeoutMs() { return readTimeoutMs; }
    public void setReadTimeoutMs(int readTimeoutMs) { this.readTimeoutMs = readTimeoutMs; }

    /**
     * 폴백을 실제로 쓸 것인가.
     *
     * <p>빈 값이거나 1순위와 같으면 <b>안 쓴다</b>. 원본
     * ({@code if not fallback_model or fallback_model == current_model()})과 같은 판정이다.
     */
    public boolean hasFallback() {
        String fallback = trimmed(fallbackModel);
        return !fallback.isEmpty() && !fallback.equals(trimmed(model));
    }

    /**
     * 1순위 모델 — 없으면 <b>바로 실패</b>한다.
     *
     * <p>기본값으로 대충 메우지 않는 이유: 그러면 설정 누락이 "모델을 못 찾음(404)"
     * 으로 나타나 <b>엉뚱한 곳(엔드포인트·모델 배포)을 파게 된다.</b> 원인을 그대로 말한다.
     */
    public String requirePrimaryModel() {
        String primary = trimmed(model);
        if (primary.isEmpty()) {
            throw new IllegalStateException(
                    "ggreport.llm.model 이 비어 있다 — 사내 LLM 모델 이름을 설정해야 한다"
                            + "(문의 1 회신의 '사용 가능한 모델 이름 목록' 참고).");
        }
        return primary;
    }

    /** 빈 문자열도 미설정으로 본다 — {@code LLM_BASE_URL=} 만 남은 설정이 흔하다(원본 {@code _env}). */
    private static String trimmed(String value) {
        return value == null ? "" : value.trim();
    }
}
