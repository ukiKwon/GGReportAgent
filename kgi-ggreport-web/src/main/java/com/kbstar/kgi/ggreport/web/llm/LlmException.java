package com.kbstar.kgi.ggreport.web.llm;

/**
 * LLM 호출 실패. 하위 두 종류가 <b>폴백 여부를 가른다</b>({@link FallbackPolicy}).
 *
 * <p>⚠️ <b>토큰·인증 헤더를 메시지에 담지 말 것.</b> 이 문구는 로그로 나가고,
 * 일부는 {@code ConsultReply#failureNotice} 를 거쳐 <b>화면에까지</b> 간다.
 * 설계 §6-C 가 명시한 규칙이다 — 토큰은 메모리에만 둔다.
 * 파이썬 쪽 실패 안내문이 엔드포인트 정보를 그대로 노출하고 있어(같은 실수를
 * 반복하지 않으려고) 설계에 적어 둔 항목이다.
 */
public class LlmException extends RuntimeException {

    private final int statusCode;

    public LlmException(String message, int statusCode) {
        super(message);
        this.statusCode = statusCode;
    }

    public LlmException(String message, int statusCode, Throwable cause) {
        super(message, cause);
        this.statusCode = statusCode;
    }

    /** HTTP 상태. 알 수 없으면 {@code 0}(연결 실패·타임아웃 등). */
    public int getStatusCode() {
        return statusCode;
    }
}
