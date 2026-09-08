package com.kb.uploader.code;

/**
 * 감사 컬럼 {@code 시스템사용자번호} 에 넣을 값 — <b>이 데이터를 넣게 만든 주체</b>다.
 *
 * <p>이 앱에는 로그인도 사용자 개념도 없다. 그래서 주체는 사람이 아니라 <b>프로그램</b>이고,
 * 화면번호를 넣는다. 인포타입이 {@code 사용자번호7}(CHAR 7) 이라 <b>앞의 {@code K} 를 뗀
 * 7자</b>를 쓴다 — {@code KGI11100} → {@code GI11100}.
 *
 * <p><b>값을 손으로 심지 않는다.</b> 컨트롤러 클래스명이 이미 화면번호를 담고 있으므로
 * ({@code KGI11100$UploadAction}) 거기서 뽑는다 — {@code SystemUserInterceptor} 가
 * 요청마다 넣고 끝나면 지운다. <b>화면이 늘어도 여기 손댈 일이 없다.</b>
 *
 * <p>⚠️ 웹 요청이 아닌 경로(재분류 배치)는 컨트롤러가 없으므로 {@link #BATCH} 를
 * <b>직접 넣고 반드시 지워야</b> 한다. ThreadLocal 이라 안 지우면 그 스레드를 물려받은
 * 다음 작업에 값이 새어 나간다.
 *
 * <p>⚠️ 값이 없으면 {@code null} 이다. 컬럼이 NULLABLE 이라 기동은 되지만, 그 행은
 * "누가 넣었는지 모르는 행"이 된다 — 새 쓰기 경로를 만들 때 컨텍스트가 세팅되는지 확인할 것.
 */
public final class SystemUser {

    /** 재분류 배치처럼 화면이 없는 경로. 7자를 넘지 않는다. */
    public static final String BATCH = "BATCH01";

    private static final ThreadLocal<String> CURRENT = new ThreadLocal<String>();

    /** 컨트롤러 클래스명에서 화면번호를 뽑는다. {@code KGI11100$UploadAction} → {@code GI11100}. */
    public static String ofController(Class<?> controller) {
        if (controller == null) {
            return null;
        }
        String name = controller.getSimpleName();
        // 규약: K + GI + 5자리. 뒤에 $이름 이 붙는다.
        if (name.length() < 8 || name.charAt(0) != 'K') {
            return null;   // FileSearchApiController 처럼 번호가 없는 것 — 읽기 전용이라 무방하다
        }
        String code = name.substring(1, 8);
        for (int i = 2; i < code.length(); i++) {
            if (!Character.isDigit(code.charAt(i))) {
                return null;
            }
        }
        return code;
    }

    public static void set(String systemUserNo) {
        CURRENT.set(systemUserNo);
    }

    /** 세팅된 값이 없으면 {@code null} — 호출부가 판단하지 않고 그대로 DB 에 넣는다. */
    public static String get() {
        return CURRENT.get();
    }

    public static void clear() {
        CURRENT.remove();
    }

    private SystemUser() {}
}
