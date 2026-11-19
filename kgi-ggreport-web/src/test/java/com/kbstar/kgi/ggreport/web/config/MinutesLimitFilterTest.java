package com.kbstar.kgi.ggreport.web.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * 이사회 회의록 쓰기 경로의 본문 크기 사전 차단(MinutesLimitFilter). 필터는 인증·경로 존재와 무관하게 Content-Length 로 먼저 자르므로
 * 번호가 없는 경로로도 확인한다(multipart 로 해석되지 않은 일반 요청). 기존 BoardWriteLimitFilter 한도는 그대로여야 한다(회귀).
 */
@RunWith(SpringRunner.class)
@AppTest
public class MinutesLimitFilterTest {

    private static final long MB = 1024L * 1024;

    @Autowired private MockMvc mockMvc;
    private final ObjectMapper om = new ObjectMapper();

    private JsonNode body(MvcResult r) throws Exception {
        return om.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private static byte[] bytes(long n) {
        return new byte[(int) n];
    }

    @Test
    public void 업로드_경로가_파일_세_개_한도를_넘으면_413_FILE_TOO_LARGE() throws Exception {
        MvcResult r = mockMvc.perform(post("/board-materials/1/minutes").contentType(MediaType.APPLICATION_OCTET_STREAM)
                .content(bytes(7 * MB + 1))).andReturn();
        assertEquals(413, r.getResponse().getStatus());
        assertEquals("FILE_TOO_LARGE", body(r).path("detail").path("code").asText());
        assertEquals("no-store", r.getResponse().getHeader("Cache-Control"));
        MvcResult pv = mockMvc.perform(post("/board-materials/1/minutes/preview").contentType(MediaType.APPLICATION_OCTET_STREAM)
                .content(bytes(7 * MB + 1))).andReturn();
        assertEquals(413, pv.getResponse().getStatus());
    }

    @Test
    public void 길이가_없으면_411_LENGTH_REQUIRED() throws Exception {
        MvcResult r = mockMvc.perform(post("/board-materials/1/minutes")).andReturn();
        assertEquals(411, r.getResponse().getStatus());
        assertEquals("LENGTH_REQUIRED", body(r).path("detail").path("code").asText());
    }

    @Test
    public void 수정_PUT은_128KB를_넘으면_413_BODY_TOO_LARGE() throws Exception {
        MvcResult r = mockMvc.perform(put("/board-minutes/1/utterances/1").contentType(MediaType.APPLICATION_JSON)
                .content(bytes(128 * 1024 + 1))).andReturn();
        assertEquals(413, r.getResponse().getStatus());
        assertEquals("BODY_TOO_LARGE", body(r).path("detail").path("code").asText());
        MvcResult item = mockMvc.perform(put("/board-minutes/1/items/1").contentType(MediaType.APPLICATION_JSON)
                .content(bytes(128 * 1024 + 1))).andReturn();
        assertEquals(413, item.getResponse().getStatus());
    }

    @Test
    public void 공개범위_추가와_삭제_메타는_16KB를_넘으면_413() throws Exception {
        for (String path : new String[]{"/board-minutes/1/scope/add", "/board-minutes/1/scope/remove",
                "/board-minutes/1/delete", "/board-minutes/1/items/1/done"}) {
            MvcResult r = mockMvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(bytes(16 * 1024 + 1))).andReturn();
            assertEquals(path, 413, r.getResponse().getStatus());
        }
        MvcResult meta = mockMvc.perform(put("/board-minutes/1/meta").contentType(MediaType.APPLICATION_JSON)
                .content(bytes(16 * 1024 + 1))).andReturn();
        assertEquals(413, meta.getResponse().getStatus());
    }

    @Test
    public void 기존_이사회_자료_쓰기는_기존_한도_16KB를_그대로_받는다() throws Exception {
        MvcResult r = mockMvc.perform(post("/board-materials/1/submit").contentType(MediaType.APPLICATION_JSON)
                .content(bytes(16 * 1024 + 1))).andReturn();
        assertEquals(413, r.getResponse().getStatus());
        assertEquals("BODY_TOO_LARGE", body(r).path("detail").path("code").asText());
        assertEquals(16, body(r).path("detail").path("max_kb").asInt());   // 기존 필터의 응답(max_kb 포함)
    }
}
