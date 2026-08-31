package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 골든 {@code 25·26·27} 계열의 <b>빈 상태</b>만 본다 — 계획서가 단계 2에 요구한 범위다.
 *
 * <p>이 세 골든의 본문은 결재 시나리오(10~24)를 거친 뒤의 상태라 지금은 대조할 수
 * 없다. 그래도 <b>지금 확인해야 하는 것</b>이 있다: 데이터가 하나도 없을 때
 * <ul>
 *   <li>500 이 아니라 <b>200</b> 이고,</li>
 *   <li>{@code null} 이나 {@code {}} 가 아니라 <b>{@code []}</b> 다.</li>
 * </ul>
 * 둘 다 화면 쪽 계약이다 — 빈 배열 대신 null 이 가면 목록 컴포넌트가 그 자리에서
 * 깨진다. 그리고 이 경로들은 방언 분기가 걸린 SQL({@code selectForAssignee},
 * {@code selectByRecipients})을 실제로 <b>실행</b>하는 유일한 테스트이기도 하다 —
 * {@code MapperStatementBindingTest} 는 파싱까지만 본다.
 *
 * <p>본문이 실린 대조는 시드(Task 2.3)와 쓰기 경로(단계 3)가 붙은 뒤에 한다.
 */
@RunWith(SpringRunner.class)
@AppTest
public class EmptyStateApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    public void 담당자_공고목록이_빈_배열이다() throws Exception {
        // 골든 25 와 같은 질의(팀=영업, 담당=dave).
        mockMvc.perform(get("/bidcases").param("team", "영업").param("assignee", "dave"))
                .andExpect(status().isOk())
                .andExpect(content().json("[]", true));
    }

    @Test
    public void 기관별_최신공고가_빈_배열이다() throws Exception {
        mockMvc.perform(get("/bidcases/latest"))
                .andExpect(status().isOk())
                .andExpect(content().json("[]", true));
    }

    @Test
    public void 팀_작업목록이_빈_배열이다() throws Exception {
        // 골든 26 과 같은 질의(팀=전산).
        mockMvc.perform(get("/tasks").param("team", "전산"))
                .andExpect(status().isOk())
                .andExpect(content().json("[]", true));
    }

    @Test
    public void 쪽지함이_빈_배열이다() throws Exception {
        // 골든 27 과 같은 질의(수신=영업팀).
        mockMvc.perform(get("/notifications").param("recipient", "영업팀"))
                .andExpect(status().isOk())
                .andExpect(content().json("[]", true));
    }

    /**
     * {@code limit} 범위 밖은 원본이 FastAPI {@code Query(ge=1, le=200)} 로 막던
     * 자리다. 스프링에는 그 검증이 없어 직접 넣었으므로({@link NotificationController})
     * 여기서 못 박는다 — 없으면 {@code limit=0} 이 조용히 빈 목록을 내고,
     * {@code limit=100000} 이 전량 조회가 된다.
     */
    @Test
    public void 쪽지함_limit이_범위를_벗어나면_400이다() throws Exception {
        mockMvc.perform(get("/notifications").param("recipient", "영업팀").param("limit", "0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").exists());
        mockMvc.perform(get("/notifications").param("recipient", "영업팀").param("limit", "201"))
                .andExpect(status().isBadRequest());
    }

    /**
     * 필수 파라미터 누락은 400 이어야 한다(원본 FastAPI 는 422 지만, 골든에 그 응답이
     * 없어 계약이 아니다 — 여기서 보는 것은 <b>500 이 아니라는 것</b>이다).
     */
    @Test
    public void 필수_파라미터가_빠지면_500이_아니다() throws Exception {
        mockMvc.perform(get("/bidcases").param("team", "영업"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/tasks"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/notifications"))
                .andExpect(status().isBadRequest());
    }
}
