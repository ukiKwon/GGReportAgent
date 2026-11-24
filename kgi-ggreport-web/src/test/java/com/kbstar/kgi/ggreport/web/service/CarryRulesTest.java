package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BankContract;
import com.kbstar.kgi.ggreport.web.domain.BidTarget;
import org.junit.Test;
import java.time.LocalDate;
import java.time.MonthDay;
import java.util.*;
import static org.junit.Assert.*;

/** 자동 이월 판정(NEXT 105) — 순수 단위. 연도는 가상(2029·2030)이라 시험 날짜와 무관하다. */
public class CarryRulesTest {
    private static final MonthDay DFLT = MonthDay.of(1, 1);
    private static final Map<Integer, String> NONE = Collections.<Integer, String>emptyMap();

    private static BidTarget goal(int no, int year) {
        BidTarget t = new BidTarget();
        t.setInstitutionId("x"); t.setTargetNo(no); t.setRevNo(1); t.setActionCd("SAVE"); t.setKindCd("GOAL"); t.setTargetYear(year);
        t.setTagCd("NEW");
        return t;
    }
    /** 원천 no 에서 넘어온 기록(최신 행). action = CARRY(손 안 탐) | SAVE(사람이 고침) | CANCEL. */
    private static BidTarget carried(int no, int fromNo, String kind, String action, String cancelReason) {
        BidTarget t = new BidTarget();
        t.setInstitutionId("x"); t.setTargetNo(no); t.setRevNo(action.equals("CARRY") ? 1 : 2); t.setActionCd(action); t.setKindCd(kind);
        t.setTargetYear("GOAL".equals(kind) ? Integer.valueOf(2030) : null);
        t.setFirstActionCd("CARRY"); t.setFirstCarryFromNo(fromNo); t.setFirstKindCd(kind); t.setCancelReasonCd(cancelReason);
        return t;
    }
    private static BidTarget watch(int no) {
        BidTarget t = new BidTarget();
        t.setInstitutionId("x"); t.setTargetNo(no); t.setRevNo(1); t.setActionCd("SAVE"); t.setKindCd("WATCH");
        return t;
    }
    private static BankContract line(String bank, String from) {
        BankContract c = new BankContract();
        c.setContractNo(1); c.setRankCd("FIRST"); c.setBankCd(bank); c.setTermFrom(from);
        return c;
    }
    private static Map<Integer, String> starts(int year, String d) { Map<Integer, String> m = new HashMap<Integer, String>(); m.put(year, d); return m; }
    private static CarryRules.Decision decide(BidTarget src, List<BidTarget> all, List<BankContract> lines, Map<Integer, String> st, LocalDate today) {
        return CarryRules.decide(src, all, lines, st, today, DFLT);
    }

    @Test public void 개시일_기록_없고_기본일_뒤_약정_없음은_다음_해_목표() {
        BidTarget s = goal(1, 2029);
        CarryRules.Decision d = decide(s, Arrays.asList(s), null, NONE, LocalDate.of(2030, 1, 2));
        assertTrue(d.due); assertEquals("UNREGISTERED", d.verdict);
        assertEquals("GOAL", d.carryKind); assertEquals(Integer.valueOf(2030), d.carryYear);
    }

    @Test public void 기본일_전이면_보류() {
        BidTarget s = goal(1, 2029);
        CarryRules.Decision d = decide(s, Arrays.asList(s), null, NONE, LocalDate.of(2029, 12, 31));
        assertFalse(d.due); assertTrue(d.isEmpty());
    }

    @Test public void 기록된_개시일_전이면_보류() {
        BidTarget s = goal(1, 2029);
        CarryRules.Decision d = decide(s, Arrays.asList(s), null, starts(2029, "2030-03-01"), LocalDate.of(2030, 2, 28));
        assertFalse(d.due); assertTrue(d.isEmpty());
    }

    @Test public void 개시일과_약정_시작이_같으면_그_목표_연도로_귀속되어_달성() {
        BidTarget s = goal(1, 2029);
        List<BankContract> lines = Arrays.asList(line("B02", "2030-03-01"));
        CarryRules.Decision d = decide(s, Arrays.asList(s), lines, starts(2029, "2030-03-01"), LocalDate.of(2030, 3, 1));
        assertEquals("SUCCESS", d.verdict); assertNull(d.carryKind);
        // 개시일 기록이 없으면 104 추정(3월 시작 = 시작 연도 2030 귀속)이라 2029 목표는 줄 없음
        CarryRules.Decision n = decide(s, Arrays.asList(s), lines, NONE, LocalDate.of(2030, 3, 1));
        assertEquals("UNREGISTERED", n.verdict); assertEquals("GOAL", n.carryKind);
    }

    @Test public void 다른_은행_약정은_FAIL_관심으로() {
        BidTarget s = goal(1, 2029);
        CarryRules.Decision d = decide(s, Arrays.asList(s), Arrays.asList(line("B03", "2030-01-01")), NONE, LocalDate.of(2030, 1, 2));
        assertEquals("FAIL", d.verdict); assertEquals("WATCH", d.carryKind); assertNull(d.carryYear);
    }

    @Test public void 손_안_탄_이월이_있는데_개시일을_미래로_고치면_거둔다() {
        BidTarget s = goal(1, 2029), c = carried(2, 1, "GOAL", "CARRY", null);
        CarryRules.Decision d = decide(s, Arrays.asList(s, c), null, starts(2029, "2030-06-01"), LocalDate.of(2030, 1, 2));
        assertEquals(1, d.revoke.size()); assertNull(d.carryKind);
    }

    @Test public void 올해_원천은_개시일_뒤_다음_해_목표_원천_자신은_막지_않는다() {
        BidTarget s = goal(1, 2030);
        CarryRules.Decision d = decide(s, Arrays.asList(s), null, starts(2030, "2030-07-01"), LocalDate.of(2030, 7, 2));
        assertEquals("GOAL", d.carryKind); assertEquals(Integer.valueOf(2031), d.carryYear);
    }

    @Test public void 사람별_관심은_목표_이월을_막지_않는다() {   // 061
        BidTarget s = goal(1, 2029), w = watch(2); w.setWatchEmpNo("3918264");
        assertEquals("GOAL", decide(s, Arrays.asList(s, w), null, NONE, LocalDate.of(2030, 1, 2)).carryKind);
    }

    @Test public void 이월_관심은_같은_주인_관심이_있을_때만_막힌다() {   // 061
        BidTarget s = goal(1, 2029); s.setOwnerEmpNo("3918264");
        BidTarget mine = watch(2); mine.setWatchEmpNo("3918264");
        BidTarget other = watch(3); other.setWatchEmpNo("5047192");
        List<BankContract> fail = Arrays.asList(line("B03", "2030-01-01"));
        assertNull(decide(s, Arrays.asList(s, mine), fail, NONE, LocalDate.of(2030, 1, 2)).carryKind);
        assertEquals("WATCH", decide(s, Arrays.asList(s, other), fail, NONE, LocalDate.of(2030, 1, 2)).carryKind);
    }

    @Test public void 이월_관심_주인은_주담당_처음요청자_처음입력자_순() {   // 061
        BidTarget s = goal(1, 2029); s.setFirstEditorEmpNo("1111111");
        assertEquals("1111111", CarryRules.watchOwnerOf(s));
        s.setFirstRequesterEmpNo("2222222"); assertEquals("2222222", CarryRules.watchOwnerOf(s));
        s.setOwnerEmpNo("3333333"); assertEquals("3333333", CarryRules.watchOwnerOf(s));
    }

    @Test public void 원천이_올해_목표인데_FAIL이면_관심으로_이월하지_않는다() {
        BidTarget s = goal(1, 2030);
        CarryRules.Decision d = decide(s, Arrays.asList(s), Arrays.asList(line("B03", "2030-01-01")), starts(2030, "2030-01-01"), LocalDate.of(2030, 2, 1));
        assertEquals("FAIL", d.verdict); assertNull(d.carryKind); assertTrue(d.revoke.isEmpty());
    }

    @Test public void 원천이_올해_목표이고_손_안_탄_관심_이월이_있으면_거둔다() {
        BidTarget s = goal(1, 2030), c = carried(2, 1, "WATCH", "CARRY", null);
        CarryRules.Decision d = decide(s, Arrays.asList(s, c), Arrays.asList(line("B03", "2030-01-01")), starts(2030, "2030-01-01"), LocalDate.of(2030, 2, 1));
        assertEquals(1, d.revoke.size()); assertNull(d.carryKind);
    }

    @Test public void 사람이_고친_이월은_판정이_바뀌어도_거두지_않는다() {
        BidTarget s = goal(1, 2029), c = carried(2, 1, "GOAL", "SAVE", null);
        CarryRules.Decision d = decide(s, Arrays.asList(s, c), Arrays.asList(line("B02", "2030-01-01")), NONE, LocalDate.of(2030, 1, 2));
        assertEquals("SUCCESS", d.verdict); assertTrue(d.revoke.isEmpty());
    }

    @Test public void 사람이_뺀_이월은_다시_넘기지_않는다() {
        BidTarget s = goal(1, 2029), c = carried(2, 1, "GOAL", "CANCEL", "DROPPED");
        CarryRules.Decision d = decide(s, Arrays.asList(s, c), null, NONE, LocalDate.of(2030, 1, 2));
        assertNull(d.carryKind);
    }

    @Test public void 자동_취소된_이월은_다시_미달성이면_다시_넘긴다() {
        BidTarget s = goal(1, 2029), c = carried(2, 1, "GOAL", "CANCEL", "CARRY_REVOKED");
        CarryRules.Decision d = decide(s, Arrays.asList(s, c), null, NONE, LocalDate.of(2030, 1, 2));
        assertEquals("GOAL", d.carryKind);
    }

    @Test public void 이월_구분이_바뀌면_거두고_새로_넘긴다() {
        BidTarget s = goal(1, 2029), c = carried(2, 1, "GOAL", "CARRY", null);
        CarryRules.Decision d = decide(s, Arrays.asList(s, c), Arrays.asList(line("B03", "2030-01-01")), NONE, LocalDate.of(2030, 1, 2));
        assertEquals(1, d.revoke.size()); assertEquals("WATCH", d.carryKind);
    }
}
