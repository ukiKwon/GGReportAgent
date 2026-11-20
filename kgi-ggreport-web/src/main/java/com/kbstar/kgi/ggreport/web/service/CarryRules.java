package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BankContract;
import com.kbstar.kgi.ggreport.web.domain.BidTarget;
import java.time.LocalDate;
import java.time.MonthDay;
import java.util.*;

/**
 * 자동 이월 판정(NEXT 105, 사용자 11-20). 목표 연도 Y 의 판정일 = RFP 협약 개시일(INST_BID_TERM), 없으면 (Y+1)년 기본일.
 * 판정일 전 = 보류(이월 안 함, 이미 한 이월은 거둠). 판정일 뒤: SUCCESS = 없음, FAIL = Y+1 관심, 그 밖 = Y+1 목표. 귀속은 ResultYearRules.
 */
final class CarryRules {
    static final class Decision {
        String verdict, carryKind; Integer carryYear; boolean due; LocalDate judgeFrom;
        final List<BidTarget> revoke = new ArrayList<BidTarget>();
        boolean isEmpty() { return carryKind == null && revoke.isEmpty(); }
    }
    private CarryRules() { }

    static String neededKind(String verdict) {
        if (verdict == null || TargetResultRules.SUCCESS.equals(verdict)) return null;
        if (TargetResultRules.FAIL.equals(verdict)) return BidTargetRules.KIND_WATCH;
        return BidTargetRules.KIND_GOAL;
    }

    static LocalDate judgeFrom(int year, Map<Integer, String> starts, MonthDay dflt) {
        String d = starts == null ? null : starts.get(year);
        return d != null ? LocalDate.parse(d) : dflt.atYear(year + 1);
    }

    /** 살아 있는 목표 중 목표 연도가 fromYear~toYear(연도·번호 순). */
    static List<BidTarget> sourcesOf(List<BidTarget> latest, int fromYear, int toYear) {
        List<BidTarget> out = new ArrayList<BidTarget>();
        for (BidTarget t : latest) {
            if (BidTargetRules.KIND_GOAL.equals(BidTargetRules.kindOf(t)) && !BidTargetService.ACTION_CANCEL.equals(t.getActionCd())
                    && t.getTargetYear() != null && t.getTargetYear().intValue() >= fromYear && t.getTargetYear().intValue() <= toYear) out.add(t);
        }
        Collections.sort(out, new Comparator<BidTarget>() {
            @Override public int compare(BidTarget a, BidTarget b) {
                int c = a.getTargetYear().compareTo(b.getTargetYear());
                return c != 0 ? c : a.getTargetNo() - b.getTargetNo();
            }
        });
        return out;
    }

    static boolean isCarryOf(BidTarget t, int fromNo) {
        return BidTargetService.ACTION_CARRY.equals(t.getFirstActionCd()) && t.getFirstCarryFromNo() != null
                && t.getFirstCarryFromNo().intValue() == fromNo;
    }

    static boolean autoRevoked(BidTarget t) {
        return BidTargetService.ACTION_CANCEL.equals(t.getActionCd()) && BidTargetService.CANCEL_CARRY_REVOKED.equals(t.getCancelReasonCd());
    }

    /**
     * latest = 그 기관 모든 기록의 최신 행(뺀 것 포함).
     * ① 이 원천에서 넘어온 기록 중 사람 손을 안 탄 것(최신 행이 CARRY)이 지금 판정과 구분이 다르면 거둔다(보류면 전부 거둠).
     * ② 넘길 구분이 있고, '현재' 기록(관심 또는 올해 이후 목표, S6)이 하나도 없고, 같은 원천·같은 구분의 이월이
     *    자동 취소 말고는 없으면(사람이 뺀 이월은 다시 넘기지 않음) 새로 넘긴다. 원천 자신은 '현재'로 막지 않는다.
     */
    static Decision decide(BidTarget source, List<BidTarget> latest, List<BankContract> lines, Map<Integer, String> starts,
                           LocalDate today, MonthDay dflt) {
        Decision d = new Decision();
        int y = source.getTargetYear().intValue(), thisYear = today.getYear();
        d.judgeFrom = judgeFrom(y, starts, dflt);
        d.due = !today.isBefore(d.judgeFrom);
        d.verdict = d.due ? ResultYearRules.verdict(lines, starts, y) : null;
        String need = neededKind(d.verdict);   // 보류면 null → 손 안 탄 이월은 거둔다
        // 원천 목표가 아직 살아 있는 '현재'(목표 연도 >= 올해)면 관심을 만들지 않는다(관심·목표 동시 존재 금지). GOAL 이월만 허용.
        if (BidTargetRules.KIND_WATCH.equals(need) && y >= thisYear) need = null;
        boolean blocked = false;
        for (BidTarget t : latest) {
            if (t.getTargetNo() == source.getTargetNo()) continue;   // 원천 자신(올해 목표면 '현재'라 막지 않게)
            boolean alive = !BidTargetService.ACTION_CANCEL.equals(t.getActionCd());
            if (isCarryOf(t, source.getTargetNo())) {
                String kind = BidTargetRules.KIND_WATCH.equals(t.getFirstKindCd()) ? BidTargetRules.KIND_WATCH : BidTargetRules.KIND_GOAL;
                if (alive && BidTargetService.ACTION_CARRY.equals(t.getActionCd()) && !kind.equals(need)) { d.revoke.add(t); continue; }
                if (kind.equals(need) && !autoRevoked(t)) blocked = true;
            }
            if (alive && BidTargetRules.isCurrent(t, thisYear)) blocked = true;
        }
        if (need != null && !blocked) {
            d.carryKind = need;
            d.carryYear = BidTargetRules.KIND_GOAL.equals(need) ? Integer.valueOf(y + 1) : null;
        }
        return d;
    }
}
