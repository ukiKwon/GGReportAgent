package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;

/** 조치 B — 모든 응답에 보안 헤더 3개. CSP 는 넣지 않는다(인라인 스크립트). */
@RunWith(SpringRunner.class)
@AppTest
public class SecurityHeadersApiTest {

    @Autowired
    private MockMvc mockMvc;

    private static void assertHeaders(ResultActions r) throws Exception {
        r.andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "SAMEORIGIN"))
                .andExpect(header().string("Referrer-Policy", "same-origin"))
                .andExpect(header().doesNotExist("Content-Security-Policy"));
    }

    @Test
    public void API_응답에_붙는다() throws Exception {
        assertHeaders(mockMvc.perform(get("/menus").param("role", "영업팀")));
    }

    @Test
    public void 오류_응답에도_붙는다() throws Exception {
        assertHeaders(mockMvc.perform(get("/institutions/없는기관")));   // 404 (ApiException)
    }

    /** 정적 경로 — 상태가 200 이든 404 이든(테스트 클래스패스에 화면이 없을 수 있다) 헤더는 붙는다. */
    @Test
    public void 정적_경로에도_붙는다() throws Exception {
        assertHeaders(mockMvc.perform(get("/index.html")));
        assertHeaders(mockMvc.perform(get("/no-such-file.js")));
    }
}
