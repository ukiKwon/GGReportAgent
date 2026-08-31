package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.ChatMessage;

import java.util.List;

/**
 * 대화 탭의 답변 생성기 — Python {@code server/agent_adapter.stream_consult_reply}
 * 와 {@code failure_notice} 자리.
 *
 * <p><b>이 인터페이스가 Task 4.3 과 4.4 의 경계다.</b> 4.3(스트리밍 전송)은 여기까지
 * 완성돼 있고, 답변을 실제로 만드는 구현은 사내 LLM 어댑터(Task 4.4)가 채운다 —
 * <b>문의 1·6 회신 전까지 규격이 정해지지 않는다.</b> 회신이 오면
 * {@link NotYetMigratedConsultReply} 를 실제 구현으로 갈아 끼우는 것이 전부이고,
 * {@link ChatService} 와 컨트롤러는 손대지 않는다.
 */
public interface ConsultReply {

    /**
     * 답변을 조각으로 나눠 {@code sink} 에 밀어 넣는다. 조각 경계는 자유다 —
     * 화면이 {@code TextDecoder(..., {stream:true})} 로 이어 붙이므로 한글이
     * 조각 경계에서 잘려도 깨지지 않는다({@code frontend/js/chat.js}).
     *
     * @throws ClientGoneException {@code sink} 가 던진다. <b>가로채지 말 것</b> —
     *         {@link ChatService} 가 "중단된 답변"과 "실패한 답변"을 이것으로 가른다.
     */
    void stream(Request request, ChunkSink sink) throws Exception;

    /**
     * 실패를 <b>사용자가 읽을 한 문단</b>으로 만든다. Python {@code failure_notice}.
     *
     * <p>스트리밍은 첫 바이트를 보낸 뒤라 HTTP 상태를 바꿀 수 없다. 그래서 예외를
     * 삼키면 화면에 <b>아무 설명 없는 빈 말풍선</b>만 남는다 — 사용자는 고장인지
     * 답이 없는 건지 알 수 없다. 조용히 실패하지 않는다.
     *
     * <p>원본은 여기서 모델명·엔드포인트 URL 을 문구에 넣어 "무엇을 고쳐야 하는지"를
     * 알려준다. 그 두 값은 LLM 어댑터가 아는 것이라 이 메서드도 구현 쪽에 있다.
     */
    String failureNotice(Exception exc);

    /** 답변 조각을 받는 곳. 화면으로 곧장 흘러간다. */
    interface ChunkSink {
        /**
         * @throws ClientGoneException 브라우저가 이미 끊었을 때. 생성기는 이걸 잡지 말고
         *         그대로 위로 올려 보내면 된다(계속 만들어 봐야 받을 사람이 없다).
         */
        void accept(String chunk) throws ClientGoneException;
    }

    /** 답변 생성에 필요한 입력. Python {@code stream_consult_reply} 의 인자와 1:1. */
    final class Request {

        private final String institutionName;
        private final String giganlistDir;
        private final String rfpTextPath;
        private final List<ChatMessage> history;
        private final String userMessage;

        public Request(String institutionName, String giganlistDir, String rfpTextPath,
                       List<ChatMessage> history, String userMessage) {
            this.institutionName = institutionName;
            this.giganlistDir = giganlistDir;
            this.rfpTextPath = rfpTextPath;
            this.history = history;
            this.userMessage = userMessage;
        }

        public String getInstitutionName() { return institutionName; }

        public String getGiganlistDir() { return giganlistDir; }

        /** 반입된 공고 원문. <b>없으면 null</b> — 원본도 파일이 있을 때만 넘긴다. */
        public String getRfpTextPath() { return rfpTextPath; }

        /** 이번 질문 <b>이전</b>까지의 대화. 방금 받은 질문은 들어 있지 않다. */
        public List<ChatMessage> getHistory() { return history; }

        public String getUserMessage() { return userMessage; }
    }
}
