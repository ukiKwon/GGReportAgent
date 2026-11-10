package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.config.StaticCacheFilter;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;

/** 화면 정적 파일 캐시 정책 — 재배포 뒤 옛 JS 가 뜨는 것을 막는다(NEXT 53). 파일 유무와 무관(404 에도 헤더). */
@RunWith(SpringRunner.class)
@AppTest
public class StaticCacheApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    public void html_js_css_는_no_cache() throws Exception {
        for (String p : new String[]{"/", "/index.html", "/js/workflow.js", "/css/x.css"}) {
            mockMvc.perform(get(p)).andExpect(header().string("Cache-Control", "no-cache"));
        }
    }

    @Test
    public void 이미지_폰트는_짧은_캐시() throws Exception {
        mockMvc.perform(get("/img/a.png")).andExpect(header().string("Cache-Control", "private, max-age=300"));
    }

    @Test
    public void API_응답에는_붙지_않는다() throws Exception {
        mockMvc.perform(get("/menus").param("role", "영업팀"))
                .andExpect(header().string("Cache-Control", not(containsString("max-age"))));
    }

    @Test
    public void 확장자_판정_단위() {
        assertEquals("no-cache", StaticCacheFilter.policyFor("/app/js/a.JS;jsessionid=1", "/app"));
        assertNull(StaticCacheFilter.policyFor("/tasks/1.5/files", ""));
        assertNull(StaticCacheFilter.policyFor("/institutions/강남구", ""));
    }
}
