package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BankContract;
import java.time.LocalDate;
import java.util.*;

/**
 * 금고 약정 기록(039)의 최신 유효 줄로 연도별 '국민은행 유치' 상태를 계산한다(새 표 없음, 순수 로직).
 * 상태: KB(그 해에 걸친 국민은행 줄 있음) · OTHER(기록된 줄은 있으나 국민은행 없음) · NO_RECORD(기록 없음 — '국민은행 아님'이 아니다).
 * 시작(TERM_FROM)을 모르는 줄은 끝 해에만 걸친 것으로 본다(확실한 해만). 1·2금고 구분 없이 어느 순위든 국민은행이면 KB.
 */
final class BankYears {
    static final String KB_BANK = "B02";   // 039 코드표 'KB국민은행'
    static final String KB = "KB", OTHER = "OTHER", NO_RECORD = "NO_RECORD";
    static final int MAX_SPAN = 40, DEFAULT_BACK = 16, DEFAULT_AHEAD = 4;

    private BankYears() { }

    static Integer yearOf(String t) {
        if (t == null || t.length() < 4) return null;
        for (int i = 0; i < 4; i++) { char ch = t.charAt(i); if (ch < '0' || ch > '9') return null; }
        return Integer.valueOf(t.substring(0, 4));
    }

    static boolean covers(String from, String to, int year) {
        Integer t = yearOf(to);
        if (t == null) return false;
        Integer f = from == null ? t : yearOf(from);
        return f != null && f <= year && year <= t;
    }

    static String yearState(List<BankContract> lines, int year) {
        boolean any = false;
        for (BankContract c : safe(lines)) {
            if (!covers(c.getTermFrom(), c.getTermTo(), year)) continue;
            if (KB_BANK.equals(c.getBankCd())) return KB;
            any = true;
        }
        return any ? OTHER : NO_RECORD;
    }

    /** 오늘 기준(039 termState CURRENT 와 같은 판정). */
    static String nowState(List<BankContract> lines, LocalDate today) {
        boolean any = false;
        for (BankContract c : safe(lines)) {
            if (!"CURRENT".equals(BankContractRules.termState(c.getTermFrom(), c.getTermTo(), today))) continue;
            if (KB_BANK.equals(c.getBankCd())) return KB;
            any = true;
        }
        return any ? OTHER : NO_RECORD;
    }

    /** 국민은행 줄의 가장 늦은 끝 해(없으면 null). '예전엔 국민은행'(되찾기) 표시는 kb_now≠KB 이고 이 값 < 올해일 때 — 판단은 화면. */
    static Integer lastKbYear(List<BankContract> lines) {
        Integer max = null;
        for (BankContract c : safe(lines)) {
            if (!KB_BANK.equals(c.getBankCd())) continue;
            Integer y = yearOf(c.getTermTo());
            if (y != null && (max == null || y > max)) max = y;
        }
        return max;
    }

    static Map<String, Object> summary(List<BankContract> lines, LocalDate today) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("kb_now", nowState(lines, today));
        m.put("last_kb_year", lastKbYear(lines));
        List<Map<String, Object>> now = new ArrayList<Map<String, Object>>();
        for (BankContract c : safe(lines)) {
            if ("CURRENT".equals(BankContractRules.termState(c.getTermFrom(), c.getTermTo(), today))) now.add(line(c, true));
        }
        m.put("lines_now", now);
        m.put("record_count", safe(lines).size());
        return m;
    }

    static List<Map<String, Object>> table(List<BankContract> lines, int from, int to) {
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        for (int y = from; y <= to; y++) {
            List<Map<String, Object>> banks = new ArrayList<Map<String, Object>>();
            for (BankContract c : safe(lines)) if (covers(c.getTermFrom(), c.getTermTo(), y)) banks.add(line(c, false));
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("year", y);
            m.put("state", yearState(lines, y));
            m.put("banks", banks);
            out.add(m);
        }
        return out;
    }

    private static Map<String, Object> line(BankContract c, boolean withTerm) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("contract_no", c.getContractNo());
        m.put("rank_cd", c.getRankCd());
        m.put("bank_cd", c.getBankCd());
        m.put("bank_name", BankContractRules.BANK_ETC.equals(c.getBankCd()) ? c.getBankNameEtc() : c.getBankName());
        if (withTerm) { m.put("term_from", c.getTermFrom()); m.put("term_to", c.getTermTo()); }
        return m;
    }

    private static List<BankContract> safe(List<BankContract> l) { return l == null ? Collections.<BankContract>emptyList() : l; }
}
