package com.kbstar.kgi.ggreport.web.domain;

/** INST_HEAD 한 행(026) — 사람 x 재임 1행. INSTITUTION_ID 가 null 이면 매칭 대기(반입 후보). */
public class InstHead {

    private Long headId;
    private String institutionId;
    private String srcOrgCd;
    private String srcOrgName;
    private String statusCd;
    private String originCd;
    private String batchId;
    private String createdBy;
    private String createdAt;
    private int createdVerified;
    private String decidedBy;
    private String decidedAt;
    private String endedBy;
    private String endedAt;
    private String matchedBy;
    private String matchedAt;
    private Long mergedIntoId;

    public Long getHeadId() { return headId; }
    public void setHeadId(Long v) { this.headId = v; }
    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String v) { this.institutionId = v; }
    public String getSrcOrgCd() { return srcOrgCd; }
    public void setSrcOrgCd(String v) { this.srcOrgCd = v; }
    public String getSrcOrgName() { return srcOrgName; }
    public void setSrcOrgName(String v) { this.srcOrgName = v; }
    public String getStatusCd() { return statusCd; }
    public void setStatusCd(String v) { this.statusCd = v; }
    public String getOriginCd() { return originCd; }
    public void setOriginCd(String v) { this.originCd = v; }
    public String getBatchId() { return batchId; }
    public void setBatchId(String v) { this.batchId = v; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String v) { this.createdBy = v; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }
    public int getCreatedVerified() { return createdVerified; }
    public void setCreatedVerified(int v) { this.createdVerified = v; }
    public String getDecidedBy() { return decidedBy; }
    public void setDecidedBy(String v) { this.decidedBy = v; }
    public String getDecidedAt() { return decidedAt; }
    public void setDecidedAt(String v) { this.decidedAt = v; }
    public String getEndedBy() { return endedBy; }
    public void setEndedBy(String v) { this.endedBy = v; }
    public String getEndedAt() { return endedAt; }
    public void setEndedAt(String v) { this.endedAt = v; }
    public String getMatchedBy() { return matchedBy; }
    public void setMatchedBy(String v) { this.matchedBy = v; }
    public String getMatchedAt() { return matchedAt; }
    public void setMatchedAt(String v) { this.matchedAt = v; }
    public Long getMergedIntoId() { return mergedIntoId; }
    public void setMergedIntoId(Long v) { this.mergedIntoId = v; }
}
