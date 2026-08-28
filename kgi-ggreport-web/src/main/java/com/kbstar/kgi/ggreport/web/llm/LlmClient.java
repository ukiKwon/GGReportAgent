package com.kbstar.kgi.ggreport.web.llm;

/**
 * 사내 공용 LLM API 어댑터 — Task 4.4. Python {@code agent/llm.py} 자리.
 *
 * <p><b>이 인터페이스는 동결됐고 구현은 비어 있다.</b> 규격이 <b>문의 1</b>(호출 규격·
 * 인증)과 <b>문의 6</b>(경유지 OAuth) 회신으로 정해지기 때문이다. 회신이 오면
 * {@link NotYetMigratedLlmClient} 자리에 실제 구현을 등록하는 것이 전부이고,
 * 부르는 쪽(노드·{@code ConsultReply})은 손대지 않는다.
 *
 * <p><b>쓰는 기능은 둘뿐이다</b>(설계 §6-C): 구조화 출력과 2단 폴백. 그래서
 * LangChain4j 를 들이지 않고 HttpClient + Jackson 으로 직접 부른다 — JDK 1.8 지원
 * 때문에 구버전에 묶이고 폐쇄망 반입 목록만 길어진다.
 *
 * <p>⚠️ <b>실제로 답한 모델을 반환값에 싣는다</b>({@link LlmResponse#getModel()}).
 * 파이썬은 langchain 의 폴백이 불투명해 스레드 로컬로 추적했고, 그래서
 * "{@code reset} 을 빠뜨리면 앞 노드의 모델명이 다음 기록에 붙는" 함정이 있었다.
 * 자바는 폴백을 우리가 돌리므로 그 값을 그냥 돌려주면 된다 — 함정이 사라진다.
 * {@code Recorder.message(..., model)} 이 이미 그 값을 받는 모양이다.
 */
public interface LlmClient {

    /**
     * 스키마에 맞는 JSON 을 받아 객체로 돌려준다.
     *
     * <p>구현은 "JSON 스키마를 프롬프트에 포함 → 응답에서 JSON 블록 추출 → Jackson
     * 역직렬화 → 실패 시 재시도" 로 재현한다(설계 §6-C). 사내 API 가 tool-calling 을
     * 지원하지 않으면 어차피 이 경로다.
     *
     * @throws LlmAuthException          인증 실패. <b>폴백을 태우지 않는다</b> — 2순위도
     *                                   같은 토큰을 쓰므로 똑같이 실패한다.
     * @throws LlmModelUnavailableException 1·2순위 모두 없을 때.
     * @throws LlmException              그 밖의 실패.
     */
    <T> LlmResponse<T> structured(LlmRequest<T> request);
}
