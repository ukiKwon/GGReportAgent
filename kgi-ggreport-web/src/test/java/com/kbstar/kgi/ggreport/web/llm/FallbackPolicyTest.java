package com.kbstar.kgi.ggreport.web.llm;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 폴백 규칙을 못 박는다 — Task 4.4 인터페이스 동결의 핵심.
 *
 * <p>구현(HttpClient 호출)은 회신 대기지만 <b>정책은 지금 정해져 있다.</b> 어댑터가
 * 나중에 들어올 때 이 규칙을 새로 쓰면 아래 근거가 조용히 사라지므로 테스트로 고정한다.
 */
public class FallbackPolicyTest {

    /**
     * ⚠️ 이 클래스에서 가장 중요한 갈래다. 인증 실패를 폴백에 태우면 2순위도 같은
     * 토큰으로 같은 게이트웨이를 지나 똑같이 실패하고, 사람에게는 "모델 두 개가 다
     * 죽었다"로 보고된다 — 실제 원인(토큰 만료)과 전혀 다른 곳을 파게 된다.
     */
    @Test
    public void 인증실패는_폴백하지_않는다() {
        assertFalse(FallbackPolicy.shouldFallback(new LlmAuthException("인증 실패", 401)));
        assertFalse(FallbackPolicy.shouldFallback(new LlmAuthException("권한 없음", 403)));
    }

    @Test
    public void 모델부재는_폴백한다() {
        assertTrue(FallbackPolicy.shouldFallback(
                new LlmModelUnavailableException("모델 없음", 404, "gpt-oss-120b")));
    }

    /**
     * 계획(2026-08-25)이 "404 일 때만" 으로 좁혔다. 원본 파이썬은
     * {@code with_fallbacks} 라 어떤 실패든 넘어갔다 — <b>의도된 차이</b>이므로
     * 여기서 고정해 둔다(넓히려면 {@link FallbackPolicy} 의 "되돌리는 조건"을 볼 것).
     */
    @Test
    public void 그밖의_실패는_폴백하지_않는다() {
        assertFalse(FallbackPolicy.shouldFallback(new LlmException("서버 오류", 500)));
        assertFalse(FallbackPolicy.shouldFallback(new LlmException("타임아웃", 0)));
    }
}
