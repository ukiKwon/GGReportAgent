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
    public void 제어문자는_공백으로_공백은_접고_길이를_자른다() {
        ScriptDraftBasisReader.Basis b = new ScriptDraftBasisReader.Basis();
        assertEquals("가 나 다", ScriptDraftBasisReader.clean(b, "가\t\n  나   다", 100));
        assertEquals("가나다", ScriptDraftBasisReader.clean(b, "가나다라마", 3));
    }
}
