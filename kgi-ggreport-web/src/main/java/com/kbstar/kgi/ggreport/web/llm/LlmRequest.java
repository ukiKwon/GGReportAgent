package com.kbstar.kgi.ggreport.web.llm;

/**
 * 구조화 출력 1회 호출의 입력. Python {@code structured_llm(schema, temperature)} +
 * 프롬프트 문자열에 대응한다.
 *
 * @param <T> 응답을 담을 타입. Jackson 이 역직렬화할 수 있어야 한다.
 */
public final class LlmRequest<T> {

    private final String prompt;
    private final Class<T> schema;
    private final double temperature;

    private LlmRequest(String prompt, Class<T> schema, double temperature) {
        this.prompt = prompt;
        this.schema = schema;
        this.temperature = temperature;
    }

    /**
     * ⚠️ <b>기본 온도는 0 이다.</b> 파이썬도 그렇고, 2026-08-10 실측에서 기본
     * temperature(0.8)로는 <b>같은 프롬프트·같은 모델인데 실행마다 산출물이 달랐다</b>
     * ({@code qwen3.5:9b} 3회: 2항목/합33 → 10항목/합135 → 21항목/합300).
     * 배점표 추출처럼 숫자가 결과인 작업에서 이건 그대로 오답이 된다.
     */
    public static <T> LlmRequest<T> of(String prompt, Class<T> schema) {
        return new LlmRequest<>(prompt, schema, 0.0);
    }

    public static <T> LlmRequest<T> of(String prompt, Class<T> schema, double temperature) {
        return new LlmRequest<>(prompt, schema, temperature);
    }

    public String getPrompt() { return prompt; }

    public Class<T> getSchema() { return schema; }

    public double getTemperature() { return temperature; }
}
