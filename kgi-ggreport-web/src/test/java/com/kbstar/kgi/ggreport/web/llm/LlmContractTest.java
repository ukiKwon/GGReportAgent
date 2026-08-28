package com.kbstar.kgi.ggreport.web.llm;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 동결된 계약 — 구현이 회신 뒤에 들어와도 <b>여기서 정한 것은 바뀌지 않는다.</b>
 */
public class LlmContractTest {

    @Test
    public void 온도_기본값은_0이다() {
        // 기본 temperature(0.8)에서는 같은 프롬프트·같은 모델인데 실행마다 산출물이
        // 달라진다(2026-08-10 실측). 숫자가 결과인 작업에서 그건 그대로 오답이다.
        assertEquals(0.0, LlmRequest.of("프롬프트", String.class).getTemperature(), 0.0);
    }

    @Test
    public void 폴백모델이_1순위와_같으면_폴백이_없는_것과_같다() {
        LlmProperties props = new LlmProperties();
        props.setModel("gpt-oss-120b");

        props.setFallbackModel("");
        assertFalse("비어 있으면 폴백 없음", props.hasFallback());

        props.setFallbackModel("gpt-oss-120b");
        assertFalse("같은 모델은 재시도이지 폴백이 아니다", props.hasFallback());

        props.setFallbackModel("  gpt-oss-120b  ");
        assertFalse("앞뒤 공백 때문에 다른 모델로 보이면 안 된다", props.hasFallback());

        props.setFallbackModel("llama-4-scout-17b-16e-instruct");
        assertTrue(props.hasFallback());
    }

    /**
     * 1순위 모델을 기본값으로 대충 메우지 않는다. 메우면 설정 누락이 "모델을 못 찾음
     * (404)"으로 나타나 엉뚱한 곳(엔드포인트·모델 배포)을 파게 된다.
     */
    @Test
    public void 우선순위_모델이_비어_있으면_원인을_그대로_말한다() {
        LlmProperties props = new LlmProperties();
        try {
            props.requirePrimaryModel();
            fail("비어 있는데 통과하면 안 된다");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("ggreport.llm.model"));
        }
    }

    /** 빈 구현으로 통과시키지 않는다 — 실행이 끝까지 돌아 화면에 정상 완료로 보인다. */
    @Test
    public void 이관전_어댑터는_조용히_성공하지_않는다() {
        try {
            new NotYetMigratedLlmClient().structured(LlmRequest.of("프롬프트", String.class));
            fail("이관 전인데 성공하면 안 된다");
        } catch (LlmException expected) {
            assertTrue("무엇을 기다리는지 문구에 남아야 한다",
                    expected.getMessage().contains("Task 4.4"));
        }
    }

    /**
     * 토큰 발급 실패는 <b>인증 갈래</b>여야 한다 — 그래야 폴백을 타지 않는다.
     * 일반 {@link LlmException} 으로 던지면 2순위로 넘어가 같은 실패를 반복한다.
     */
    @Test
    public void 이관전_토큰공급자는_인증실패로_던진다() {
        try {
            new NotYetMigratedLlmClient.Unavailable().bearerToken();
            fail("이관 전인데 토큰이 나오면 안 된다");
        } catch (LlmAuthException expected) {
            assertFalse("폴백을 태우면 안 되는 갈래다", FallbackPolicy.shouldFallback(expected));
        }
    }
}
