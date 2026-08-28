package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.domain.ChatMessage;
import com.kbstar.kgi.ggreport.web.domain.Institution;
import com.kbstar.kgi.ggreport.web.dto.ChatIn;
import com.kbstar.kgi.ggreport.web.mapper.ChatMessageMapper;
import com.kbstar.kgi.ggreport.web.support.Ids;
import com.kbstar.kgi.ggreport.web.support.Times;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

/**
 * 대화 탭. Python {@code server/routers/chat.py} + {@code server/chat_repository.py}.
 *
 * <p><b>스트리밍이지만 SSE 가 아니다</b>(설계 2026-08-28 개정). 원본은
 * {@code POST} + {@code text/plain; charset=utf-8} 평문 청크이고 {@code data:}
 * 프레이밍이 없다. 화면도 {@code EventSource} 가 아니라 {@code fetch} +
 * {@code body.getReader()} 로 읽는다({@code frontend/js/chat.js}).
 * ⚠️ {@code SseEmitter} 로 바꾸면 프레이밍이 붙어 말풍선에 {@code data:} 가 쌓인다 —
 * <b>화면 무변경이 이관의 전제</b>다.
 *
 * <p>실행이 두 토막인 것도 원본 그대로다. {@link #begin} 은 <b>응답 첫 바이트 전에</b>
 * 끝나야 한다 — 404 와 질문 저장이 여기 있다. 그 뒤에야 {@link #writeReply} 가 돈다.
 * 합치면 404 를 200 본문에 실어 보내게 되어 화면이 오류를 못 알아본다.
 */
@Service
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);

    /** 중단된 답변임을 읽는 사람이 알게 하는 꼬리표. 원본 문구 그대로다. */
    static final String INTERRUPTED = "…(응답이 중단되었습니다)";

    private final InstitutionService institutions;
    private final ChatMessageMapper messages;
    private final ConsultReply consult;
    private final AppProperties properties;

    public ChatService(InstitutionService institutions, ChatMessageMapper messages,
                       ConsultReply consult, AppProperties properties) {
        this.institutions = institutions;
        this.messages = messages;
        this.consult = consult;
        this.properties = properties;
    }

    /** {@code GET /institutions/{id}/chat} — 없는 기관이면 404. */
    public List<ChatMessage> list(String institutionId) {
        institutions.require(institutionId);
        return messages.selectByInstitution(institutionId);
    }

    /**
     * 스트리밍 <b>전에</b> 끝내야 하는 일 — 404 판정, 이력 확보, 질문 저장.
     *
     * <p>⚠️ <b>순서가 계약이다.</b> 이력을 먼저 읽고 그다음에 질문을 넣는다. 뒤집으면
     * 방금 한 질문이 "이전 대화"에 섞여 모델에 두 번 들어간다(원본과 같은 순서).
     */
    public Pending begin(String institutionId, ChatIn in) {
        Institution institution = institutions.require(institutionId);

        List<ChatMessage> history = messages.selectByInstitution(institutionId);

        ChatMessage question = new ChatMessage();
        question.setChatMessageId(Ids.chat());
        question.setInstitutionId(institutionId);
        question.setRole("user");
        question.setContent(in.getContent());
        question.setCreatedAt(Times.nowIso());
        // 한글 이름은 헤더에 못 실어서 본문으로 받는다(X-User-Id 는 ASCII 전용).
        question.setAuthor(in.getAuthor());
        messages.insert(question);

        // 반입된 공고 원문이 있을 때만 넘긴다 — 원본도 존재할 때만 경로를 준다.
        Path rfpText = Paths.get(properties.getOutputRoot(), institution.getNameKo(), "rfp_text.txt");
        String rfpTextPath = Files.isRegularFile(rfpText) ? rfpText.toString() : null;

        return new Pending(institutionId, new ConsultReply.Request(
                institution.getNameKo(), institution.getGiganlistDir(), rfpTextPath,
                history, in.getContent()));
    }

    /**
     * 답변을 만들면서 곧바로 흘려보내고, 끝나면 이력에 남긴다.
     *
     * <p>이 메서드는 <b>예외를 밖으로 내보내지 않는다</b>. 첫 바이트를 이미 보냈을 수
     * 있어 HTTP 상태를 바꿀 수 없기 때문이다 — 사유는 200 본문에 실어 보낸다.
     */
    public void writeReply(Pending pending, OutputStream out) {
        List<String> parts = new ArrayList<>();
        boolean completed = false;
        String failure = null;

        try {
            consult.stream(pending.request, chunk -> {
                if (chunk == null || chunk.isEmpty()) {
                    return;
                }
                // ⚠️ 기록이 먼저, 전송이 나중이다(원본도 append 뒤에 yield 한다).
                // 순서를 뒤집으면 브라우저가 끊긴 순간의 마지막 조각이 이력에서 사라진다.
                parts.add(chunk);
                write(out, chunk);
            });
            completed = true;
        } catch (ClientGoneException gone) {
            // 실패가 아니라 중단이다. 더 쓸 곳이 없으므로 본문에 아무것도 덧붙이지 않는다.
            log.debug("대화 스트림이 클라이언트 종료로 끊겼다 — 받은 만큼만 남긴다", gone);
        } catch (Exception exc) {
            failure = consult.failureNotice(exc);
            // 이미 보낸 조각이 있으면 빈 줄로 떼어 놓는다(원본과 같은 모양).
            try {
                write(out, (parts.isEmpty() ? "" : "\n\n") + failure);
            } catch (ClientGoneException alreadyGone) {
                log.debug("실패 사유를 보내려던 중 클라이언트가 끊겼다", alreadyGone);
            }
            log.warn("대화 답변 생성 실패 — 사유를 본문에 실어 보냈다", exc);
        } finally {
            persist(pending.institutionId, parts, completed, failure);
        }
    }

    /**
     * 받은 만큼은 남긴다 — 안 그러면 질문만 있고 답이 통째로 사라진 "반쪽 이력"이 된다.
     *
     * <p>⚠️ <b>한 조각도 못 받았으면 저장하지 않는다.</b> 오류 문구가 {@code agent}
     * 발언으로 이력에 남으면 <b>다음 질문 때 그것이 대화 맥락으로 모델에 다시 들어간다.</b>
     */
    private void persist(String institutionId, List<String> parts, boolean completed, String failure) {
        StringBuilder joined = new StringBuilder();
        for (String part : parts) {
            joined.append(part);
        }
        if (joined.length() == 0) {
            return;
        }
        if (!completed) {
            joined.append("\n\n").append(failure != null ? failure : INTERRUPTED);
        }

        ChatMessage answer = new ChatMessage();
        answer.setChatMessageId(Ids.chat());
        answer.setInstitutionId(institutionId);
        answer.setRole("agent");
        answer.setContent(joined.toString());
        answer.setCreatedAt(Times.nowIso());
        answer.setAuthor(null);   // 에이전트 답변에는 작성자가 없다
        try {
            messages.insert(answer);
        } catch (RuntimeException exc) {
            // 응답은 이미 나갔다. 여기서 던져 봐야 화면에 전달되지 않으므로 로그로 남긴다.
            log.error("대화 답변을 이력에 남기지 못했다 — institutionId={}", institutionId, exc);
        }
    }

    /**
     * 한 조각을 내보내고 <b>즉시 flush</b> 한다.
     *
     * <p>⚠️ flush 를 빠뜨리면 컨테이너가 버퍼에 모아 두었다가 <b>끝에 한 번에</b> 보낸다.
     * 그러면 응답은 맞지만 "조금씩 나타나는" 동작이 사라져 스트리밍의 의미가 없다.
     * (앞단 경유지가 버퍼링하면 여기서 flush 해도 같은 증상이 난다 — 그게 문의 7번이다.)
     */
    private void write(OutputStream out, String chunk) throws ClientGoneException {
        try {
            out.write(chunk.getBytes(StandardCharsets.UTF_8));
            out.flush();
        } catch (IOException io) {
            throw new ClientGoneException(io);
        }
    }

    /** {@link #begin} 이 확보해 둔 것 — 스트리밍이 시작되면 더 조회하지 않는다. */
    public static final class Pending {

        private final String institutionId;
        private final ConsultReply.Request request;

        Pending(String institutionId, ConsultReply.Request request) {
            this.institutionId = institutionId;
            this.request = request;
        }

        public ConsultReply.Request getRequest() {
            return request;
        }
    }
}
