package com.kbstar.kgi.ggreport.web.service;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 기관명 사전과 스캔(NEXT 106). DB·Spring 없음 — 단위 시험 대상. <b>정식 기관 이름만</b> 잡는다(약칭 사전 없음 — 사용자 결정 11-20).
 * <ul>
 *   <li>시도 접두형(서울 강남구·부산광역시 중구청 …)은 늘 넣는다.</li>
 *   <li>맨몸(접두 없는) 이름은 3글자 이상이고 표 전체에서 유일할 때만 — '서구'·'중구'와 서울·부산에 다 있는 '강서구' 같은 맨몸은 다른 기관으로 잡지 않는다.</li>
 *   <li>현재 기관의 모든 형태(두 글자 포함)와 현재 시도 이름(서울특별시·서울시 …)은 '현재'로 소비만 하고 보고하지 않는다.</li>
 *   <li>같은 문자열이 서로 다른 기관에 걸리면(현재 기관이 아니면) 모호하다고 보고 뺀다.</li>
 *   <li>법인 접두(재단법인·사단법인·의료법인·(재)·(사))는 사전에 넣을 때 떼고 등록한다. 영문은 소문자로 통일한다.</li>
 *   <li>일치한 이름 바로 뒤가 '청년·청소년·청사·청렴·시민·도민·군민·구민'으로 이어지면 그 일치는 버린다(서울청년·세종청사·부산시민 오탐 방지).</li>
 * </ul>
 * 스캔은 왼쪽부터 가장 긴 일치. 입력은 NFKC + 공백·제로폭 제거 + 영문 소문자, 문단 경계 '|' 는 남겨 경계를 넘는 일치를 막는다.
 * 공백을 지운 뒤 비교하지만, 일치 끝과 다음 글자 사이에 원문 공백이 있었으면 낱말 경계 규칙으로 버리지 않는다('도봉구 민원'은 잡힘, '서울청년'은 버림).
 * 가장 긴 일치가 버려지면 같은 시작 위치의 더 짧은 일치를 다시 본다.
 * ⚠️ 시도 코드 표는 데이터 확인 대상이다(보고서 이관 메모).
 */
final class InstNameMatcher {

    static final class Row {
        final String id;
        final String nameKo;
        final String regionCode;

        Row(String id, String nameKo, String regionCode) {
            this.id = id;
            this.nameKo = nameKo;
            this.regionCode = regionCode;
        }
    }

    static final class Found {
        final String instId;
        final int start;
        final int end;

        Found(String instId, int start, int end) {
            this.instId = instId;
            this.start = start;
            this.end = end;
        }
    }

    static final class Normalized {
        final String text;
        final int[] orig;   // 정규화 글자 i 가 원문의 몇 번째 글자에서 왔나

        Normalized(String text, int[] orig) {
            this.text = text;
            this.orig = orig;
        }
    }

    private static final String AMBIGUOUS = "\u0000";

    /** 법인 접두 — 사전 등록 때 뗀다(데이터 점검 반영). */
    private static final String[] CORP_PREFIXES = {"재단법인", "사단법인", "의료법인", "(재)", "(사)"};

    /** 이 글자로 이어지면 기관 이름이 아니라 다른 낱말의 앞부분이다. */
    private static final String[] GLUED_WORDS = {"청년", "청소년", "청사", "청렴", "시민", "도민", "군민", "구민"};

    /** 시도 코드 → 접두(긴 것부터). */
    static final Map<String, String[]> SIDO_PREFIXES;
    /** 띄어쓰기 없이 떼도 되는 정식 이름(…특별시·광역시·도·특별자치시). */
    private static final Set<String> FORMAL;

    static {
        Map<String, String[]> m = new HashMap<String, String[]>();
        m.put("11", new String[]{"서울특별시", "서울시", "서울"});
        m.put("26", new String[]{"부산광역시", "부산시", "부산"});
        m.put("27", new String[]{"대구광역시", "대구시", "대구"});
        m.put("28", new String[]{"인천광역시", "인천시", "인천"});
        m.put("29", new String[]{"광주광역시", "광주시", "광주"});
        m.put("30", new String[]{"대전광역시", "대전시", "대전"});
        m.put("31", new String[]{"울산광역시", "울산시", "울산"});
        m.put("36", new String[]{"세종특별자치시", "세종시", "세종"});
        m.put("41", new String[]{"경기도", "경기"});
        m.put("42", new String[]{"강원특별자치도", "강원도", "강원"});
        m.put("51", new String[]{"강원특별자치도", "강원도", "강원"});
        m.put("43", new String[]{"충청북도", "충북"});
        m.put("44", new String[]{"충청남도", "충남"});
        m.put("45", new String[]{"전북특별자치도", "전라북도", "전북"});
        m.put("52", new String[]{"전북특별자치도", "전라북도", "전북"});
        // 46 = 전남광주통합특별시(데이터 점검 11-20). 옛 광주(29)·전남 표기도 같은 시도로 본다. 전남광주통합특별시 행은 시도급으로 인식된다.
        m.put("46", new String[]{"전남광주통합특별시", "전남광주", "광주광역시", "광주시", "광주", "전라남도", "전남"});
        m.put("47", new String[]{"경상북도", "경북"});
        m.put("48", new String[]{"경상남도", "경남"});
        m.put("50", new String[]{"제주특별자치도", "제주도", "제주"});
        SIDO_PREFIXES = Collections.unmodifiableMap(m);
        Set<String> formal = new HashSet<String>();
        for (String[] ps : m.values()) {
            for (String p : ps) {
                if (p.endsWith("특별시") || p.endsWith("광역시") || p.endsWith("도") || p.endsWith("특별자치시")) {
                    formal.add(p);
                }
            }
        }
        FORMAL = Collections.unmodifiableSet(formal);
    }

    private static final class Node {
        Map<Character, Node> next;
        String instId;
        boolean current;
    }

    private final Node root = new Node();

    private InstNameMatcher() {
    }

    private static final class Forms {
        String name = "";
        String body = "";
        String core = "";
        String[] prefixes;
        boolean stripped;
        boolean district;
        boolean sidoLevel;

        static Forms of(Row r) {
            Forms f = new Forms();
            String raw = stripCorp(r.nameKo == null ? "" : r.nameKo.trim());
            f.name = normalize(raw);
            f.prefixes = SIDO_PREFIXES.get(trim(r.regionCode));
            f.body = f.name;
            if (f.prefixes != null) {
                for (String p : f.prefixes) {
                    if (f.name.equals(p) || f.name.equals(p + "청")) {
                        f.sidoLevel = true;
                        break;
                    }
                    if (raw.startsWith(p + " ") || (FORMAL.contains(p) && f.name.startsWith(p))) {
                        f.body = f.name.substring(p.length());
                        f.stripped = true;
                        break;
                    }
                }
            }
            f.district = f.body.matches("[가-힣]{1,10}(?:구|시|군)청?");
            f.core = f.body.matches(".+(?:구|시|군)청") ? f.body.substring(0, f.body.length() - 1) : f.body;
            return f;
        }

        List<String> variants(boolean isCur, Map<String, Integer> coreCount) {
            List<String> out = new ArrayList<String>();
            if (sidoLevel) {
                if (prefixes != null) {
                    for (String p : prefixes) {
                        out.add(p);
                        out.add(p + "청");
                    }
                }
                return out;
            }
            if (stripped) {
                out.add(name);
            }
            if (district && prefixes != null) {
                for (String p : prefixes) {
                    out.add(p + core);
                    out.add(p + core + "청");
                }
            }
            Integer n = coreCount.get(core);
            // 접두를 뗀 '일반 이름'(예: 경기도교육청 → 교육청)은 맨몸으로 넣지 않는다 — 흔한 낱말이 다른 기관으로 잡힌다.
            boolean bare = isCur || ((!stripped || district) && core.length() >= 3 && n != null && n == 1);
            if (bare) {
                out.add(body);
                out.add(core);
                if (district) {
                    out.add(core + "청");
                }
            }
            return out;
        }
    }

    /** 맨 앞의 법인 접두를 뗀다(여러 개 겹쳐도 반복). 전각 괄호는 반각으로 본다. 접두만 있는 이름은 그대로 둔다. */
    static String stripCorp(String raw) {
        String n = raw == null ? "" : raw.trim().replace('（', '(').replace('）', ')');
        boolean again = true;
        while (again) {
            again = false;
            for (String c : CORP_PREFIXES) {
                if (n.startsWith(c) && n.length() > c.length()) {
                    n = n.substring(c.length()).trim();
                    again = true;
                    break;
                }
            }
        }
        return n;
    }

    static InstNameMatcher build(List<Row> rows, String currentId) {
        Row cur = null;
        Map<String, Integer> coreCount = new HashMap<String, Integer>();
        List<Forms> forms = new ArrayList<Forms>(rows.size());
        for (Row r : rows) {
            Forms f = Forms.of(r);
            forms.add(f);
            Integer c = coreCount.get(f.core);
            coreCount.put(f.core, c == null ? 1 : c + 1);
            if (r.id != null && r.id.equals(currentId)) {
                cur = r;
            }
        }
        String curRegion = cur == null ? null : trim(cur.regionCode);
        boolean curSidoLevel = cur != null && Forms.of(cur).sidoLevel;
        Set<String> current = new HashSet<String>();
        Map<String, String> owner = new HashMap<String, String>();
        String[] curPs = curRegion == null ? null : SIDO_PREFIXES.get(curRegion);
        if (curPs != null) {
            for (String p : curPs) {
                current.add(p);
                current.add(p + "청");
            }
        }
        for (int i = 0; i < rows.size(); i++) {
            Row r = rows.get(i);
            Forms f = forms.get(i);
            if (r.id == null || f.name.isEmpty()) {
                continue;
            }
            boolean sameSido = curRegion != null && curRegion.equals(trim(r.regionCode));
            boolean isCur = r.id.equals(currentId) || (sameSido && (f.sidoLevel || curSidoLevel));
            for (String v : f.variants(isCur, coreCount)) {
                if (v.length() < (isCur ? 2 : 3)) {
                    continue;
                }
                if (isCur) {
                    current.add(v);
                    continue;
                }
                String prev = owner.put(v, r.id);
                if (prev != null && !prev.equals(r.id)) {
                    owner.put(v, AMBIGUOUS);
                }
            }
        }
        InstNameMatcher m = new InstNameMatcher();
        for (String v : current) {
            m.insert(v, null, true);
        }
        for (Map.Entry<String, String> e : owner.entrySet()) {
            if (!AMBIGUOUS.equals(e.getValue()) && !current.contains(e.getKey())) {
                m.insert(e.getKey(), e.getValue(), false);
            }
        }
        return m;
    }

    private void insert(String v, String instId, boolean current) {
        Node n = root;
        for (int i = 0; i < v.length(); i++) {
            if (n.next == null) {
                n.next = new HashMap<Character, Node>();
            }
            Character c = v.charAt(i);
            Node k = n.next.get(c);
            if (k == null) {
                k = new Node();
                n.next.put(c, k);
            }
            n = k;
        }
        if (current) {
            n.current = true;
            n.instId = null;
        } else if (!n.current) {
            n.instId = instId;
        }
    }

    /** 원문 정보 없이 찾는다(공백 구분 불가 — 붙은 것으로 본다). 시험·단순 호출용. */
    List<Found> scan(String s) {
        return scan(s, null, null);
    }

    /**
     * 정규화된 글에서 다른 기관 이름을 찾는다(현재 기관·현재 시도는 소비만). 낱말 경계에 걸린 일치는 버린다 —
     * 단 원문에서 일치 끝과 다음 글자 사이에 공백이 있었으면 버리지 않는다('서초구청 사업'). 가장 긴 일치가 버려지면 같은 시작의 더 짧은 일치를 본다.
     *
     * @param orig 정규화 글자 → 원문 글자 위치({@link Normalized#orig}). null 이면 공백 판단을 하지 않는다.
     * @param raw  정규화 전 원문
     */
    List<Found> scan(String s, int[] orig, String raw) {
        List<Found> out = new ArrayList<Found>();
        int i = 0;
        int n = s.length();
        while (i < n) {
            Node node = root;
            List<Node> hitNodes = null;
            List<Integer> hitEnds = null;
            for (int j = i; j < n && node != null; j++) {
                node = node.next == null ? null : node.next.get(s.charAt(j));
                if (node != null && (node.current || node.instId != null)) {
                    if (hitNodes == null) {
                        hitNodes = new ArrayList<Node>(2);
                        hitEnds = new ArrayList<Integer>(2);
                    }
                    hitNodes.add(node);
                    hitEnds.add(j + 1);
                }
            }
            Node best = null;
            int bestEnd = -1;
            if (hitNodes != null) {
                for (int k = hitNodes.size() - 1; k >= 0; k--) {   // 긴 것부터
                    int end = hitEnds.get(k);
                    if (!glued(s, i, end) || spaceBetween(raw, orig, end)) {
                        best = hitNodes.get(k);
                        bestEnd = end;
                        break;
                    }
                }
            }
            if (best == null) {
                i++;                       // 서울청년·세종청사·부산시민 — 이름이 아니라 다른 낱말의 앞부분
                continue;
            }
            if (!best.current) {
                out.add(new Found(best.instId, i, bestEnd));
            }
            i = bestEnd;
        }
        return out;
    }

    /** 일치 끝(정규화 위치 end)의 앞 글자와 다음 글자 사이, 원문에 공백(줄바꿈 포함)이 있었는가. */
    private static boolean spaceBetween(String raw, int[] orig, int end) {
        if (raw == null || orig == null || end <= 0 || end >= orig.length) {
            return false;
        }
        int a = orig[end - 1];
        int b = Math.min(orig[end], raw.length());
        for (int k = a + 1; k < b; k++) {
            char c = raw.charAt(k);
            if (Character.isWhitespace(c) || Character.isSpaceChar(c)) {
                return true;
            }
        }
        return false;
    }

    /** 일치([start, end)) 바로 뒤가 다른 낱말로 이어지는가 — 뒤 글자부터이거나, 일치의 마지막 글자(청·시·군·구·도)를 낱말의 첫 글자로 겹쳐 쓰는 경우. */
    private static boolean glued(String s, int start, int end) {
        for (String w : GLUED_WORDS) {
            if (s.startsWith(w, end)) {
                return true;
            }
            if (end - 1 > start && s.charAt(end - 1) == w.charAt(0) && s.startsWith(w, end - 1)) {
                return true;
            }
        }
        return false;
    }

    static String normalize(String s) {
        return normalizeWithMap(s).text;
    }

    /** NFKC(한글 음절·ASCII 는 그대로) + 공백·제로폭·소프트하이픈 제거 + 영문 소문자. '|' 는 남긴다. */
    static Normalized normalizeWithMap(String s) {
        String in = s == null ? "" : s;
        StringBuilder out = new StringBuilder(in.length());
        int[] map = new int[in.length() + 1];
        int n = 0;
        for (int i = 0; i < in.length(); i++) {
            char c = in.charAt(i);
            if (skip(c)) {
                continue;
            }
            if (n >= map.length) {
                map = Arrays.copyOf(map, map.length * 2 + 8);
            }
            if (c < 0x80 || (c >= 0xAC00 && c <= 0xD7A3)) {
                out.append(lower(c));
                map[n++] = i;
                continue;
            }
            String t = Normalizer.normalize(String.valueOf(c), Normalizer.Form.NFKC);
            for (int k = 0; k < t.length(); k++) {
                char d = t.charAt(k);
                if (skip(d)) {
                    continue;
                }
                if (n >= map.length) {
                    map = Arrays.copyOf(map, map.length * 2 + 8);
                }
                out.append(lower(d));
                map[n++] = i;
            }
        }
        return new Normalized(out.toString(), Arrays.copyOf(map, n));
    }

    private static char lower(char c) {
        return c >= 'A' && c <= 'Z' ? (char) (c + 32) : c;
    }

    private static boolean skip(char c) {
        return Character.isWhitespace(c) || Character.isSpaceChar(c)
                || c == (char) 0x200B || c == (char) 0x200C || c == (char) 0x200D || c == (char) 0xFEFF || c == (char) 0x00AD;
    }

    /** 원문 기준 앞뒤 12자 문맥. 제어·서식 문자 제거, '|'→' / ', 80자 상한. 로그·DB 에 남기지 않는다(호출자 책임). */
    static String context(String raw, Normalized nz, Found f) {
        int a = nz.orig[f.start];
        int b = nz.orig[f.end - 1] + 1;
        int from = Math.max(0, a - 12);
        int to = Math.min(raw.length(), b + 12);
        String s = raw.substring(from, to).replace("|", " / ")
                .replaceAll("[\\p{Cc}\\p{Cf}]", " ").replaceAll("\\s+", " ").trim();
        s = (from > 0 ? "…" : "") + s + (to < raw.length() ? "…" : "");
        return s.length() > 80 ? s.substring(0, 80) : s;
    }

    private static String trim(String v) {
        return v == null ? null : v.trim();
    }
}
