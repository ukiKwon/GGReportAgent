package com.kbstar.kgi.ggreport.web.service;

import org.junit.Test;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Arrays;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

public class PlanCollectRulesTest {

    @Test
    public void 호스트만_소문자로_앞_www_하나만_뗀다() {
        assertEquals("jongno.go.kr", PlanCollectRules.domainOf("https://www.Jongno.go.kr/a b/계획.pdf?x=1"));
        assertEquals("example.kr", PlanCollectRules.domainOf("http://user@example.kr:8080/x"));
        assertEquals("www.kr", PlanCollectRules.domainOf("https://www.kr/"));
        assertNull(PlanCollectRules.domainOf("ftp://example.kr/x"));
        assertNull(PlanCollectRules.domainOf("javascript:alert(1)"));
        assertNull(PlanCollectRules.domainOf(null));
    }

    @Test
    public void 도메인은_중복없이_최대_5개다() {
        assertEquals("a.kr,b.kr", PlanCollectRules.joinDomains(Arrays.asList("https://www.a.kr/1", "https://a.kr/2", "https://b.kr", "bad")));
        assertEquals(5, PlanCollectRules.joinDomains(Arrays.asList("https://a1.kr", "https://a2.kr", "https://a3.kr",
                "https://a4.kr", "https://a5.kr", "https://a6.kr")).split(",").length);
        assertNull(PlanCollectRules.joinDomains(Arrays.asList((String) null)));
    }

    @Test
    public void recent_applied_기준_시각은_KST_날짜_기준_7일이다() {
        ZoneId seoul = ZoneId.of("Asia/Seoul");
        Instant d25 = ZonedDateTime.of(2026, 11, 25, 23, 59, 0, 0, seoul).toInstant();
        Instant d26 = ZonedDateTime.of(2026, 11, 26, 0, 0, 0, 0, seoul).toInstant();
        assertEquals(ZonedDateTime.of(2026, 11, 19, 0, 0, 0, 0, seoul).toInstant(), PlanCollectService.appliedCutoff(d25));
        assertEquals(ZonedDateTime.of(2026, 11, 20, 0, 0, 0, 0, seoul).toInstant(), PlanCollectService.appliedCutoff(d26));
        // UTC 로는 아직 25일(15:00Z)이어도 KST 로 26일 00:00 이면 다음 날 기준이다
        assertEquals(ZonedDateTime.of(2026, 11, 20, 0, 0, 0, 0, seoul).toInstant(), PlanCollectService.appliedCutoff(Instant.parse("2026-11-25T15:00:00Z")));
    }

    @Test
    public void notBefore는_같은_시각은_포함하고_빈값과_잘못된_값은_false다() {
        Instant c = Instant.parse("2026-11-18T15:00:00Z");
        org.junit.Assert.assertTrue(PlanCollectService.notBefore("2026-11-18T15:00:00Z", c));
        org.junit.Assert.assertFalse(PlanCollectService.notBefore("2026-11-18T14:59:59Z", c));
        org.junit.Assert.assertFalse(PlanCollectService.notBefore(null, c));
        org.junit.Assert.assertFalse(PlanCollectService.notBefore("not-a-date", c));
    }
}
