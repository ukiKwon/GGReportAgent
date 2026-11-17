package com.kbstar.kgi.ggreport.web.service;

import org.junit.Test;

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
}
