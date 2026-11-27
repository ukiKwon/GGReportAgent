package com.kbstar.kgi.ggreport.web.service;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

/** NEXT 129 ⑤ — AI 에 넘기는 값의 정리(clean): 사번 모양 7자리 숫자와 개인정보 모양은 버린다. */
public class ScriptDraftBasisReaderTest {

    @Test
    public void 사번_모양_7자리_숫자가_든_글은_버리고_센다() {
        ScriptDraftBasisReader.Basis b = new ScriptDraftBasisReader.Basis();
        assertNull(ScriptDraftBasisReader.clean(b, "담당 1234567", 100));
        assertEquals(1, b.piiDropped);
    }

    @Test
    public void 쉼표_금액과_8자리_숫자는_유지한다() {
        ScriptDraftBasisReader.Basis b = new ScriptDraftBasisReader.Basis();
        assertEquals("예산 1,234,567천원", ScriptDraftBasisReader.clean(b, "예산 1,234,567천원", 100));
        assertEquals("12345678", ScriptDraftBasisReader.clean(b, "12345678", 100));
        assertEquals(0, b.piiDropped);
    }

    @Test
    public void 개인정보_모양과_빈_값은_버린다() {
        ScriptDraftBasisReader.Basis b = new ScriptDraftBasisReader.Basis();
        assertNull(ScriptDraftBasisReader.clean(b, "문의 test@example.com", 100));
        assertEquals(1, b.piiDropped);
        assertNull(ScriptDraftBasisReader.clean(b, "   ", 100));
        assertNull(ScriptDraftBasisReader.clean(b, null, 100));
    }

    @Test
    public void 유선전화_모양도_버린다() {
        ScriptDraftBasisReader.Basis b = new ScriptDraftBasisReader.Basis();
        assertNull(ScriptDraftBasisReader.clean(b, "대표 02-1234-5678", 100));
        assertEquals(1, b.piiDropped);
        assertEquals("정상 금액은 유지", "예산 1,000억원", ScriptDraftBasisReader.clean(b, "예산 1,000억원", 100));
    }

    @Test
    public void boardSent는_effect를_묻고_실리는_숫자가_있을_때만_true다() {
        java.util.Set<String> effect = new java.util.LinkedHashSet<String>(java.util.Arrays.asList("effect"));
        java.util.Set<String> intro = new java.util.LinkedHashSet<String>(java.util.Arrays.asList("intro"));
        ScriptDraftBasisReader.Basis b = new ScriptDraftBasisReader.Basis();
        b.instName = "가상구청";
        assertEquals(false, ScriptDraftPrompt.facts(b, effect, null).boardSent);          // 숫자 없음
        b.amountExclIt = new java.math.BigDecimal("6");                                    // 기본(TOTAL)에는 안 실리는 값
        assertEquals(false, ScriptDraftPrompt.facts(b, effect, null).boardSent);
        b.amountTotal = new java.math.BigDecimal("9");
        assertEquals(true, ScriptDraftPrompt.facts(b, effect, null).boardSent);
        assertEquals(false, ScriptDraftPrompt.facts(b, intro, null).boardSent);            // effect 를 묻지 않으면 싣지 않는다
    }

    @Test
    public void 제어문자는_공백으로_공백은_접고_길이를_자른다() {
        ScriptDraftBasisReader.Basis b = new ScriptDraftBasisReader.Basis();
        assertEquals("가 나 다", ScriptDraftBasisReader.clean(b, "가\t\n  나   다", 100));
        assertEquals("가나다", ScriptDraftBasisReader.clean(b, "가나다라마", 3));
    }
}
