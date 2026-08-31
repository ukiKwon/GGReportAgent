package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 대화 탭의 <b>전송 계약</b> — Task 4.3.
 *
 * <p>여기서 지키는 것은 답변 내용이 아니라 <b>봉투</b>다. 답변 생성기는 아직 이관 전이라
 * ({@code NotYetMigratedConsultReply}, 문의 1·6 대기) 본문은 실패 사유가 된다. 그래도
 * 이관 뒤에 깨지면 화면이 조용히 망가지는 것들은 <b>지금</b> 못 박을 수 있다.
 *
 * <p>⚠️ <b>{@code data:} 프레이밍이 없어야 한다.</b> 설계가 2026-08-28 전까지 원본을
 * "SSE"로 잘못 적고 있었고, 그대로 {@code SseEmitter} 로 만들면 말풍선에 {@code data:}
 * 접두사가 그대로 쌓인다. 화면({@code frontend/js/chat.js})은 {@code EventSource} 가
 * 아니라 {@code fetch} + {@code body.getReader()} 로 읽어 프레이밍을 풀지 않는다.
 */
@RunWith(SpringRunner.class)
@AppTest
public class ChatStreamingApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    public void 없는_기관의_대화조회는_404다() throws Exception {
        mockMvc.perform(get("/institutions/no-such-gu/chat"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("institution not found"));
    }

    /**
     * 404 는 <b>스트림이 시작되기 전에</b> 나가야 한다. 스트림이 열린 뒤에는 상태를
     * 바꿀 수 없어 오류가 200 본문에 섞이고, 화면이 그것을 답변으로 표시한다.
     */
    @Test
    public void 없는_기관에_질문하면_스트림_대신_404가_나간다() throws Exception {
        mockMvc.perform(post("/institutions/no-such-gu/chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"안녕\"}"))
                .andExpect(status().isNotFound())
                .andExpect(request().asyncNotStarted())
                .andExpect(jsonPath("$.detail").value("institution not found"));
    }

    /**
     * ⚠️ <b>기관을 테스트마다 다르게 쓴다.</b> 이 클래스는 {@code @Transactional} 이
     * 아니라 넣은 행이 그대로 남고, 컨텍스트(=H2)는 클래스 사이에 공유된다. 같은
     * 기관을 쓰면 실행 순서에 따라 "빈 목록"이 빈 목록이 아니게 된다(2026-08-28 실제로 겪음).
     * 아래 배분: {@code jongno}=빈 목록 · {@code nowon}=전송 계약 · {@code dobong}=이력 규칙.
     */
    @Test
    public void 대화가_없으면_빈_배열이다() throws Exception {
        mockMvc.perform(get("/institutions/jongno/chat"))
                .andExpect(status().isOk())
                .andExpect(content().json("[]", true));
    }

    @Test
    public void 응답은_평문_스트림이고_SSE_프레이밍이_없다() throws Exception {
        MvcResult started = mockMvc.perform(post("/institutions/nowon/chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"노원구 알려줘\",\"author\":\"김영업\"}"))
                .andExpect(request().asyncStarted())
                .andReturn();

        MvcResult done = mockMvc.perform(asyncDispatch(started))
                .andExpect(status().isOk())
                .andReturn();

        String contentType = done.getResponse().getContentType();
        assertEquals("text/plain;charset=UTF-8", contentType);

        String body = done.getResponse().getContentAsString();
        assertFalse("SSE 프레이밍이 붙으면 안 된다", body.contains("data:"));
        assertFalse("SSE 이벤트 필드가 붙으면 안 된다", body.contains("event:"));

        // 생성기가 아직 이관 전이라 사유가 본문으로 온다 — 조용히 빈 답을 주지 않는다.
        assertTrue("이관 전에는 사유가 본문에 실려야 한다", body.contains("[답변 실패]"));
        assertTrue("무엇을 기다리는지 문구에 남아야 한다", body.contains("Task 4.4"));
    }

    /**
     * 길이를 모르는 응답이라 chunked 로 나가야 한다. {@code Content-Length} 가 붙었다면
     * 어딘가에서 응답을 통째로 모았다는 뜻이고, 그 순간 스트리밍이 아니게 된다.
     */
    @Test
    public void ContentLength를_달지_않는다() throws Exception {
        MvcResult started = mockMvc.perform(post("/institutions/nowon/chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"질문\"}"))
                .andReturn();
        MvcResult done = mockMvc.perform(asyncDispatch(started)).andReturn();

        assertFalse(done.getResponse().containsHeader("Content-Length"));
    }

    /**
     * 답변을 한 조각도 못 받았으므로 이력에는 <b>질문만</b> 남는다. 실패 문구가
     * {@code agent} 발언으로 남으면 다음 질문 때 대화 맥락으로 다시 들어간다.
     */
    @Test
    public void 실패한_답변은_이력에_남지_않는다() throws Exception {
        MvcResult started = mockMvc.perform(post("/institutions/dobong/chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"도봉구 알려줘\",\"author\":\"김영업\"}"))
                .andReturn();
        mockMvc.perform(asyncDispatch(started)).andExpect(status().isOk());

        mockMvc.perform(get("/institutions/dobong/chat"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].role").value("user"))
                .andExpect(jsonPath("$[0].content").value("도봉구 알려줘"))
                .andExpect(jsonPath("$[0].author").value("김영업"));
    }
}
