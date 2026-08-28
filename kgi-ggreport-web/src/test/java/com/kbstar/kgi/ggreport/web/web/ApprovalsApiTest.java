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
 * 결재함 API — Task 5B.2.
 *
 * <p>결재 라인 자체는 {@code ApprovalsQueueTest} 가 본다. 여기서 보는 것은 <b>배선</b>이다:
 * 경로·필수 파라미터·빈 상태, 그리고 <b>동적 SQL 이 실제로 도는지</b>.
 * {@code MapperStatementBindingTest} 는 파싱까지만 보므로, {@code foreach} 로 만든
 * {@code (팀,상태) OR …} 절이 실행되는 것은 여기서만 확인된다.
 *
 * <p>데이터를 만들지 않는다 — 이 클래스는 {@code @Transactional} 이 아니라, 넣은 행이
 * 남으면 다른 테스트의 빈 상태 계약을 깨뜨린다(2026-08-28에 실제로 겪었다).
 * 본문이 실린 대조는 {@code GoldenWriteScenarioTest} 가 만든 상태에서 볼 일이다.
 */
@RunWith(SpringRunner.class)
@AppTest
public class ApprovalsApiTest {

    @Autowired
    private MockMvc mockMvc;

    /**
     * ⚠️ 후행 슬래시가 붙으면 안 된다 — 원본이 정확히 {@code /approvals} 이고 화면이
     * 그 주소로 부른다.
     */
    @Test
    public void 팀장_결재함이_빈_목록으로_온다() throws Exception {
        mockMvc.perform(get("/approvals").param("role", "전산팀장"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("전산팀장"))
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.items.length()").value(0));
    }

    /** 영업팀장은 (영업, 디자이너) 두 쌍으로 질의한다 — {@code foreach} 가 실제로 도는 자리. */
    @Test
    public void 영업팀장_결재함도_돈다() throws Exception {
        mockMvc.perform(get("/approvals").param("role", "영업팀장"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0));
    }

    /**
     * 영업부장은 게이트까지 본다 — 오케스트레이터를 기관마다 물어보는 경로가 여기서만
     * 실행된다. 실행 중인 것이 없으면 빈 목록이어야 하고, <b>예외가 나면 안 된다.</b>
     */
    @Test
    public void 영업부장_결재함은_게이트_조회까지_돌고_빈_목록이다() throws Exception {
        mockMvc.perform(get("/approvals").param("role", "영업부장"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("영업부장"))
                .andExpect(jsonPath("$.items.length()").value(0));
    }

    /**
     * 결재 권한이 없는 역할은 <b>빈 IN 절로 질의를 돌리면 안 된다</b>(SQL 오류).
     * 500 이 아니라 200 + 빈 목록이어야 한다.
     */
    @Test
    public void 결재권한이_없는_역할도_500이_아니라_빈_목록이다() throws Exception {
        for (String role : new String[]{"영업팀", "디자이너", "없는역할"}) {
            mockMvc.perform(get("/approvals").param("role", role))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.role").value(role))
                    .andExpect(jsonPath("$.items.length()").value(0));
        }
    }

    /** {@code role} 이 없으면 400 — 없이 열면 남의 결재함까지 보이는 전체 조회가 된다. */
    @Test
    public void role이_없으면_400이다() throws Exception {
        mockMvc.perform(get("/approvals"))
                .andExpect(status().isBadRequest());
    }

    @Test
    public void role이_비어_있으면_400이다() throws Exception {
        mockMvc.perform(get("/approvals").param("role", "  "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").exists());
    }
}
