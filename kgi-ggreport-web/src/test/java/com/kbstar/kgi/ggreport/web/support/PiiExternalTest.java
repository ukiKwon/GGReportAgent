package com.kbstar.kgi.ggreport.web.support;

import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** scanExternal — v2 시험표 31행 + security 재검토 추가 행 + 백트래킹·마감 시험. 번호는 전부 가상이다. */
public class PiiExternalTest {

    private static final String M = "휴대폰", L = "유선전화", E = "이메일", R = "주민등록번호";

    private static List<String> kinds(String s) {
        List<String> k = new ArrayList<String>();
        for (Pii.Finding f : Pii.scanExternal(s)) {
            k.add(f.getKind());
        }
        return k;
    }
    private static void hit(String in, String... expected) { assertEquals(in, Arrays.asList(expected), kinds(in)); }
    private static void ok(String in) { assertEquals(in, Collections.emptyList(), kinds(in)); }
    private static String rep(String s, int n) {
        StringBuilder b = new StringBuilder(s.length() * n);
        for (int i = 0; i < n; i++) b.append(s);
        return b.toString();
    }

    @Test public void 휴대폰은_가렸든_아니든_있으면_걸린다() {            // 1~14
        hit("010-1234-5678", M);
        hit("010-****-5678", M);
        hit("010-1234-****", M);
        hit("010-****-****", M);
        hit("01012345678", M);
        hit("+82-10-1234-5678", M);
        hit("+82 10 1234 5678", M);
        hit("+82-(0)10-1234-5678", M);
        hit("0082-10-1234-5678", M);
        hit("(010)1234-5678", M);
        hit("010/1234/5678", M);
        hit("010.1234.5678", M);
        hit("０１０－１２３４－５６７８", M);   // 전각
        hit("010-1234-\n5678", M);
    }

    @Test public void 유선은_국번_뒤가_전부_가려진_것만_통과한다() {       // 15~22
        hit("02-1234-5678", L);
        hit("02-****-5678", L);
        hit("02-1234-****", L);
        ok("02-****-****");
        hit("(031)123-4567", L);
        ok("031-***-****");
        hit("+82-2-1234-5678", L);
        hit("070-1234-5678", L);
    }

    @Test public void 오탐이_없어야_하는_것() {                            // 23~27
        ok("1588-1234");
        ok("1661-0000");
        ok("접수 2026-12-02 마감");
        ok("문서번호 2026-0212-3456");
        ok("사업자 123-45-67890");
        ok("3010-1234-5678");
        ok("2026-02-1234-5678");                    // 연도 형식 바로 뒤는 번호로 보지 않는다(상-3 의 의도된 한계)
        ok("");
        ok(null);
    }

    @Test public void 이메일은_첫글자와_별표만_통과한다() {                 // 28~30 + 중-2
        ok("a***@x.kr");
        hit("hong@x.kr", E);
        hit("ab***z@x.kr", E);
        hit("ho***@x.kr", E);
        hit("***@x.kr", E);
        hit("a○○○@x.kr", E);          // ○ 로 가린 것은 규칙 3 의 모양이 아니다
        hit("a.b@x.kr", E);                          // '.' 을 살린 접힘
    }

    @Test public void 주민번호는_기존_동작이다() {                        // 31
        hit("900101-1234567", R);
    }

    @Test public void security_추가행_상3_이어붙은_두번째_번호와_국가번호_02() {
        hit("02-****-****/02-1234-5679", L);
        hit("1. 02-1234-5678", L);
        hit("+82-02-1234-5678", L);
        hit("0507-1234-5678", L);                    // 안심번호 050x
        hit("010-1234-5678 / 02-1234-5678", M, L);
    }

    @Test public void security_추가행_중3_가림표_종류() {
        hit("010-□□□□-5678", M);        // □
        hit("010-ㅇㅇㅇㅇ-5678", M);        // ㅇ
        hit("010-∗∗∗∗-5678", M);        // ∗
        hit("02-□□□□-1234", L);
        ok("02-□□□□-□□□□");
    }

    @Test public void 공백을_늘어놓아도_걸린다() {
        hit("010   -   1234  -  5678", M);
        hit("+82" + rep(" ", 50) + "10 1234 5678", M);
    }

    @Test public void 값은_항상_가림이다() {
        List<Pii.Finding> f = Pii.scanExternal("연락 010-1234-5678, hong@x.kr, 900101-1234567");
        assertEquals(3, f.size());
        for (Pii.Finding x : f) {
            assertEquals("[가림]", x.getValue());
            assertFalse(x.toString().contains("5678"));
        }
    }

    @Test public void 기존_scan_scanLoose_출력은_그대로다() {
        assertEquals("010-****-5678", Pii.scanLoose("010-1234-5678").get(0).getValue());
        assertEquals("k***@x.kr", Pii.scan("kim@x.kr").get(0).getValue());
        assertTrue(Pii.scan("02-1234-5678").isEmpty());      // 유선은 기존 scan 이 보지 않는다
    }

    /** 상-2: 공백·구분자가 긴 입력에서 정규식이 O(n²) 로 늘지 않아야 한다. */
    @Test(timeout = 20000)
    public void 적대적_입력도_선형_시간이다() {
        String[] hostile = {
            "+82" + rep(" ", 200000) + "x", rep("82 ", 60000), rep("+82 (0) ", 30000),
            "a@" + rep("-", 200000), rep("1", 200000) + "@x", rep("0 ", 100000), rep("-", 200000)
        };
        long t0 = System.nanoTime();
        for (String h : hostile) {
            Pii.scanExternal(h);
        }
        long ms = (System.nanoTime() - t0) / 1000000L;
        assertTrue("너무 느리다: " + ms + "ms", ms < 5000);
    }

    @Test(expected = Pii.ScanTimeoutException.class)
    public void 마감이_지났으면_멈춘다() {
        Pii.scanExternal("010-1234-5678", System.nanoTime() - 1);
    }

    @Test public void 마감_안이면_정상_종료한다() {
        assertEquals(1, Pii.scanExternal("010-1234-5678", System.nanoTime() + 5000000000L).size());
    }

    @Test public void 하1_구분자가_길어도_걸린다() {
        hit("010 / / 1234 - 5678", M);
        hit("010 _ 1234 _ 5678", M);
        hit("010,,1234,,5678", M);
        hit("010~~1234~~5678", M);
        hit("02 / / 1234 / / 5678", L);
        ok("02 / / **** / / ****");
    }

    @Test public void 하2_한글자씩_띄운_번호는_deep_검사에서만_걸린다() {
        String t = "연락처 0 1 0 1 2 3 4 5 6 7 8 입니다";
        assertEquals(0, Pii.scanExternal(t).size());
        assertTrue(Pii.scanExternalDeep(t, System.nanoTime() + 5000000000L).size() > 0);
        assertEquals(0, Pii.scanExternalDeep("a b c d", System.nanoTime() + 5000000000L).size());
    }

    @Test(expected = Pii.ScanTimeoutException.class)
    public void 하3_deep도_마감이_지났으면_멈춘다() {
        Pii.scanExternalDeep("010-1234-5678", System.nanoTime() - 1);
    }
}
