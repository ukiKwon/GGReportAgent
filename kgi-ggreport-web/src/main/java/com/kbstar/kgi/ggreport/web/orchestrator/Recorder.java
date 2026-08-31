package com.kbstar.kgi.ggreport.web.orchestrator;

/**
 * 오케스트레이터의 <b>기록 포트</b> — Python {@code agent/orchestrator/ports.Recorder}.
 *
 * <p>노드는 이 포트로만 바깥에 말한다. 실행 계층이 DB 구현체를 주입하고, 단위테스트는
 * 아무것도 안 하는 구현을 쓴다 — 그래야 노드 로직을 DB 없이 돌려 볼 수 있다.
 */
public interface Recorder {

    /** 기관 단계를 옮긴다. 이후의 기록에 "몇 단계였는지"가 이 값으로 붙는다. */
    void setStage(int stage);

    /**
     * 그 팀의 작업 <b>자리만</b> 연다 — 없으면 만들고, <b>있으면 아무것도 바꾸지 않는다.</b>
     *
     * <p>⚠️ {@link #taskUpdate} 와 나뉘어 있는 이유: 최종반려면 취합 노드가 다시 도는데,
     * 그때 {@code taskUpdate("디자이너","대기",0)} 을 부르면 디자이너가 파일을 올리고
     * '작성중'으로 바꿔 둔 것이 <b>초기화된다.</b>
     */
    void taskOpen(String team);

    void taskUpdate(String team, String status, int progressPct);

    /**
     * 작업 로그 한 줄.
     *
     * @param author 사람이 쓴 글의 실명(결재자 등). 에이전트면 null
     * @param model  이 보고를 남길 때 실제로 쓴 LLM 모델 — LLM 을 쓴 노드만 넘긴다
     */
    void message(String team, String role, String content, String author, String model);

    void notify(String recipient, String kind, String content);
}
