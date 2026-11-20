package com.kbstar.kgi.ggreport.web.docout;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

/** HeadDocBuilder.ageOn — Word 의 '나이: 만 n세'(사용자 11-20). 서울 오늘 기준, 2/29생은 평년 3/1에 한 살. */
public class HeadDocBuilderAgeTest {
    @Test
    public void 생일_전날은_한_살_적다() {
        assertEquals(Integer.valueOf(55), HeadDocBuilder.ageOn("1970-05-17", "2026-05-16"));
        assertEquals(Integer.valueOf(56), HeadDocBuilder.ageOn("1970-05-17", "2026-05-17"));
    }

    @Test
    public void 이월29일생은_평년_3월1일에_한_살_오른다() {
        assertEquals(Integer.valueOf(20), HeadDocBuilder.ageOn("2000-02-29", "2021-02-28"));
        assertEquals(Integer.valueOf(21), HeadDocBuilder.ageOn("2000-02-29", "2021-03-01"));
        assertEquals(Integer.valueOf(23), HeadDocBuilder.ageOn("2000-02-29", "2024-02-28"));
        assertEquals(Integer.valueOf(24), HeadDocBuilder.ageOn("2000-02-29", "2024-02-29"));
    }

    @Test
    public void 미래_형식오류_빈값은_null이다() {
        assertNull(HeadDocBuilder.ageOn("2030-01-01", "2026-11-20"));
        assertNull(HeadDocBuilder.ageOn("1970-13-40", "2026-11-20"));
        assertNull(HeadDocBuilder.ageOn("", "2026-11-20"));
        assertNull(HeadDocBuilder.ageOn(null, "2026-11-20"));
        assertNull(HeadDocBuilder.ageOn("1850-01-01", "2026-11-20"));
    }
}
