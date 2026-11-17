package com.kbstar.kgi.ggreport.web.service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 이전 출처 도메인 — URL 에서 호스트만(소문자, 맨 앞 'www.' 하나 제거). 전체 URL 은 같은 파일을 다시 받게 하므로 쓰지 않는다(사용자 Q2).
 * 'www.' 만 떼는 이유: www 유무로 두 줄이 갈리지 않게. 등록 도메인(공개 접미사)까지 줄이지 않는다 — 폐쇄망이라 목록이 없다.
 * URI 파서 대신 앞부분 정규식 — 경로의 공백·한글 때문에 호스트를 놓치지 않게.
 */
final class PlanCollectRules {

    static final int MAX_DOMAINS = 5;
    static final int MAX_CHARS = 300;
    private static final Pattern AUTHORITY = Pattern.compile("(?i)^https?://(?:[^/?#@\\s]*@)?([^/?#:\\s]+)");
    private static final Pattern HOST = Pattern.compile(
            "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+");

    private PlanCollectRules() {
    }

    static String domainOf(String url) {
        if (url == null) return null;
        String t = url.trim();
        if (t.isEmpty() || t.length() > 1000) return null;
        Matcher m = AUTHORITY.matcher(t);
        if (!m.find()) return null;
        String h = m.group(1).toLowerCase(Locale.ROOT);
        if (h.endsWith(".")) h = h.substring(0, h.length() - 1);
        if (h.startsWith("www.") && h.indexOf('.', 4) > 0) h = h.substring(4);
        return h.length() <= 100 && HOST.matcher(h).matches() ? h : null;
    }

    /** 순서 유지·중복 제거·최대 5개·합계 300자. 하나도 없으면 null. */
    static String joinDomains(List<String> urls) {
        LinkedHashSet<String> set = new LinkedHashSet<>();
        if (urls != null) {
            for (String u : urls) {
                String d = domainOf(u);
                if (d != null) set.add(d);
                if (set.size() >= MAX_DOMAINS) break;
            }
        }
        StringBuilder sb = new StringBuilder();
        for (String d : set) {
            int add = (sb.length() > 0 ? 1 : 0) + d.length();
            if (sb.length() + add > MAX_CHARS) break;
            if (sb.length() > 0) sb.append(',');
            sb.append(d);
        }
        return sb.length() == 0 ? null : sb.toString();
    }

    static List<String> splitDomains(String joined) {
        if (joined == null || joined.trim().isEmpty()) return Collections.emptyList();
        return new ArrayList<>(Arrays.asList(joined.split(",")));
    }
}
