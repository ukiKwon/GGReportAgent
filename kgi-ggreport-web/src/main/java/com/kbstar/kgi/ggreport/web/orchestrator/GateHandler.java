package com.kbstar.kgi.ggreport.web.orchestrator;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 🛑 결재 게이트 — 원본 {@code _gate_plan}·{@code _gate_handoff}·{@code _gate_final}.
 *
 * <p>이 본문은 <b>결재가 온 뒤에만</b> 돈다. 결재 전에는 엔진이 여기 오기 전에 멈춘다
 * ({@link OrchestratorEngine} 의 {@code pause}) — 원본에서 {@code interrupt()} 앞뒤가
 * 갈리던 것과 같은 경계다.
 *
 * <p>그래서 <b>여기 있는 것은 전부 "결재 1회당 정확히 1번" 일어나야 하는 일</b>이다:
 * 승인/반려 기록, 단계 이동, 다음 결재자에게 보내는 알림. 반대로 <b>결재를 기다린다는
 * 안내</b>는 여기 두면 안 된다 — 반려로 되돌아왔다가 다시 오면 또 나간다
 * ({@link AnnouncePlanHandler} 주석).
 */
public class GateHandler implements NodeHandler {

    private final OrchNode gate;

    public GateHandler(OrchNode gate) {
        if (!gate.isGate()) {
            throw new IllegalArgumentException("게이트가 아니다: " + gate.id());
        }
        this.gate = gate;
    }

    @Override
    public Map<String, Object> run(Map<String, Object> state, Recorder recorder) {
        boolean approved = Boolean.TRUE.equals(state.get(OrchestratorEngine.DECISION_APPROVED));
        String by = str(state.get(OrchestratorEngine.DECISION_BY));
        String comment = str(state.get(OrchestratorEngine.DECISION_COMMENT));

        switch (gate) {
            case GATE_PLAN:    return plan(recorder, approved, by, comment);
            case GATE_HANDOFF: return handoff(recorder, approved, by, comment);
            case GATE_FINAL:   return last(recorder, approved, by, comment);
            default:
                throw new IllegalStateException("배선이 없는 게이트다: " + gate.id());
        }
    }

    /** 5단계 기획승인. 반려면 3팀이 <b>사유를 들고</b> 다시 쓴다. */
    private Map<String, Object> plan(Recorder recorder, boolean approved,
                                     String by, String comment) {
        recorder.setStage(5);
        if (approved) {
            recorder.setStage(6);
            recorder.message("영업", "human", "기획 승인 — " + by, by, null);
            recorder.notify("영업팀", "결재요청",
                    "이관결재 대기 — 기획승인 완료, 이관 여부를 결재해주세요.");
            return updates(6, null);
        }
        recorder.message("영업", "human", "기획 반려 — " + reason(comment), by, null);
        // ⚠️ 반려 사유를 상태에 실어야 3팀이 **같은 프롬프트로 그대로 다시 쓰는 것**을
        //    막는다. 원본 리뷰 F1 픽스와 같은 자리다.
        return updates(null, comment);
    }

    /** 6단계 이관결재. 반려면 기획승인으로 되돌아간다. */
    private Map<String, Object> handoff(Recorder recorder, boolean approved,
                                        String by, String comment) {
        if (approved) {
            recorder.message("취합", "human", "이관 결재 — " + by, by, null);
            return updates(7, null);
        }
        recorder.message("영업", "human", "이관 반려 — " + reason(comment), by, null);
        return updates(null, comment);
    }

    /** 8단계 최종결재. 반려면 취합부터 다시 한다. */
    private Map<String, Object> last(Recorder recorder, boolean approved,
                                     String by, String comment) {
        if (approved) {
            recorder.message("검증", "human", "최종 결재 — " + by, by, null);
            return Collections.emptyMap();
        }
        recorder.message("검증", "human", "최종 반려 — " + reason(comment), by, null);
        return updates(null, comment);
    }

    private static Map<String, Object> updates(Integer stage, String revisionNote) {
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        if (stage != null) {
            out.put("stage", stage);
        }
        // 승인이면 null 로 덮어 앞선 반려 사유를 지운다 — 안 지우면 다음 재작성이
        // 이미 해소된 지적을 다시 반영하려 든다.
        out.put("revision_note", revisionNote);
        return out;
    }

    /** 원본의 {@code comment or '(사유 없음)'} 그대로. 빈 문자열도 사유 없음이다. */
    private static String reason(String comment) {
        return comment == null || comment.trim().isEmpty() ? "(사유 없음)" : comment;
    }

    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
    }
}
