package com.kbstar.kgi.ggreport.web.config;

import com.kbstar.kgi.ggreport.web.service.AccessLogService;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.junit.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.BufferedReader;
import java.io.InputStream;
import java.util.Arrays;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

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

    private static MockHttpServletRequest withBody(int bytes) {
        MockHttpServletRequest req = new MockHttpServletRequest("PUT", "/board-forms/1");
        byte[] b = new byte[bytes];
        Arrays.fill(b, (byte) 'a');
        req.setContent(b);
        return req;
    }

    private static void expectTooLarge(ApiException e) {
        assertEquals(413, e.getStatus());
        Map<?, ?> d = (Map<?, ?>) e.getDetailObject();
        assertEquals("BODY_TOO_LARGE", d.get("code"));
        assertTrue(((Number) d.get("max_kb")).longValue() >= 0);
        assertFalse(String.valueOf(d.get("message")).isEmpty());
    }

    @Test
    public void 실제로_읽은_바이트가_한도를_넘으면_헤더와_무관하게_끊는다() throws Exception {
        // 한도 2KB — 본문 3KB. 헤더(Content-Length)가 거짓이어도(여기서는 작게 속인다) 읽는 도중 끊긴다.
        long limit = 2048;
        MockHttpServletRequest liar = withBody(3072);
        liar.addHeader("Content-Length", "10");
        BoardWriteLimitFilter.CountingRequest wrapped = new BoardWriteLimitFilter.CountingRequest(liar, limit);
        byte[] buf = new byte[512];
        long read = 0;
        try {
            int n;
            while ((n = wrapped.getInputStream().read(buf)) > 0) {
                read += n;
            }
            fail("한도를 넘으면 ApiException(413) 이 나와야 한다");
        } catch (ApiException e) {
            expectTooLarge(e);
            assertTrue("끊기기 전까지 한도+버퍼 한 번 이상 읽지 않는다: " + read, read <= limit);
        }
        // 한 바이트씩 읽어도 같다
        MockHttpServletRequest one = withBody(2049);
        try {
            InputStream in = new BoardWriteLimitFilter.CountingRequest(one, limit).getInputStream();
            while (in.read() >= 0) {
                // 계속 읽는다
            }
            fail("한도를 넘으면 ApiException(413) 이 나와야 한다");
        } catch (ApiException e) {
            expectTooLarge(e);
        }
        // reader 경로도 센다
        try {
            BufferedReader r = new BoardWriteLimitFilter.CountingRequest(withBody(4096), limit).getReader();
            while (r.read() >= 0) {
                // 계속 읽는다
            }
            fail("한도를 넘으면 ApiException(413) 이 나와야 한다");
        } catch (ApiException e) {
            expectTooLarge(e);
        }
    }

    @Test
    public void 한도_이하는_그대로_읽힌다() throws Exception {
        long limit = 2048;
        MockHttpServletRequest req = withBody(2048);                       // 정확히 한도 — 통과
        InputStream in = new BoardWriteLimitFilter.CountingRequest(req, limit).getInputStream();
        int total = 0;
        byte[] buf = new byte[300];
        int n;
        while ((n = in.read(buf)) > 0) {
            total += n;
        }
        assertEquals(2048, total);
        assertEquals(-1, in.read());
        // 같은 래퍼에서 getInputStream 을 다시 불러도 카운터가 이어진다(우회 방지)
        BoardWriteLimitFilter.CountingRequest w = new BoardWriteLimitFilter.CountingRequest(withBody(2048), limit);
        assertSame(w.getInputStream(), w.getInputStream());
    }

    @Test
    public void 한도_상수는_저장_512KB_복제_16KB_초안_256KB() {
        assertEquals(512 * 1024L, BoardWriteLimitFilter.SAVE_MAX);
        assertEquals(16 * 1024L, BoardWriteLimitFilter.COPY_MAX);
        assertEquals(256 * 1024L, BoardWriteLimitFilter.DRAFT_MAX);
    }

    // ── 기관장 정보(NEXT 72·77, 026) ─────────────────────────────────────

    private static MockHttpServletResponse filter(String method, String uri, int bodyBytes, boolean withBody) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest(method, uri);
        if (withBody) {
            req.setContent(new byte[bodyBytes]);
        }
        MockHttpServletResponse res = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();
        new BoardWriteLimitFilter(org.mockito.Mockito.mock(AccessLogService.class), 5).doFilter(req, res, chain);
        lastPassed = chain.getRequest() != null;
        return res;
    }

    private static boolean lastPassed;

    @Test
    public void 기관장_사진은_5MB_한도다_6MB_넘으면_413_길이_없으면_411() throws Exception {
        long over = 6L * 1024 * 1024 + 2;
        for (String uri : new String[]{"/institutions/x/head/photos", "/institutions//x//head//photos/", "/institutions/x/head/photos;jsessionid=1",
                "/INSTITUTIONS/x/head/photos"}) {
            MockHttpServletResponse res = filter("POST", uri, (int) over, true);
            assertEquals(uri, 413, res.getStatus());
            String body = res.getContentAsString();
            assertTrue(body, body.contains("FILE_TOO_LARGE") && body.contains("\"max_mb\":5"));
            assertFalse(lastPassed);
        }
        assertEquals(411, filter("POST", "/institutions/x/head/photos", 0, false).getStatus());
        MockHttpServletResponse ok = filter("POST", "/institutions/x/head/photos", 1024, true);
        assertEquals(200, ok.getStatus());
        assertTrue("한도 안의 사진은 통과한다", lastPassed);
    }

    @Test
    public void 기관장_그_밖의_쓰기는_16KB_한도고_GET은_통과한다() throws Exception {
        for (String uri : new String[]{"/institutions/x/head/items", "/institution-heads/unmatched/1/assign",
                "/institutions/x/heads", "/institutions/x/heads/3/confirm", "/institutions/x/head/photos/9/void"}) {
            MockHttpServletResponse res = filter("POST", uri, 20 * 1024, true);
            assertEquals(uri, 413, res.getStatus());
            assertTrue(res.getContentAsString().contains("BODY_TOO_LARGE"));
        }
        assertEquals(200, filter("GET", "/institution-heads/unmatched/1/assign", 20 * 1024, true).getStatus());
        assertTrue(lastPassed);
        assertEquals(200, filter("POST", "/institutions/x/head/items", 1024, true).getStatus());
        assertTrue("16KB 안의 JSON 은 통과한다", lastPassed);
    }
}
