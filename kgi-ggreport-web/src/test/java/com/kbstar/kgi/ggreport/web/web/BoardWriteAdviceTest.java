package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.service.BoardWriteService;
import org.junit.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 작성 API advice 의 5xx 처리 — 서비스를 목으로 바꿔 예외를 던진다(원문이 응답에 새지 않는지). 관리자 8203417 은 부여 없이 작성 가능. */
public class BoardWriteAdviceTest {

    private static final String ADMIN = "8203417";
    private static final String EXCEL = "/board-forms/default_doc/excel";
    private static final String SECRET = "secret-cell-9f3-900101-1234567";

    /** 스프링 컨텍스트·DB 없이 standalone MockMvc — 가드·서비스는 mock. */
    private final BoardWriteService service = mock(BoardWriteService.class);
    private final MockMvc mockMvc;

    public BoardWriteAdviceTest() {
        MenuGuard guard = mock(MenuGuard.class);
        when(guard.requireWrite(any(), any(), any())).thenReturn(Actor.claimed(ADMIN));
        mockMvc = MockMvcBuilders.standaloneSetup(new BoardWriteController(guard, service))
                .setControllerAdvice(new BoardWriteExceptionHandler()).build();
    }

    private JsonNode uploadExpecting(int expect) throws Exception {
        String text = mockMvc.perform(multipart(EXCEL)
                .file(new MockMultipartFile("file", "가상.xlsx", "application/octet-stream", new byte[]{1}))
                .header(Actor.HEADER, ADMIN))
                .andExpect(status().is(expect)).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertFalse(text, text.contains("secret"));
        assertFalse(text, text.contains("1234567"));
        assertFalse(text, text.contains("Exception"));
        return new ObjectMapper().readTree(text).get("detail");
    }

    private void assertGeneric500(JsonNode d) {
        assertEquals("SERVER_ERROR", d.get("code").asText());
        assertEquals(ApiExceptionHandler.GENERIC_500, d.get("message").asText());
    }

    @Test
    public void IllegalState는_500_SERVER_ERROR_일반_문구() throws Exception {
        when(service.upload(any(), any(), any(), any())).thenThrow(new IllegalStateException(SECRET));
        assertGeneric500(uploadExpecting(500));
    }

    @Test
    public void POI_Error계열은_500_SERVER_ERROR_일반_문구() throws Exception {
        java.util.List<Error> errors = java.util.Arrays.asList(
                new NoClassDefFoundError(SECRET), new StackOverflowError(), new ExceptionInInitializerError(new RuntimeException(SECRET)));
        for (Error err : errors) {
            org.mockito.Mockito.doThrow(err).when(service).upload(any(), any(), any(), any());   // 반복 재설정: when(...) 형태는 앞선 설정이 터진다
            assertGeneric500(uploadExpecting(500));
        }
    }

    @Test
    public void NullPointer도_RuntimeException_처리기로_500() throws Exception {
        when(service.upload(any(), any(), any(), any())).thenThrow(new NullPointerException(SECRET));
        assertGeneric500(uploadExpecting(500));
    }

    @Test
    public void 구체_처리기가_우선한다_4xx_ApiException은_상수_문구_그대로() throws Exception {
        when(service.upload(any(), any(), any(), any())).thenThrow(ApiException.badRequest("고정 문구"));
        JsonNode detail = uploadExpecting(400);
        assertEquals("BAD_REQUEST", detail.get("code").asText());
        assertEquals("고정 문구", detail.get("message").asText());
    }

    @Test
    public void 문자열_사유_5xx_ApiException은_일반_문구로_바꾼다() throws Exception {
        when(service.upload(any(), any(), any(), any())).thenThrow(new ApiException(500, SECRET));
        assertGeneric500(uploadExpecting(500));
    }

    @Test
    public void codeOf는_409_CONFLICT_422_ERROR() {
        assertEquals("CONFLICT", BoardWriteExceptionHandler.codeOf(409));
        assertEquals("ERROR", BoardWriteExceptionHandler.codeOf(422));
        assertEquals("SERVER_ERROR", BoardWriteExceptionHandler.codeOf(503));
    }

    @Test
    public void 로그_설명은_메시지를_빼고_프레임_8개_cause_5개까지() {
        Throwable t = new IllegalStateException(SECRET, new RuntimeException("c1", new RuntimeException("c2",
                new RuntimeException("c3", new RuntimeException("c4", new RuntimeException("c5",
                        new RuntimeException("c6")))))));
        String s = BoardWriteExceptionHandler.describe(t);
        assertTrue(s, s.startsWith("java.lang.IllegalStateException"));
        assertFalse(s, s.contains("secret"));
        assertFalse(s, s.contains("c1"));
        int frames = s.split("\n    at ", -1).length - 1;
        assertTrue("프레임 " + frames, frames <= 8);
        String causes = s.substring(s.indexOf("causes:"));
        assertEquals(5, causes.split("java.lang.RuntimeException", -1).length - 1);
    }
}
