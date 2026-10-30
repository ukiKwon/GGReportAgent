package com.kbstar.kgi.ggreport.web.domain;

/** 기관별 최신 ORCH_RUN 한 줄(워크플로 개요 조회용). */
public class OverviewRun {
    private String institutionId;
    private String runId;
    private String status;
    private String pendingGate;
    private String updatedAt;

    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String v) { this.institutionId = v; }
    public String getRunId() { return runId; }
    public void setRunId(String v) { this.runId = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getPendingGate() { return pendingGate; }
    public void setPendingGate(String v) { this.pendingGate = v; }
    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String v) { this.updatedAt = v; }
}
