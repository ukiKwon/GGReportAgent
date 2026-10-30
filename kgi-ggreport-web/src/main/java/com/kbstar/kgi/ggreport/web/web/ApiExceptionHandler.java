package com.kbstar.kgi.ggreport.web.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.io.UncheckedIOException;
import java.util.Collections;
import java.util.Map;

/**
 * 오류 응답을 FastAPI 와 같은 모양({@code {"detail": …}})으로 맞춘다.
 *
 * <p>이게 없으면 Spring 기본 본문({@code timestamp/status/error/path})이 나가서
 * ⓐ 골든 {@code 02} 가 깨지고 ⓑ 화면이 읽는 {@code detail} 키가 없어 오류 문구가
 * 빈칸이 된다. <b>상태 코드만 같다고 되는 게 아니다.</b>
 *
 * <p><b>운영 문구 일반화(조치 D).</b> 4xx {@link ApiException} 은 화면이 그대로 보여 주는 한글 문구라
 * <b>그대로 둔다.</b> 다음 둘만 일반 문구로 바꾼다 — ⓐ 5xx {@code ApiException}(일부가 IOException 메시지·서버 경로를
 * 이어 붙인다) ⓑ 처리되지 않은 내부 예외(상태 500). 실제 원인은 서버 로그에만 남긴다.
 * {@code ggreport.errors.detail=true}(개발축)이면 원문을 싣는다. 코드 기본값은 false(일반화).
 *
 * <p>⚠️ 처리 대상 예외를 <b>종류로 한정</b>했다. {@code Exception}/{@code RuntimeException} 전체를 잡으면 깨진 JSON(400)·
 * 필수 파라미터 누락(400) 같은 스프링 MVC 오류가 500 으로 둔갑한다.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    static final String GENERIC_500 = "서버에서 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    private final boolean verbose;

    public ApiExceptionHandler(@Value("${ggreport.errors.detail:false}") boolean verbose) {
        this.verbose = verbose;
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> handle(ApiException e) {
        Object detail = e.getDetailObject() != null ? e.getDetailObject() : e.getMessage();
        if (e.getStatus() >= 500 && e.getDetailObject() == null && !verbose) {
            log.warn("ApiException {}: {}", e.getStatus(), e.getMessage());
            detail = GENERIC_500;
        }
        return ResponseEntity.status(e.getStatus()).body(detail(detail));
    }

    /** 처리되지 않은 내부 예외 — 스택트레이스는 로그에만, 응답은 {@code {"detail": …}} 로 통일. */
    @ExceptionHandler({IllegalStateException.class, IllegalArgumentException.class,
            DataAccessException.class, UncheckedIOException.class})
    public ResponseEntity<Map<String, Object>> handleUnexpected(Exception e) {
        log.error("처리되지 않은 예외", e);
        String detail = verbose ? e.getClass().getSimpleName() + ": " + e.getMessage() : GENERIC_500;
        return ResponseEntity.status(500).body(detail(detail));
    }

    /**
     * {@code detail} 은 문자열일 수도 객체일 수도 있다 — FastAPI 와 같다.
     * 감싸는 키({@code "detail"})는 어느 쪽이든 동일하므로 화면의 읽는 코드는 하나다.
     */
    private static Map<String, Object> detail(Object detail) {
        return Collections.singletonMap("detail", detail);
    }
}
