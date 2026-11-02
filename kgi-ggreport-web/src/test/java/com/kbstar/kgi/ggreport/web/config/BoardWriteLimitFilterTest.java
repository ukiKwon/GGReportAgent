package com.kbstar.kgi.ggreport.web.config;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

/** 경로 정규화 — 세그먼트별 ';' 제거 후 %XX 한 번 풀기, 잘못된 %XX 는 그대로. */
public class BoardWriteLimitFilterTest {

    @Test
    public void 경로_매개변수와_퍼센트_인코딩을_정규화한다() {
        assertEquals("/board-forms/a/excel", BoardWriteLimitFilter.normalize("/board-forms/a;x=1/%65xcel;y"));
        assertEquals("/board-forms/a/excel/", BoardWriteLimitFilter.normalize("/board-forms/a/excel/"));
        assertEquals("/a/%zz/%6", BoardWriteLimitFilter.normalize("/a/%zz/%6"));
        assertEquals("/a/%3B", BoardWriteLimitFilter.normalize("/a/%253B"));     // 한 번만 푼다
        assertEquals("", BoardWriteLimitFilter.normalize(null));
    }
}
