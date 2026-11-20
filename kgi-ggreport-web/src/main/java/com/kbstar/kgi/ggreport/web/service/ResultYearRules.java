package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BankContract;
import java.util.*;

/**
 * 약정 → 귀속 목표 연도(입찰한 해, 사용자 11-20). 정본 한 곳 — 105 이월과 104 성과가 같이 쓴다.
 * ① 그 기관에 기록된 RFP 협약 개시일(INST_BID_TERM, 목표 연도 → YYYY-MM-DD)과 약정 시작이 같으면 그 목표 연도.
 * ② 아니면(기록 없음·여러 해와 겹침) 104 추정 TargetResultRules.targetYearOf(1월 개시 = 전년도) — 기록이 없으면 104 와 결과가 같다.
 */
final class ResultYearRules {
    private static final List<String> RANK_ORDER = Arrays.asList("FIRST", "SECOND", "JOINT", "NONE");   // TargetResultRules 와 같은 순서
    private ResultYearRules() { }

    static Integer yearOf(String termFrom, Map<Integer, String> starts) {
        if (termFrom == null) return null;
        if (starts != null) {
            Integer hit = null;
            for (Map.Entry<Integer, String> e : starts.entrySet()) {
                String d = e.getValue();
                if (d == null) continue;
                boolean match = termFrom.length() >= 10 ? d.equals(termFrom.substring(0, 10)) : d.startsWith(termFrom);
                if (!match) continue;
                if (hit != null && !hit.equals(e.getKey())) return TargetResultRules.targetYearOf(termFrom);   // 모호 — 추정으로
                hit = e.getKey();
            }
            if (hit != null) return hit;
        }
        return TargetResultRules.targetYearOf(termFrom);
    }

    /** TargetResultRules.resultLines 와 같은 선택(순위마다 시작이 가장 이른 줄, 같으면 번호 큰 쪽), 귀속만 yearOf. */
    static List<BankContract> linesOf(List<BankContract> all, int year, Map<Integer, String> starts) {
        Map<String, BankContract> byRank = new HashMap<String, BankContract>();
        if (all != null) for (BankContract c : all) {
            Integer ty = yearOf(c.getTermFrom(), starts);
            if (ty == null || ty.intValue() != year) continue;
            String k = c.getRankCd() == null ? "" : c.getRankCd();
            BankContract cur = byRank.get(k);
            if (cur == null) { byRank.put(k, c); continue; }
            int r = c.getTermFrom().compareTo(cur.getTermFrom());
            if (r < 0 || (r == 0 && c.getContractNo() > cur.getContractNo())) byRank.put(k, c);
        }
        List<BankContract> out = new ArrayList<BankContract>(byRank.values());
        Collections.sort(out, new Comparator<BankContract>() {
            @Override public int compare(BankContract a, BankContract b) {
                int x = RANK_ORDER.indexOf(a.getRankCd()), y = RANK_ORDER.indexOf(b.getRankCd());
                return (x < 0 ? 99 : x) - (y < 0 ? 99 : y);
            }
        });
        return out;
    }

    /** 판정일이 지난 뒤의 결과 — 줄 없음 = UNREGISTERED, 국민은행 줄 = SUCCESS, 그 밖 = FAIL(TargetResultRules.judge 와 같은 코드값). */
    static String verdict(List<BankContract> all, Map<Integer, String> starts, int year) {
        List<BankContract> ls = linesOf(all, year, starts);
        if (ls.isEmpty()) return TargetResultRules.UNREGISTERED;
        for (BankContract c : ls) if (BankYears.KB_BANK.equals(c.getBankCd())) return TargetResultRules.SUCCESS;
        return TargetResultRules.FAIL;
    }
}
