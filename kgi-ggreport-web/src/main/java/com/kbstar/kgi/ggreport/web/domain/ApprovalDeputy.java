package com.kbstar.kgi.ggreport.web.domain;

/** 대결 지정 1행({@code APPROVAL_DEPUTY}). 날짜는 한국 기준 {@code YYYY-MM-DD}. */
public class ApprovalDeputy {
    private Long deputyId;
    private String principalEmpNo;
    private String deputyEmpNo;
    private String startDate;
    private String endDate;
    private String reason;
    private String createdBy;
    private String createdAt;
    private String cancelledAt;
    private String cancelledBy;

    public Long getDeputyId() { return deputyId; }
    public void setDeputyId(Long deputyId) { this.deputyId = deputyId; }
    public String getPrincipalEmpNo() { return principalEmpNo; }
    public void setPrincipalEmpNo(String principalEmpNo) { this.principalEmpNo = principalEmpNo; }
    public String getDeputyEmpNo() { return deputyEmpNo; }
    public void setDeputyEmpNo(String deputyEmpNo) { this.deputyEmpNo = deputyEmpNo; }
    public String getStartDate() { return startDate; }
    public void setStartDate(String startDate) { this.startDate = startDate; }
    public String getEndDate() { return endDate; }
    public void setEndDate(String endDate) { this.endDate = endDate; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public String getCancelledAt() { return cancelledAt; }
    public void setCancelledAt(String cancelledAt) { this.cancelledAt = cancelledAt; }
    public String getCancelledBy() { return cancelledBy; }
    public void setCancelledBy(String cancelledBy) { this.cancelledBy = cancelledBy; }
}
