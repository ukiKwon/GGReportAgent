package com.kbstar.kgi.ggreport.web.llm;

/**
 * 구조화 출력 1회 호출의 결과 — 값과 <b>실제로 답한 모델</b>.
 *
 * <p><b>모델 이름을 왜 값과 함께 돌려주나.</b> 폴백이 돌면 "쓰기로 한 모델"과 "답을
 * 만든 모델"이 갈린다. 파이썬은 langchain 의 폴백이 불투명해 스레드 로컬로 추적했고,
 * {@code reset_last_model()} 을 빠뜨리면 <b>앞 노드의 모델명이 다음 기록에 붙는</b>
 * 함정이 있었다(그 함정을 막으려 회귀 테스트까지 있다). 자바는 폴백을 우리가 돌리므로
 * 그냥 여기 실어 보낸다 — 추적 상태가 없으니 빠뜨릴 것도 없다.
 *
 * <p>이 값이 {@code Recorder.message(..., model)} 로 그대로 흘러가 화면의 🧠 표시가 된다.
 */
public final class LlmResponse<T> {

    private final T value;
    private final String model;
    private final boolean fellBack;

    public LlmResponse(T value, String model, boolean fellBack) {
        this.value = value;
        this.model = model;
        this.fellBack = fellBack;
    }

    public T getValue() { return value; }

    /** 1순위가 아니라 <b>실제로 답한</b> 모델 이름. */
    public String getModel() { return model; }

    /**
     * 2순위로 넘어가서 얻은 답인가.
     *
     * <p>기록에는 모델 이름만 남지만, 폴백이 <b>얼마나 자주 도는지</b>는 운영에서
     * 따로 보고 싶은 값이다 — 잦으면 1순위가 사실상 죽어 있다는 뜻이다.
     */
    public boolean isFellBack() { return fellBack; }
}
