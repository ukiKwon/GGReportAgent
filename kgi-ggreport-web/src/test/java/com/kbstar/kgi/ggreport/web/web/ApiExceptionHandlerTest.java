package com.kbstar.kgi.ggreport.web.web;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.Test;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.http.ResponseEntity;

import java.util.Collections;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
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
    public void 운영에서_BadSqlGrammar는_SQL_테이블_ORA코드_없이_일반_문구와_참조_머리글이다() {
        ResponseEntity<Map<String, Object>> r = new ApiExceptionHandler(false).handleUnexpected(
                new org.springframework.jdbc.BadSqlGrammarException("t", "SELECT * FROM SECRET_T",
                        new java.sql.SQLSyntaxErrorException("ORA-00942")));
        assertEquals(500, r.getStatusCodeValue());
        String body = String.valueOf(r.getBody());
        assertFalse(body, body.contains("SELECT"));
        assertFalse(body, body.contains("SECRET_T"));
        assertFalse(body, body.contains("ORA-00942"));
        assertEquals(ApiExceptionHandler.GENERIC_500, detail(r));
        assertTrue(r.getHeaders().containsKey("X-Error-Ref"));
    }

    @Test
    public void 전역_업로드_한도_초과는_413_객체이고_파일명이_없다() {
        ResponseEntity<Map<String, Object>> r = new ApiExceptionHandler(false, "50MB")
                .handleUploadTooLarge(new org.springframework.web.multipart.MaxUploadSizeExceededException(-1));
        assertEquals(413, r.getStatusCodeValue());
        Map<?, ?> d = (Map<?, ?>) detail(r);
        assertEquals("FILE_TOO_LARGE", d.get("code"));
        assertEquals(50L, ((Number) d.get("max_mb")).longValue());
        assertFalse(String.valueOf(d.get("message")).isEmpty());
        assertEquals(3, d.size());                                // code, message, max_mb
    }

    @Test
    public void 엑셀_업로드_413은_전역과_작성모드_중_작은_한도로_안내한다() {
        org.springframework.mock.web.MockHttpServletRequest excel =
                new org.springframework.mock.web.MockHttpServletRequest("POST", "/board-forms/default_doc/excel");
        org.springframework.mock.web.MockHttpServletRequest other =
                new org.springframework.mock.web.MockHttpServletRequest("POST", "/tasks/1/files");
        org.springframework.web.multipart.MaxUploadSizeExceededException ex =
                new org.springframework.web.multipart.MaxUploadSizeExceededException(-1);
        assertEquals(1L, ((Number) ((Map<?, ?>) detail(new ApiExceptionHandler(false, "1MB", 5).handleUploadTooLarge(ex, excel))).get("max_mb")).longValue());
        assertEquals(5L, ((Number) ((Map<?, ?>) detail(new ApiExceptionHandler(false, "50MB", 5).handleUploadTooLarge(ex, excel))).get("max_mb")).longValue());
        assertEquals(50L, ((Number) ((Map<?, ?>) detail(new ApiExceptionHandler(false, "50MB", 5).handleUploadTooLarge(ex, other))).get("max_mb")).longValue());
    }

    @Test
    public void 깨진_multipart는_400이고_파일명이_없다() {
        ApiExceptionHandler h = new ApiExceptionHandler(false, "50MB", 5);
        org.springframework.web.multipart.MultipartException ex =
                new org.springframework.web.multipart.MultipartException("x secret.xlsx");
        ResponseEntity<Map<String, Object>> excel = h.handleBadMultipart(ex,
                new org.springframework.mock.web.MockHttpServletRequest("POST", "/board-forms/default_doc/excel"));
        assertEquals(400, excel.getStatusCodeValue());
        Map<?, ?> d = (Map<?, ?>) detail(excel);
        assertEquals("BAD_REQUEST", d.get("code"));
        assertFalse(String.valueOf(d).contains("secret"));
        ResponseEntity<Map<String, Object>> other = h.handleBadMultipart(ex,
                new org.springframework.mock.web.MockHttpServletRequest("POST", "/tasks/1/files"));
        assertEquals(400, other.getStatusCodeValue());
        assertEquals(ApiExceptionHandler.MSG_BAD_MULTIPART, detail(other));
    }

    @Test
    public void 개발축에서는_예외_원문을_싣는다() {
        ResponseEntity<Map<String, Object>> r = new ApiExceptionHandler(true)
                .handleUnexpected(new IllegalStateException("boom"));
        assertTrue(String.valueOf(detail(r)).contains("boom"));
    }

    @Test
    public void 처리되지_않은_예외_로그는_한_줄이고_메시지와_스택이_없다() {
        Logger lg = (Logger) LoggerFactory.getLogger(ApiExceptionHandler.class);
        ListAppender<ILoggingEvent> logs = new ListAppender<>();
        logs.start();
        Level old = lg.getLevel();
        lg.setLevel(Level.DEBUG);
        lg.addAppender(logs);
        try {
            ResponseEntity<Map<String, Object>> r = new ApiExceptionHandler(false).handleUnexpected(
                    new DataRetrievalFailureException("ORA-00942: table SECRET_T", new IllegalStateException("jdbc:oracle:thin:@//10.0.0.1")));
            String ref = r.getHeaders().getFirst("X-Error-Ref");
            assertEquals(8, ref.length());
            ILoggingEvent error = null, debug = null;
            for (ILoggingEvent e : logs.list) {
                if (e.getLevel() == Level.ERROR) error = e;
                if (e.getLevel() == Level.DEBUG) debug = e;
            }
            String line = error.getFormattedMessage();
            assertTrue(line, line.contains("ref=" + ref));
            assertFalse(line, line.contains("\n"));
            assertFalse(line, line.contains("ORA-00942") || line.contains("SECRET_T") || line.contains("10.0.0.1"));
            assertTrue(line, line.contains(" at com.kbstar.") && line.contains("root=java.lang.IllegalStateException"));
            assertNull("ERROR 줄에는 스택이 없다", error.getThrowableProxy());
            assertTrue("스택은 DEBUG 줄에만", debug.getThrowableProxy() != null && debug.getFormattedMessage().contains(ref));
        } finally {
            lg.detachAppender(logs);
            lg.setLevel(old);
            logs.stop();
        }
    }

    @Test
    public void oneLine은_원인이_없으면_root를_붙이지_않는다() {
        String s = ApiExceptionHandler.oneLine(new IllegalArgumentException("secret"));
        assertTrue(s.startsWith("java.lang.IllegalArgumentException"));
        assertFalse(s.contains("secret") || s.contains("root="));
    }
}
