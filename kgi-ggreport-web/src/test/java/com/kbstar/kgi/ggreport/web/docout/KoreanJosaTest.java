package com.kbstar.kgi.ggreport.web.docout;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class KoreanJosaTest {
    @Test public void 은는_받침_판정() {
        assertEquals("는", KoreanJosa.eunNeun("가상구"));
        assertEquals("는", KoreanJosa.eunNeun("인천광역시 영종구"));
        assertEquals("은", KoreanJosa.eunNeun("가상강남"));
        assertEquals("은", KoreanJosa.eunNeun("교육청"));
        assertEquals("는", KoreanJosa.eunNeun("〔기관명 확인 필요〕"));   // 괄호는 건너뛰고 '요'
    }
    @Test public void 으로로_받침_판정과_ㄹ받침() {
        assertEquals("으로", KoreanJosa.euroRo("무형자산"));
        assertEquals("으로", KoreanJosa.euroRo("금고은행"));
        assertEquals("로", KoreanJosa.euroRo("가상시"));
        assertEquals("로", KoreanJosa.euroRo("가상달"));     // ㄹ받침
    }
    @Test public void 숫자는_읽는_소리_기준이다() {
        assertEquals("로", KoreanJosa.euroRo("현금(2)"));     // 이 → 받침 없음
        assertEquals("으로", KoreanJosa.euroRo("제3"));        // 삼 → ㅁ
        assertEquals("로", KoreanJosa.euroRo("제8"));          // 팔 → ㄹ
        assertEquals("은", KoreanJosa.eunNeun("제0"));         // 영 → ㅇ
    }
    @Test public void 영문자와_빈값은_모른다() {
        assertEquals("은(는)", KoreanJosa.eunNeun("ABC"));
        assertEquals("(으)로", KoreanJosa.euroRo(null));
        assertEquals("(으)로", KoreanJosa.euroRo(""));
    }
}
