package com.kbstar.kgi.ggreport.web.config;

import com.kbstar.kgi.ggreport.web.service.AccessLogService;
import org.junit.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * 회의록 기능이 꺼졌을 때 MinutesLimitFilter 단위 시험(Spring 없음). 필터가 직접 끊었는지(체인 미호출·Connection: close)를 구별한다.
 * MockMvc 시험은 컨트롤러의 404와 구별하지 못한다(qa 11-24 P3-3).
 */
public class MinutesLimitFilterOffTest {

    private final AccessLogService accessLog = mock(AccessLogService.class);

    private MinutesLimitFilter off() {
        MinutesSettings s = new MinutesSettings();
        ReflectionTestUtils.setField(s, "enabled", false);
        return new MinutesLimitFilter(accessLog, s);
    }

    private static MockHttpServletRequest req(String method, String uri) {
        MockHttpServletRequest r = new MockHttpServletRequest(method, uri);
        r.setRequestURI(uri);
        return r;
    }

    @Test
    public void 꺼짐_업로드_POST_multipart는_체인_없이_404이고_연결을_닫는다() throws Exception {
        MockHttpServletRequest r = req("POST", "/board-materials/1/minutes");
        r.setContentType("multipart/form-data; boundary=x");
        r.setContent(new byte[]{1, 2, 3});
        MockHttpServletResponse res = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();
        off().doFilter(r, res, chain);
        assertEquals(404, res.getStatus());
        assertNull("체인을 부르면 안 된다", chain.getRequest());
        assertEquals("close", res.getHeader("Connection"));
        assertEquals("no-store", res.getHeader("Cache-Control"));
        assertTrue(res.getContentAsString(StandardCharsets.UTF_8).contains("찾을 수 없습니다"));
        verifyNoInteractions(accessLog);
    }

    @Test
    public void 꺼짐_GET은_체인을_부른다() throws Exception {
        MockHttpServletResponse res = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();
        off().doFilter(req("GET", "/board-minutes/1"), res, chain);
        assertNotNull(chain.getRequest());
        assertEquals("no-store", res.getHeader("Cache-Control"));
        assertNull(res.getHeader("Connection"));
    }

    @Test
    public void 꺼짐이어도_회의록_경로가_아닌_쓰기는_체인을_부른다() throws Exception {
        MockHttpServletResponse res = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();
        off().doFilter(req("POST", "/board-materials/1/files"), res, chain);
        assertNotNull(chain.getRequest());
        assertEquals(200, res.getStatus());
        assertNull(res.getHeader("Cache-Control"));
    }
}
