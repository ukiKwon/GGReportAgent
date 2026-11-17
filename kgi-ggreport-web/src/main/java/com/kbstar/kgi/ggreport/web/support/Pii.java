package com.kbstar.kgi.ggreport.web.support;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 개인정보 검출 — Python {@code agent/orchestrator/pii.py} 의 이관본.
 *
 * <p><b>결정적 정규식만 쓴다(LLM 이 아니다).</b> 그리고 <b>검출값을 마스킹해서</b>
 * 보고한다 — 검사 결과 자체가 개인정보 2차 유출 경로가 되면 안 된다.
 *
 * <p>⚠️ <b>주민등록번호와 겹치는 휴대폰 매치는 버린다.</b> 주민번호 뒷자리
 * ({@code 1~4} 로 시작하는 7자리)가 휴대폰 패턴에 걸려 <b>한 값이 두 번</b> 보고되기
 * 때문이다. 원본이 스팬 겹침을 검사하는 이유가 그것이고, 여기서도 같게 옮겼다.
 */
public final class Pii {

    private static final Pattern MOBILE =
            Pattern.compile("(?<!\\d)(01[016789])[-\\s]?(\\d{3,4})[-\\s]?(\\d{4})(?!\\d)");
    private static final Pattern RRN =
            Pattern.compile("(?<!\\d)(\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01]))[-\\s]?([1-4]\\d{6})(?!\\d)");
    private static final Pattern EMAIL = Pattern.compile(
            "(?<![A-Za-z0-9._%+-])([A-Za-z0-9._%+-])([A-Za-z0-9._%+-]*+)@([A-Za-z0-9.-]+\\.[A-Za-z]{2,})");
    private static final Pattern FOREIGN =
            Pattern.compile("(?<!\\d)(\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01]))[-\\s]?([5-8]\\d{6})(?!\\d)");
    private static final Pattern CARD =
            Pattern.compile("(?<!\\d)(\\d{4})([- ])(\\d{4})\\2(\\d{4})\\2(\\d{4})(?!\\d)");

    // ── 외부 확인 반입(scanExternal)용 — 서버 안전망. 기존 scan/scanLoose 는 바뀌지 않는다 ──
    /** 가림표 후보(NFKC 뒤). 숫자 * x X # o O ○●□■◯△▲☆★ ㅇ(U+3147, NFKC 뒤 U+110B) ∗(U+2217) ×. */
    private static final String MK = "[\\d*xX#oO\\u25CB\\u25CF\\u25A1\\u25A0\\u25EF\\u25B3\\u25B2"
            + "\\u2606\\u2605\\u3147\\u110B\\u2217\\u00D7]";
    /** 구분자 0~3자. 소유 한정자라 되돌아가지 않는다(상-2). */
    private static final String SP = "[\\s\\-./]{0,3}+";
    /** 외부 확인용 숫자 사이 구분자 접힘(하-1) — 공백·탭·'-' 에 '/'·'_'·','·'~' 까지, 2자 이상 이어질 때 '-' 하나로. 양옆은 숫자·가림표여야 한다. */
    private static final Pattern SEP_RUN_EXT = Pattern.compile(
            "(?<=" + MK + ")[ \\t/_,~\\-]{2,}(?=" + MK + ")");
    /** 국가번호(+82·0082·82, 뒤에 (0)·0 선택) 또는 국내 0. +82-02 도 잡는다(상-3). */
    private static final String CC = "(?:(?:\\+|00)?82" + SP + "(?:\\(0\\))?+" + SP + "0?+|\\(?0)";
    /** 휴대폰 — 부분 가림·전부 가림도 '있음'으로 본다. */
    private static final Pattern MOBILE_ANY = Pattern.compile(
            "(?<!\\d)" + CC + "1[016789]\\)?" + SP + MK + "{3,4}" + SP + MK + "{4}(?!\\d)");
    /** 유선 — 02·031~033·041~044·051~055·061~064·070·050x. 대표번호 15xx·16xx·18xx 는 0 으로 시작하지 않아 걸리지 않는다. */
    private static final Pattern LANDLINE = Pattern.compile(
            "(?<!\\d)(?<!(?:19|20)\\d\\d[-./])" + CC
            + "(?:2|3[1-3]|4[1-4]|5[1-5]|6[1-4]|70|50\\d)\\)?" + SP
            + "(" + MK + "{3,4})" + SP + "(" + MK + "{4})(?!\\d)");
    private static final String LOCAL_CH = "[A-Za-z0-9._%+*\\-\\u25CB\\u25CF\\u25A1\\u25A0\\u25EF\\u2217#]";
    /** 이메일 — 가림표가 든 로컬 부분까지 통째로 잡고, 허용 모양인지는 아래에서 따로 본다(중-2). */
    private static final Pattern EMAIL_ANY = Pattern.compile(
            "(?<!" + LOCAL_CH + ")(" + LOCAL_CH + "++)@([A-Za-z0-9.-]+\\.[A-Za-z]{2,})");
    /** 허용되는 가린 이메일 로컬 부분: 첫 글자 하나 + '*' 한 개 이상. */
    private static final Pattern EMAIL_MASKED_OK = Pattern.compile("[A-Za-z0-9]\\*+");
    private static final String REDACTED = "[가림]";
    private static final long DEFAULT_BUDGET_NANOS = 10_000_000_000L;

    private Pii() {
    }

    /** 한 건. {@code value} 는 <b>이미 마스킹된</b> 값이다. */
    public static final class Finding {
        private final String kind;
        private final String value;

        Finding(String kind, String value) {
            this.kind = kind;
            this.value = value;
        }

        public String getKind()  { return kind; }
        public String getValue() { return value; }

        @Override
        public String toString() {
            return kind + "=" + value;
        }
    }

    /**
     * 검출 순서 — 주민등록번호 → 휴대폰 → 이메일 → (신규) 외국인등록번호 → 카드번호.
     * 앞의 셋은 원본과 같다. 화면이 목록을 그대로 뿌리므로 순서가 곧 표시 순서다.
     * 숫자 패턴은 앞뒤가 숫자이면 일치로 보지 않는다(긴 숫자열 속 오탐 방지).
     */
    public static List<Finding> scan(String text) {
        return scanImpl(text, null);
    }

    /** @param deadlineNanos null 이면 마감 없음(기존 동작 그대로). 있으면 정규식이 마감을 넘길 때 ScanTimeoutException(하-3). */
    private static List<Finding> scanImpl(String original, Long deadlineNanos) {
        List<Finding> found = new ArrayList<Finding>();
        if (original == null || original.isEmpty()) {
            return found;
        }
        CharSequence text = deadlineNanos == null ? original : new Budget(original, deadlineNanos.longValue());

        // 주민·외국인등록번호 스팬 — 아래 휴대폰·카드 검사에서 겹침을 판정한다.
        Set<int[]> spans = new LinkedHashSet<int[]>();
        Matcher rrn = RRN.matcher(text);
        while (rrn.find()) {
            spans.add(new int[]{rrn.start(), rrn.end()});
            found.add(new Finding("주민등록번호", rrn.group(1) + "-*******"));
        }
        List<Finding> foreign = new ArrayList<Finding>();   // 표시 순서상 이메일 뒤에 붙인다
        Matcher fgn = FOREIGN.matcher(text);
        while (fgn.find()) {
            spans.add(new int[]{fgn.start(), fgn.end()});
            foreign.add(new Finding("외국인등록번호", fgn.group(1) + "-*******"));
        }

        Matcher mobile = MOBILE.matcher(text);
        while (mobile.find()) {
            if (overlaps(mobile.start(), mobile.end(), spans)) {
                continue;
            }
            spans.add(new int[]{mobile.start(), mobile.end()});
            // 접두사를 살려 010/011/016/017/018/019 를 구분해 보여준다.
            found.add(new Finding("휴대폰", mobile.group(1) + "-****-" + mobile.group(3)));
        }

        Matcher email = EMAIL.matcher(text);
        while (email.find()) {
            found.add(new Finding("이메일", email.group(1) + "***@" + email.group(3)));
        }

        found.addAll(foreign);

        // 카드번호 — 4-4-4-4 형태 + Luhn 검사를 통과한 것만(아무 16자리 숫자는 버린다). 앞 4·뒤 4만 남긴다.
        Matcher card = CARD.matcher(text);
        while (card.find()) {
            if (overlaps(card.start(), card.end(), spans)) {
                continue;
            }
            String digits = card.group(1) + card.group(3) + card.group(4) + card.group(5);
            if (luhn(digits)) {
                found.add(new Finding("카드번호", card.group(1) + "-****-****-" + card.group(5)));
            }
        }
        return found;
    }

    private static final String EMAIL_KIND = "이메일";

    /**
     * 우회 구분자까지 보는 검사(security 하-2) — 사용자 입력(칸 값·메모)용. NFKC 뒤 ① 서식 문자(폭 없는 공백·소프트 하이픈) 제거
     * ② 십진 숫자(아랍-인도 등 비ASCII)를 ASCII 로 ③ 대시류(en dash 등 DASH_PUNCTUATION, U+2212)를 '-' 로 ④ 숫자류는 '.'·'·' 도 '-' 로 본다.
     * 이메일은 '.' 이 뜻을 가지므로 ④ 를 적용하지 않은 변형으로 찾는다(한 값이 두 번 세어지지 않는다).
     * 알려진 오탐: "900101.1234567" 같은 6자리.7자리 소수 — 숫자 칸(소수 2자리)에서는 나오지 않는다.
     */
    public static List<Finding> scanLoose(String text) {
        List<Finding> out = new ArrayList<Finding>();
        if (text == null || text.isEmpty()) {
            return out;
        }
        for (Finding f : scan(fold(text, true))) {
            if (!EMAIL_KIND.equals(f.getKind())) {
                out.add(f);
            }
        }
        for (Finding f : scan(fold(text, false))) {
            if (EMAIL_KIND.equals(f.getKind())) {
                out.add(f);
            }
        }
        return out;
    }

    /** 기관장 정보(026)의 유선전화 검사용 — scanLoose 가 보는 접힘({@code '.'} 구분자 포함)을 그대로 돌려준다. 기존 동작은 바뀌지 않는다. */
    public static String foldLoose(String t) {
        return t == null ? "" : fold(t, true);
    }

    /** scanExternal 이 마감 시각을 넘기면 던진다. 호출자는 그 check 를 TIMEOUT 으로 제외한다. */
    public static final class ScanTimeoutException extends RuntimeException {
        private static final long serialVersionUID = 1L;
        ScanTimeoutException() { super("scan deadline exceeded"); }
    }

    /**
     * 외부 확인 반입용 안전망 검사(기본 10초). 종류·건수만 알려 주고 value 는 항상 "[가림]" 이다.
     * 휴대폰은 가렸든 아니든 있으면 건수에 든다. 유선은 국번 뒤 두 묶음이 모두 가림표일 때만 통과한다.
     * 이메일은 로컬 부분이 {@code 첫글자+*...} 일 때만 통과한다.
     */
    public static List<Finding> scanExternal(String text) {
        return scanExternal(text, System.nanoTime() + DEFAULT_BUDGET_NANOS);
    }

    /** @param deadlineNanos {@link System#nanoTime()} 기준 절대 마감 시각. 넘기면 {@link ScanTimeoutException}. */
    public static List<Finding> scanExternal(String text, long deadlineNanos) {
        List<Finding> out = new ArrayList<Finding>();
        if (text == null || text.isEmpty()) {
            return out;
        }
        checkDeadline(deadlineNanos);
        String f = collapseSpace(fold(text, true, SEP_RUN_EXT));   // 구분자가 '/'·'_'·','·'~' 로 길어져도 접는다(하-1)
        Matcher m = MOBILE_ANY.matcher(new Budget(f, deadlineNanos));
        while (m.find()) {
            out.add(new Finding("휴대폰", REDACTED));
        }
        Matcher l = LANDLINE.matcher(new Budget(f, deadlineNanos));
        while (l.find()) {
            if (hasDigit(l.group(1)) || hasDigit(l.group(2))) {
                out.add(new Finding("유선전화", REDACTED));
            }
        }
        checkDeadline(deadlineNanos);
        for (Finding x : scanImpl(fold(text, true), Long.valueOf(deadlineNanos))) {   // 주민·외국인·카드. scanLoose 와 같은 접힘, 마감 아래(하-3)
            String k = x.getKind();
            if (!"휴대폰".equals(k) && !EMAIL_KIND.equals(k)) {
                out.add(new Finding(k, REDACTED));
            }
        }
        Matcher e = EMAIL_ANY.matcher(new Budget(fold(text, false), deadlineNanos));   // '.' 을 살린 접힘
        while (e.find()) {
            if (!EMAIL_MASKED_OK.matcher(e.group(1)).matches()) {
                out.add(new Finding(EMAIL_KIND, REDACTED));
            }
        }
        return out;
    }

    private static void checkDeadline(long deadlineNanos) {
        if (System.nanoTime() - deadlineNanos > 0) {
            throw new ScanTimeoutException();
        }
    }

    /**
     * scanExternal + 한 글자씩 띄운 구간("0 1 0 1 2 3 …", 8쌍 이상)의 공백을 지워 한 번 더 본다(security 하-2).
     * 전체 공백 제거는 오탐이 커서 쓰지 않는다. PDF·HWPX 본문처럼 글자 사이가 벌어진 추출물용이다.
     */
    public static List<Finding> scanExternalDeep(String text, long deadlineNanos) {
        List<Finding> out = scanExternal(text, deadlineNanos);
        String spaced = spacedRuns(text, deadlineNanos);
        if (spaced != null) {
            out.addAll(scanExternal(spaced, deadlineNanos));
        }
        return out;
    }

    private static String spacedRuns(String text, long deadlineNanos) {
        if (text == null) {
            return null;
        }
        StringBuilder out = null;
        int n = text.length();
        int i = 0;
        while (i < n) {
            if ((i & 0x3FF) == 0) {
                checkDeadline(deadlineNanos);
            }
            if (!isSpaceLike(text.charAt(i)) && i + 1 < n && text.charAt(i + 1) == ' ') {
                StringBuilder run = new StringBuilder();
                int j = i;
                int pairs = 0;
                while (j + 1 < n && !isSpaceLike(text.charAt(j)) && text.charAt(j + 1) == ' ') {
                    run.append(text.charAt(j));
                    j += 2;
                    pairs++;
                }
                if (j < n && !isSpaceLike(text.charAt(j))) {
                    run.append(text.charAt(j));
                    j++;
                }
                if (pairs >= 8) {
                    if (out == null) {
                        out = new StringBuilder();
                    }
                    out.append(run).append('\n');
                }
                i = Math.max(j, i + 1);
            } else {
                i++;
            }
        }
        return out == null ? null : out.toString();
    }

    private static boolean isSpaceLike(char c) {
        return Character.isWhitespace(c) || c == ' ' || c == '　';
    }

    private static boolean hasDigit(String s) {
        for (int i = 0; i < s.length(); i++) {
            if (Character.isDigit(s.charAt(i))) {
                return true;
            }
        }
        return false;
    }

    /** 공백류(스페이스·탭·줄바꿈·VT·FF·CR) 연속을 스페이스 하나로. 정규식을 쓰지 않는다. */
    private static String collapseSpace(String s) {
        StringBuilder b = new StringBuilder(s.length());
        boolean inWs = false;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            boolean ws = c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == (char) 0x0B;
            if (ws) {
                if (!inWs) {
                    b.append(' ');
                }
                inWs = true;
            } else {
                b.append(c);
                inWs = false;
            }
        }
        return b.toString();
    }

    /** charAt 마다(1024번에 한 번 시각 확인) 마감을 보는 감싸개 — 정규식은 인터럽트에 반응하지 않기 때문이다(상-2). */
    private static final class Budget implements CharSequence {
        private final CharSequence s;
        private final long deadline;
        private int n;

        Budget(CharSequence s, long deadline) { this.s = s; this.deadline = deadline; }

        @Override public char charAt(int i) {
            if ((n++ & 0x3FF) == 0 && System.nanoTime() - deadline > 0) {
                throw new ScanTimeoutException();
            }
            return s.charAt(i);
        }
        @Override public int length() { return s.length(); }
        @Override public CharSequence subSequence(int a, int b) { return s.subSequence(a, b); }
        @Override public String toString() { return s.toString(); }
    }

    private static String fold(String text, boolean dotAsDash) {
        return fold(text, dotAsDash, SEP_RUN);
    }

    private static String fold(String text, boolean dotAsDash, Pattern sepRun) {
        String s = java.text.Normalizer.normalize(text, java.text.Normalizer.Form.NFKC);
        StringBuilder b = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); ) {
            int cp = s.codePointAt(i);
            i += Character.charCount(cp);
            int ty = Character.getType(cp);
            if (ty == Character.FORMAT) {
                continue;
            }
            if (ty == Character.DECIMAL_DIGIT_NUMBER) {
                b.append((char) ('0' + Character.digit(cp, 10)));
            } else if (ty == Character.DASH_PUNCTUATION || cp == 0x2212
                    || (dotAsDash && (cp == '.' || cp == 0x00B7 || cp == 0x30FB || cp == 0x2027))) {
                b.append('-');
            } else {
                b.appendCodePoint(cp);
            }
        }
        // ⑤ 숫자 사이 구분자 연속("900101 - 1234567", "010 - 1234 - 5678")을 '-' 하나로 접는다(security 하-1, 11-10).
        // 줄바꿈은 접지 않는다(다른 줄의 숫자를 한 값으로 잇는 오탐 방지). 이메일 변형은 건드리지 않는다.
        return dotAsDash ? sepRun.matcher(b).replaceAll("-") : b.toString();
    }

    private static final Pattern SEP_RUN = Pattern.compile("(?<=\\d)[ \\t-]{2,}(?=\\d)");

    /** Luhn 검사 — 카드번호 오탐(아무 16자리 숫자)을 걸러낸다. */
    static boolean luhn(String digits) {
        int sum = 0;
        boolean dbl = false;
        for (int i = digits.length() - 1; i >= 0; i--) {
            int d = digits.charAt(i) - '0';
            if (dbl) {
                d *= 2;
                if (d > 9) {
                    d -= 9;
                }
            }
            sum += d;
            dbl = !dbl;
        }
        return sum % 10 == 0;
    }

    /** 두 스팬이 겹치면 {@code start1 < end2 && start2 < end1}. */
    private static boolean overlaps(int start, int end, Set<int[]> spans) {
        for (int[] span : spans) {
            if (start < span[1] && span[0] < end) {
                return true;
            }
        }
        return false;
    }
}
