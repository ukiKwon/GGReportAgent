package com.kbstar.kgi.ggreport.web.orchestrator;

import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.Map;

/**
 * 노드 → 본문 배선. <b>바꿔 끼울 수 있는 것이 요점이다</b> —
 * LLM 어댑터(Task 4.4)가 붙으면 {@link NotYetMigratedHandler} 세 자리만 갈아 끼운다.
 *
 * <p>테스트도 이 자리를 갈아 끼워 엔진(라우팅·게이트·재개)만 따로 돌려 본다.
 */
@Component
public class NodeHandlers {

    private final Map<OrchNode, NodeHandler> byNode = new EnumMap<OrchNode, NodeHandler>(OrchNode.class);

    public NodeHandlers() {
        // ⚠️ 본문이 사내 LLM 에 기대는 셋 — 아직 이관 전이다(NotYetMigratedHandler 주석).
        byNode.put(OrchNode.RFI, new NotYetMigratedHandler(OrchNode.RFI));
        byNode.put(OrchNode.DRAFT, new NotYetMigratedHandler(OrchNode.DRAFT));
        byNode.put(OrchNode.VERIFIER, new NotYetMigratedHandler(OrchNode.VERIFIER));
        // 취합은 LLM 을 안 쓴다(팀 초안 → PPTX). 다만 그 초안이 draft 노드의 산출이라
        // 지금은 앞이 막혀 도달하지 못한다 — 단계 5의 PptxBuilder 로 붙일 자리다.
        byNode.put(OrchNode.PACKAGER, new NotYetMigratedHandler(OrchNode.PACKAGER));

        byNode.put(OrchNode.ANNOUNCE_PLAN, new AnnouncePlanHandler());
        byNode.put(OrchNode.GATE_PLAN, new GateHandler(OrchNode.GATE_PLAN));
        byNode.put(OrchNode.GATE_HANDOFF, new GateHandler(OrchNode.GATE_HANDOFF));
        byNode.put(OrchNode.GATE_FINAL, new GateHandler(OrchNode.GATE_FINAL));
        byNode.put(OrchNode.FINISH, new FinishHandler());
    }

    /** 테스트가 한 자리만 갈아 끼울 때. */
    public void override(OrchNode node, NodeHandler handler) {
        byNode.put(node, handler);
    }

    public NodeHandler of(OrchNode node) {
        NodeHandler handler = byNode.get(node);
        if (handler == null) {
            throw new IllegalStateException("배선이 없는 노드다: " + node.id());
        }
        return handler;
    }
}
