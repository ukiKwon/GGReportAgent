package com.kbstar.kgi.ggreport.web.support;

import java.security.SecureRandom;

/**
 * 식별자 생성 — 원본 {@code f"bc-{secrets.token_hex(4)}"} 과 <b>같은 모양</b>이어야 한다.
 *
 * <p>모양이 계약인 이유가 둘이다:
 * <ol>
 *   <li>골든 정규화가 {@code \b(bc|task|ntf|msg|chat|new)-[0-9a-f]{8}\b} 로 id 를 지운다
 *       ({@code GoldenNormalizer}). 자릿수가 다르거나 대문자 hex 면 <b>치환이 안 돼</b>
 *       실행마다 다른 값이 그대로 비교에 들어가고, 골든이 영원히 실패한다.</li>
 *   <li>이미 쌓인 Python 쪽 데이터와 한 테이블에 섞인다. 접두사가 곧 종류 표시다.</li>
 * </ol>
 *
 * <p>⚠️ {@code UUID} 로 바꾸지 말 것. 위 두 이유 모두 깨진다.
 *
 * <p>4바이트 = 42억분의 1. 원본과 같은 폭이고, 충돌해도 PK 가 막는다(조용히 덮이지 않는다).
 */
public final class Ids {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final char[] HEX = "0123456789abcdef".toCharArray();

    private Ids() {
    }

    /** 입찰 건. */
    public static String bidCase() {
        return "bc-" + tokenHex4();
    }

    /** 팀별 작업. */
    public static String task() {
        return "task-" + tokenHex4();
    }

    /** 쪽지·알림. */
    public static String notification() {
        return "ntf-" + tokenHex4();
    }

    /** 작업 댓글. */
    public static String message() {
        return "msg-" + tokenHex4();
    }

    /** 대화 탭 메시지. */
    public static String chat() {
        return "chat-" + tokenHex4();
    }

    /** {@code secrets.token_hex(4)} — 소문자 hex 8자. */
    static String tokenHex4() {
        byte[] bytes = new byte[4];
        RANDOM.nextBytes(bytes);
        char[] out = new char[8];
        for (int i = 0; i < bytes.length; i++) {
            out[i * 2] = HEX[(bytes[i] >> 4) & 0xF];
            out[i * 2 + 1] = HEX[bytes[i] & 0xF];
        }
        return new String(out);
    }
}
