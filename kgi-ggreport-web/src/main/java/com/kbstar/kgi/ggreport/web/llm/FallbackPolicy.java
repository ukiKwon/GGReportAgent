package com.kbstar.kgi.ggreport.web.llm;

/**
 * 1순위 실패 뒤 <b>2순위로 넘어갈지</b>를 한 곳에서 정한다.
 *
 * <p>판정을 클래스로 뺀 이유는 이것이 <b>정책이지 배선이 아니기</b> 때문이다.
 * 어댑터 구현(Task 4.4)이 회신 뒤에 들어올 때 이 규칙까지 함께 새로 쓰면, 아래
 * 근거가 조용히 사라진다.
 *
 * <p><b>⚠️ 원본과 다르다 — 의도된 차이다.</b> 파이썬은 {@code with_fallbacks} 라
 * <b>어떤 실패든</b> 2순위로 넘어간다. 여기서는 계획(2026-08-25)에 따라
 * <b>모델 부재(404)일 때만</b> 넘어간다.
 *
 * <table border="1">
 *   <caption>갈래</caption>
 *   <tr><th>1순위 실패</th><th>폴백</th><th>왜</th></tr>
 *   <tr><td>401·403 인증</td><td><b>안 함</b></td>
 *       <td>2순위도 같은 토큰·같은 게이트웨이다. 태우면 토큰 만료가
 *           "모델 두 개가 다 죽었다"로 보고된다(설계 §6-C)</td></tr>
 *   <tr><td>404 모델 부재</td><td><b>함</b></td>
 *       <td>자체호스팅에서 가장 흔한 실패. 작은 모델로라도 끝내고 사람이 검수한다</td></tr>
 *   <tr><td>그 밖(5xx·타임아웃·파싱)</td><td>안 함</td>
 *       <td>계획이 "404일 때만"으로 좁혔다. 아래 <b>되돌리는 조건</b> 참고</td></tr>
 * </table>
 *
 * <p><b>되돌리는 조건</b>: 운영에서 1순위가 5xx·타임아웃으로 자주 죽는데 2순위는
 * 멀쩡한 상황이 실제로 관측되면, {@link #shouldFallback} 에 그 갈래를 더한다.
 * 지금 넓히지 않는 이유는 <b>인증 실패를 폴백에 태우지 않는다</b>는 규칙이 이 좁은
 * 정의 덕에 확실해지기 때문이다 — 넓힐 때도 401/403 은 반드시 제외한 채로 넓힌다.
 */
public final class FallbackPolicy {

    private FallbackPolicy() {
    }

    /**
     * 1순위가 {@code failure} 로 실패했을 때 2순위를 시도할 것인가.
     *
     * <p>인증 실패는 {@link LlmModelUnavailableException} 이 아니므로 자동으로 걸러진다.
     * 다만 그 규칙이 이 메서드를 읽는 것만으로 보이도록 <b>명시적으로도</b> 막는다 —
     * 나중에 조건을 넓힐 사람이 401/403 을 같이 넓히는 사고를 막는 자리다.
     */
    public static boolean shouldFallback(LlmException failure) {
        if (failure instanceof LlmAuthException) {
            return false;
        }
        return failure instanceof LlmModelUnavailableException;
    }
}
