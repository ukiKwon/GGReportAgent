package com.kbstar.kgi.ggreport.web.orchestrator;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.mapper.OrchMapper;
import com.kbstar.kgi.ggreport.web.support.Ids;
import com.kbstar.kgi.ggreport.web.support.Times;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 상태머신 실행기 — LangGraph 의 그래프 실행과 {@code interrupt()} 재개를 대신한다
 * (설계 §6-B). <b>재개 의미론이 이 클래스의 전부다.</b>
 *
 * <h3>어떻게 도는가</h3>
 * <pre>
 *   start(기관)  → RUN 생성 → advance()
 *   advance()    → 노드를 하나씩 실행하며 STEP 을 남긴다
 *                  · 게이트를 만나면 STATUS=PENDING_APPROVAL 로 두고 **되돌아온다**
 *                  · finish 까지 가면 DONE
 *                  · 예외면 FAILED + 사유 기록
 *   resume(승인) → 멈춰 있던 게이트의 판정을 상태에 넣고 다시 advance()
 * </pre>
 *
 * <h3>원본과 다른 점</h3>
 * <ul>
 *   <li><b>멈춘 자리가 DB 에 보인다.</b> 원본은 LangGraph 체크포인트 안에 있어 운영자가
 *       열어볼 수 없었다. 여기서는 {@code ORCH_RUN.PENDING_GATE} 한 컬럼이다.</li>
 *   <li><b>지금은 호출 스레드에서 돈다.</b> 원본은 {@code threading.Thread} 였고 이관
 *       목적지는 CommonJ WorkManager(Task 4.2)다. 그 교체는 {@link #advance} 를 어디서
 *       부르느냐만 바뀌는 일이라 <b>이 클래스는 그대로다</b> — 그러라고 갈라 뒀다.</li>
 *   <li><b>팬아웃(3팀 초안)도 순차로 돈다.</b> 자식 STEP 은 원본과 같은 모양으로
 *       남기므로 기록은 같고, <b>병렬 제출만</b> Task 4.2 에서 붙는다.</li>
 * </ul>
 */
@Component
public class OrchestratorEngine {

    private static final Logger log = LoggerFactory.getLogger(OrchestratorEngine.class);

    /** 한 번의 {@code advance} 에서 밟을 수 있는 노드 수 상한 — 라우팅 무한루프 방지. */
    private static final int MAX_STEPS = 100;

    /** 게이트 판정이 상태에 실리는 키. 게이트 노드가 이 값을 읽는다. */
    public static final String DECISION_APPROVED = "gate_approved";
    public static final String DECISION_BY = "gate_by";
    public static final String DECISION_COMMENT = "gate_comment";

    private static final ObjectMapper JSON = new ObjectMapper();

    private final OrchMapper orch;
    private final NodeHandlers handlers;
    private final DbRecorderFactory recorders;
    private final BackgroundExecutor executor;

    public OrchestratorEngine(OrchMapper orch, NodeHandlers handlers,
                              DbRecorderFactory recorders, BackgroundExecutor executor) {
        this.orch = orch;
        this.handlers = handlers;
        this.recorders = recorders;
        this.executor = executor;
    }

    /**
     * 실행을 시작한다.
     *
     * <p>이미 도는 실행이 있으면 {@link IllegalStateException}(원본의 {@code RuntimeException}
     * → 409 {@code already running}). <b>메모리가 아니라 DB 제약이 판정한다</b> — 경합이
     * 나도 UNIQUE 가 한쪽만 통과시킨다.
     */
    public OrchRun start(String institutionId, String bidCaseId, Map<String, Object> runInput) {
        if (orch.selectActiveRun(institutionId) != null) {
            throw new IllegalStateException("already running");
        }
        String now = Times.nowIso();
        OrchRun run = new OrchRun();
        run.setRunId(Ids.run());
        run.setInstitutionId(institutionId);
        run.setBidCaseId(bidCaseId);
        run.setCurrentNode(OrchNode.RFI.id());
        run.setStatus(OrchRun.RUNNING);
        run.setStage(intOrNull(runInput.get("stage")));
        run.setCreatedAt(now);
        run.setUpdatedAt(now);
        orch.insertRun(run);

        submit(run, new LinkedHashMap<String, Object>(runInput));
        return orch.selectRun(run.getRunId());
    }

    /**
     * 게이트 결재를 반영하고 이어 돌린다 — 원본 {@code Command(resume=…)} 자리.
     *
     * @throws IllegalStateException 도는 중이면(원본 {@code graph still running})
     * @throws java.util.NoSuchElementException 기다리는 게이트가 없으면
     */
    public OrchRun resume(String institutionId, boolean approved, String by, String comment) {
        OrchRun run = orch.selectActiveRun(institutionId);
        if (run == null || !OrchRun.PENDING_APPROVAL.equals(run.getStatus())) {
            throw new java.util.NoSuchElementException("no pending gate");
        }
        OrchStep pending = orch.selectPendingStep(run.getRunId());
        if (pending == null) {
            throw new java.util.NoSuchElementException("no pending gate");
        }

        Map<String, Object> state = readState(pending.getInputJson());
        state.put(DECISION_APPROVED, Boolean.valueOf(approved));
        state.put(DECISION_BY, by);
        state.put(DECISION_COMMENT, comment);

        // 멈춰 있던 STEP 은 여기서 끝난 것으로 닫는다 — 다음 advance 가 같은 노드를
        // 새 STEP 으로 다시 밟는다(게이트는 판정을 받아 '실행'된다).
        pending.setStatus(OrchStep.DONE);
        pending.setFinishedAt(Times.nowIso());
        orch.updateStep(pending);

        run.setStatus(OrchRun.RUNNING);
        run.setPendingGate(null);
        touch(run);

        submit(run, state);
        return orch.selectRun(run.getRunId());
    }

    /**
     * 실행을 <b>요청 스레드 밖으로</b> 넘긴다(설계 §2·§4 — WAS 에서 raw thread 금지).
     *
     * <p>⚠️ 상태를 <b>클로저로</b> 들려 보낸다. DB 에 따로 적지 않으므로, 제출과 실행
     * 사이에 서버가 죽으면 그 실행은 {@code ORCH_RUN} 이 {@code RUNNING} 인 채 STEP 이
     * 없는 모양으로 남는다 — <b>보이는 형태로</b> 남는다는 뜻이고, 재기동 뒤 사람이
     * 판단할 근거가 된다(조용히 사라지는 것보다 낫다).
     *
     * <p>{@link CallerRunsExecutor} 면 이 자리에서 그대로 돌고(테스트·외부망 로컬),
     * WorkManager 면 다른 스레드에서 돈다 — 그쪽은 트랜잭션이 없으므로
     * {@code advance} 가 자기 것을 연다.
     */
    private void submit(final OrchRun run, final Map<String, Object> state) {
        executor.execute("orch:" + run.getRunId(), new Runnable() {
            @Override
            public void run() {
                advance(run, state);
            }
        });
    }

    /**
     * 게이트를 만나거나 끝날 때까지 노드를 밟는다.
     *
     * <p><b>예외를 삼키지 않는다</b> — RUN 을 {@code FAILED} 로 표시하고 사유를 남긴다.
     * 조용히 멈추면 화면은 "안 돌고 있다"만 보여 주고, 도는 중인지 죽은 건지 알 수 없다.
     */
    void advance(OrchRun run, Map<String, Object> state) {
        OrchNode node = OrchNode.of(run.getCurrentNode());
        for (int guard = 0; guard < MAX_STEPS; guard++) {
            OrchStep step = beginStep(run, node, null, state, null);
            try {
                if (node.isGate() && !state.containsKey(DECISION_APPROVED)) {
                    // 원본 interrupt() — 여기서 멈추고 결재를 기다린다.
                    pause(run, node, step, state);
                    return;
                }
                Map<String, Object> updates = execute(node, state, run, step);
                state.putAll(updates);
                finishStep(step, updates);

                OrchNode next = route(node, state);
                // 게이트 판정은 **한 번만** 쓴다. 안 지우면 다음 게이트가 앞의 결재를
                // 자기 것으로 읽어 그대로 통과한다(3단 결재가 1번으로 끝난다).
                state.remove(DECISION_APPROVED);
                state.remove(DECISION_BY);
                state.remove(DECISION_COMMENT);

                if (next == null) {
                    complete(run, node);
                    return;
                }
                node = next;
                run.setCurrentNode(node.id());
                touch(run);
            } catch (RuntimeException e) {
                fail(run, step, e);
                return;
            }
        }
        fail(run, null, new IllegalStateException(
                "노드를 " + MAX_STEPS + "번 밟고도 끝나지 않았다 — 라우팅이 순환한다"));
    }

    /**
     * 노드 본문 실행.
     *
     * <p>팬아웃(3팀 초안)은 <b>부모 STEP 하나 + 자식 STEP 3</b>을 남긴다 — 설계 §6-B 의
     * "팬아웃 노드가 자식 STEP 여러 건을 만들고 … 전부 완료되면 조인 노드로 진행"
     * 그대로다. 자식은 {@code PARENT_STEP_ID} 로 부모를 가리키며, <b>그게 조인 판정
     * ("형제가 전부 끝났는가")의 근거</b>다. 지금은 순차라 판정이 자명하지만
     * WorkManager(Task 4.2)가 붙으면 그 컬럼으로 기다린다.
     */
    private Map<String, Object> execute(OrchNode node, Map<String, Object> state, OrchRun run,
                                        OrchStep parent) {
        Recorder recorder = recorders.create(run.getInstitutionId(), run.getBidCaseId());
        if (node != OrchNode.DRAFT) {
            return handlers.of(node).run(state, recorder);
        }

        Map<String, Object> merged = new LinkedHashMap<String, Object>();
        for (String role : com.kbstar.kgi.ggreport.web.support.Teams.AUTHORING_TEAMS) {
            Map<String, Object> childState = new LinkedHashMap<String, Object>(state);
            childState.put("role", role);
            OrchStep child = beginStep(run, node, role, childState, parent.getStepId());
            Map<String, Object> updates = handlers.of(node).run(childState, recorder);
            finishStep(child, updates);
            merged.putAll(updates);
        }
        return merged;
    }

    /**
     * 다음 노드. {@code null} 이면 끝이다.
     *
     * <p>원본 그래프의 엣지·{@code Command(goto=…)} 를 한곳에 모은 것이다.
     * <b>반려의 되돌림 지점이 게이트마다 다르다</b> — 기획반려는 3팀 재작성으로,
     * 이관반려는 기획승인으로, 최종반려는 취합으로 간다.
     */
    private OrchNode route(OrchNode node, Map<String, Object> state) {
        switch (node) {
            case RFI:            return OrchNode.DRAFT;
            case DRAFT:          return OrchNode.ANNOUNCE_PLAN;
            case ANNOUNCE_PLAN:  return OrchNode.GATE_PLAN;
            case GATE_PLAN:      return approved(state) ? OrchNode.GATE_HANDOFF : OrchNode.DRAFT;
            case GATE_HANDOFF:   return approved(state) ? OrchNode.PACKAGER : OrchNode.GATE_PLAN;
            case PACKAGER:       return OrchNode.VERIFIER;
            case VERIFIER:       return OrchNode.GATE_FINAL;
            case GATE_FINAL:     return approved(state) ? OrchNode.FINISH : OrchNode.PACKAGER;
            case FINISH:         return null;
            default:
                throw new IllegalStateException("라우팅이 없는 노드다: " + node.id());
        }
    }

    private static boolean approved(Map<String, Object> state) {
        return Boolean.TRUE.equals(state.get(DECISION_APPROVED));
    }

    // ── STEP · RUN 기록 ──────────────────────────────────────────────────

    /**
     * STEP 을 열고 <b>들어간 상태를 그 자리에 적는다</b>. 이게 체크포인트다 —
     * 게이트에서 멈췄을 때 재개의 입력이 되고, 실패했을 때는 "무엇을 들고 들어갔나"가
     * 그대로 남는다.
     */
    private OrchStep beginStep(OrchRun run, OrchNode node, String role,
                               Map<String, Object> state, String parentStepId) {
        OrchStep step = new OrchStep();
        step.setStepId(Ids.step());
        step.setRunId(run.getRunId());
        step.setSeqNo(orch.nextSeqNo(run.getRunId()));
        step.setNode(node.id());
        step.setStatus(OrchStep.RUNNING);
        step.setRole(role);
        step.setParentStepId(parentStepId);
        step.setInputJson(writeState(state));
        step.setStartedAt(Times.nowIso());
        orch.insertStep(step);
        return step;
    }

    private void finishStep(OrchStep step, Map<String, Object> updates) {
        step.setStatus(OrchStep.DONE);
        step.setOutputJson(writeState(updates));
        step.setFinishedAt(Times.nowIso());
        orch.updateStep(step);
    }

    /**
     * 게이트에서 멈춘다. 상태는 {@link #beginStep} 이 이미 {@code INPUT_JSON} 에
     * 적어 뒀다 — 그게 재개의 입력이다.
     */
    private void pause(OrchRun run, OrchNode node, OrchStep step, Map<String, Object> state) {
        step.setStatus(OrchStep.PENDING_APPROVAL);
        orch.updateStep(step);

        run.setStatus(OrchRun.PENDING_APPROVAL);
        run.setPendingGate(gateName(node));
        touch(run);
        log.info("게이트에서 멈췄다: run={} gate={}", run.getRunId(), run.getPendingGate());
    }

    private void complete(OrchRun run, OrchNode node) {
        run.setStatus(OrchRun.DONE);
        run.setCurrentNode(node.id());
        run.setPendingGate(null);
        touch(run);
    }

    private void fail(OrchRun run, OrchStep step, RuntimeException e) {
        log.warn("실행이 멈췄다: run={} node={}", run.getRunId(), run.getCurrentNode(), e);
        if (step != null) {
            step.setStatus(OrchStep.FAILED);
            step.setFailureReason(trim(e.getMessage()));
            step.setFinishedAt(Times.nowIso());
            orch.updateStep(step);
        }
        run.setStatus(OrchRun.FAILED);
        run.setPendingGate(null);
        run.setFailureReason(trim(e.getMessage()));
        touch(run);
    }

    private void touch(OrchRun run) {
        run.setUpdatedAt(Times.nowIso());
        orch.updateRun(run);
    }

    /**
     * 화면이 읽는 게이트 이름. 원본 {@code interrupt({"gate": …})} 의 값 그대로다 —
     * 결재 화면이 이 문자열로 무엇을 묻는지 정한다.
     */
    private static String gateName(OrchNode node) {
        switch (node) {
            case GATE_PLAN:    return "기획승인";
            case GATE_HANDOFF: return "이관결재";
            case GATE_FINAL:   return "최종결재";
            default:
                throw new IllegalArgumentException("게이트가 아니다: " + node.id());
        }
    }

    private static String trim(String message) {
        if (message == null) {
            return null;
        }
        // FAILURE_REASON 은 1000자다. 넘치면 INSERT 가 죽어 실패 사유조차 못 남긴다.
        return message.length() <= 1000 ? message : message.substring(0, 1000);
    }

    private static Integer intOrNull(Object value) {
        return value instanceof Number ? Integer.valueOf(((Number) value).intValue()) : null;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> readState(String json) {
        if (json == null || json.isEmpty()) {
            return new LinkedHashMap<String, Object>();
        }
        try {
            return JSON.readValue(json, LinkedHashMap.class);
        } catch (Exception e) {
            throw new IllegalStateException("체크포인트를 읽지 못했다: " + e.getMessage(), e);
        }
    }

    private static String writeState(Map<String, Object> state) {
        try {
            return JSON.writeValueAsString(state);
        } catch (Exception e) {
            throw new IllegalStateException("체크포인트를 쓰지 못했다: " + e.getMessage(), e);
        }
    }
}
