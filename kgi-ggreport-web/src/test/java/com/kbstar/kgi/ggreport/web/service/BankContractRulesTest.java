package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BankContract;
import com.kbstar.kgi.ggreport.web.dto.BankContractCancelIn;
import com.kbstar.kgi.ggreport.web.dto.BankContractIn;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.junit.Test;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.*;

public class BankContractRulesTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 16);
    private static final List<String> NAMES = Arrays.asList("NH농협은행", "KB국민은행", "신한은행", "우리은행", "하나은행", "IBK기업은행",
            "BNK부산은행", "BNK경남은행", "광주은행", "전북은행", "제주은행", "iM뱅크(구 대구은행)", "수협은행", "기타(직접 입력)");
    private static final Set<String> BANKS_ON = new HashSet<String>(Arrays.asList("B01", "B02", "B03", "B04", "B05", "B06", "B07", "B08",
            "B09", "B10", "B11", "B12", "B13", "ETC"));   // X01·X02 는 ENABLED=0 이라 없다

    private static final BankContractRules.CodeCheck CODES = new BankContractRules.CodeCheck() {
        public boolean enabled(String g, String c) {
            if ("BANK".equals(g)) return BANKS_ON.contains(c);
            if ("BANK_RANK".equals(g)) return Arrays.asList("FIRST", "SECOND", "NONE", "JOINT").contains(c);
            if ("BANK_CONTRACT_SRC".equals(g)) return Arrays.asList("LINK", "DOC_NO", "PRESS", "STAFF").contains(c);
            if ("BANK_CANCEL_REASON".equals(g)) return Arrays.asList("WRONG", "DUP", "CHANGED", "ETC").contains(c);
            if ("BANK_ACCOUNT".equals(g)) return Arrays.asList("GENERAL", "SPECIAL", "FUND", "PART", "ETC").contains(c);
            return false;
        }
        public List<String> names(String g) { return NAMES; }
    };

    private static BankContractIn base() {
        BankContractIn in = new BankContractIn();
        in.setRankCd("FIRST"); in.setBankCd("B04"); in.setTermFrom("2023"); in.setTermTo("2026-12-31");
        in.setSrcKind("DOC_NO"); in.setSrcNo("제2023-154호"); in.setCheckedDate("2026-11-16");
        return in;
    }

    private static BankContractRules.Parsed ok(BankContractIn in) { return BankContractRules.parse(in, "지자체", TODAY, CODES); }

    private static void bad(BankContractIn in) {
        try { ok(in); fail("400 이어야 한다"); } catch (ApiException e) { assertEquals(400, e.getStatus()); }
    }

    @SuppressWarnings("unchecked")
    private static String blocked(BankContractIn in, String code) {
        try { ok(in); fail("422 이어야 한다"); return null; }
        catch (ApiException e) {
            assertEquals(422, e.getStatus());
            Map<String, Object> d = (Map<String, Object>) e.getDetailObject();
            assertEquals(code, d.get("code"));
            return ((List<Map<String, Object>>) d.get("kinds")).get(0).get("kind").toString();
        }
    }

    private static BankContractIn etc(String name) { BankContractIn in = base(); in.setBankCd("ETC"); in.setBankNameEtc(name); return in; }
    private static BankContractIn dept(String d) { BankContractIn in = base(); in.setSrcKind("STAFF"); in.setCheckedDept(d); return in; }

    @Test public void 겹침_확인_이어받기_조건() {
        BankContract prev = new BankContract();
        prev.setRankCd("FIRST"); prev.setBankCd("B04"); prev.setTermFrom("2023"); prev.setTermTo("2026-12-31"); prev.setOverlapConfirmed(1);
        BankContractRules.Parsed p = ok(base());
        assertTrue(BankContractRules.carriesOverlap(prev, p));
        BankContractIn d = base(); d.setTermTo("2027");
        assertFalse(BankContractRules.carriesOverlap(prev, ok(d)));            // 기간 변경
        d = base(); d.setBankCd("B02");
        assertFalse(BankContractRules.carriesOverlap(prev, ok(d)));            // 은행 변경
        d = base(); d.setRankCd("SECOND");
        assertFalse(BankContractRules.carriesOverlap(prev, ok(d)));            // 순위 변경
        prev.setOverlapConfirmed(0);
        assertFalse(BankContractRules.carriesOverlap(prev, p));                // 직전이 확인 안 함
        assertFalse(BankContractRules.carriesOverlap(null, p));
    }

    // ---- 기간·순위 ----
    @Test public void 기간_끝_계산과_범위() {
        assertEquals(LocalDate.of(2026, 12, 31), BankContractRules.end("2026"));
        assertEquals(LocalDate.of(2026, 2, 28), BankContractRules.end("2026-02"));
        for (String s : new String[]{"2026-13", "26", "1989"}) { try { BankContractRules.term(s); fail(s); } catch (ApiException e) { assertEquals(400, e.getStatus()); } }
    }
    @Test public void 기간_상태() {
        assertEquals("PAST", BankContractRules.termState("2019", "2022", TODAY));
        assertEquals("FUTURE", BankContractRules.termState("2027", "2030", TODAY));
        assertEquals("CURRENT", BankContractRules.termState("2023", "2026-12-31", TODAY));
        assertEquals("UNKNOWN", BankContractRules.termState("zz", "2026", TODAY));
    }
    @Test public void 순위는_기관_종류별로_정해진다() {
        assertTrue(BankContractRules.rankAllowed("FIRST", "지자체"));
        assertTrue(BankContractRules.rankAllowed("SECOND", "교육청"));
        assertFalse(BankContractRules.rankAllowed("JOINT", "지자체"));
        assertFalse(BankContractRules.rankAllowed("NONE", "교육청"));
        assertFalse(BankContractRules.rankAllowed("FIRST", "법원"));
        assertFalse(BankContractRules.rankAllowed("SECOND", "공공기관"));
        assertTrue(BankContractRules.rankAllowed("NONE", "법원"));
        assertTrue(BankContractRules.rankAllowed("JOINT", "공공기관"));
        assertTrue(BankContractRules.rankAllowed("FIRST", null));   // TYPE 비어 있으면 막지 않음
    }
    @Test public void 겹침_대상은_공동이면_같은_은행만() {
        assertTrue(BankContractRules.overlapScope("FIRST", "B04", null, "B02", null));
        assertTrue(BankContractRules.overlapScope("JOINT", "B04", null, "B04", null));
        assertFalse(BankContractRules.overlapScope("JOINT", "B04", null, "B02", null));
        assertTrue(BankContractRules.overlapScope("JOINT", "ETC", "SC제일은행", "ETC", "SC 제일은행"));
        assertFalse(BankContractRules.overlapScope("JOINT", "ETC", "SC제일은행", "ETC", "케이뱅크"));
        assertFalse(BankContractRules.overlapScope("NONE", "B04", null, "B04", null));
    }

    // ---- S2 겹침 ----
    @Test public void 겹침_판정() {
        assertTrue(BankContractRules.overlaps("2023", "2026-12-31", "2025", "2027"));
        assertTrue(BankContractRules.overlaps("2023", "2026", "2023", "2026"));            // 완전 같음
        assertFalse(BankContractRules.overlaps("2023", "2026-12-31", "2026", "2029"));     // 끝 2026-12-31 · 시작 2026 — 같은 해라 맞닿음
        assertFalse(BankContractRules.overlaps("2023", "2026-06", "2026-06-15", "2029"));  // 같은 달 맞닿음
        assertFalse(BankContractRules.overlaps("2019", "2022", "2023", "2026"));
        assertFalse(BankContractRules.overlaps("2023", "2026", "2027", "2030"));
        assertTrue(BankContractRules.overlaps(null, "2026", "2024", "2028"));              // 시작 모름 + 상대 끝이 먼저가 아님 → 겹침
        assertFalse(BankContractRules.overlaps(null, "2022", "2023", "2026"));             // 시작 모름이어도 끝이 먼저 오면 겹침 아님
        assertTrue(BankContractRules.rankChecked("FIRST"));
        assertTrue(BankContractRules.rankChecked("SECOND"));
        assertFalse(BankContractRules.rankChecked("NONE"));
        assertFalse(BankContractRules.rankChecked("JOINT"));
    }

    // ---- 맡는 회계 ----
    @Test public void 맡는_회계() {
        BankContractIn a = base(); a.setAccountCd("GENERAL");
        assertEquals("GENERAL", ok(a).account);
        BankContractIn none = base();
        assertNull(ok(none).account);                                                            // 선택 칸
        BankContractIn bad1 = base(); bad1.setAccountCd("NOPE"); bad(bad1);                      // 코드표 밖
        BankContractIn bad2 = base(); bad2.setAccountCd("ETC"); bad(bad2);                       // 기타인데 글 없음
        BankContractIn bad3 = base(); bad3.setAccountCd("GENERAL"); bad3.setAccountEtc("덧붙임"); bad(bad3);
        BankContractIn bad4 = base(); bad4.setAccountEtc("글만"); bad(bad4);
        BankContractIn bad5 = base(); bad5.setAccountCd("ETC"); bad5.setAccountEtc("수​입"); bad(bad5);   // 서식 문자
        BankContractIn ok2 = base(); ok2.setAccountCd("ETC"); ok2.setAccountEtc("상수도 사업"); assertEquals("상수도 사업", ok(ok2).accountEtc);
        BankContractIn pii = base(); pii.setAccountCd("ETC"); pii.setAccountEtc("010-1234-5678");
        assertEquals("휴대폰", blocked(pii, "PII_BLOCKED"));
        try {   // 법원에는 칸 자체를 받지 않음
            BankContractIn court = base(); court.setRankCd("NONE"); court.setAccountCd("GENERAL");
            BankContractRules.parse(court, "법원", TODAY, CODES); fail();
        } catch (ApiException e) { assertEquals(400, e.getStatus()); assertTrue(e.getMessage().contains("회계")); }
    }

    // ---- S3 기타 은행 우회 ----
    @Test public void 기타에_목록_은행을_적으면_400() {
        for (String s : new String[]{"국민은행", "KB국민", "K B 국민", "ＫＢ", "농협", "Ｎ Ｈ 농협은행", "신한", "수협은행", "우리 은행", "하나은행",
                "부산은행", "BNK경남은행", "iM뱅크", "대구은행", "IBK", "기업은행", "NH농협은행"}) bad(etc(s));
    }
    @Test public void 기타에_목록에_없는_은행은_통과() {
        for (String s : new String[]{"SC제일은행", "케이뱅크", "Kbank", "새마을금고", "씨티은행", "신용협동조합"}) assertEquals(s, s, ok(etc(s)).bankEtc);
    }
    @Test public void 목록에_없는_코드_X01은_400() { BankContractIn in = base(); in.setBankCd("X01"); bad(in); }

    // ---- S4 이름+직함 ----
    @Test public void 사람_이름과_직함은_422_NAME() {
        for (String s : new String[]{"홍길동 주무관", "김철수 과장님", "이영희 팀장", "박민수주사", "최영수 씨", "정수진 담당자", "홍길동님", "재정과 홍길동 주무관", "홍길동 주무관은"})
            assertEquals(s, "NAME", blocked(dept(s), "PII_BLOCKED"));
    }
    @Test public void 부서명과_일반_표현은_통과() {
        for (String s : new String[]{"재정과장실", "재정과 담당자", "세무과 팀장", "기획예산과", "재정과 과장", "복지센터 담당자", "고객님", "총무과장 확인",
                "예산담당 주무관", "정책기획과 팀장", "담당자 확인"}) assertEquals(s, s, ok(dept(s)).checkedDept);
    }

    @Test public void 앞에_한글이_붙거나_괄호_직함도_422_NAME() {
        for (String s : new String[]{"재정과홍길동주무관", "재정과 홍길동주무관", "홍길동(주무관)", "재정과 홍길동 (주무관)", "재정과홍길동 과장님"})
            assertEquals(s, "NAME", blocked(dept(s), "PII_BLOCKED"));
    }
    @Test public void 부서명만_있으면_통과() {
        for (String s : new String[]{"재정과 세입팀", "재정과세입팀", "재정과세입팀장", "세입팀(팀장)", "재정과 세입팀 팀장", "기획예산과 담당자"})
            assertEquals(s, s, ok(dept(s)).checkedDept);
    }
    @Test public void 취소_사유_기타의_이름_직함은_422() {
        try { BankContractRules.parseCancel(cancel("ETC", "홍길동 주무관 요청"), CODES); fail(); }
        catch (ApiException e) { assertEquals(422, e.getStatus()); }
        assertEquals("재정과 요청", BankContractRules.parseCancel(cancel("ETC", "재정과 요청"), CODES).reasonEtc);
    }

    // ---- S5 번호·링크 ----
    @Test public void 문서번호_오탐_없음() {
        for (String s : new String[]{"제2023-154호", "공고 제2024-0302호", "2023-1234", "제2025-10호"}) { BankContractIn in = base(); in.setSrcNo(s); assertEquals(s, ok(in).srcNo); }
    }
    @Test public void 번호칸의_전화번호는_422() {
        BankContractIn in = base(); in.setSrcNo("010 1234 5678");
        assertEquals("휴대폰", blocked(in, "PII_BLOCKED"));
        BankContractIn in2 = base(); in2.setSrcNo("02-2148-1234");
        assertEquals("PHONE", blocked(in2, "CONTRACT_FORBIDDEN"));
    }
    @Test public void 링크_쿼리의_전화번호는_422_경로는_안_본다() {
        BankContractIn in = base(); in.setSrcKind("LINK"); in.setSrcNo(null); in.setSrcUrl("https://example.org/bbs/view.do?tel=010-1234-5678");
        assertEquals("휴대폰", blocked(in, "PII_BLOCKED"));
        BankContractIn pass = base(); pass.setSrcKind("LINK"); pass.setSrcNo(null); pass.setSrcUrl("https://example.org/bbs/view.do?idx=154&page=2");
        assertNotNull(ok(pass).srcUrl);
        BankContractIn path = base(); path.setSrcKind("LINK"); path.setSrcNo(null); path.setSrcUrl("https://example.org/010-1234-5678/view");
        assertNotNull(ok(path).srcUrl);   // 경로는 검사 대상 아님
    }

    // ---- S7 서식 문자 ----
    @Test public void 서식_문자는_400() {
        for (String s : new String[]{"‮행은민국", "수​협", "A­B"}) bad(etc(s));
        BankContractIn in = base(); in.setNote("비​고"); bad(in);
    }

    // ---- 기존 검사 ----
    @Test public void 개인정보와_정당은_422() {
        BankContractIn a = base(); a.setNote("010-1234-5678"); assertEquals("휴대폰", blocked(a, "PII_BLOCKED"));
        BankContractIn b = base(); b.setNote("국민의힘 시당 소개"); assertEquals("PARTY", blocked(b, "CONTRACT_FORBIDDEN"));
        BankContractIn c = dept("재정과 02-2148-1234"); assertEquals("PHONE", blocked(c, "CONTRACT_FORBIDDEN"));
    }

    // ---- S10 취소 사유 ----
    private static BankContractCancelIn cancel(String cd, String etc) { BankContractCancelIn c = new BankContractCancelIn(); c.setCancelReasonCd(cd); c.setCancelReasonEtc(etc); return c; }

    @Test public void 취소_사유는_필수이고_코드표_안의_값() {
        for (BankContractCancelIn c : new BankContractCancelIn[]{cancel(null, null), cancel("", null), cancel("NOPE", null), cancel("ETC", null), cancel("WRONG", "덧붙임")}) {
            try { BankContractRules.parseCancel(c, CODES); fail(); } catch (ApiException e) { assertEquals(400, e.getStatus()); }
        }
        assertEquals("DUP", BankContractRules.parseCancel(cancel("DUP", null), CODES).reasonCd);
        assertEquals("원문 확인 결과 다른 기관 자료", BankContractRules.parseCancel(cancel("ETC", "원문 확인 결과 다른 기관 자료"), CODES).reasonEtc);
    }
    @Test public void 기타_취소_사유에도_개인정보_검사() {
        try { BankContractRules.parseCancel(cancel("ETC", "010-1234-5678"), CODES); fail(); }
        catch (ApiException e) { assertEquals(422, e.getStatus()); }
    }
}
