package com.kbstar.kgi.ggreport.web.support;

/**
 * 기관장 이름 가리기(NEXT 72·77) — 목록·대기열에는 가린 이름만 나간다. 코드포인트 단위(이모지 등 서로게이트 쌍을 쪼개지 않는다).
 * 1자 {@code *}, 2자 {@code 홍*}, 3자 이상은 앞·뒤 한 글자만 남긴다({@code 홍*동}, {@code 남**수}).
 */
public final class HeadMask {

    private HeadMask() {
    }

    public static String name(String raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.trim();
        int n = s.codePointCount(0, s.length());
        if (n == 0) {
            return "";
        }
        if (n == 1) {
            return "*";
        }
        StringBuilder b = new StringBuilder().appendCodePoint(s.codePointAt(0));
        if (n == 2) {
            return b.append('*').toString();
        }
        for (int k = 0; k < n - 2; k++) {
            b.append('*');
        }
        return b.appendCodePoint(s.codePointBefore(s.length())).toString();
    }
}
