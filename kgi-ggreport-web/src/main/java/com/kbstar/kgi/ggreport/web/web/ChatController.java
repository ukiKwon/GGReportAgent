package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.domain.ChatMessage;
import com.kbstar.kgi.ggreport.web.dto.ChatIn;
import com.kbstar.kgi.ggreport.web.service.ChatService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.util.List;

/**
 * 대화 탭 — Task 4.3. Python {@code server/routers/chat.py}.
 *
 * <p>기관 컨트롤러와 접두사가 같지만 파일을 나눴다. 여기만 <b>비동기 스트리밍</b>이라
 * 수명주기가 다르고({@link StreamingResponseBody} 는 요청 스레드 밖에서 돈다),
 * 아래 두 계약이 한 곳에 모여 있어야 다음 사람이 안전하게 고칠 수 있다.
 *
 * <p><b>계약 1 — SSE 가 아니다.</b> {@code text/plain; charset=utf-8} 평문 청크이고
 * {@code data:} 프레이밍이 없다. 화면은 {@code fetch} + {@code body.getReader()} 로
 * 읽는다({@code frontend/js/chat.js}). ⚠️ {@code SseEmitter}(= {@code text/event-stream})
 * 로 바꾸면 말풍선에 {@code data:} 접두사가 그대로 쌓인다.
 * (설계 2026-08-28 개정 — 종전 설계가 원본을 "SSE"로 잘못 적고 있었다.)
 *
 * <p><b>계약 2 — {@code Content-Length} 를 달지 않는다.</b> 길이를 알 수 없으므로
 * chunked 로 나가야 한다. 스트림을 다 모아 길이를 세는 순간 "조금씩 나타나는"
 * 동작이 사라진다.
 *
 * <p>⚠️ 이 메서드에 {@code @Transactional} 을 붙이지 말 것. 답변이 끝날 때까지 DB
 * 커넥션을 붙잡아, 대화 하나가 커넥션 풀을 수 분씩 점유한다.
 */
@RestController
@RequestMapping("/institutions")
public class ChatController {

    private final ChatService chat;

    public ChatController(ChatService chat) {
        this.chat = chat;
    }

    @GetMapping("/{institutionId}/chat")
    public List<ChatMessage> list(@PathVariable String institutionId) {
        return chat.list(institutionId);
    }

    /**
     * 질문을 받아 답변을 흘려보낸다.
     *
     * <p>{@code begin()} 을 <b>본문 밖에서</b> 먼저 부른다 — 없는 기관의 404 는 첫
     * 바이트를 보내기 전에 나가야 진짜 404 가 된다. 스트림이 시작된 뒤에는 상태를
     * 바꿀 수 없어, 오류가 200 본문에 섞여 나가고 화면이 알아보지 못한다.
     */
    @PostMapping("/{institutionId}/chat")
    public ResponseEntity<StreamingResponseBody> post(@PathVariable String institutionId,
                                                      @RequestBody ChatIn body) {
        ChatService.Pending pending = chat.begin(institutionId, body);
        StreamingResponseBody stream = out -> chat.writeReply(pending, out);
        return ResponseEntity.ok()
                .contentType(MediaType.valueOf("text/plain;charset=UTF-8"))
                // 앞단이 우리 편일 때 버퍼링을 끄게 하는 힌트다. 경유지가 무시할 수 있고
                // (그래서 문의 7번을 물었다) 표준 헤더도 아니지만, 붙여서 손해는 없다.
                .header(HttpHeaders.CACHE_CONTROL, "no-cache")
                .header("X-Accel-Buffering", "no")
                .body(stream);
    }
}
