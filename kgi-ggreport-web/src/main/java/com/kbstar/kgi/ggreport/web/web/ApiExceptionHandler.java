package com.kbstar.kgi.ggreport.web.web;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Collections;
import java.util.Map;

/**
 * 오류 응답을 FastAPI 와 같은 모양({@code {"detail": …}})으로 맞춘다.
 *
 * <p>이게 없으면 Spring 기본 본문({@code timestamp/status/error/path})이 나가서
 * ⓐ 골든 {@code 02} 가 깨지고 ⓑ 화면이 읽는 {@code detail} 키가 없어 오류 문구가
 * 빈칸이 된다. <b>상태 코드만 같다고 되는 게 아니다.</b>
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> handle(ApiException e) {
        return ResponseEntity.status(e.getStatus()).body(detail(e.getMessage()));
    }

    private static Map<String, Object> detail(String message) {
        return Collections.<String, Object>singletonMap("detail", message);
    }
}
