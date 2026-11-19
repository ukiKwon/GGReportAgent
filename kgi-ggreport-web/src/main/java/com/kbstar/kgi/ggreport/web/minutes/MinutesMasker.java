package com.kbstar.kgi.ggreport.web.minutes;

import com.kbstar.kgi.ggreport.web.support.Pii;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 회의록 가림 — 설계 3-5 (security R9~R15). DB 의존이 없는 순수 클래스다. 이름 사전은 생성자로 받는다.
 *
 * <p>한 글(발언 본문·주제어·항목·소제목·제목)을 줄 단위로 다음 순서로 처리한다.
 * <ol>
 *   <li>PII 정규식(휴대폰·유선·이메일·주민·외국인·카드) → {@code [가림]} (해제 불가, R12)</li>
 *   <li>{@link Pii#scanExternal} 안전망 — 아직 잡히면 줄 전체를 {@code [가림: 개인정보 의심 줄]}</li>
 *   <li>이름 사전(해제 가능, R9) → {@code [이름]}. 성+이름 전체만 대조한다.</li>
 *   <li>성+직함(해제 불가, R10) → 성만 {@code [이름]}</li>
 *   <li>담당자 지정 단어(R11) → {@code [이름]}. 긴 것부터, 라틴은 대소문자 무시. 저장·기록하지 않는다.</li>
 *   <li>마지막 안전망 한 번 더</li>
 * </ol>
 * 가림 표기는 고정 문자열이다(R13 — 글자 수·성·가명을 남기지 않는다). 이미 들어 있는 고정 표기는 다시 건드리지 않는다.
 */
public final class MinutesMasker {
    /** 파서·가림 규칙 버전. 규칙이 바뀌면 올린다(CONTENT_DIGEST 에 섞인다). */
    public static final String RULE_VER = "m2";   // m2: 코드포인트 정규화·digest 를 가리기 전 내용으로 계산(11-19 검토 반영)
    public static final String NAME_TOKEN = "[이름]";
    public static final String PII_TOKEN = "[가림]";
    public static final String LINE_TOKEN = "[가림: 개인정보 의심 줄]";
    public static final int MAX_TERMS = 100;
    public static final int MIN_TERM_CHARS = 2;
    public static final int MAX_TERM_CHARS = 30;

    private static final String[] TOKENS = {LINE_TOKEN, NAME_TOKEN, PII_TOKEN};

    private static final Pattern EMAIL = Pattern.compile("[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}");
    private static final Pattern JUMIN = Pattern.compile("(?<!\\d)\\d{6}[-\\s]?[1-8]\\d{6}(?!\\d)");
    private static final Pattern CARD = Pattern.compile("(?<!\\d)(?:\\d{4}[-\\s]?){3}\\d{4}(?!\\d)");
    private static final Pattern MOBILE = Pattern.compile("(?<!\\d)01[016789][-.\\s/_,~]?\\d{3,4}[-.\\s/_,~]?\\d{4}(?!\\d)");
    private static final Pattern LANDLINE = Pattern.compile("(?<!\\d)0(?:2|[3-6]\\d)[-.\\s/_,~)]?\\s?\\d{3,4}[-.\\s/_,~]\\d{4}(?!\\d)");
    private static final Pattern[] PII_PATTERNS = {EMAIL, JUMIN, CARD, MOBILE, LANDLINE};

    private static final String[] SURNAMES2 = {"남궁", "제갈", "선우", "황보", "독고", "사공", "서문", "동방"};
    private static final String SURNAMES1 = "김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민나진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예경봉";
    static final String[] JOB_TITLES = {"부장", "팀장", "차장", "과장", "대리", "주임", "계장", "본부장", "행장", "국장", "실장",
            "이사", "상무", "전무", "대표", "주무관", "위원장", "위원", "의원", "구청장", "시장", "군수"};
    private static final String[] PARTICLES = {"은", "는", "이", "가", "을", "를", "의", "와", "과", "도", "만", "께", "에게", "한테", "님", "씨",
            "에서", "하고", "랑", "로", "으로", "처럼", "께서", "에게서", "부터", "까지"};
    private static final Pattern SURNAME_TITLE = buildSurnameTitle();

    private final Map<Character, List<String>> byFirst = new HashMap<Character, List<String>>();

    /** @param names 이름 사전(USERS.NAME 전체, 상태 무관). 한글 2~5자·라틴 3자 이상만 쓴다. null 허용. */
    public MinutesMasker(Collection<String> names) {
        Set<String> uniq = new HashSet<String>();
        if (names != null) {
            for (String raw : names) {
                String n = MinutesText.fold(raw);
                if (n.matches("^[가-힣]{2,5}$") || n.matches("^[A-Za-z]{3,30}$")) {
                    uniq.add(n);
                }
            }
        }
        for (String n : uniq) {
            Character k = Character.valueOf(Character.toLowerCase(n.charAt(0)));
            List<String> list = byFirst.get(k);
            if (list == null) {
                list = new ArrayList<String>();
                byFirst.put(k, list);
            }
            list.add(n);
        }
        for (List<String> list : byFirst.values()) {
            Collections.sort(list, new Comparator<String>() {
                @Override
                public int compare(String a, String b) {
                    if (a.length() != b.length()) {
                        return b.length() - a.length();
                    }
                    return a.compareTo(b);
                }
            });
        }
    }

    private static Pattern buildSurnameTitle() {
        StringBuilder sur = new StringBuilder();
        for (String s : SURNAMES2) {
            sur.append(s).append('|');
        }
        sur.append('[').append(SURNAMES1).append(']');
        StringBuilder titles = new StringBuilder();
        for (int i = 0; i < JOB_TITLES.length; i++) {
            if (i > 0) {
                titles.append('|');
            }
            titles.append(JOB_TITLES[i]);
        }
        return Pattern.compile("(?<![가-힣])(" + sur + ")(\\s?)(?=(?:" + titles + "))");
    }

    /** 새 가림 세션(업로드 한 건). 추가 가림 단어·해제 목록은 POST 본문으로 받은 값이다. 건수는 세션에 쌓인다. */
    public Session newSession(Collection<String> terms, Collection<String> release, MinutesBudget budget) {
        return new Session(terms, release, budget);
    }

    /**
     * 수정 저장 검사(R15) — 이 글에 가려야 할 것이 남아 있으면 종류별 건수({@code pii·name·title}), 없으면 빈 맵.
     * 등록 때 해제한 이름도 다시 걸린다. 값은 돌려주지 않는다.
     */
    public Map<String, Integer> check(String text, MinutesBudget budget) {
        Session s = new Session(null, null, budget);
        s.mask(text);
        Map<String, Integer> kinds = new LinkedHashMap<String, Integer>();
        if (s.piiCount() + s.lineCount() > 0) {
            kinds.put("pii", Integer.valueOf(s.piiCount() + s.lineCount()));
        }
        if (s.nameCount() > 0) {
            kinds.put("name", Integer.valueOf(s.nameCount()));
        }
        if (s.titleCount() > 0) {
            kinds.put("title", Integer.valueOf(s.titleCount()));
        }
        return kinds;
    }

    /**
     * {@link #check} 에 걸리면 422 MASK_REQUIRED(kinds 건수만). 받은 글은 먼저 R4 정규화한다.
     * 통과하면 <b>정규화된 글</b>을 돌려준다 — 서비스는 받은 원문이 아니라 이 값을 저장해야 한다(검사한 글과 저장하는 글이 같게).
     */
    public String requireClean(String text, MinutesBudget budget) {
        String normalized = MinutesText.normalizeText(text, "edit");
        Map<String, Integer> kinds = check(normalized, budget);
        if (!kinds.isEmpty()) {
            throw new MinutesException(422, "MASK_REQUIRED", "edit", 0, kinds);
        }
        return normalized;
    }

    /** 한 업로드의 가림 상태. 스레드 안전하지 않다 — 요청 하나에서만 쓴다. */
    public final class Session {
        private final MinutesBudget budget;
        private final List<String> terms = new ArrayList<String>();
        private final Set<String> release = new HashSet<String>();
        private final Map<String, Integer> hits = new TreeMap<String, Integer>();
        private int pii;
        private int name;
        private int title;
        private int term;
        private int line;
        private int released;

        Session(Collection<String> termsIn, Collection<String> releaseIn, MinutesBudget budget) {
            this.budget = budget;
            Set<String> seen = new HashSet<String>();
            if (termsIn != null) {
                for (String raw : termsIn) {
                    String t = MinutesText.fold(raw);
                    if (t.length() < MIN_TERM_CHARS || t.length() > MAX_TERM_CHARS || hasForbidden(t)) {
                        throw MinutesException.badRequest("TERMS_INVALID");
                    }
                    if (seen.add(t.toLowerCase(Locale.ROOT))) {
                        terms.add(t);
                    }
                }
            }
            if (terms.size() > MAX_TERMS) {
                throw MinutesException.badRequest("TERMS_INVALID");
            }
            Collections.sort(terms, new Comparator<String>() {
                @Override
                public int compare(String a, String b) {
                    return b.length() - a.length();
                }
            });
            if (releaseIn != null) {
                for (String raw : releaseIn) {
                    String r = MinutesText.fold(raw);
                    if (r.isEmpty() || r.length() > MAX_TERM_CHARS) {
                        throw MinutesException.badRequest("RELEASE_INVALID");
                    }
                    release.add(r.toLowerCase(Locale.ROOT));
                }
                if (release.size() > MAX_TERMS) {
                    throw MinutesException.badRequest("RELEASE_INVALID");
                }
            }
        }

        /** 여러 줄 글 전체를 가린다. null 은 빈 문자열. 줄바꿈은 유지한다. */
        public String mask(String text) {
            if (text == null || text.isEmpty()) {
                return "";
            }
            String[] ls = text.split("\n", -1);
            StringBuilder sb = new StringBuilder(text.length() + 16);
            for (int i = 0; i < ls.length; i++) {
                budget.tick("mask", 0);
                if (i > 0) {
                    sb.append('\n');
                }
                sb.append(maskLine(ls[i]));
            }
            return sb.toString();
        }

        private String maskLine(String l) {
            if (l.isEmpty()) {
                return l;
            }
            String s = maskPii(l);
            s = net(s);
            if (LINE_TOKEN.equals(s)) {
                return s;
            }
            s = maskNames(s);
            s = maskTitles(s);
            s = maskTerms(s);
            return net(s);
        }

        private String maskPii(String s) {
            String cur = s;
            for (Pattern p : PII_PATTERNS) {
                Matcher m = p.matcher(cur);
                StringBuffer sb = null;
                while (m.find()) {
                    if (sb == null) {
                        sb = new StringBuffer();
                    }
                    pii++;
                    m.appendReplacement(sb, Matcher.quoteReplacement(PII_TOKEN));
                }
                if (sb != null) {
                    m.appendTail(sb);
                    cur = sb.toString();
                }
            }
            return cur;
        }

        /** Pii.scanExternal 안전망 — 걸리면 줄 전체를 가린다(줄 단위 fail-closed). */
        private String net(String s) {
            if (LINE_TOKEN.equals(s)) {
                return s;
            }
            List<?> found;
            try {
                found = Pii.scanExternal(s, budget.deadlineNanos());
            } catch (Pii.ScanTimeoutException e) {
                throw MinutesException.unprocessable("PARSE_TIMEOUT", "mask", 0);
            }
            if (!found.isEmpty()) {
                line++;
                return LINE_TOKEN;
            }
            return s;
        }

        private String maskNames(String s) {
            StringBuilder sb = new StringBuilder(s.length());
            int i = 0;
            int n = s.length();
            while (i < n) {
                char c = s.charAt(i);
                if (c == '[') {
                    String tok = tokenAt(s, i);
                    if (tok != null) {
                        sb.append(tok);
                        i += tok.length();
                        continue;
                    }
                }
                String matched = null;
                List<String> cands = byFirst.get(Character.valueOf(Character.toLowerCase(c)));
                if (cands != null) {
                    for (String nm : cands) {
                        int len = nm.length();
                        if (i + len <= n && s.regionMatches(true, i, nm, 0, len) && boundaryOk(s, i, len)) {
                            matched = nm;
                            break;
                        }
                    }
                }
                if (matched == null) {
                    sb.append(c);
                    i++;
                    continue;
                }
                int len = matched.length();
                Integer h = hits.get(matched);
                hits.put(matched, Integer.valueOf(h == null ? 1 : h.intValue() + 1));
                if (release.contains(matched.toLowerCase(Locale.ROOT))) {
                    released++;
                    sb.append(s, i, i + len);
                } else {
                    name++;
                    sb.append(NAME_TOKEN);
                }
                i += len;
            }
            return sb.toString();
        }

        private String maskTitles(String s) {
            Matcher m = SURNAME_TITLE.matcher(s);
            StringBuffer sb = null;
            while (m.find()) {
                if (sb == null) {
                    sb = new StringBuffer();
                }
                title++;
                m.appendReplacement(sb, Matcher.quoteReplacement(NAME_TOKEN + m.group(2)));
            }
            if (sb == null) {
                return s;
            }
            m.appendTail(sb);
            return sb.toString();
        }

        private String maskTerms(String s) {
            if (terms.isEmpty()) {
                return s;
            }
            StringBuilder sb = new StringBuilder(s.length());
            int i = 0;
            int n = s.length();
            while (i < n) {
                if (s.charAt(i) == '[') {
                    String tok = tokenAt(s, i);
                    if (tok != null) {
                        sb.append(tok);
                        i += tok.length();
                        continue;
                    }
                }
                String matched = null;
                for (String t : terms) {
                    if (i + t.length() <= n && s.regionMatches(true, i, t, 0, t.length())) {
                        matched = t;
                        break;
                    }
                }
                if (matched == null) {
                    sb.append(s.charAt(i));
                    i++;
                } else {
                    term++;
                    sb.append(NAME_TOKEN);
                    i += matched.length();
                }
            }
            return sb.toString();
        }

        /** 이번 업로드에서 해제 요청이 이름 사전 적중이 아닌 값이면 400 RELEASE_INVALID(R7). 모든 글을 가린 뒤에 부른다. */
        public void validateRelease() {
            Set<String> hitKeys = new HashSet<String>();
            for (String k : hits.keySet()) {
                hitKeys.add(k.toLowerCase(Locale.ROOT));
            }
            for (String r : release) {
                if (!hitKeys.contains(r)) {
                    throw MinutesException.badRequest("RELEASE_INVALID");
                }
            }
        }

        /** 이름 사전에 걸린 이름과 적중 수(해제된 것 포함) — 미리보기의 해제 후보. */
        public Map<String, Integer> nameHits() {
            return Collections.unmodifiableMap(hits);
        }

        public int piiCount() {
            return pii;
        }

        public int nameCount() {
            return name;
        }

        public int titleCount() {
            return title;
        }

        public int termCount() {
            return term;
        }

        public int lineCount() {
            return line;
        }

        /** 해제 요청으로 가리지 않고 둔 횟수(RELEASE_CNT). */
        public int releasedCount() {
            return released;
        }
    }

    private static String tokenAt(String s, int i) {
        for (String t : TOKENS) {
            if (s.startsWith(t, i)) {
                return t;
            }
        }
        return null;
    }

    private static boolean hasForbidden(String s) {
        for (int i = 0; i < s.length(); i++) {
            if (MinutesText.isForbidden(s.charAt(i)) || s.charAt(i) == '\n') {
                return true;
            }
        }
        return false;
    }

    private static boolean isHangul(char c) {
        return c >= '가' && c <= '힣';
    }

    private static boolean isLatin(char c) {
        return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
    }

    /**
     * 라틴 이름은 앞뒤가 라틴 글자가 아닐 때만(단어 경계 — "Zorinsky"·"xZorin" 은 가리지 않는다).
     * 한글 3자 이상 이름은 위치와 관계없이 가린다. 2자 이름은 앞이 한글이 아니고 뒤가 경계·조사·님·씨·직함일 때만(R9).
     */
    private static boolean boundaryOk(String s, int i, int len) {
        if (isLatin(s.charAt(i))) {
            int after = i + len;
            return (i == 0 || !isLatin(s.charAt(i - 1))) && (after >= s.length() || !isLatin(s.charAt(after)));
        }
        if (len >= 3) {
            return true;
        }
        if (i > 0 && isHangul(s.charAt(i - 1))) {
            return false;
        }
        int e = i + len;
        if (e >= s.length()) {
            return true;
        }
        if (!Character.isLetterOrDigit(s.charAt(e))) {
            return true;
        }
        for (String p : PARTICLES) {
            if (s.startsWith(p, e)) {
                return true;
            }
        }
        for (String t : JOB_TITLES) {
            if (s.startsWith(t, e)) {
                return true;
            }
        }
        return false;
    }
}
