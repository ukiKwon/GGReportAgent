package com.kbstar.kgi.ggreport.web.orchestrator;

import java.util.Map;

/**
 * 노드 하나의 <b>본문</b>. Python {@code agent/orchestrator/subagents.py} 의 함수 하나에
 * 대응한다.
 *
 * <p>노드는 <b>상태를 받아 변경분을 돌려주고</b>, 바깥에는 {@link Recorder} 로만 말한다
 * (원본 그대로 — subagent 끼리 직접 통신하지 않는다). 다음에 어디로 갈지는 노드가
 * 정하지 않고 {@link OrchestratorEngine} 의 라우팅이 정한다 — 설계 §6-B 의
 * "노드가 다음 노드 이름을 반환하는 방식으로 단순화한다"를, <b>게이트 결과에 따른
 * 되돌림</b>까지 한곳에서 보려고 엔진에 모았다.
 */
public interface NodeHandler {

    /**
     * @param state    지금까지의 실행 상태(읽기 전용으로 다룰 것)
     * @param recorder 기록 통로
     * @return 상태에 병합할 <b>변경분</b>. 없으면 빈 맵
     */
    Map<String, Object> run(Map<String, Object> state, Recorder recorder);
}
