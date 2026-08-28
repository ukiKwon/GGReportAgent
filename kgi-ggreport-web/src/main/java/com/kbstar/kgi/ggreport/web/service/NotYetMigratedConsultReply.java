package com.kbstar.kgi.ggreport.web.service;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;

/**
 * 아직 이관하지 않은 답변 생성기 — <b>소리 내어 실패한다.</b>
 * {@code orchestrator/NotYetMigratedHandler} 와 같은 이유·같은 방식이다.
 *
 * <p>사내 LLM 어댑터(Task 4.4)는 <b>문의 1·6 회신 전까지 규격이 정해지지 않는다.</b>
 * 그동안 이 자리를 빈 구현으로 채워 두면 대화 탭이 <b>빈 답을 정상 응답처럼</b>
 * 돌려주고, 화면에는 그저 답이 짧은 것으로 보인다.
 *
 * <p>대신 실패로 남긴다. {@link ChatService} 가 이 예외를 잡아 사유를 <b>본문에 실어</b>
 * 보내므로(상태는 200 — 첫 바이트를 이미 보냈을 수 있어 바꿀 수 없다) 화면에는
 * "왜 답이 없는지"가 그대로 보인다. 그리고 답이 한 조각도 없으므로 <b>이력에는
 * 저장되지 않는다</b> — 저장하면 이 문구가 다음 질문의 대화 맥락으로 들어간다.
 */
public class NotYetMigratedConsultReply implements ConsultReply {

    @Override
    public void stream(Request request, ChunkSink sink) {
        throw new IllegalStateException(
                "대화 답변 생성은 아직 이관 전이다 — 사내 LLM 어댑터(Task 4.4)가 필요하다."
                        + " 문의 1(사내 API 규격)·6(경유지 OAuth) 회신 뒤에 붙는다.");
    }

    /**
     * 원본은 모델명·엔드포인트 URL 을 문구에 넣지만 그 두 값은 어댑터가 아는 것이라
     * 아직 없다. 원본의 <b>마지막 갈래</b>(유형 + 앞부분 300자)와 같은 모양으로만 낸다.
     */
    @Override
    public String failureNotice(Exception exc) {
        String detail = exc.getMessage() == null ? "" : exc.getMessage().trim();
        if (detail.length() > 300) {
            detail = detail.substring(0, 300);
        }
        return "[답변 실패] " + exc.getClass().getSimpleName() + ": " + detail;
    }

    /**
     * 실제 어댑터가 들어오면 그 빈이 이걸 <b>자동으로 밀어낸다</b>
     * ({@code @ConditionalOnMissingBean}). Task 4.4 는 구현 클래스를 하나 등록하기만
     * 하면 되고 이 파일은 지우지 않아도 된다 — 다만 지우는 편이 정직하다.
     */
    @Configuration
    public static class Registration {

        @Bean
        @ConditionalOnMissingBean(ConsultReply.class)
        public ConsultReply notYetMigratedConsultReply() {
            return new NotYetMigratedConsultReply();
        }
    }
}
