package com.kbstar.kgi.ggreport.web.config;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** 접근 이력 건너뛰기 — 점이 있다고 정적 파일이 아니다(NEXT 70 F7: API 첨부 다운로드는 기록). */
public class AccessLogInterceptorSkipTest {

    @Test
    public void API_다운로드는_기록하고_정적_파일과_폴링은_건너뛴다() {
        assertFalse(AccessLogInterceptor.skip("GET", "/tasks/1/files/a.xlsx"));
        assertTrue(AccessLogInterceptor.skip("GET", "/js/app.js"));
        assertTrue(AccessLogInterceptor.skip("GET", "/favicon.ico"));
        assertTrue(AccessLogInterceptor.skip("POST", "/auth/login"));
        assertTrue(AccessLogInterceptor.skip("GET", "/institutions/x/status"));
    }

    @Test
    public void 컨텍스트_경로와_세미콜론을_떼고_판정한다() {
        assertEquals("/auth/login", StaticCacheFilter.stripContext("/ggreport/auth/login", "/ggreport"));
        assertEquals("/js/a.js", StaticCacheFilter.stripContext("/ggreport/js/a.js;jsessionid=X", "/ggreport"));
        assertEquals("/tasks/1/files/a.xlsx", StaticCacheFilter.stripContext("/tasks/1/files/a.xlsx", ""));
        assertEquals("/tasks/1/files/a.xlsx", StaticCacheFilter.stripContext("/tasks/1/files/a.xlsx", null));
        assertEquals("/ggreport2/x", StaticCacheFilter.stripContext("/ggreport2/x", "/ggreport"));   // 경계: 접두사만 같으면 안 뗀다
        assertEquals("", StaticCacheFilter.stripContext("/ggreport", "/ggreport"));
        assertNull(StaticCacheFilter.stripContext(null, "/ggreport"));
    }

    @Test
    public void 경로_매개변수는_마디별로만_떼어_실제_호출_경로를_남긴다() {
        assertEquals("/bidcases/1/finalize", StaticCacheFilter.stripContext("/bidcases/1;a=b/finalize", ""));
        assertEquals("/tasks/1/files/a.xlsx", StaticCacheFilter.stripContext("/tasks;x=1/1/files/a.xlsx", ""));
        assertEquals("/js/a.js", StaticCacheFilter.stripContext("/ggreport;jsessionid=X/js/a.js", "/ggreport"));
        assertEquals("/approval-requests/assignee-change",
                StaticCacheFilter.stripContext("/ggreport/approval-requests;x/assignee-change", "/ggreport"));
    }
}
