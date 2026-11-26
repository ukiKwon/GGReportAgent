package com.kbstar.kgi.ggreport.web.llm;

/** 어댑터 실패의 사유 코드. 메시지 = 코드 그대로(주소·모델명·본문 없음 — LlmException 주석의 규칙). */
public class LlmCallException extends LlmException {

    public static final String OFF = "LLM_OFF";
    public static final String BUSY = "LLM_BUSY";
    public static final String TIMEOUT = "LLM_TIMEOUT";
    public static final String UNREACHABLE = "LLM_UNREACHABLE";
    public static final String HTTP = "LLM_HTTP";
    public static final String BAD_OUTPUT = "LLM_BAD_OUTPUT";
    public static final String TRUNCATED = "LLM_TRUNCATED";
    public static final String BAD_REQUEST = "LLM_BAD_REQUEST";
    /** 다른 예외형(LlmModelUnavailableException·LlmAuthException)의 메시지로 쓰는 코드. */
    public static final String MODEL_MISSING = "LLM_MODEL_MISSING";
    public static final String AUTH = "LLM_AUTH";

    private final String code;

    public LlmCallException(String code, int statusCode) {
        super(code, statusCode);
        this.code = code;
    }

    public String getCode() { return code; }
}
