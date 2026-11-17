package com.kbstar.kgi.ggreport.web.domain;

/** PLAN_COLLECT_REQ(045) + 목록용 조인 칸(nameKo·lastImportAt·runByName). 칸 이름은 camelCase 로 매핑된다. */
public class PlanCollectReq {
    private String institutionId;
    private Integer reqSeq;
    private String reqKey;
    private String statusCd;
    private String openInstId;
    private String prevDomains;
    private String requestedBy;
    private String requestedAt;
    private Integer reqVerified;
    private String runMode;
    private String runBy;
    private String runAt;
    private Integer runVerified;
    private String runDomains;
    private String runResultCd;
    private String jobId;
    private Long appliedImportId;
    private String closedAt;
    private String closedBy;
    private String closeReason;
    private String nameKo;
    private String lastImportAt;
    private String runByName;

    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String v) { this.institutionId = v; }
    public Integer getReqSeq() { return reqSeq; }
    public void setReqSeq(Integer v) { this.reqSeq = v; }
    public String getReqKey() { return reqKey; }
    public void setReqKey(String v) { this.reqKey = v; }
    public String getStatusCd() { return statusCd; }
    public void setStatusCd(String v) { this.statusCd = v; }
    public String getOpenInstId() { return openInstId; }
    public void setOpenInstId(String v) { this.openInstId = v; }
    public String getPrevDomains() { return prevDomains; }
    public void setPrevDomains(String v) { this.prevDomains = v; }
    public String getRequestedBy() { return requestedBy; }
    public void setRequestedBy(String v) { this.requestedBy = v; }
    public String getRequestedAt() { return requestedAt; }
    public void setRequestedAt(String v) { this.requestedAt = v; }
    public Integer getReqVerified() { return reqVerified; }
    public void setReqVerified(Integer v) { this.reqVerified = v; }
    public String getRunMode() { return runMode; }
    public void setRunMode(String v) { this.runMode = v; }
    public String getRunBy() { return runBy; }
    public void setRunBy(String v) { this.runBy = v; }
    public String getRunAt() { return runAt; }
    public void setRunAt(String v) { this.runAt = v; }
    public Integer getRunVerified() { return runVerified; }
    public void setRunVerified(Integer v) { this.runVerified = v; }
    public String getRunDomains() { return runDomains; }
    public void setRunDomains(String v) { this.runDomains = v; }
    public String getRunResultCd() { return runResultCd; }
    public void setRunResultCd(String v) { this.runResultCd = v; }
    public String getJobId() { return jobId; }
    public void setJobId(String v) { this.jobId = v; }
    public Long getAppliedImportId() { return appliedImportId; }
    public void setAppliedImportId(Long v) { this.appliedImportId = v; }
    public String getClosedAt() { return closedAt; }
    public void setClosedAt(String v) { this.closedAt = v; }
    public String getClosedBy() { return closedBy; }
    public void setClosedBy(String v) { this.closedBy = v; }
    public String getCloseReason() { return closeReason; }
    public void setCloseReason(String v) { this.closeReason = v; }
    public String getNameKo() { return nameKo; }
    public void setNameKo(String v) { this.nameKo = v; }
    public String getLastImportAt() { return lastImportAt; }
    public void setLastImportAt(String v) { this.lastImportAt = v; }
    public String getRunByName() { return runByName; }
    public void setRunByName(String v) { this.runByName = v; }
}
