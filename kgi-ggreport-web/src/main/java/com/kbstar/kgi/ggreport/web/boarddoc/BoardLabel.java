package com.kbstar.kgi.ggreport.web.boarddoc;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * 라벨 정규화·대조(순수 함수, 정규식 없음).
 *
 * <p>정규화 key: NFKC → 첫 '=' 또는 '＝' 부터 끝까지 제거(수식 꼬리) → 공백·가운뎃점·쉼표·마침표·서식 문자 제거 → 소문자(ROOT).
 * 대조는 "지도 라벨이 실제 라벨과 전체 일치" 이거나, 지도 라벨 끝에 {@code *} 가 있을 때만 "지도 라벨이 실제 라벨의 접두"(한 방향).
 * 정규화 결과가 빈 문자열이면 어떤 경우에도 일치하지 않는다. 오류 메시지에는 라벨 글자를 싣지 않는다.
 */
public final class BoardLabel {

    /** 접두 일치(*)에서 정규화 후 최소 글자 수. */
    public static final int MIN_PREFIX = 2;

    private BoardLabel() {
    }

    /** 지도 쪽 라벨 한 개(정규화 key + 접두 여부). */
    public static final class Spec {
        private final String key;
        private final boolean prefix;

        Spec(String key, boolean prefix) {
            this.key = key;
            this.prefix = prefix;
        }

        public String getKey() {
            return key;
        }

        public boolean isPrefix() {
            return prefix;
        }
    }

    public static String key(String s) {
        if (s == null || s.isEmpty()) {
            return "";
        }
        String n = Normalizer.normalize(s, Normalizer.Form.NFKC);
        int cut = n.length();
        for (int i = 0; i < n.length(); i++) {
            char ch = n.charAt(i);
            if (ch == '=' || ch == '＝') {
                cut = i;
                break;
            }
        }
        StringBuilder sb = new StringBuilder(cut);
        for (int i = 0; i < cut; i++) {
            char ch = n.charAt(i);
            if (Character.isWhitespace(ch) || Character.isSpaceChar(ch) || Character.getType(ch) == Character.FORMAT
                    || ch == '·' || ch == 'ㆍ' || ch == 'ᆞ' || ch == '・' || ch == ','
                    || ch == '.') {
                continue;
            }
            sb.append(ch);
        }
        return sb.toString().toLowerCase(Locale.ROOT);
    }

    /**
     * 지도 라벨 → Spec. 끝이 {@code *} 면 접두 일치(정규화 후 2자 이상). 정규화 결과가 비면 거부(IllegalArgumentException).
     */
    public static Spec parse(String raw) {
        if (raw == null) {
            throw new IllegalArgumentException("LABEL_SPEC_EMPTY");
        }
        String t = Normalizer.normalize(raw, Normalizer.Form.NFKC).trim();
        boolean prefix = t.endsWith("*");
        String body = prefix ? t.substring(0, t.length() - 1) : t;
        String k = key(body);
        if (k.isEmpty()) {
            throw new IllegalArgumentException("LABEL_SPEC_EMPTY");
        }
        if (prefix && k.length() < MIN_PREFIX) {
            throw new IllegalArgumentException("LABEL_SPEC_PREFIX_TOO_SHORT");
        }
        return new Spec(k, prefix);
    }

    /** "별칭1|별칭2" 형태를 Spec 목록으로(최소 1개). '|' 구분은 문자 루프로 자른다. */
    public static List<Spec> parseAliases(String piped) {
        if (piped == null) {
            throw new IllegalArgumentException("LABEL_SPEC_EMPTY");
        }
        List<Spec> out = new ArrayList<>();
        int from = 0;
        for (int i = 0; i <= piped.length(); i++) {
            if (i == piped.length() || piped.charAt(i) == '|') {
                out.add(parse(piped.substring(from, i)));
                from = i + 1;
            }
        }
        return out;
    }

    public static boolean matches(Spec spec, String actual) {
        return matchesKey(spec, key(actual));
    }

    /** 이미 정규화한 실제 key 와 대조(행마다 한 번만 정규화해 저장해 두고 쓸 때). */
    public static boolean matchesKey(Spec spec, String actualKey) {
        if (spec == null || actualKey == null || actualKey.isEmpty() || spec.key.isEmpty()) {
            return false;
        }
        return spec.prefix ? actualKey.startsWith(spec.key) : actualKey.equals(spec.key);
    }

    /** 별칭 중 하나라도 일치하면 true. */
    public static boolean matchesAny(List<Spec> specs, String actual) {
        return matchesAnyKey(specs, key(actual));
    }

    public static boolean matchesAnyKey(List<Spec> specs, String actualKey) {
        for (Spec sp : specs) {
            if (matchesKey(sp, actualKey)) {
                return true;
            }
        }
        return false;
    }
}
