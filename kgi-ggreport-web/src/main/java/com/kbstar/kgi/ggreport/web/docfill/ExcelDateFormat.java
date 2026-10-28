package com.kbstar.kgi.ggreport.web.docfill;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * 한글이 든 엑셀 날짜 서식({@code yyyy"년" m"월" d"일"}) 처리.
 *
 * <p>⚠️ <b>POI의 {@code DataFormatter}는 서식에 한글 글자가 있으면 날짜 서식으로 인식하지 못하고
 * 일련번호(46323.0)를 그대로 내놓는다</b>(2026-10-28 스파이크에서 실측 — 수식 셀·일반 셀 모두).
 * 한국어 양식에서 거의 반드시 만나는 서식이라, 이 경우에만 직접 풀어 쓴다. {@code yyyy-mm-dd}처럼
 * ASCII뿐인 서식은 POI가 정확히 처리하므로 여기를 타지 않는다.
 *
 * <p>지원 범위는 날짜·시각에 실제로 쓰이는 토큰이다: {@code y m d h s}, {@code AM/PM}, 따옴표 글자,
 * 역슬래시 글자. {@code [색]}·{@code [경과시간]} 같은 대괄호 구간은 무시한다.
 */
final class ExcelDateFormat {

    private static final Pattern DATE_TOKENS = Pattern.compile("[yYmMdDhHsSaApP/:\\-.,\\s]+");

    private ExcelDateFormat() {
    }

    /** 한글(비ASCII)이 들어 있고, 따옴표·이스케이프를 걷어 낸 나머지가 날짜 토큰뿐인가. */
    static boolean isNonAsciiDateFormat(String format) {
        if (format == null || format.isEmpty()) return false;
        boolean nonAscii = false;
        for (int i = 0; i < format.length(); i++) if (format.charAt(i) > 127) nonAscii = true;
        if (!nonAscii) return false;
        String bare = strip(format);
        return !bare.trim().isEmpty() && DATE_TOKENS.matcher(bare).matches()
                && bare.matches("(?s).*[yYdDhHsS].*");
    }

    /** 따옴표 글자·역슬래시 글자·대괄호 구간을 걷어 낸다. */
    private static String strip(String f) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < f.length(); i++) {
            char c = f.charAt(i);
            if (c == '"') {
                i++;
                while (i < f.length() && f.charAt(i) != '"') i++;
            } else if (c == '\\') {
                i++;
            } else if (c == '[') {
                while (i < f.length() && f.charAt(i) != ']') i++;
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    static String format(String excelFormat, Date date) {
        return new SimpleDateFormat(toJavaPattern(excelFormat), Locale.KOREA).format(date);
    }

    static String toJavaPattern(String f) {
        boolean ampm = strip(f).toUpperCase(Locale.ROOT).contains("AM/PM")
                || strip(f).toUpperCase(Locale.ROOT).contains("A/P");
        StringBuilder out = new StringBuilder();
        boolean afterHour = false;     // 직전 토큰이 시(h) — 이어지는 m은 '분'이다
        int i = 0;
        while (i < f.length()) {
            char c = f.charAt(i);
            if (c == '"') {
                int j = f.indexOf('"', i + 1);
                if (j < 0) j = f.length();
                quote(out, f.substring(i + 1, j));
                i = j + 1;
            } else if (c == '\\') {
                if (i + 1 < f.length()) quote(out, String.valueOf(f.charAt(i + 1)));
                i += 2;
            } else if (c == '[') {
                int j = f.indexOf(']', i);
                i = j < 0 ? f.length() : j + 1;
            } else if (Character.toLowerCase(c) == 'y') {
                int n = run(f, i);
                out.append(n <= 2 ? "yy" : "yyyy");
                i += n;
                afterHour = false;
            } else if (Character.toLowerCase(c) == 'd') {
                int n = run(f, i);
                out.append(n == 1 ? "d" : n == 2 ? "dd" : n == 3 ? "EEE" : "EEEE");
                i += n;
                afterHour = false;
            } else if (Character.toLowerCase(c) == 'h') {
                int n = run(f, i);
                out.append(ampm ? (n == 1 ? "h" : "hh") : (n == 1 ? "H" : "HH"));
                i += n;
                afterHour = true;
            } else if (Character.toLowerCase(c) == 's') {
                int n = run(f, i);
                out.append(n == 1 ? "s" : "ss");
                i += n;
                afterHour = false;
            } else if (Character.toLowerCase(c) == 'm') {
                int n = run(f, i);
                boolean minute = afterHour || nextIsSeconds(f, i + n);
                if (minute) out.append(n == 1 ? "m" : "mm");
                else out.append(n == 1 ? "M" : n == 2 ? "MM" : n == 3 ? "MMM" : "MMMM");
                i += n;
                afterHour = false;
            } else if (Character.toLowerCase(c) == 'a') {
                int len = f.regionMatches(true, i, "AM/PM", 0, 5) ? 5
                        : f.regionMatches(true, i, "A/P", 0, 3) ? 3 : 1;
                if (len == 1) quote(out, String.valueOf(c)); else out.append('a');
                i += len;
            } else if (Character.isLetter(c) && c < 128) {
                quote(out, String.valueOf(c));        // 모르는 ASCII 글자는 글자 그대로
                i++;
            } else {
                if (c != ':' && c != ' ') afterHour = false;
                if (c > 127) quote(out, String.valueOf(c)); else out.append(c);
                i++;
            }
        }
        return out.toString();
    }

    private static int run(String f, int i) {
        char c = Character.toLowerCase(f.charAt(i));
        int n = 0;
        while (i + n < f.length() && Character.toLowerCase(f.charAt(i + n)) == c) n++;
        return n;
    }

    private static boolean nextIsSeconds(String f, int from) {
        int i = from;
        while (i < f.length() && (f.charAt(i) == ':' || f.charAt(i) == ' ')) i++;
        return i < f.length() && Character.toLowerCase(f.charAt(i)) == 's';
    }

    private static void quote(StringBuilder out, String text) {
        out.append('\'').append(text.replace("'", "''")).append('\'');
    }
}
