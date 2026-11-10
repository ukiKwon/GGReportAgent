package com.kbstar.kgi.ggreport.web.config;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
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
}
