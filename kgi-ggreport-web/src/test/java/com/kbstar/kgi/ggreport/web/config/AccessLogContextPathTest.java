package com.kbstar.kgi.ggreport.web.config;

import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.junit4.SpringRunner;

import java.util.List;

import static org.junit.Assert.assertEquals;

/**
 * 접근 이력 — 컨텍스트 경로(/ggreport, WebLogic)가 붙어도 /auth/·정적 건너뛰기가 맞고, 기록 경로는 컨텍스트를 뗀 값이다.
 * NEXT 70 가드 후속·NEXT 64 ④. @Transactional 을 붙이지 않는다(record 는 REQUIRES_NEW) — 앞뒤로 LOG_ID 기준 정리.
 */
@RunWith(SpringRunner.class)
@AppTest
public class AccessLogContextPathTest {

    private static final String CTX = "/ggreport";

    @Autowired private AccessLogInterceptor interceptor;
    @Autowired private JdbcTemplate jdbc;
    private long base;

    @Before
    public void 앞정리() {
        base = jdbc.queryForObject("SELECT COALESCE(MAX(LOG_ID), 0) FROM ACCESS_LOG", Long.class);
    }

    @After
    public void 뒤정리() {
        jdbc.update("DELETE FROM ACCESS_LOG WHERE LOG_ID > ?", base);
    }

    private void fire(String method, String ctx, String uri) {
        MockHttpServletRequest rq = new MockHttpServletRequest(method, uri);
        rq.setContextPath(ctx);
        MockHttpServletResponse rs = new MockHttpServletResponse();
        interceptor.afterCompletion(rq, rs, new Object(), null);
    }

    private List<String> paths() {
        return jdbc.queryForList("SELECT REQ_PATH FROM ACCESS_LOG WHERE LOG_ID > ? ORDER BY LOG_ID", String.class, base);
    }

    @Test
    public void 컨텍스트_있어도_auth_는_기록하지_않는다() {
        fire("POST", CTX, CTX + "/auth/login");
        assertEquals(0, paths().size());
    }

    @Test
    public void 컨텍스트_있어도_정적_파일은_기록하지_않는다() {
        fire("GET", CTX, CTX + "/js/a.js");
        fire("GET", CTX, CTX + "/js/a.js;jsessionid=ABC");
        assertEquals(0, paths().size());
    }

    @Test
    public void 컨텍스트_있어도_API_다운로드는_기록하고_경로는_컨텍스트를_뗀_값이다() {
        fire("GET", CTX, CTX + "/tasks/1/files/ctx-a.xlsx");
        List<String> p = paths();
        assertEquals(1, p.size());
        assertEquals("/tasks/1/files/ctx-a.xlsx", p.get(0));
    }

    @Test
    public void 컨텍스트_있어도_폴링_status_는_기록하지_않고_jsessionid_는_기록_경로에서_빠진다() {
        fire("GET", CTX, CTX + "/institutions/x/status");
        fire("GET", CTX, CTX + "/tasks/2/files/ctx-b.xlsx;jsessionid=ABC");
        List<String> p = paths();
        assertEquals(1, p.size());
        assertEquals("/tasks/2/files/ctx-b.xlsx", p.get(0));
    }

    @Test
    public void 경로_중간_매개변수로_실제_호출_경로를_가리지_못한다() {
        fire("POST", CTX, CTX + "/bidcases/1;a=b/finalize");
        List<String> p = paths();
        assertEquals(1, p.size());
        assertEquals("/bidcases/1/finalize", p.get(0));
    }

    @Test
    public void 컨텍스트가_없으면_기존_동작_그대로다() {
        fire("POST", "", "/auth/login");
        fire("GET", "", "/js/a.js");
        fire("GET", "", "/tasks/3/files/ctx-c.xlsx");
        List<String> p = paths();
        assertEquals(1, p.size());
        assertEquals("/tasks/3/files/ctx-c.xlsx", p.get(0));
    }
}
