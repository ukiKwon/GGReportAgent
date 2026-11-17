package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BankContract;
import com.kbstar.kgi.ggreport.web.domain.BidTarget;
import com.kbstar.kgi.ggreport.web.domain.NoticeRoundView;
import com.kbstar.kgi.ggreport.web.dto.BidTargetCancelIn;
import com.kbstar.kgi.ggreport.web.dto.BidTargetIn;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.junit.Test;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import static org.junit.Assert.*;

/** 목표 기관(043) 입력 검사 — DB 없음, 가짜 CodeCheck. */
public class BidTargetRulesTest {
    private static final BankContractRules.CodeCheck CODES = new BankContractRules.CodeCheck() {
        @Override public boolean enabled(String group, String code) {
            return ("TARGET_TAG".equals(group) && ("NEW".equals(code) || "RETAIN".equals(code)))
                    || ("TARGET_CANCEL_REASON".equals(group) && ("WRONG".equals(code) || "ETC".equals(code)));
        }
        @Override public List<String> names(String group) { return Arrays.asList("x"); }
    };

    private static BidTargetIn in(Integer year, String tag) { BidTargetIn i = new BidTargetIn(); i.setTargetYear(year); i.setTagCd(tag); return i; }

    private static int statusOf(Runnable r) {
        try { r.run(); return 0; } catch (ApiException e) { return e.getStatus(); }
    }

    @Test public void 연도를_빼면_넣기는_올해_고치기는_그대로() {
        assertEquals(2026, BidTargetRules.parse(in(null, "NEW"), 2026, null, CODES).year);
        assertEquals(2025, BidTargetRules.parse(in(null, "NEW"), 2026, 2025, CODES).year);   // 지난해 유지 허용
        assertEquals(2025, BidTargetRules.parse(in(2025, "NEW"), 2026, 2025, CODES).year);
    }

    @Test public void 바꾸는_연도가_범위_밖이면_400() {
        assertEquals(400, statusOf(new Runnable() { public void run() { BidTargetRules.parse(in(2025, "NEW"), 2026, null, CODES); } }));
        assertEquals(400, statusOf(new Runnable() { public void run() { BidTargetRules.parse(in(2029, "NEW"), 2026, null, CODES); } }));
        assertEquals(2028, BidTargetRules.parse(in(2028, "NEW"), 2026, null, CODES).year);
    }

    @Test public void 태그와_주_담당_형식() {
        assertEquals(400, statusOf(new Runnable() { public void run() { BidTargetRules.parse(in(null, "ZZ"), 2026, null, CODES); } }));
        final BidTargetIn bad = in(null, "NEW"); bad.setOwnerEmpNo("12ab");
        assertEquals(400, statusOf(new Runnable() { public void run() { BidTargetRules.parse(bad, 2026, null, CODES); } }));
        BidTargetIn blank = in(null, "NEW"); blank.setOwnerEmpNo("  ");
        assertNull(BidTargetRules.parse(blank, 2026, null, CODES).owner);
    }

    @Test public void same_은_네_값_비교() {
        BidTarget c = new BidTarget(); c.setTargetYear(2026); c.setTagCd("NEW"); c.setMemo("a"); c.setOwnerEmpNo(null);
        BidTargetIn i = in(2026, "NEW"); i.setMemo("a");
        assertTrue(BidTargetRules.same(c, BidTargetRules.parse(i, 2026, 2026, CODES)));
        i.setMemo("b");
        assertFalse(BidTargetRules.same(c, BidTargetRules.parse(i, 2026, 2026, CODES)));
    }

    // ---- 044 ----

    private static BankContract term(int no, String rank, String from, String to) {
        BankContract c = new BankContract(); c.setContractNo(no); c.setRankCd(rank); c.setTermFrom(from); c.setTermTo(to); return c;
    }
    private static NoticeRoundView notice(String handledAt, String status, String anchor, String cur) {
        NoticeRoundView n = new NoticeRoundView();
        n.setRoundSeq(1); n.setHandledAt(handledAt); n.setStatusCd(status); n.setAnchorLastBid(anchor); n.setCurLastBid(cur);
        return n;
    }
    private static final LocalDate TODAY = LocalDate.of(2026, 11, 17);

    @Test public void parseWatch_는_연도가_있으면_400_없으면_watch() {
        assertEquals(400, statusOf(new Runnable() { public void run() { BidTargetRules.parseWatch(in(2026, "NEW"), CODES); } }));
        BidTargetRules.Parsed p = BidTargetRules.parseWatch(in(null, "NEW"), CODES);
        assertTrue(p.watch);
    }

    @Test public void same_관심은_연도_null_이고_같은_값이면_true() {
        BidTarget c = new BidTarget(); c.setKindCd("WATCH"); c.setTargetYear(null); c.setTagCd("NEW"); c.setMemo("a");
        BidTargetIn i = in(null, "NEW"); i.setMemo("a");
        assertTrue(BidTargetRules.same(c, BidTargetRules.parseWatch(i, CODES)));
        i.setMemo("b");
        assertFalse(BidTargetRules.same(c, BidTargetRules.parseWatch(i, CODES)));
    }

    @Test public void kind_와_moveKind_빈_값과_이상한_값() {
        assertEquals("GOAL", BidTargetRules.kind(null));
        assertEquals("GOAL", BidTargetRules.kind("  "));
        assertEquals("WATCH", BidTargetRules.kind(" WATCH "));
        assertEquals(400, statusOf(new Runnable() { public void run() { BidTargetRules.kind("X"); } }));
        assertEquals(400, statusOf(new Runnable() { public void run() { BidTargetRules.moveKind(null); } }));
        assertEquals(400, statusOf(new Runnable() { public void run() { BidTargetRules.moveKind(" "); } }));
        assertEquals("GOAL", BidTargetRules.moveKind("GOAL"));
    }

    @Test public void nextTermTo_순위별_가장_늦은_끝_중_가장_이른_것() {
        assertEquals("2027-12-31", BidTargetRules.nextTermTo(Arrays.asList(
                term(1, "FIRST", "2024-01-01", "2027-12-31"), term(2, "SECOND", "2024-01-01", "2029-12-31")), TODAY));
        assertEquals("2030-12-31", BidTargetRules.nextTermTo(Arrays.asList(
                term(1, "FIRST", "2024-01-01", "2026-12-31"), term(2, "FIRST", "2027-01-01", "2030-12-31")), TODAY));
        assertNull(BidTargetRules.nextTermTo(Arrays.asList(
                term(1, "FIRST", "2020-01-01", "2023-12-31"), term(2, "FIRST", "2024-01-01", null)), TODAY));
        assertNull(BidTargetRules.nextTermTo(null, TODAY));
    }

    @Test public void bidClosedBasis_판정() {
        assertNull(BidTargetRules.bidClosedBasis(null, null, TODAY));
        assertNull(BidTargetRules.bidClosedBasis(notice("2025-12-01T09:00:00+09:00", "CLOSED", null, null), null, TODAY));   // 지난해 판정
        NoticeRoundView adv = notice("2026-11-01T09:00:00+09:00", null, "2022-10-18", "2026-10-01");
        adv.setCloseReasonCd("SOURCE_ADVANCED"); adv.setClosedLastBid("2022-10-18");
        assertNull(BidTargetRules.bidClosedBasis(adv, null, TODAY));                                                         // 기관 자료로 닫힘
        Map<String, Object> m = BidTargetRules.bidClosedBasis(notice("2026-11-01T09:00:00+09:00", "CLOSED", null, null), null, TODAY);
        assertEquals("NOTICE_CLOSED", m.get("basis_cd"));
        assertEquals("2026-11-01", m.get("basis_date"));
        assertNull(BidTargetRules.bidClosedBasis(notice("2026-11-01T09:00:00+09:00", "CLOSED", "2022-10-18", "2026-10-01"), null, TODAY));   // 넘어감
        Map<String, Object> f = BidTargetRules.bidClosedBasis(null, Arrays.asList(term(3, "FIRST", "2027-01-01", "2030-12-31")), TODAY);
        assertEquals("CONTRACT_DECIDED", f.get("basis_cd"));
        assertEquals("2027-01-01", f.get("basis_date"));
    }

    @Test public void 취소_기타는_글이_필요하고_이름은_422() {
        final BidTargetCancelIn c = new BidTargetCancelIn(); c.setCancelReasonCd("ETC");
        assertEquals(400, statusOf(new Runnable() { public void run() { BidTargetRules.parseCancel(c, CODES); } }));
        c.setCancelReasonEtc("홍길동 주무관 요청");
        assertEquals(422, statusOf(new Runnable() { public void run() { BidTargetRules.parseCancel(c, CODES); } }));
        c.setCancelReasonEtc("담당 변경");
        assertEquals("담당 변경", BidTargetRules.parseCancel(c, CODES).reasonEtc);
        final BidTargetCancelIn w = new BidTargetCancelIn(); w.setCancelReasonCd("WRONG"); w.setCancelReasonEtc("x");
        assertEquals(400, statusOf(new Runnable() { public void run() { BidTargetRules.parseCancel(w, CODES); } }));
    }
}
