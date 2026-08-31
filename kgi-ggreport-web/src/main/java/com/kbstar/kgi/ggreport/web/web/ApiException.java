package com.kbstar.kgi.ggreport.web.web;

/**
 * FastAPI 의 {@code HTTPException} 자리. 응답 본문은 {@code {"detail": …}} 다.
 *
 * <p>⚠️ <b>본문 모양이 계약이다.</b> 골든 {@code 02}({@code 404})가
 * {@code {"detail": "institution not found"}} 로 고정했고, 화면도 그 키를 읽는다.
 * Spring 기본 오류 본문({@code timestamp/status/error/path})으로 나가면 골든이
 * 깨지고 화면의 오류 문구가 빈다 — {@link ApiExceptionHandler} 가 이를 막는다.
 *
 * <p>메시지는 <b>사람이 읽고 바로 고칠 수 있게</b> 쓴다. 원본이 영어로 쓴 자리
 * ({@code institution not found})는 <b>그대로 영어로</b> 옮긴다 — 번역하면 골든이 깨진다.
 */
public class ApiException extends RuntimeException {

    private final int status;

    public ApiException(int status, String detail) {
        super(detail);
        this.status = status;
    }

    public int getStatus() {
        return status;
    }

    public static ApiException notFound(String detail) {
        return new ApiException(404, detail);
    }

    public static ApiException badRequest(String detail) {
        return new ApiException(400, detail);
    }

    public static ApiException unsupportedMediaType(String detail) {
        return new ApiException(415, detail);
    }
}
