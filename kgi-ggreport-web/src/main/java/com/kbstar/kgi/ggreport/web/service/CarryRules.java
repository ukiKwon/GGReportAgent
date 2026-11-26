package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BankContract;
import com.kbstar.kgi.ggreport.web.domain.BidTarget;
import java.time.LocalDate;
import java.time.MonthDay;
import java.util.*;

/**
 * 자동 이월 판정(NEXT 105, 사용자 11-20; 11-26 미달성→다음 해 목표 이월 폐지). 목표 연도 Y 의 판정일 = RFP 협약 개시일(INST_BID_TERM), 없으면 (Y+1)년 기본일.
 * 판정일 전 = 보류(관심 이월은 안 함, 이미 한 관심 이월은 거둠). 판정일 뒤: FAIL(다른 은행 약정) = 담당자 관심 이월, 그 밖(SUCCESS·미달성) = 없음. 귀속은 ResultYearRules.
 * 옛 GOAL 이월 행(ACTION_CD=CARRY, 첫 구분 GOAL)은 읽기만 하고 거두지도 새로 만들지도 않는다.
 */
final class CarryRules {
    static final class Decision {
        String verdict, carryKind; boolean due; LocalDate judgeFrom;
        final List<BidTarget> revoke = new ArrayList<BidTarget>();
        boolean isEmpty() { return carryKind == null && revoke.isEmpty(); }
    }
    private CarryRules() { }

    /** 11-26 — 다른 은행 약정(FAIL)만 관심으로 넘긴다. 미달성(약정 없음)은 다음 해 목표로 넘기지 않는다(기관은 3·4년 단위). */
    static String neededKind(String verdict) {
        return TargetResultRules.FAIL.equals(verdict) ? BidTargetRules.KIND_WATCH : null;
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

    /** 061 — 미달성 이월 관심의 주인: 원천 목표의 주 담당 → 처음 요청자 → 처음 입력자(사용자 11-24 결정). */
    static String watchOwnerOf(BidTarget source) {
        if (source.getOwnerEmpNo() != null) return source.getOwnerEmpNo();
        return source.getFirstRequesterEmpNo() != null ? source.getFirstRequesterEmpNo() : source.getFirstEditorEmpNo();
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
        String owner = watchOwnerOf(source);
        for (BidTarget t : latest) {
            if (t.getTargetNo() == source.getTargetNo()) continue;   // 원천 자신(올해 목표면 '현재'라 막지 않게)
            boolean alive = !BidTargetService.ACTION_CANCEL.equals(t.getActionCd());
            if (isCarryOf(t, source.getTargetNo())) {
                String kind = BidTargetRules.KIND_WATCH.equals(t.getFirstKindCd()) ? BidTargetRules.KIND_WATCH : BidTargetRules.KIND_GOAL;
                if (alive && BidTargetService.ACTION_CARRY.equals(t.getActionCd()) && BidTargetRules.KIND_WATCH.equals(kind) && !kind.equals(need)) { d.revoke.add(t); continue; }   // 11-26 — 옛 GOAL 이월 행은 거두지 않는다(그대로 둠)
                if (kind.equals(need) && !autoRevoked(t)) blocked = true;
            }
            if (!alive) continue;
            if (BidTargetRules.KIND_WATCH.equals(BidTargetRules.kindOf(t))) {   // 061 — 관심은 사람별: 목표 이월은 막지 않고, 같은 주인 관심만 관심 이월을 막는다
                if (BidTargetRules.KIND_WATCH.equals(need) && owner != null && owner.equals(t.getWatchEmpNo())) blocked = true;
                continue;
            }
            if (BidTargetRules.isCurrent(t, thisYear)) blocked = true;
        }
        if (need != null && !blocked) d.carryKind = need;   // 11-26 — 관심(WATCH)뿐, 목표 연도 없음
        return d;
    }
}
