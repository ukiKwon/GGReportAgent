package com.kbstar.kgi.ggreport.web.support;

import com.kbstar.kgi.ggreport.web.web.ApiException;

import java.net.URI;
import java.net.URISyntaxException;
import java.text.Normalizer;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 기관장 정보(NEXT 72·77, 026) 입력값 검사·정규화. 오류 응답에는 입력값을 싣지 않는다(고정 문구·코드뿐).
 * 금지 내용(정당·범죄 경력 등)은 {@link HeadForbidden} 이 따로 본다.
 */
public final class HeadText {

    private static final Pattern DATE = Pattern.compile("[0-9]{4}-[0-9]{2}-[0-9]{2}");
    private static final Pattern PERIOD = Pattern.compile("([0-9]{4})(?:-([0-9]{2}))?");
    private static final LocalDate MIN_CHECKED = LocalDate.of(2000, 1, 1);
    private static final LocalDate MIN_BIRTH = LocalDate.of(1920, 1, 1);
    /** 나이·생년 표기 — NFKC 뒤 find. '출생'·일반 날짜는 넣지 않는다('저출생대응과', '2022.07.01 취임' 통과). security 11-20 ③ */
    private static final Pattern AGE_HINT = Pattern.compile("(?:19|20)\\d{2}\\s*년\\s*생(?![가-힣])|생년월일|만\\s*\\d{2}\\s*세");   // '생' 뒤에 한글이 이어지면(생산·생활·생명·생태) 낱말로 보고 통과(qa 11-20 P2-2)

    private HeadText() {
    }

    /** NFKC · 앞뒤 공백 제거 · 연속 공백 한 칸. */
    public static String normalize(String v) {
        if (v == null) {
            return "";
        }
        String n = Normalizer.normalize(v, Normalizer.Form.NFKC).trim();
        return n.replaceAll("\\s+", " ");
    }

    /** 같음 비교용 — normalize 뒤 공백까지 제거. */
    public static String compareKey(String v) {
        return normalize(v).replace(" ", "");
    }

    /**
     * 한 줄 글자 — 1~max 코드포인트. 줄바꿈·탭·제어·서식 문자(Cc·Cf, 줄·문단 구분자)가 있으면 400 INVALID_TEXT.
     * {@code noDigits} 가 참이면(이름) 숫자가 있어도 400. 반환값은 normalize 한 문자열.
     */
    public static String requireLine(String field, String v, int max, boolean noDigits) {
        if (v == null || v.trim().isEmpty()) {
            throw coded(400, "INVALID_TEXT", label(field) + "을(를) 입력하세요.");
        }
        for (int i = 0; i < v.length(); ) {
            int cp = v.codePointAt(i);
            i += Character.charCount(cp);
            int ty = Character.getType(cp);
            if (ty == Character.CONTROL || ty == Character.FORMAT || ty == Character.LINE_SEPARATOR
                    || ty == Character.PARAGRAPH_SEPARATOR || ty == Character.SURROGATE) {
                throw coded(400, "INVALID_TEXT", label(field) + "에 쓸 수 없는 문자가 있습니다.");
            }
        }
        String n = normalize(v);
        if (noDigits) {   // NFKC 뒤에 본다 — '①'·전각 숫자가 '1' 로 바뀌어 저장되는 우회 차단(qa P3-6)
            for (int i = 0; i < n.length(); ) {
                int cp = n.codePointAt(i);
                i += Character.charCount(cp);
                if (Character.isDigit(cp)) {
                    throw coded(400, "INVALID_TEXT", label(field) + "에 쓸 수 없는 문자가 있습니다.");
                }
            }
        }
        int len = n.codePointCount(0, n.length());
        if (len < 1 || len > max) {
            throw coded(400, "INVALID_TEXT", label(field) + "은(는) 1~" + max + "자로 입력하세요.");
        }
        return n;
    }

    /** 선택 한 줄 — 비어 있으면 null. */
    public static String optionalLine(String field, String v, int max) {
        return v == null || v.trim().isEmpty() ? null : requireLine(field, v, max, false);
    }

    /** 실재하는 날짜 YYYY-MM-DD(2026-02-30 은 400). */
    public static String requireDate(String field, String v) {
        if (v == null || !DATE.matcher(v).matches()) {
            throw coded(400, "INVALID_DATE", label(field) + "은(는) YYYY-MM-DD 형식으로 입력하세요.");
        }
        try {
            LocalDate.parse(v);
        } catch (DateTimeParseException e) {
            throw coded(400, "INVALID_DATE", label(field) + "은(는) 실제 있는 날짜여야 합니다.");
        }
        return v;
    }

    public static String optionalDate(String field, String v) {
        return v == null || v.isEmpty() ? null : requireDate(field, v);
    }

    /** 글자 칸(직위·학력·경력·출처 제목)에 나이·생년월일 표기가 있으면 400 INVALID_TEXT. 입력값은 싣지 않는다. 반환은 받은 값 그대로. */
    public static String noAge(String v) {
        if (v != null && AGE_HINT.matcher(normalize(v)).find()) {
            throw coded(400, "INVALID_TEXT", "나이·생년월일은 이 칸에 적을 수 없습니다(생년월일 칸에만 입력).");
        }
        return v;
    }

    /** 생년월일 — 실재 날짜, 1920-01-01 이상, 서울 오늘-18년 이하. 밖이면 400 INVALID_DATE(오류 문구에 입력값을 싣지 않는다). */
    public static String requireBirthDate(String v) {
        return requireBirthDate(v, LocalDate.parse(Times.todayKst()));
    }

    /** 오늘 날짜를 받는 오버로드 — 윤년 경계 단위 시험용. */
    static String requireBirthDate(String v, LocalDate today) {
        String d = requireDate("birth_date", v);
        LocalDate day = LocalDate.parse(d);
        LocalDate max = today.minusYears(18);
        if (day.isBefore(MIN_BIRTH) || day.isAfter(max)) {
            throw coded(400, "INVALID_DATE", "생년월일은 1920-01-01부터 만 18세 이상이 되는 날짜까지만 입력할 수 있습니다.");
        }
        return d;
    }

    /** 기간 YYYY 또는 YYYY-MM(1900~2100). 비어 있으면 null. */
    public static String requirePeriod(String field, String v) {
        if (v == null || v.isEmpty()) {
            return null;
        }
        java.util.regex.Matcher m = PERIOD.matcher(v);
        if (!m.matches()) {
            throw coded(400, "INVALID_DATE", label(field) + "은(는) YYYY 또는 YYYY-MM 형식으로 입력하세요.");
        }
        int year = Integer.parseInt(m.group(1));
        int month = m.group(2) == null ? 1 : Integer.parseInt(m.group(2));
        if (year < 1900 || year > 2100 || month < 1 || month > 12) {
            throw coded(400, "INVALID_DATE", label(field) + "의 연·월이 올바르지 않습니다.");
        }
        return v;
    }

    /** 확인일 — 실재 날짜, 2000-01-01 이상, 서울 오늘 이하. */
    public static String requireCheckedOn(String v) {
        String d = requireDate("checked_on", v);
        LocalDate day = LocalDate.parse(d);
        if (day.isBefore(MIN_CHECKED) || day.isAfter(LocalDate.parse(Times.todayKst()))) {
            throw coded(400, "INVALID_DATE", "확인일은 2000-01-01부터 오늘까지의 날짜여야 합니다.");
        }
        return d;
    }

    /** 출처 URL — 서버는 이 URL 을 열지 않는다(화면 링크 표시용 문자열). http/https 만, 계정정보·공백·역슬래시 금지. */
    public static String requireUrl(String raw) {
        if (raw == null || raw.isEmpty()) {
            return null;
        }
        if (raw.length() > 1000 || !raw.equals(raw.trim())) {
            throw badUrl();
        }
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c <= 0x20 || c == 0x7F || c == '\\' || Character.getType(c) == Character.FORMAT) {
                throw badUrl();
            }
        }
        URI u;
        try {
            u = new URI(raw);
        } catch (URISyntaxException e) {
            throw badUrl();
        }
        String s = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
        if (!("http".equals(s) || "https".equals(s)) || u.isOpaque() || u.getRawUserInfo() != null
                || u.getHost() == null || u.getHost().isEmpty()) {
            throw badUrl();
        }
        return raw;
    }

    /** 사유 — 1~200자 한 줄 + 개인정보·금지 내용 검사. */
    public static String requireReason(String v) {
        String r = requireLine("reason", v, 200, false);
        HeadForbidden.rejectAny(r);
        return r;
    }

    private static ApiException badUrl() {
        return coded(400, "SRC_URL_INVALID", "출처 주소는 http 또는 https 로 시작하는 올바른 주소여야 합니다.");
    }

    private static String label(String field) {
        if ("name".equals(field) || "NAME".equals(field)) {
            return "이름";
        }
        if ("reason".equals(field)) {
            return "사유";
        }
        if ("src_title".equals(field)) {
            return "출처 이름";
        }
        if ("birth_date".equals(field)) {   // 화면이 '생년월일…' 문구일 때만 생년월일 칸 아래에 오류를 붙인다
            return "생년월일";
        }
        return "값";
    }

    static ApiException coded(int status, String code, String message) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("code", code);
        d.put("message", message);
        return ApiException.withDetail(status, d);
    }
}
