package com.kbstar.kgi.ggreport.web.orchestrator;

/**
 * 오케스트레이터의 노드 — 설계 §6-B 의 "노드 enum + 각 노드 1클래스".
 *
 * <p>원본은 LangGraph {@code StateGraph} 의 노드 이름 문자열이었다. enum 으로 두면
 * ⓐ 오타가 컴파일 때 잡히고 ⓑ DB({@code ORCH_STEP.NODE})에 남는 값이 코드와 1:1 이라
 * 운영자가 "어디서 멈췄나"를 그대로 읽는다.
 *
 * <p><b>이름은 원본 그래프의 노드 이름 그대로다.</b> 바꾸면 이미 쌓인
 * {@code ORCH_STEP} 행이 어느 노드인지 알 수 없게 된다.
 */
public enum OrchNode {

    /** 3·4단계 — 공고문 추출·분석·역할 배정. 여러 서브에이전트를 부른다. */
    RFI("rfi", false),

    /** 5단계 팬아웃 — 3팀이 각자 초안을 쓴다. 자식 STEP 3건으로 갈라진다. */
    DRAFT("draft", false),

    /**
     * 팬아웃 합류 직후의 <b>통과 노드</b>. 결재요청 알림을 딱 1회 보낸다.
     *
     * <p>⚠️ <b>게이트 본문에 두면 안 된다.</b> 게이트는 재개할 때마다 처음부터 다시
     * 실행되므로 알림이 중복된다 — 원본이 이 노드를 따로 뺀 이유가 그것이다.
     */
    ANNOUNCE_PLAN("announce_plan", false),

    /** 🛑 5단계 기획승인. 반려면 3팀 재작성으로 되돌아간다. */
    GATE_PLAN("gate_plan", true),

    /** 🛑 6단계 이관결재. 반려면 기획승인으로 되돌아간다. */
    GATE_HANDOFF("gate_handoff", true),

    /** 7단계 취합 — 팀 초안을 제안서로 묶는다. */
    PACKAGER("packager", false),

    /** 8단계 검증. */
    VERIFIER("verifier", false),

    /** 🛑 8단계 최종결재. 반려면 취합으로 되돌아간다. */
    GATE_FINAL("gate_final", true),

    /** 9단계 제출 대기 — 흐름의 끝. */
    FINISH("finish", false);

    private final String id;
    private final boolean gate;

    OrchNode(String id, boolean gate) {
        this.id = id;
        this.gate = gate;
    }

    /** {@code ORCH_STEP.NODE} 에 저장되는 값. 원본 그래프의 노드 이름 그대로다. */
    public String id() {
        return id;
    }

    /**
     * 사람 결재를 기다리는 노드인가.
     *
     * <p>원본의 {@code interrupt()} 자리다 — 여기서 실행이 멈추고
     * {@code ORCH_RUN.STATUS} 가 {@code PENDING_APPROVAL} 이 된다. 결재 API 가
     * 그 RUN 을 다시 큐에 넣어야 이어진다(설계 §6-B).
     */
    public boolean isGate() {
        return gate;
    }

    /** 저장된 값 → enum. 모르는 값이면 소리 내어 죽는다(조용히 건너뛰면 실행이 멈춘다). */
    public static OrchNode of(String id) {
        for (OrchNode node : values()) {
            if (node.id.equals(id)) {
                return node;
            }
        }
        throw new IllegalArgumentException("모르는 노드다: " + id
                + " — ORCH_STEP 에 남은 이름과 enum 이 갈라졌다");
    }
}
