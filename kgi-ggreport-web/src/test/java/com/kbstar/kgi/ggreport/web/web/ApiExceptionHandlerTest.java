package com.kbstar.kgi.ggreport.web.web;

import org.junit.Test;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.http.ResponseEntity;

import java.util.Collections;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** 조치 D — 운영(일반화)과 개발(원문) 두 모드. */
public class ApiExceptionHandlerTest {

    private static Object detail(ResponseEntity<Map<String, Object>> r) {
        return r.getBody().get("detail");
    }

    @Test
    public void 의도된_4xx_문구는_운영에서도_그대로다() {
        ApiExceptionHandler prod = new ApiExceptionHandler(false);
        for (int status : new int[]{400, 401, 403, 404, 409}) {
            ResponseEntity<Map<String, Object>> r = prod.handle(new ApiException(status, "한글 사유 " + status));
            assertEquals(status, r.getStatusCodeValue());
            assertEquals("한글 사유 " + status, detail(r));
        }
        assertEquals("institution not found", detail(prod.handle(ApiException.notFound("institution not found"))));
    }

    @Test
    public void 객체_detail_은_그대로다() {
        Map<String, Object> obj = Collections.<String, Object>singletonMap("errors", "x");
        ResponseEntity<Map<String, Object>> r = new ApiExceptionHandler(false).handle(ApiException.withDetail(422, obj));
        assertEquals(422, r.getStatusCodeValue());
        assertEquals(obj, detail(r));
    }

    @Test
    public void 운영에서_5xx_ApiException_은_경로를_싣지_않는다() {
        ResponseEntity<Map<String, Object>> r = new ApiExceptionHandler(false)
                .handle(new ApiException(500, "아카이브에 실패했습니다: /app/ggreport/x/secret.dat (권한 없음)"));
        assertEquals(500, r.getStatusCodeValue());
        assertEquals(ApiExceptionHandler.GENERIC_500, detail(r));
        assertFalse(String.valueOf(detail(r)).contains("/app/"));
    }

    @Test
    public void 개발축에서는_5xx_원문을_싣는다() {
        ResponseEntity<Map<String, Object>> r = new ApiExceptionHandler(true)
                .handle(new ApiException(500, "아카이브에 실패했습니다: /app/x"));
        assertEquals("아카이브에 실패했습니다: /app/x", detail(r));
    }

    @Test
    public void 운영에서_예기치_못한_예외는_일반_문구이고_키는_detail_이다() {
        ApiExceptionHandler prod = new ApiExceptionHandler(false);
        ResponseEntity<Map<String, Object>> a = prod.handleUnexpected(
                new DataRetrievalFailureException("ORA-00942: table KGI.SECRET_T does not exist"));
        ResponseEntity<Map<String, Object>> b = prod.handleUnexpected(
                new IllegalStateException("jdbc:oracle:thin:@//10.0.0.1:1521/PROD"));
        for (ResponseEntity<Map<String, Object>> r : java.util.Arrays.asList(a, b)) {
            assertEquals(500, r.getStatusCodeValue());
            assertEquals(Collections.singleton("detail"), r.getBody().keySet());
            assertEquals(ApiExceptionHandler.GENERIC_500, detail(r));
        }
    }

    @Test
    public void 개발축에서는_예외_원문을_싣는다() {
        ResponseEntity<Map<String, Object>> r = new ApiExceptionHandler(true)
                .handleUnexpected(new IllegalStateException("boom"));
        assertTrue(String.valueOf(detail(r)).contains("boom"));
    }
}
