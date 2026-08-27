package com.kbstar.kgi.ggreport.web.orchestrator;

/**
 * 노드 실행 1건 — {@code ORCH_STEP} 한 행. <b>이게 체크포인트다</b>(설계 §6-B).
 *
 * <p>{@code INPUT_JSON}·{@code OUTPUT_JSON} 에 그 노드가 받은 상태와 낸 변경을 남긴다.
 * LangGraph 체크포인트와 달리 <b>사람이 읽을 수 있는 형태</b>라, 실행이 어디서 무엇을
 * 하다 멈췄는지 운영자가 SELECT 로 본다.
 */
public class OrchStep {

    public static final String RUNNING = "RUNNING";
    public static final String DONE = "DONE";
    public static final String FAILED = "FAILED";
    /** 게이트에서 멈춘 단계. 결재가 오면 이 단계부터 이어진다. */
    public static final String PENDING_APPROVAL = "PENDING_APPROVAL";

    private String stepId;
    private String runId;
    private long seqNo;
    private String node;
    private String status;
    private String parentStepId;
    private String role;
    private String inputJson;
    private String outputJson;
    private String failureReason;
    private String startedAt;
    private String finishedAt;

    public String getStepId() { return stepId; }
    public void setStepId(String stepId) { this.stepId = stepId; }

    public String getRunId() { return runId; }
    public void setRunId(String runId) { this.runId = runId; }

    public long getSeqNo() { return seqNo; }
    public void setSeqNo(long seqNo) { this.seqNo = seqNo; }

    public String getNode() { return node; }
    public void setNode(String node) { this.node = node; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getParentStepId() { return parentStepId; }
    public void setParentStepId(String parentStepId) { this.parentStepId = parentStepId; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getInputJson() { return inputJson; }
    public void setInputJson(String inputJson) { this.inputJson = inputJson; }

    public String getOutputJson() { return outputJson; }
    public void setOutputJson(String outputJson) { this.outputJson = outputJson; }

    public String getFailureReason() { return failureReason; }
    public void setFailureReason(String failureReason) { this.failureReason = failureReason; }

    public String getStartedAt() { return startedAt; }
    public void setStartedAt(String startedAt) { this.startedAt = startedAt; }

    public String getFinishedAt() { return finishedAt; }
    public void setFinishedAt(String finishedAt) { this.finishedAt = finishedAt; }
}
