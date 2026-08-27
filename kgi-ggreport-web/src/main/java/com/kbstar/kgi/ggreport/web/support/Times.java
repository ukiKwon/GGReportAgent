package com.kbstar.kgi.ggreport.web.support;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

/**
 * 시각 문자열 — 원본 {@code datetime.now(timezone.utc).isoformat()} 과 <b>같은 모양</b>.
 *
 * <p>예: {@code 2026-08-27T06:12:33.481000+00:00}
 *
 * <p><b>왜 모양까지 맞추나.</b> 이 값들은 DB 에 <b>문자열로</b> 들어가고
 * ({@code VARCHAR2}, 설계 §5) 정렬도 문자열로 한다 — 쪽지함의
 * {@code ORDER BY CREATED_AT DESC} 가 그렇다. 이관 뒤에도 Python 이 쓴 옛 행과 Java 가
 * 쓴 새 행이 <b>한 테이블에 섞여</b> 같은 정렬을 탄다. 그래서 자릿수·오프셋 표기가
 * 갈리면 시각이 뒤섞인다.
 *
 * <p>⚠️ {@code Instant.toString()} 을 쓰지 말 것. 그건 {@code +00:00} 대신 {@code Z} 를
 * 쓰고 <b>0 인 소수점 이하를 통째로 생략</b>한다({@code …T06:12:33Z}). 문자열 정렬에서
 * {@code 'Z'}(0x5A)는 {@code '.'}(0x2E)보다 커서, 같은 초에 찍힌 Python 행보다
 * <b>항상 뒤로</b> 간다.
 *
 * <p>JDK 8 의 {@code Instant.now()} 는 보통 밀리초까지만 준다 — 남는 세 자리는 0 이다
 * ({@code .481000}). 원본도 마이크로초 6자리라 폭은 같다.
 */
public final class Times {

    private static final DateTimeFormatter ISO_MICROS =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSSSSxxx");

    private Times() {
    }

    /** 지금(UTC). */
    public static String nowIso() {
        return iso(Instant.now());
    }

    /** 테스트에서 시각을 고정할 수 있게 열어 둔다. */
    public static String iso(Instant instant) {
        return ISO_MICROS.format(instant.atOffset(ZoneOffset.UTC));
    }
}
