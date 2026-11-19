package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.context.junit4.SpringRunner;

import static org.junit.Assert.assertEquals;

/** DENIED 행의 경로도 API 행과 같은 형식(컨텍스트·경로 매개변수 제거) — security 11-15 1959 하, NEXT 84. */
@RunWith(SpringRunner.class)
@AppTest
public class DeniedPathFormatTest {
    @Autowired private MenuGuard guard;
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

    @Test
    public void DENIED_행의_경로는_컨텍스트와_경로_매개변수를_뗀_값이다() {
        MockHttpServletRequest rq = new MockHttpServletRequest("POST", "/ggreport/bidcases/1;a=b/finalize");
        rq.setContextPath("/ggreport");
        rq.addHeader(Actor.HEADER, "3918264");
        guard.denied(rq, new ApiException(403, "고정 문구"));
        assertEquals("/bidcases/1/finalize", jdbc.queryForObject(
                "SELECT REQ_PATH FROM ACCESS_LOG WHERE LOG_ID > ? AND EVENT_TYPE = 'DENIED'", String.class, base));
    }
}
