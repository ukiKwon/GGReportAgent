package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BankContract;
import org.junit.Test;

import java.time.LocalDate;
import java.util.*;

import static org.junit.Assert.*;

/** 협약 성과 판정(NEXT 104) 순수 시험 — 스프링·DB 없음. 줄 입력 → 판정. */
public class TargetResultRulesTest {
    private static final int Y = 2026;

    private static BankContract line(int no, String rank, String bank, String from, String to) {
        BankContract c = new BankContract();
        c.setInstitutionId("t1"); c.setContractNo(no); c.setRevNo(1);
        c.setRankCd(rank); c.setBankCd(bank); c.setTermFrom(from); c.setTermTo(to);
        return c;
    }
    private static List<BankContract> L(BankContract... c) { return Arrays.asList(c); }
    private static Map<String, Object> basis(String cd) { Map<String, Object> m = new HashMap<String, Object>(); m.put("basis_cd", cd); return m; }

    @Test public void 이긴_줄이_2금고_국민은행이면_성공_순위_SECOND() {
        TargetResultRules.Verdict v = TargetResultRules.judge(L(line(1, "SECOND", "B02", "2027-01", "2030-12")), "NEW", Y, Y, null);
        assertEquals(TargetResultRules.SUCCESS, v.resultCd);
        assertEquals("SECOND", v.kbLine.getRankCd());
    }
    @Test public void 결과_줄이_다른_은행뿐이면_실패() {
        assertEquals(TargetResultRules.FAIL, TargetResultRules.judge(L(line(1, "FIRST", "B03", "2027-01", "2030-12")), "NEW", Y, Y, null).resultCd);
    }
    @Test public void 줄이_없고_지난해면_결과_미등록() {
        assertEquals(TargetResultRules.UNREGISTERED, TargetResultRules.judge(L(), "NEW", Y - 1, Y, null).resultCd);
    }
    @Test public void 줄이_없고_다음해_이후면_결과_대기() {
        assertEquals(TargetResultRules.PENDING, TargetResultRules.judge(null, "NEW", Y + 1, Y, null).resultCd);
    }
    @Test public void 올해_줄_없고_끝남_근거_없으면_대기() {
        assertEquals(TargetResultRules.PENDING, TargetResultRules.judge(L(), "NEW", Y, Y, null).resultCd);
    }
    @Test public void 올해_줄_없고_공고_종료_근거가_있으면_미등록() {
        assertEquals(TargetResultRules.UNREGISTERED, TargetResultRules.judge(L(), "NEW", Y, Y, basis("NOTICE_CLOSED")).resultCd);
        assertEquals(TargetResultRules.UNREGISTERED, TargetResultRules.judge(L(), "NEW", Y, Y, basis("NOTICE_NO_BID")).resultCd);
    }
    @Test public void 올해_줄_없고_창_밖_약정으로만_결정된_근거여도_미등록() {
        assertEquals(TargetResultRules.UNREGISTERED, TargetResultRules.judge(L(), "NEW", Y, Y, basis("CONTRACT_DECIDED")).resultCd);
    }
    @Test public void 시작을_모르는_줄은_결과로_세지_않는다() {
        assertEquals(TargetResultRules.UNREGISTERED, TargetResultRules.judge(L(line(1, "FIRST", "B02", null, "2030-12")), "NEW", Y - 1, Y, null).resultCd);
        assertEquals(TargetResultRules.PENDING, TargetResultRules.judge(L(line(1, "FIRST", "B02", null, "2030-12")), "NEW", Y, Y, null).resultCd);
    }
    @Test public void 귀속_연도가_다른_줄은_제외() {
        assertEquals(TargetResultRules.PENDING, TargetResultRules.judge(L(line(1, "FIRST", "B02", (Y - 1) + "-01", "2030-12")), "NEW", Y, Y, null).resultCd);
        assertEquals(TargetResultRules.PENDING, TargetResultRules.judge(L(line(1, "FIRST", "B02", (Y + 2) + "-01", "2034-12")), "NEW", Y, Y, null).resultCd);
        assertEquals(TargetResultRules.SUCCESS, TargetResultRules.judge(L(line(1, "FIRST", "B02", Y + "-07", "2030-12")), "NEW", Y, Y, null).resultCd);
    }
    @Test public void 같은_순위_직전이_국민은행이면_재유치() {
        TargetResultRules.Verdict v = TargetResultRules.judge(L(line(1, "FIRST", "B02", "2023-01", "2026-12"), line(2, "FIRST", "B02", "2027-01", "2030-12")), "NEW", Y, Y, null);
        assertEquals(TargetResultRules.RETAIN, v.winKind);
        assertEquals(TargetResultRules.BASIS_PRIOR, v.winKindBasis);
    }
    @Test public void 같은_순위_직전이_다른_은행이면_신규() {
        TargetResultRules.Verdict v = TargetResultRules.judge(L(line(1, "FIRST", "B03", "2023-01", "2026-12"), line(2, "FIRST", "B02", "2027-01", "2030-12")), "RETAIN", Y, Y, null);
        assertEquals(TargetResultRules.NEW, v.winKind);
        assertEquals(TargetResultRules.BASIS_PRIOR, v.winKindBasis);
    }
    @Test public void 직전_약정이_없으면_목표_구분으로_대신하고_근거를_드러낸다() {
        TargetResultRules.Verdict v = TargetResultRules.judge(L(line(2, "FIRST", "B02", "2027-01", "2030-12")), "RETAIN", Y, Y, null);
        assertEquals(TargetResultRules.RETAIN, v.winKind);
        assertEquals(TargetResultRules.BASIS_TAG, v.winKindBasis);
    }
    @Test public void 다른_순위의_이전_줄은_직전으로_치지_않는다() {
        TargetResultRules.Verdict v = TargetResultRules.judge(L(line(1, "SECOND", "B02", "2023-01", "2026-12"), line(2, "FIRST", "B02", "2027-01", "2030-12")), "NEW", Y, Y, null);
        assertEquals(TargetResultRules.NEW, v.winKind);
        assertEquals(TargetResultRules.BASIS_TAG, v.winKindBasis);
    }
    @Test public void 한쪽_순위만_국민은행이어도_성공() {
        TargetResultRules.Verdict v = TargetResultRules.judge(L(line(1, "FIRST", "B03", "2027-01", "2030-12"), line(2, "SECOND", "B02", "2027-01", "2030-12")), "NEW", Y, Y, null);
        assertEquals(TargetResultRules.SUCCESS, v.resultCd);
        assertEquals("SECOND", v.kbLine.getRankCd());
        assertEquals(2, v.lines.size());
    }
    @Test public void 같은_순위에_시작이_다른_두_줄이면_이른_쪽이_결과() {
        TargetResultRules.Verdict v = TargetResultRules.judge(L(line(1, "FIRST", "B03", Y + "-03", "2030-12"), line(2, "FIRST", "B02", "2027-01", "2030-12")), "NEW", Y, Y, null);
        assertEquals(TargetResultRules.FAIL, v.resultCd);
    }
    @Test public void 기타_은행_직접_입력은_국민은행이_아니다() {
        assertEquals(TargetResultRules.FAIL, TargetResultRules.judge(L(line(1, "FIRST", "ETC", "2027-01", "2030-12")), "NEW", Y, Y, null).resultCd);
    }

    // ── 패리티 표(portal.js P.decided ↔ 보고서) — 프런트 frontend/test 에도 같은 이름·같은 입력으로 둔다 ──
    @Test public void 패리티_kept_지금_국민은행_시작전_국민은행은_성공_재유치() {
        TargetResultRules.Verdict v = TargetResultRules.judge(L(line(1, "FIRST", "B02", "2023-01", "2026-12"), line(2, "FIRST", "B02", "2027-01", "2030-12")), "NEW", Y, Y, null);
        assertEquals(TargetResultRules.SUCCESS, v.resultCd); assertEquals(TargetResultRules.RETAIN, v.winKind);
    }
    @Test public void 패리티_won_지금_다른은행_시작전_국민은행은_성공_신규() {
        TargetResultRules.Verdict v = TargetResultRules.judge(L(line(1, "FIRST", "B03", "2023-01", "2026-12"), line(2, "FIRST", "B02", "2027-01", "2030-12")), "NEW", Y, Y, null);
        assertEquals(TargetResultRules.SUCCESS, v.resultCd); assertEquals(TargetResultRules.NEW, v.winKind);
    }
    @Test public void 패리티_next_시작전이_다른은행이면_실패() {
        assertEquals(TargetResultRules.FAIL, TargetResultRules.judge(L(line(1, "FIRST", "B02", "2023-01", "2026-12"), line(2, "FIRST", "B03", "2027-01", "2030-12")), "NEW", Y, Y, null).resultCd);
    }
    @Test public void 패리티_KB_NEXT_기사만으로는_성공이_아니다_약정줄_없음() {
        assertEquals(TargetResultRules.PENDING, TargetResultRules.judge(L(line(1, "FIRST", "B03", "2023-01", "2026-12")), "NEW", Y, Y, null).resultCd);
    }
    @Test public void 패리티_ended_올해_공고종료는_미등록_근거없으면_대기() {
        assertEquals(TargetResultRules.UNREGISTERED, TargetResultRules.judge(L(), "NEW", Y, Y, basis("NOTICE_CLOSED")).resultCd);
        assertEquals(TargetResultRules.PENDING, TargetResultRules.judge(L(), "NEW", Y, Y, null).resultCd);
    }

    // ── 보는 사람(F1 허용 목록) ──
    @Test public void 영업_계열과_디자이너와_전산_계열은_볼_수_있다() {
        for (String r : new String[]{"영업팀", "영업팀장", "영업부장", "디자이너", "전산팀", "전산팀장"}) assertTrue(r, TargetResultService.canView(r));
    }
    @Test public void 앞뒤_공백은_정리하고_NBSP는_거부() {
        assertTrue(TargetResultService.canView(" 영업팀 "));
        assertFalse(TargetResultService.canView("영업팀\u00A0"));
        assertFalse(TargetResultService.canView("\u00A0영업팀"));
    }
    @Test public void 예산_재무_모르는_역할_빈값은_거부() {
        for (String r : new String[]{"예산팀", "예산팀장", "재무팀", "예산부장", "재무부장", "영업", "영업팀팀", "마스터", "", null}) assertFalse(String.valueOf(r), TargetResultService.canView(r));
    }

    // ── F3 가림 ──
    @Test public void 기타_사유가_검사에_걸리면_가린다() {
        assertEquals("기타(가림)", TargetResultService.safeFree("문의 010-1234-5678"));
        assertEquals("예산 사정으로 포기", TargetResultService.safeFree("예산 사정으로 포기"));
        assertNull(TargetResultService.safeFree(null));
    }

    @Test public void 귀속_연도_경계값_1월_시작은_전년도_목표() {
        assertEquals(Integer.valueOf(Y - 1), TargetResultRules.targetYearOf(Y + "-01"));
        assertEquals(Integer.valueOf(Y - 1), TargetResultRules.targetYearOf(Y + "-01-15"));
        assertEquals(Integer.valueOf(Y), TargetResultRules.targetYearOf(Y + "-02"));
        assertEquals(Integer.valueOf(Y), TargetResultRules.targetYearOf(Y + "-07"));
        assertEquals(Integer.valueOf(Y), TargetResultRules.targetYearOf((Y + 1) + "-01"));
        assertEquals(Integer.valueOf(Y), TargetResultRules.targetYearOf(Y + "-12-31"));
        assertNull(TargetResultRules.targetYearOf(String.valueOf(Y)));   // 연도만 — 월을 모르면 귀속 불명
        assertNull(TargetResultRules.targetYearOf(Y + "-xx"));
        assertNull(TargetResultRules.targetYearOf(null));
    }
    @Test public void 이웃_연도에_이중_계산되지_않는다() {
        List<BankContract> one = L(line(1, "FIRST", "B02", (Y + 1) + "-01", "2031-12"));   // Y 귀속
        assertEquals(TargetResultRules.SUCCESS, TargetResultRules.judge(one, "NEW", Y, Y, null).resultCd);
        assertEquals(TargetResultRules.PENDING, TargetResultRules.judge(one, "NEW", Y + 1, Y, null).resultCd);
        assertEquals(TargetResultRules.UNREGISTERED, TargetResultRules.judge(one, "NEW", Y - 1, Y, null).resultCd);
        List<BankContract> two = L(line(1, "FIRST", "B02", Y + "-07", "2030-12"), line(2, "FIRST", "B03", (Y + 1) + "-07", "2031-12"));
        assertEquals(1, TargetResultRules.judge(two, "NEW", Y, Y, null).evidence.getContractNo());
        assertEquals(TargetResultRules.FAIL, TargetResultRules.judge(two, "NEW", Y + 1, Y, null).resultCd);
        assertEquals(2, TargetResultRules.judge(two, "NEW", Y + 1, Y, null).evidence.getContractNo());
    }
    @Test public void 공동_지정_JOINT_국민은행도_성공() {
        TargetResultRules.Verdict v = TargetResultRules.judge(L(line(1, "JOINT", "B02", "2027-01", "2030-12")), "NEW", Y, Y, null);
        assertEquals(TargetResultRules.SUCCESS, v.resultCd);
        assertEquals("JOINT", v.kbLine.getRankCd());
    }
    // ── RFP 협약 개시일 기록(INST_BID_TERM)으로 귀속 — 105 ResultYearRules (사용자 11-20: 성과 귀속 = 입찰한 해) ──
    private static Map<Integer, String> st(int y, String d) { Map<Integer, String> m = new HashMap<Integer, String>(); m.put(y, d); return m; }

    @Test public void 개시일_기록이_있으면_3월_개시도_입찰한_해로_귀속() {
        List<BankContract> l = L(line(1, "FIRST", "B02", "2027-03-01", "2030-12"));
        LocalDate today = LocalDate.of(2026, 11, 20);
        TargetResultRules.Verdict v = TargetResultRules.judge(l, "NEW", 2026, 2026, null, st(2026, "2027-03-01"), today);
        assertEquals(TargetResultRules.SUCCESS, v.resultCd);
        assertEquals(1, v.lines.size());
        assertTrue(TargetResultRules.judge(l, "NEW", 2027, 2026, null, st(2026, "2027-03-01"), today).lines.isEmpty());
    }
    @Test public void 개시일_기록이_없으면_기존_규칙() {
        List<BankContract> l = L(line(1, "FIRST", "B02", "2027-03-01", "2030-12"));
        LocalDate today = LocalDate.of(2026, 11, 20);
        assertTrue(TargetResultRules.judge(l, "NEW", 2026, 2026, null, null, today).lines.isEmpty());
        assertTrue(TargetResultRules.judge(l, "NEW", 2026, 2026, null, new HashMap<Integer, String>(), today).lines.isEmpty());
        assertEquals(TargetResultRules.judge(l, "NEW", 2027, 2026, null).resultCd,
                TargetResultRules.judge(l, "NEW", 2027, 2026, null, null, today).resultCd);
    }
    @Test public void 기록된_개시일이_지났는데_약정이_없으면_미등록() {
        assertEquals(TargetResultRules.UNREGISTERED, TargetResultRules.judge(L(), "NEW", Y, Y, null, st(Y, Y + "-03-01"), LocalDate.of(Y, 11, 20)).resultCd);
        assertEquals(TargetResultRules.PENDING, TargetResultRules.judge(L(), "NEW", Y, Y, null, null, LocalDate.of(Y, 11, 20)).resultCd);
    }
    @Test public void 개시일이_아직이면_대기() {
        assertEquals(TargetResultRules.PENDING, TargetResultRules.judge(L(), "NEW", Y, Y, null, st(Y, Y + "-12-31"), LocalDate.of(Y, 11, 20)).resultCd);
    }
    @Test public void 개시일_당일은_지난_것으로_본다() {
        LocalDate today = LocalDate.of(Y, 11, 20);
        assertEquals(TargetResultRules.UNREGISTERED, TargetResultRules.judge(L(), "NEW", Y, Y, null, st(Y, today.toString()), today).resultCd);
    }
}
