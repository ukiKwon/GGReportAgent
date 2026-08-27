package com.kbstar.kgi.ggreport.web.orchestrator;

import java.util.Map;

/**
 * 아직 이관하지 않은 노드 — <b>소리 내어 실패한다.</b>
 *
 * <p>{@code rfi}·{@code draft}·{@code verifier} 는 본문이 사내 LLM 호출에 기대는데,
 * 그 어댑터(Task 4.4)는 <b>문의 1·6 회신 전까지 규격이 정해지지 않는다.</b>
 *
 * <p>⚠️ <b>빈 구현으로 통과시키지 않는 이유</b>: 그러면 실행이 끝까지 돌아
 * "9단계 제출 대기"까지 가고, 화면에는 <b>정상 완료로 보인다.</b> 아무도 배점표가
 * 비어 있다는 것을 모른 채 제출일을 맞는다. 실패는 실패로 남겨야
 * {@code /status} 의 {@code failed} 가 사실을 말한다.
 */
public class NotYetMigratedHandler implements NodeHandler {

    private final OrchNode node;

    public NotYetMigratedHandler(OrchNode node) {
        this.node = node;
    }

    @Override
    public Map<String, Object> run(Map<String, Object> state, Recorder recorder) {
        throw new IllegalStateException(node.id()
                + " 노드는 아직 이관 전이다 — 사내 LLM 어댑터(Task 4.4)가 필요하다."
                + " 문의 1·6 회신 뒤에 붙는다.");
    }
}
