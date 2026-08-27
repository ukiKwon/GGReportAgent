package com.kbstar.kgi.ggreport.web.orchestrator;

/**
 * 실행 1건 — {@code ORCH_RUN} 한 행. LangGraph 의 스레드(thread_id) 자리다.
 *
 * <p>⚠️ {@link #activeInstitutionId} 는 <b>실행 중일 때만</b> {@link #institutionId} 와
 * 같고 끝나면 null 이다. 단일 컬럼 UNIQUE 로 "한 기관에 활성 실행 하나"를 지킨다
 * ({@code db/oracle/006_orch.sql} 주석 참조) — 손으로 채우지 말고
 * {@link #setStatus(String)} 를 쓸 것.
 */
public class OrchRun {

    /** 도는 중. */
    public static final String RUNNING = "RUNNING";
    /** 게이트에서 사람 결재를 기다린다 — 원본 {@code interrupt()} 자리. */
    public static final String PENDING_APPROVAL = "PENDING_APPROVAL";
    /** 끝났다. */
    public static final String DONE = "DONE";
    /** 예외로 멈췄다. 재실행은 새 RUN 을 만든다. */
    public static final String FAILED = "FAILED";

    private String runId;
    private String institutionId;
    private String bidCaseId;
    private String status;
    private String currentNode;
    private String pendingGate;
    private Integer stage;
    private String activeInstitutionId;
    private String failureReason;
    private String createdAt;
    private String updatedAt;

    /** 아직 끝나지 않았는가 — 활성 제약이 걸리는 상태 둘. */
    public static boolean isActive(String status) {
        return RUNNING.equals(status) || PENDING_APPROVAL.equals(status);
    }

    public String getRunId() { return runId; }
    public void setRunId(String runId) { this.runId = runId; }

    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String institutionId) {
        this.institutionId = institutionId;
        syncActive();
    }

    public String getBidCaseId() { return bidCaseId; }
    public void setBidCaseId(String bidCaseId) { this.bidCaseId = bidCaseId; }

    public String getStatus() { return status; }
    /** 상태를 바꾸면 {@code ACTIVE_INSTITUTION_ID} 도 함께 맞춰진다(둘이 갈라지면 제약이 헛돈다). */
    public void setStatus(String status) {
        this.status = status;
        syncActive();
    }

    public String getCurrentNode() { return currentNode; }
    public void setCurrentNode(String currentNode) { this.currentNode = currentNode; }

    public String getPendingGate() { return pendingGate; }
    public void setPendingGate(String pendingGate) { this.pendingGate = pendingGate; }

    public Integer getStage() { return stage; }
    public void setStage(Integer stage) { this.stage = stage; }

    public String getActiveInstitutionId() { return activeInstitutionId; }
    public void setActiveInstitutionId(String activeInstitutionId) {
        this.activeInstitutionId = activeInstitutionId;
    }

    public String getFailureReason() { return failureReason; }
    public void setFailureReason(String failureReason) { this.failureReason = failureReason; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }

    private void syncActive() {
        this.activeInstitutionId = isActive(status) ? institutionId : null;
    }
}
