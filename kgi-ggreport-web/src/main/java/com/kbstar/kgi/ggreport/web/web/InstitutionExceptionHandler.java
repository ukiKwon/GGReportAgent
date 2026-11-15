package com.kbstar.kgi.ggreport.web.web;

import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Collections;
import java.util.Map;

/**
 * 기관 컨트롤러의 깨진 JSON(예: {@code contract_end_confirmed:"yes"}) — 보안 검토 L5.
 * Spring 기본 400 은 파서 메시지·클래스명이 본문에 실릴 수 있어 <b>고정 문구</b>로 바꾼다.
 *
 * <p>⚠️ {@code assignableTypes} 로 {@link InstitutionController} 한 곳에만 건다 — 전역 처리기
 * ({@link ApiExceptionHandler})는 이 예외를 다루지 않으므로 다른 컨트롤러(게시판 쪽은 자기 advice 가 따로 있다)의
 * 동작은 바뀌지 않는다. 응답 모양은 다른 오류와 같은 {@code {"detail": 문구}}.
 */
@RestControllerAdvice(assignableTypes = InstitutionController.class)
public class InstitutionExceptionHandler {

    static final String MSG_BAD_BODY = "요청 내용을 읽을 수 없습니다. 보낸 JSON 형식을 확인해 주세요.";

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleUnreadable(HttpMessageNotReadableException e) {
        return ResponseEntity.status(400).body(Collections.<String, Object>singletonMap("detail", MSG_BAD_BODY));
    }
}
