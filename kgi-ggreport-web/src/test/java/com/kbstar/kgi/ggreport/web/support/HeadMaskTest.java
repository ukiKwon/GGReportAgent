package com.kbstar.kgi.ggreport.web.support;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

/** 기관장 이름 가리기(NEXT 72·77) — null·빈 값·글자 수별·앞뒤 공백·서로게이트 쌍(이모지). */
public class HeadMaskTest {

    @Test
    public void null과_빈_값() {
        assertNull(HeadMask.name(null));
        assertEquals("", HeadMask.name(""));
        assertEquals("", HeadMask.name("   "));
    }

    @Test
    public void 한_글자에서_네_글자() {
        assertEquals("*", HeadMask.name("홍"));
        assertEquals("홍*", HeadMask.name("홍길"));
        assertEquals("홍*동", HeadMask.name("홍길동"));
        assertEquals("남**수", HeadMask.name("남궁민수"));
    }

    @Test
    public void 앞뒤_공백은_버리고_센다() {
        assertEquals("홍*동", HeadMask.name("  홍길동  "));
        assertEquals("*", HeadMask.name(" 홍 "));
    }

    @Test
    public void 서로게이트_쌍은_한_글자로_센다() {
        String smile = new String(Character.toChars(0x1F600));
        assertEquals("*", HeadMask.name(smile));
        assertEquals(smile + "*", HeadMask.name(smile + "길"));
        assertEquals(smile + "*동", HeadMask.name(smile + "길동"));
        assertEquals("홍*" + smile, HeadMask.name("홍길" + smile));
    }
}
