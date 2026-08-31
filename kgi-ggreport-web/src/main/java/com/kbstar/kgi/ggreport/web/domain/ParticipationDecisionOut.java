package com.kbstar.kgi.ggreport.web.domain;

import java.util.List;

/**
 * 참여 결정 응답. Python {@code server/models.ParticipationDecisionOut}.
 *
 * <p>{@link BidCaseDetail} 에 {@code run_started} 하나가 더 붙는다 — 참여확정 직후
 * 3·4단계 자동 시작이 <b>실제로 걸렸는지</b>다. {@code false} 면 이유가 쪽지로 가 있다.
 * 골든 {@code 11}~{@code 13} 의 응답 모양이다.
 */
public class ParticipationDecisionOut extends BidCaseDetail {

    private boolean runStarted;

    public ParticipationDecisionOut() {
    }

    public ParticipationDecisionOut(BidCase src, List<TaskSummary> tasks, boolean runStarted) {
        super(src, tasks);
        this.runStarted = runStarted;
    }

    public boolean isRunStarted() { return runStarted; }
    public void setRunStarted(boolean runStarted) { this.runStarted = runStarted; }
}
