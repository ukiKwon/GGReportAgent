package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * LLM 상태 배지 — Task 5B.6. {@code GET /llm/status}.
 *
 * <p>고정하는 것은 <b>응답 모양</b> 하나다. 값 자체는 어댑터가 붙어야 의미가 생기지만
 * (문의 1-2 대기), 화면 배지가 읽는 키는 지금 정해져 있어야 한다.
 */
@RunWith(SpringRunner.class)
@AppTest
public class LlmStatusApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    public void 기본_조회에는_reachable이_없다() throws Exception {
        mockMvc.perform(get("/llm/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.model").exists())
                .andExpect(jsonPath("$.fallback_model").exists())
                .andExpect(jsonPath("$.base_url").exists())
                .andExpect(jsonPath("$.installed").isArray())
                .andExpect(jsonPath("$.reachable").doesNotExist());
    }

    /**
     * ⚠️ <b>이 테스트가 이 클래스의 이유다.</b> {@code reachable} 을 기본으로 채워
     * {@code false} 를 내보내면, 조회하지 않은 것과 못 닿은 것이 구분되지 않아
     * 멀쩡한 엔드포인트가 죽은 것처럼 보인다.
     */
    @Test
    public void probe를_켜야_reachable이_붙는다() throws Exception {
        mockMvc.perform(get("/llm/status").param("probe", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reachable").exists());
    }
}
