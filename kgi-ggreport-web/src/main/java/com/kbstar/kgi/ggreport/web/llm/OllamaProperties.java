package com.kbstar.kgi.ggreport.web.llm;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 이 PC 시범용 로컬 Ollama 설정(NEXT 129 ⑤ 발표 대본 AI 초안). <b>기본값 꺼짐.</b>
 * 켜는 조건은 {@link OllamaGuard} 한 곳 — enabled=true 명시 + 루프백 주소 + 외부망 로컬 데이터소스(MySQL·H2, JNDI 없음).
 * 사내 LLM 설정({@code ggreport.llm.*}, {@link LlmProperties})과 섞지 않는다 — 시범을 통째로 걷어낼 수 있게.
 * 모델 이름은 코드 기본값을 비워 둔다(설정 키로만) — 없는 모델로 404 헤맨 전례(LlmProperties 주석). 폴백 모델은 없다(security 하-2).
 */
@Component
@ConfigurationProperties(prefix = "ggreport.llm.ollama")
public class OllamaProperties {

    private boolean enabled = false;
    private String baseUrl = "http://127.0.0.1:11434";
    private String model = "";
    private int connectTimeoutMs = 2_000;
    /** 12b CPU 추정 250~350초 + 모델 올리기. */
    private int readTimeoutMs = 480_000;
    private int maxResponseBytes = 65_536;
    /** qwen3 계열처럼 생각 단계가 있는 모델에서만 켠다. 다른 모델에 보내면 거절될 수 있다(확인 필요). */
    private boolean thinkOff = false;
    /** 0 이면 보내지 않는다(Ollama 기본 창). */
    private int numCtx = 0;
    /** 사번별 쿨다운(초) — 앞 요청 '시작'부터. 0 이면 끔. 0~600. */
    private int cooldownSeconds = 60;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
    public int getConnectTimeoutMs() { return connectTimeoutMs; }
    public void setConnectTimeoutMs(int v) { this.connectTimeoutMs = v; }
    public int getReadTimeoutMs() { return readTimeoutMs; }
    public void setReadTimeoutMs(int v) { this.readTimeoutMs = v; }
    public int getMaxResponseBytes() { return maxResponseBytes; }
    public void setMaxResponseBytes(int v) { this.maxResponseBytes = v; }
    public boolean isThinkOff() { return thinkOff; }
    public void setThinkOff(boolean thinkOff) { this.thinkOff = thinkOff; }
    public int getNumCtx() { return numCtx; }
    public void setNumCtx(int numCtx) { this.numCtx = numCtx; }
    public int getCooldownSeconds() { return cooldownSeconds; }
    public void setCooldownSeconds(int v) { this.cooldownSeconds = v; }
}
