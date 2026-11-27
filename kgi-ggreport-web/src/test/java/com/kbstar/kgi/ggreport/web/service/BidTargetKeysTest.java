package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BankContract;
import com.kbstar.kgi.ggreport.web.domain.BidTarget;
import com.kbstar.kgi.ggreport.web.domain.BidTargetReqItem;
import com.kbstar.kgi.ggreport.web.domain.TargetCaseRef;
import com.kbstar.kgi.ggreport.web.dto.BidTargetIn;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.*;

/** NEXT 125 — 목표 건 키(BidTargetKeys)·기타 금고 방식 이름(BidTargetRules.aimEtc) 순수 로직. DB 없음. */
public class BidTargetKeysTest {
    private static final BankContractRules.CodeCheck CODES = new BankContractRules.CodeCheck() {
        @Override public boolean enabled(String group, String code) {
            return ("BID_SUBJECT".equals(group) && ("MAIN_BANK".equals(code) || "CORP_CARD".equals(code) || "ETC".equals(code)))
                    || ("TARGET_AIM_RANK".equals(group) && ("FIRST".equals(code) || "SECOND".equals(code) || "OTHER".equals(code)))
                    || ("TARGET_TAG".equals(group) && "NEW".equals(code));
        }
        @Override public List<String> names(String group) { return Arrays.asList("x"); }
    };

    private static int statusOf(Runnable r) {
        try { r.run(); return 0; } catch (ApiException e) { return e.getStatus(); }
    }

    private static BidTargetKeys.Slot slot(int no, int year, String subject, String etc, String aim) {
        return new BidTargetKeys.Slot(no, Integer.valueOf(year), subject, etc, aim);
    }

    // ---- 기타 금고 방식 이름 ----

    @Test public void 기타를_고르면_이름_1_30자가_필수이고_정리해서_저장한다() {
        assertEquals("가상 공동금고", BidTargetRules.aimEtc("가상 공동금고", "OTHER"));
        assertEquals("가상 공동금고", BidTargetRules.aimEtc(" 가상　공동금고 ", "OTHER"));
        assertEquals("AB", BidTargetRules.aimEtc("ＡＢ", "OTHER"));   // NFKC
        assertEquals(400, statusOf(new Runnable() { public void run() { BidTargetRules.aimEtc(null, "OTHER"); } }));
        assertEquals(400, statusOf(new Runnable() { public void run() { BidTargetRules.aimEtc("   ", "OTHER"); } }));
        final StringBuilder s31 = new StringBuilder();
        for (int i = 0; i < 31; i++) s31.append('가');
        assertEquals(400, statusOf(new Runnable() { public void run() { BidTargetRules.aimEtc(s31.toString(), "OTHER"); } }));
        assertEquals(400, statusOf(new Runnable() { public void run() { BidTargetRules.aimEtc("a\u0007b", "OTHER"); } }));   // 제어문자
    }

    @Test public void 기타가_아닌데_이름이_오면_400_없으면_null() {
        assertEquals(400, statusOf(new Runnable() { public void run() { BidTargetRules.aimEtc("x", "FIRST"); } }));
        assertEquals(400, statusOf(new Runnable() { public void run() { BidTargetRules.aimEtc("x", null); } }));
        assertNull(BidTargetRules.aimEtc(null, "FIRST"));
        assertNull(BidTargetRules.aimEtc("", null));
    }

    @Test public void common_이_기타_이름을_Parsed에_담고_금칙어는_422() {
        BidTargetIn in = new BidTargetIn();
        in.setAimRankCd("OTHER"); in.setAimRankEtc("가상 공동금고");
        BidTargetRules.Parsed p = BidTargetRules.parse(in, 2026, null, CODES);
        assertEquals("OTHER", p.aim);
        assertEquals("가상 공동금고", p.aimEtc);
        BidTargetIn ph = new BidTargetIn();
        ph.setAimRankCd("OTHER"); ph.setAimRankEtc("연락 010-1234-5678");
        assertTrue(statusOf(() -> BidTargetRules.parse(ph, 2026, null, CODES)) >= 400);
    }

    @Test public void 고치기에서_금고_방식을_안_보내면_코드와_이름이_그대로이고_이름만_바꾸면_CHANGE() {
        BidTarget cur = new BidTarget();
        cur.setAimRankCd("OTHER"); cur.setAimRankEtc("옛 이름");
        BidTargetIn in = new BidTargetIn();
        BidTargetRules.Parsed p = BidTargetRules.parse(in, 2026, 2026, CODES);
        BidTargetRules.keepUnsent(p, null, null, cur);
        assertEquals("OTHER", p.aim);
        assertEquals("옛 이름", p.aimEtc);
        assertNull(BidTargetRules.aimEdit(cur, p));
        p.aimEtc = "새 이름";
        assertEquals(BidTargetRules.AIM_CHANGE, BidTargetRules.aimEdit(cur, p));
    }

    // ---- 정렬값 ----

    @Test public void aimSort_코드순_정하지_않음_90_금고_밖_99() {
        assertEquals(1, BidTargetKeys.aimSort("MAIN_BANK", "FIRST", Integer.valueOf(1)));
        assertEquals(5, BidTargetKeys.aimSort("MAIN_BANK", "OTHER", Integer.valueOf(5)));
        assertEquals(90, BidTargetKeys.aimSort("MAIN_BANK", null, null));
        assertEquals(99, BidTargetKeys.aimSort("CORP_CARD", null, null));
        assertEquals(89, BidTargetKeys.aimSort("MAIN_BANK", "ZZ", null));
    }

    // ---- 키 규칙 ----

    @Test public void etcKey_는_공백_전각_NFKC_소문자를_같게_본다() {
        String base = BidTargetKeys.etcKey("법인카드");
        assertEquals(base, BidTargetKeys.etcKey("법인카드　"));
        assertEquals(base, BidTargetKeys.etcKey("법인카드 "));
        assertEquals(BidTargetKeys.etcKey("fund"), BidTargetKeys.etcKey("ＦＵＮＤ"));
        assertEquals("", BidTargetKeys.etcKey(null));
    }

    @Test public void 스위치가_꺼지면_1금고_2금고_쌍도_충돌_켜지면_통과() {
        List<BidTargetKeys.Slot> pair = Arrays.asList(slot(1, 2026, "MAIN_BANK", null, "FIRST"), slot(2, 2026, "MAIN_BANK", null, "SECOND"));
        assertNotNull(BidTargetKeys.conflictOf(pair, false));
        assertNull(BidTargetKeys.conflictOf(pair, true));
    }

    @Test public void 기타는_혼자_같은_칸에_기타_두_건이나_기타와_1금고는_충돌() {
        assertNotNull(BidTargetKeys.conflictOf(Arrays.asList(slot(1, 2026, "MAIN_BANK", null, "OTHER"), slot(2, 2026, "MAIN_BANK", null, "OTHER")), true));
        assertNotNull(BidTargetKeys.conflictOf(Arrays.asList(slot(1, 2026, "MAIN_BANK", null, "OTHER"), slot(2, 2026, "MAIN_BANK", null, "FIRST")), true));
        assertNotNull(BidTargetKeys.conflictOf(Arrays.asList(slot(1, 2026, "MAIN_BANK", null, null), slot(-1, 2026, "MAIN_BANK", null, "FIRST")), true));
        assertNull(BidTargetKeys.conflictOf(Arrays.asList(slot(1, 2026, "MAIN_BANK", null, "FIRST"), slot(2, 2027, "MAIN_BANK", null, "FIRST")), true));   // 연도가 다르면 다른 칸
        assertNull(BidTargetKeys.conflictOf(Arrays.asList(slot(1, 2026, "MAIN_BANK", null, null), slot(2, 2026, "CORP_CARD", null, null)), false));   // 대상이 다르면 다른 칸
    }

    @Test public void 기타_대상은_이름까지_같아야_같은_칸() {
        assertNotNull(BidTargetKeys.conflictOf(Arrays.asList(slot(1, 2026, "ETC", "가상 사업", null), slot(2, 2026, "ETC", "가상　사업", null)), true));
        assertNull(BidTargetKeys.conflictOf(Arrays.asList(slot(1, 2026, "ETC", "가상 사업", null), slot(2, 2026, "ETC", "다른 사업", null)), true));
    }

    @Test public void 비금고_새_건은_스위치_꺼짐이면_400_기존_건_고치기는_통과() {
        assertEquals(400, statusOf(new Runnable() { public void run() { BidTargetKeys.requireSubjectAllowed("CORP_CARD", true, false); } }));
        BidTargetKeys.requireSubjectAllowed("CORP_CARD", false, false);
        BidTargetKeys.requireSubjectAllowed("CORP_CARD", true, true);
        BidTargetKeys.requireSubjectAllowed("MAIN_BANK", true, false);
    }

    @Test public void 금고_밖_대상에_금고_순위는_400() {
        assertEquals(400, statusOf(new Runnable() { public void run() { BidTargetKeys.requireRankFits("CORP_CARD", "FIRST"); } }));
        BidTargetKeys.requireRankFits("CORP_CARD", null);
        BidTargetKeys.requireRankFits("MAIN_BANK", "FIRST");
    }

    @Test public void subject_는_코드표_검사와_기타_이름_규칙() {
        assertEquals("MAIN_BANK", BidTargetKeys.subject(null, null, CODES)[0]);
        assertEquals("CORP_CARD", BidTargetKeys.subject("CORP_CARD", null, CODES)[0]);
        assertEquals(400, statusOf(new Runnable() { public void run() { BidTargetKeys.subject("NOPE", null, CODES); } }));
        assertEquals(400, statusOf(new Runnable() { public void run() { BidTargetKeys.subject("ETC", null, CODES); } }));
        assertEquals(400, statusOf(new Runnable() { public void run() { BidTargetKeys.subject("CORP_CARD", "x", CODES); } }));
        assertEquals("가상 사업", BidTargetKeys.subject("ETC", "가상 사업", CODES)[1]);
    }

    // ---- 결재 중 칸 ----

    private static BidTargetReqItem item(long req, String op, Integer baseYear, String baseKind, Integer toYear, String subject) {
        BidTargetReqItem x = new BidTargetReqItem();
        x.setReqId(Long.valueOf(req)); x.setOpCd(op); x.setBaseYear(baseYear); x.setBaseKindCd(baseKind); x.setToYear(toYear); x.setBidSubjectCd(subject);
        return x;
    }

    @Test public void pendingBuckets_EDIT_연도_바꾸기는_두_칸_TO_GOAL은_도착_칸만_자기_요청은_뺀다() {
        List<BidTargetReqItem> pend = new ArrayList<>();
        pend.add(item(1, "EDIT", 2026, "GOAL", 2027, "MAIN_BANK"));
        pend.add(item(2, "TO_GOAL", null, "WATCH", 2028, "MAIN_BANK"));
        Set<String> all = BidTargetKeys.pendingBuckets(pend, null);
        assertEquals(3, all.size());
        assertTrue(all.contains(slot(0, 2026, "MAIN_BANK", null, null).bucket()));
        assertTrue(all.contains(slot(0, 2027, "MAIN_BANK", null, null).bucket()));
        assertTrue(all.contains(slot(0, 2028, "MAIN_BANK", null, null).bucket()));
        Set<String> sans1 = BidTargetKeys.pendingBuckets(pend, Long.valueOf(1));
        assertEquals(1, sans1.size());
        assertTrue(sans1.contains(slot(0, 2028, "MAIN_BANK", null, null).bucket()));
    }

    @Test public void 공고일_마감은_YYYY_MM_DD_앞_10자만_읽고_형식_밖이면_null() {
        assertEquals("2026-03-02", BidTargetService.dateOnly("2026-03-02"));
        assertEquals("2026-03-02", BidTargetService.dateOnly("2026-03-02T09:00:00+09:00"));
        assertNull(BidTargetService.dateOnly("미정"));
        assertNull(BidTargetService.dateOnly("2026-13-45"));
        assertNull(BidTargetService.dateOnly(null));
        assertNull(BidTargetService.dateOnly("2026-03"));
    }

    // ---- 약정 줄 거르기 ----

    private static BankContract line(String rank) { BankContract c = new BankContract(); c.setRankCd(rank); return c; }

    @Test public void linesFor_1_2금고_건은_그_순위_줄만_그_밖은_전체() {
        List<BankContract> l = Arrays.asList(line("FIRST"), line("SECOND"));
        assertEquals(1, BidTargetKeys.linesFor(l, "FIRST").size());
        assertEquals("SECOND", BidTargetKeys.linesFor(l, "SECOND").get(0).getRankCd());
        assertEquals(2, BidTargetKeys.linesFor(l, null).size());
        assertEquals(2, BidTargetKeys.linesFor(l, "OTHER").size());
        assertNull(BidTargetKeys.linesFor(null, "FIRST"));
    }

    // ---- 추정 연결 ----

    private static BidTarget goal(int no, int year, String aim) {
        BidTarget t = new BidTarget();
        t.setInstitutionId("nowon"); t.setTargetNo(no); t.setRevNo(1); t.setKindCd("GOAL"); t.setTargetYear(Integer.valueOf(year)); t.setAimRankCd(aim);
        t.setBidSubjectCd("MAIN_BANK");
        return t;
    }

    private static TargetCaseRef kase(String id, String state, String rank) {
        TargetCaseRef c = new TargetCaseRef();
        c.setBidCaseId(id); c.setInstitutionId("nowon"); c.setStateCd(state); c.setBidSubjectCd("MAIN_BANK"); c.setBidRankCd(rank);
        c.setConfirmedAt("2026-03-10T00:00:00+00:00");
        return c;
    }

    @Test public void infer_는_연결_없는_목표_건_1개와_진행_중_제안_1개일_때만() {
        Map<String, Map<String, String>> marks = new HashMap<>();
        Map<String, String> r = BidTargetKeys.infer(Collections.singletonList(goal(1, 2026, null)),
                Collections.singletonList(kase("c1", "IN_PROGRESS", null)), marks);
        assertEquals("c1", r.get("nowon#1"));
        // 진행 중이 아닌 제안(취소)은 후보가 아니다
        assertTrue(BidTargetKeys.infer(Collections.singletonList(goal(1, 2026, null)),
                Collections.singletonList(kase("c1", "CANCELLED", null)), marks).isEmpty());
        // 순위가 어긋나면 후보가 아니다
        assertTrue(BidTargetKeys.infer(Collections.singletonList(goal(1, 2026, "FIRST")),
                Collections.singletonList(kase("c1", "IN_PROGRESS", "SECOND")), marks).isEmpty());
        // 탈락(RESULT=LOST)한 건은 막는 활성이 아니라 후보가 아니다
        Map<String, String> lost = new HashMap<>(); lost.put("RESULT", "LOST");
        marks.put("c1", lost);
        assertTrue(BidTargetKeys.infer(Collections.singletonList(goal(1, 2026, null)),
                Collections.singletonList(kase("c1", "IN_PROGRESS", null)), marks).isEmpty());
        // 이미 명시 연결된 건은 후보가 아니다
        BidTarget linked = goal(1, 2026, null); linked.setBidCaseId("c1");
        assertTrue(BidTargetKeys.infer(Collections.singletonList(goal(2, 2026, null)),
                Collections.singletonList(kase("c1", "IN_PROGRESS", null)), new HashMap<String, Map<String, String>>()).containsKey("nowon#2"));
        assertTrue(BidTargetKeys.infer(Arrays.asList(linked, goal(2, 2026, null)),
                Collections.singletonList(kase("c1", "IN_PROGRESS", null)), new HashMap<String, Map<String, String>>()).isEmpty());
    }
}
