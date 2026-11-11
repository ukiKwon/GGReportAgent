package com.kbstar.kgi.ggreport.web.domain;

/** BID_PREP 한 행(024) — 입찰 건별 사전준비 상태. 목록 조회에서는 기관명·상태명을 더 채운다. */
public class BidPrep {

    private String bidCaseId;
    private String institutionId;
    private String stateCd;
    private String confirmedBy;
    private String confirmedAt;
    private Long openReqId;
    private Long planReqId;
    private String openedBy;
    private String openedAt;
    private String writeBy;
    private String writeAt;
    private String updatedBy;
    private String updatedAt;
    /** 목록 조회에서만 채운다. */
    private String institutionName;
    private String stateName;

    public String getBidCaseId() { return bidCaseId; }
    public void setBidCaseId(String v) { this.bidCaseId = v; }
    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String v) { this.institutionId = v; }
    public String getStateCd() { return stateCd; }
    public void setStateCd(String v) { this.stateCd = v; }
    public String getConfirmedBy() { return confirmedBy; }
    public void setConfirmedBy(String v) { this.confirmedBy = v; }
    public String getConfirmedAt() { return confirmedAt; }
    public void setConfirmedAt(String v) { this.confirmedAt = v; }
    public Long getOpenReqId() { return openReqId; }
    public void setOpenReqId(Long v) { this.openReqId = v; }
    public Long getPlanReqId() { return planReqId; }
    public void setPlanReqId(Long v) { this.planReqId = v; }
    public String getOpenedBy() { return openedBy; }
    public void setOpenedBy(String v) { this.openedBy = v; }
    public String getOpenedAt() { return openedAt; }
    public void setOpenedAt(String v) { this.openedAt = v; }
    public String getWriteBy() { return writeBy; }
    public void setWriteBy(String v) { this.writeBy = v; }
    public String getWriteAt() { return writeAt; }
    public void setWriteAt(String v) { this.writeAt = v; }
    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String v) { this.updatedBy = v; }
    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String v) { this.updatedAt = v; }
    public String getInstitutionName() { return institutionName; }
    public void setInstitutionName(String v) { this.institutionName = v; }
    public String getStateName() { return stateName; }
    public void setStateName(String v) { this.stateName = v; }
}
