package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BidTarget;
import com.kbstar.kgi.ggreport.web.dto.BidTargetCancelIn;
import com.kbstar.kgi.ggreport.web.dto.BidTargetIn;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.junit.Test;
import java.util.Arrays;
import java.util.List;
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
