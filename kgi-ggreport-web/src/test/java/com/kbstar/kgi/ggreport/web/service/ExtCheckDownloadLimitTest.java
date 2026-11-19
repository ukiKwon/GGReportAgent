package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.mapper.ExtCheckMapper;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.junit.Test;
import org.mockito.Mockito;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** 외부 확인 다운로드 동시 수(NEXT 90 하, 11-19) — 슬롯이 없으면 429, 실패해도 슬롯을 돌려준다. */
public class ExtCheckDownloadLimitTest {
    private static final String KEY = "0123456789abcdef0123456789abcdef";
    private static final int MAX = ExtCheckQueryService.MAX_CONCURRENT_DOWNLOADS;

    @Test
    public void 슬롯이_없으면_429이고_형식_오류는_여전히_404다() {
        ExtCheckQueryService s = new ExtCheckQueryService(Mockito.mock(ExtCheckMapper.class), null, null);
        assertTrue(s.downloadSlots().tryAcquire(MAX));
        try {
            try { s.download(KEY, "1"); fail(); } catch (ApiException e) {
                assertEquals(429, e.getStatus());
                assertFalse(String.valueOf(e.getMessage()).contains(KEY));
            }
            try { s.download("zz", "1"); fail(); } catch (ApiException e) { assertEquals(404, e.getStatus()); }
        } finally {
            s.downloadSlots().release(MAX);
        }
    }

    @Test
    public void 슬롯은_404가_나도_돌려준다() {
        ExtCheckQueryService s = new ExtCheckQueryService(Mockito.mock(ExtCheckMapper.class), null, null); // selectFile -> null -> 404
        for (int i = 0; i < MAX * 3; i++) {
            try { s.download(KEY, "1"); fail(); } catch (ApiException e) { assertEquals(404, e.getStatus()); }
        }
        assertEquals(MAX, s.downloadSlots().availablePermits());
    }

    @Test
    public void 슬롯은_조회_예외가_나도_돌려준다() {
        ExtCheckMapper m = Mockito.mock(ExtCheckMapper.class);
        Mockito.when(m.selectFile(Mockito.anyString(), Mockito.anyInt())).thenThrow(new org.springframework.dao.DataRetrievalFailureException("x"));
        ExtCheckQueryService s = new ExtCheckQueryService(m, null, null);
        try { s.download(KEY, "1"); fail(); } catch (org.springframework.dao.DataRetrievalFailureException expected) { }
        assertEquals(MAX, s.downloadSlots().availablePermits());
    }
}
