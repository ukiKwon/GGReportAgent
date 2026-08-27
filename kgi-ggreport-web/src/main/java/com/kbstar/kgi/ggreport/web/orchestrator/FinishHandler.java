package com.kbstar.kgi.ggreport.web.orchestrator;

import java.util.Collections;
import java.util.Map;

/**
 * 9단계 제출 대기 — 흐름의 끝.
 *
 * <p>마지막에도 <b>"다음에 무엇을 하라"</b>가 남아야 한다. 총괄 지시 없이 끝나면
 * 화면의 마지막 줄이 검증 보고가 되어, 사람이 무엇을 더 해야 하는지 알 수 없다.
 */
public class FinishHandler implements NodeHandler {

    /** 제출 대기. */
    private static final int STAGE = 9;

    @Override
    public Map<String, Object> run(Map<String, Object> state, Recorder recorder) {
        recorder.setStage(STAGE);
        recorder.message("검증", "orchestrator",
                "최종 결재 완료. 제출 대기(9단계) — 제출 후 완료 마킹하라.", null, null);
        recorder.notify("영업팀", "쪽지",
                "최종 결재 완료 — 제출 대기(9단계). 제출 후 완료 마킹하세요.");
        return Collections.<String, Object>singletonMap("stage", Integer.valueOf(STAGE));
    }
}
