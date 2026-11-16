package com.kb.uploader.service;

import org.junit.Test;

import static org.junit.Assert.*;

/** NEXT 87: RFP 원문 저장 상한 — 넘으면 자르고 표지, 서로게이트 쌍은 쪼개지 않는다. */
public class DocumentParseFullTextLimitTest {

    private static DocumentParseService svc(int max) {
        return new DocumentParseService(null, null, null, null, null, null, null, null, max);
    }

    @Test
    public void 상한_이하는_그대로() {
        String s = new String(new char[1000]).replace('\0', '가');
        assertEquals(s, svc(1000).limitFullText(s));
        assertEquals("", svc(1000).limitFullText(null));
    }

    @Test
    public void 상한을_넘으면_잘리고_표지가_붙는다() {
        String s = new String(new char[5000]).replace('\0', '가') + "끝부분";
        String r = svc(1000).limitFullText(s);
        assertTrue(r.startsWith(new String(new char[1000]).replace('\0', '가')));
        assertTrue(r.contains(DocumentParseService.TRUNCATED_MARK));
        assertFalse(r.contains("끝부분"));
    }

    @Test
    public void 서로게이트_쌍을_쪼개지_않는다() {
        String emoji = "😀";   // 😀 (2 char)
        String s = new String(new char[999]).replace('\0', 'a') + emoji + "bbbb";
        String r = svc(1000).limitFullText(s);
        String head = r.substring(0, r.indexOf("\n\n"));
        assertEquals(999, head.length());                 // 상위 서로게이트만 남기지 않고 한 글자 덜 자름
        assertFalse(Character.isHighSurrogate(head.charAt(head.length() - 1)));
    }

    @Test
    public void 상한_최소값은_1000() {
        String s = new String(new char[1500]).replace('\0', 'a');
        assertTrue(svc(10).limitFullText(s).contains(DocumentParseService.TRUNCATED_MARK));
        assertEquals(1000, svc(10).limitFullText(s).indexOf("\n\n"));
    }
}
