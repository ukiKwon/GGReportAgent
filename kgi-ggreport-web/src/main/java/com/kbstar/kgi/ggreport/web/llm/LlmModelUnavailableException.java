package com.kbstar.kgi.ggreport.web.llm;

/**
 * 요청한 모델이 엔드포인트에 없다(404) — <b>폴백이 도는 유일한 갈래</b>.
 *
 * <p>자체호스팅 엔드포인트에서 가장 흔한 실패다. 모델이 안 올라와 있을 뿐이라
 * 2순위(작은 모델)로는 답이 나온다. 파이프라인 전체가 멈추는 것보다 작은 모델로라도
 * 끝내고 사람이 검수하는 편이 낫다({@code agent/llm.py} 모듈 주석).
 *
 * <p>실측 사례(2026-08-04): 기본값 {@code gpt-oss-120b} 가 없어 404 가 났는데
 * 화면에는 빈 답만 나오고 이력에도 아무것도 안 남았다.
 */
public class LlmModelUnavailableException extends LlmException {

    private final String model;

    public LlmModelUnavailableException(String message, int statusCode, String model) {
        super(message, statusCode);
        this.model = model;
    }

    /** 없다고 응답한 모델 이름. 실패 안내문이 "무엇을 올려야 하는지" 말하는 데 쓴다. */
    public String getModel() {
        return model;
    }
}
