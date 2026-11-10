package com.kbstar.kgi.ggreport.web.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.beans.TypeMismatchException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.bind.ServletRequestBindingException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 이사회 자료 작성 API({@link BoardWriteController}) 한정 오류 통일 — 모든 상태가
 * {@code {"detail":{"code","message",…}}} 객체다. 다른 컨트롤러는 기존 {@link ApiExceptionHandler}(문자열 detail)가 그대로 맡는다.
 *
 * <p>⚠️ message 는 <b>전부 상수</b>다 — 파서·요청 헤더·셀 값이 든 {@code e.getMessage()} 를 응답에 쓰지 않는다
 * (ApiException 의 문자열 사유는 서비스가 만든 한국어 고정 문구라 4xx 에서만 그대로 쓴다. 5xx 는 일반 문구).
 * 서블릿 필터 단계(411/413)·전역 multipart 한도는 이 advice 가 닿지 않아 각자 message 를 싣는다.
 */
@RestControllerAdvice(assignableTypes = {BoardWriteController.class, BoardMaterialController.class})
@Order(Ordered.HIGHEST_PRECEDENCE)
public class BoardWriteExceptionHandler {

    static final String MSG_BAD_BODY = "요청 내용을 읽을 수 없습니다. 보낸 JSON 형식을 확인해 주세요.";
    static final String MSG_UNSUPPORTED = "지원하지 않는 요청 형식입니다. JSON(application/json)으로 보내 주세요.";
    static final String MSG_FALLBACK = "요청을 처리할 수 없습니다.";

    private static final Logger log = LoggerFactory.getLogger(BoardWriteExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> handle(ApiException e) {
        int status = e.getStatus();
        if (e.getDetailObject() != null) {
            return respond(status, e.getDetailObject());
        }
        String message = status >= 500 ? ApiExceptionHandler.GENERIC_500
                : e.getMessage() == null ? MSG_FALLBACK : e.getMessage();
        if (status >= 500) {
            log.warn("ApiException {}", status);
        }
        return respond(status, detail(codeOf(status), message));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleUnreadable(HttpMessageNotReadableException e) {
        return respond(400, detail("BAD_REQUEST", MSG_BAD_BODY));
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<Map<String, Object>> handleMediaType(HttpMediaTypeNotSupportedException e) {
        return respond(415, detail("UNSUPPORTED_MEDIA_TYPE", MSG_UNSUPPORTED));
    }

    /** 요청 파라미터 누락·타입 불일치 등 처리기 없는 MVC 예외는 500 이 아니라 400 상수 문구로. */
    @ExceptionHandler({ServletRequestBindingException.class,    // MissingServletRequestParameterException 포함
            TypeMismatchException.class})                       // MethodArgumentTypeMismatchException 포함
    public ResponseEntity<Map<String, Object>> handleBadRequest(Exception e) {
        return respond(400, detail("BAD_REQUEST", MSG_FALLBACK));
    }

    /**
     * 나머지 런타임 예외 전부(ISE·IAE·DataAccess·UncheckedIO·NPE 등) → 500 일반 문구. 더 구체적인 처리기가 우선한다.
     * (깨진 multipart 는 핸들러 결정 전에 터져 이 advice 범위 밖이다.)
     */
    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Map<String, Object>> handleUnexpected(RuntimeException e) {
        log.error("처리되지 않은 예외 {}", describe(e));
        return respond(500, detail("SERVER_ERROR", ApiExceptionHandler.GENERIC_500));
    }

    /** POI 등이 던지는 Error(NoClassDefFound·StackOverflow·ExceptionInInitializer…) → 500 일반 문구. OOM 은 삼키지 않는다. */
    @ExceptionHandler(Error.class)
    public ResponseEntity<Map<String, Object>> handleError(Error e) {
        if (e instanceof OutOfMemoryError) {
            throw e;
        }
        log.error("처리되지 않은 오류 {}", describe(e));
        return respond(500, detail("SERVER_ERROR", ApiExceptionHandler.GENERIC_500));
    }

    /** 로그용 — getMessage() 는 셀 값이 섞일 수 있어 쓰지 않는다. 클래스 이름 + 앞쪽 스택 프레임 8개 + cause 클래스 사슬(최대 5). */
    static String describe(Throwable e) {
        StringBuilder sb = new StringBuilder(e.getClass().getName());
        StackTraceElement[] st = e.getStackTrace();
        for (int i = 0; i < Math.min(8, st.length); i++) {
            sb.append("\n    at ").append(st[i]);
        }
        sb.append("\n    causes:");
        Throwable c = e.getCause();
        for (int i = 0; i < 5 && c != null && c != e; i++) {
            sb.append(' ').append(c.getClass().getName());
            c = c.getCause();
        }
        return sb.toString();
    }

    static String codeOf(int status) {
        switch (status) {
            case 400: return "BAD_REQUEST";
            case 401: return "UNAUTHENTICATED";
            case 403: return "FORBIDDEN";
            case 404: return "NOT_FOUND";
            case 409: return "CONFLICT";
            case 415: return "UNSUPPORTED_MEDIA_TYPE";
            default: return status >= 500 ? "SERVER_ERROR" : "ERROR";
        }
    }

    private static Map<String, Object> detail(String code, String message) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("code", code);
        d.put("message", message);
        return d;
    }

    private static ResponseEntity<Map<String, Object>> respond(int status, Object detail) {
        return ResponseEntity.status(HttpStatus.valueOf(status)).contentType(MediaType.APPLICATION_JSON)
                .body(Collections.singletonMap("detail", detail));
    }
}
