package com.kbstar.kgi.ggreport.web.support;

import java.net.URI;
import java.net.URISyntaxException;

/** http(s) 출처 링크 글자 검사 — 기관 편집(InstitutionEditRules.url)과 사업계획 반입(PlanCsv)이 같이 쓴다(보안 검토 2026-11-16 조건 4). 서버는 이 주소를 열지 않는다. */
public final class SafeUrl {

    public static final int MAX = 500;

    private SafeUrl() {
    }

    /** v 는 앞뒤 공백을 자른 값. 제어·공백·DEL·서식 문자(U+202E·U+200B 등), http(s) 아님, 호스트 없음, 계정정보 있음이면 false. */
    public static boolean isHttp(String v) {
        if (v == null || v.isEmpty() || v.length() > MAX) {
            return false;
        }
        for (int i = 0; i < v.length(); i++) {
            char c = v.charAt(i);
            if (c <= ' ' || c == 0x7f || Character.getType(c) == Character.FORMAT) {
                return false;
            }
        }
        URI u;
        try {
            u = new URI(v);
        } catch (URISyntaxException e) {
            return false;
        }
        String sc = u.getScheme();
        return sc != null && (sc.equalsIgnoreCase("http") || sc.equalsIgnoreCase("https"))
                && u.getHost() != null && u.getUserInfo() == null;
    }
}
