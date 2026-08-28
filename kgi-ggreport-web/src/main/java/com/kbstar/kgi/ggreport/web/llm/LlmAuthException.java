package com.kbstar.kgi.ggreport.web.llm;

/**
 * 경유지 인증 실패(401/403) — <b>폴백을 태우지 않는다.</b>
 *
 * <p>2순위 모델도 <b>같은 토큰</b>으로 같은 게이트웨이를 지난다. 폴백을 태우면
 * 똑같이 실패하고, 사람에게는 <b>"모델 두 개가 다 죽었다"</b>로 보고된다 —
 * 실제로는 토큰이 만료됐을 뿐인데 엉뚱한 곳(모델 가용성)을 파게 된다.
 * 설계 §6-C 가 이 오진을 막으려고 명시한 규칙이다.
 *
 * <p>⚠️ 토큰 값을 메시지에 담지 말 것({@link LlmException} 참고).
 */
public class LlmAuthException extends LlmException {

    public LlmAuthException(String message, int statusCode) {
        super(message, statusCode);
    }

    public LlmAuthException(String message, int statusCode, Throwable cause) {
        super(message, statusCode, cause);
    }
}
