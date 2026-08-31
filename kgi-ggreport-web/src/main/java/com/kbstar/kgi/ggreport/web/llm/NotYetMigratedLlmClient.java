package com.kbstar.kgi.ggreport.web.llm;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 아직 이관하지 않은 LLM 어댑터 — <b>소리 내어 실패한다.</b>
 * {@code orchestrator.NotYetMigratedHandler}·{@code service.NotYetMigratedConsultReply} 와
 * 같은 이유·같은 방식이다.
 *
 * <p>규격이 <b>문의 1</b>(호출 규격·인증)과 <b>문의 6</b>(경유지 OAuth) 회신으로
 * 정해진다. 그때까지 빈 구현으로 통과시키면 노드가 <b>빈 결과를 정상처럼</b> 돌려주고,
 * 실행이 끝까지 돌아 화면에는 정상 완료로 보인다 — 아무도 배점표가 비었다는 걸 모른 채
 * 제출일을 맞는다.
 *
 * <p><b>Task 4.4 가 실제로 할 일</b>(회신 뒤):
 * <ol>
 *   <li>{@link LlmClient} 구현 — HttpClient 4.5 + Jackson. 스키마를 프롬프트에 싣고,
 *       응답에서 JSON 블록을 뽑아 역직렬화하고, 실패하면 재시도한다(설계 §6-C)</li>
 *   <li>{@link TokenProvider} 구현 — 토큰 획득·캐시·선제 갱신, 401 시 1회 재시도</li>
 *   <li>폴백은 {@link FallbackPolicy} 를 <b>그대로 쓴다</b> — 규칙을 다시 쓰지 말 것</li>
 *   <li>{@link LlmResponse#getModel()} 에 <b>실제로 답한</b> 모델을 실을 것</li>
 * </ol>
 * 그 뒤 {@code NotYetMigratedHandler} 로 막아 둔 노드 4개와
 * {@code NotYetMigratedConsultReply} 를 실제 구현으로 갈아 끼우면 단계 4가 닫힌다.
 */
public class NotYetMigratedLlmClient implements LlmClient {

    @Override
    public <T> LlmResponse<T> structured(LlmRequest<T> request) {
        throw new LlmException(
                "사내 LLM 어댑터는 아직 이관 전이다(Task 4.4)."
                        + " 문의 1(사내 API 호출 규격·인증)·6(경유지 OAuth) 회신 뒤에 붙는다.",
                0);
    }

    /** 문의 6 회신 전이라 토큰을 만들 방법이 없다. */
    public static class Unavailable implements TokenProvider {

        @Override
        public String bearerToken() {
            throw new LlmAuthException(
                    "경유지 OAuth 토큰 발급이 아직 이관 전이다(Task 4.4)."
                            + " 문의 6(발급 방식·수명·갱신 절차) 회신 뒤에 붙는다.",
                    0);
        }

        @Override
        public void invalidate() {
            // 캐시가 없으니 버릴 것도 없다.
        }
    }

    /**
     * 실제 구현이 들어오면 그 빈이 이걸 <b>자동으로 밀어낸다</b>
     * ({@code @ConditionalOnMissingBean}).
     */
    @Configuration
    public static class Registration {

        @Bean
        @ConditionalOnMissingBean(LlmClient.class)
        public LlmClient notYetMigratedLlmClient() {
            return new NotYetMigratedLlmClient();
        }

        @Bean
        @ConditionalOnMissingBean(TokenProvider.class)
        public TokenProvider notYetMigratedTokenProvider() {
            return new Unavailable();
        }
    }
}
