package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BankContract;
import java.time.LocalDate;
import java.util.*;

/** 협약 성과(NEXT 104) 판정 — 금고 약정(039) 줄만 근거. 추정 없음. 규칙 전문은 설계 보고서 3-1. */
final class TargetResultRules {
    static final String SUCCESS = "SUCCESS", FAIL = "FAIL", PENDING = "PENDING", UNREGISTERED = "UNREGISTERED";
    static final String RETAIN = "RETAIN", NEW = "NEW", BASIS_PRIOR = "PRIOR_CONTRACT", BASIS_TAG = "TARGET_TAG";
    /**
     * 사용자 11-20: Y 목표는 Y년에 협약 달성한 것만 성과. 결정일 칸이 없어 약정 시작으로 귀속 연도를 정한다 —
     * 금고 약정은 보통 입찰 다음 해 1월에 시작하므로 시작 월이 1월이면 (시작 연도 - 1) 목표, 아니면 시작 연도 목표.
     * 약정 한 줄은 한 목표 연도에만 속한다(QA P2-1: 이웃 해 이중 계산 방지). 약정 줄이 없으면(입찰이 안 떠 이월 포함) 실패가 아니라 대기·미등록.
     * 시작이 'YYYY'뿐이면 월을 모른다 — 추정하지 않고 결과로 세지 않는다(true 로 바꾸면 1월 시작으로 본다).
     */
    static final boolean YEAR_ONLY_IS_JANUARY = false;
    static final class Verdict {
        String resultCd, winKind, winKindBasis;
        List<BankContract> lines = Collections.<BankContract>emptyList();
        BankContract kbLine, evidence;
    }

    private TargetResultRules() { }

    /** 개시일 기록 없이(= 기록이 없을 때와 같은 결과). */
    static Verdict judge(List<BankContract> all, String tagCd, int year, int thisYear, Map<String, Object> bidClosed) {
        return judge(all, tagCd, year, thisYear, bidClosed, null, null);
    }

    /**
     * starts = 그 기관의 RFP 협약 개시일 기록(목표 연도 → YYYY-MM-DD, 없으면 null). 귀속은 ResultYearRules.yearOf.
     * 약정 줄이 없을 때 '그 목표 연도의 기록된 개시일이 오늘 또는 그 이전'이면 입찰 결과가 났어야 하므로 ended(UNREGISTERED) —
     * 105 의 판정일(today >= 개시일, CarryRules.decide due)과 같은 기준. 지난 목표 연도라도 기록된 개시일이 오늘보다 뒤면 PENDING(105 보류와 같음, qa P3-4).
     */
    static Verdict judge(List<BankContract> all, String tagCd, int year, int thisYear, Map<String, Object> bidClosed,
                         Map<Integer, String> starts, LocalDate today) {
        List<BankContract> src = all == null ? Collections.<BankContract>emptyList() : all;
        Verdict v = new Verdict();
        v.lines = ResultYearRules.linesOf(src, year, starts);
        if (v.lines.isEmpty()) {
            // 지난 목표 연도여도 그 연도의 기록된 개시일이 아직 안 왔으면 결과가 날 때가 아니다 — 105 CarryRules.decide 의 보류와 같은 기준(qa P3-4).
            // 기록이 없거나 today 가 없으면 기존 그대로. 올해 + 공고 종료 근거(bidClosed)는 근거가 확정이라 그대로 ended.
            boolean ended = (year < thisYear && !startNotYet(starts, year, today)) || (year == thisYear && bidClosed != null) || startPassed(starts, year, today);
            v.resultCd = ended ? UNREGISTERED : PENDING;
            return v;
        }
        for (BankContract c : v.lines) if (BankYears.KB_BANK.equals(c.getBankCd())) { v.kbLine = c; break; }
        if (v.kbLine == null) { v.resultCd = FAIL; v.evidence = v.lines.get(0); return v; }
        v.resultCd = SUCCESS;
        v.evidence = v.kbLine;
        Boolean prior = priorWasKb(src, v.kbLine);
        if (prior != null) { v.winKind = prior ? RETAIN : NEW; v.winKindBasis = BASIS_PRIOR; }
        else { v.winKind = "RETAIN".equals(tagCd) ? RETAIN : NEW; v.winKindBasis = BASIS_TAG; }
        return v;
    }

    /** 약정 시작 → 귀속 목표 연도. 1월 시작은 전년도, 그 밖은 시작 연도. 시작을 모르거나 월이 없거나(YEAR_ONLY_IS_JANUARY=false) 형식이 틀리면 null. */
    static Integer targetYearOf(String from) {
        Integer fy = BankYears.yearOf(from);
        if (fy == null) return null;
        if (from.length() < 7) return YEAR_ONLY_IS_JANUARY ? Integer.valueOf(fy.intValue() - 1) : null;
        String mm = from.substring(5, 7);
        if (from.charAt(4) != '-' || !mm.matches("[0-9]{2}")) return null;
        return "01".equals(mm) ? Integer.valueOf(fy.intValue() - 1) : fy;
    }

    /** 귀속 연도가 year 인 줄 중 순위마다 시작이 가장 이른 줄(같으면 번호 큰 쪽). 귀속을 모르면 제외. 순위 순서 정렬. */
    static List<BankContract> resultLines(List<BankContract> all, int year) {
        return ResultYearRules.linesOf(all, year, null);   // 개시일 기록 없음 = 추정(targetYearOf)과 같은 결과
    }

    private static boolean startNotYet(Map<Integer, String> starts, int year, LocalDate today) {
        if (starts == null || today == null) return false;
        LocalDate s = startOf(starts.get(year));
        return s != null && today.isBefore(s);
    }

    private static boolean startPassed(Map<Integer, String> starts, int year, LocalDate today) {
        if (starts == null || today == null) return false;
        LocalDate s = startOf(starts.get(year));
        return s != null && !today.isBefore(s);   // 당일 포함 = 105 CarryRules.decide 의 due 와 같은 기준
    }

    /** 이긴 줄과 같은 순위에서 먼저 시작한 줄 중 끝이 가장 늦은 줄이 국민은행이었나. 근거 없으면 null. */
    static Boolean priorWasKb(List<BankContract> all, BankContract win) {
        LocalDate ws = startOf(win.getTermFrom());
        if (ws == null) return null;
        BankContract best = null; LocalDate bestEnd = null;
        for (BankContract c : all) {
            if (c == win || !Objects.equals(c.getRankCd(), win.getRankCd())) continue;
            LocalDate cs = startOf(c.getTermFrom() != null ? c.getTermFrom() : c.getTermTo());
            LocalDate ce = BankContractRules.endOrNull(c.getTermTo());
            if (cs == null || ce == null || !cs.isBefore(ws)) continue;
            if (bestEnd == null || ce.isAfter(bestEnd)) { best = c; bestEnd = ce; }
        }
        return best == null ? null : Boolean.valueOf(BankYears.KB_BANK.equals(best.getBankCd()));
    }

    static LocalDate startOf(String t) {
        if (t == null || t.length() < 4) return null;
        try {
            int y = Integer.parseInt(t.substring(0, 4));
            int m = t.length() >= 7 ? Integer.parseInt(t.substring(5, 7)) : 1;
            int d = t.length() >= 10 ? Integer.parseInt(t.substring(8, 10)) : 1;
            return LocalDate.of(y, m, d);
        } catch (RuntimeException e) { return null; }
    }
}
