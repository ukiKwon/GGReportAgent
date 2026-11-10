package com.kbstar.kgi.ggreport.web.domain;

/** BID_ASSIGN_CASE 1행 — 입찰 건당 담당자 집합의 머리(019). */
public class BidAssignCase {

    private String bidCaseId;
    private int groupVer;
    /** 진행 중인 담당자 변경 결재 요청(S2-b 에서 쓴다). 없으면 null. */
    private Long pendingReqId;
    private String createdBy;
    private String createdAt;
    private String updatedBy;
    private String updatedAt;

    public String getBidCaseId() { return bidCaseId; }
    public void setBidCaseId(String v) { this.bidCaseId = v; }
    public int getGroupVer() { return groupVer; }
    public void setGroupVer(int v) { this.groupVer = v; }
    public Long getPendingReqId() { return pendingReqId; }
    public void setPendingReqId(Long v) { this.pendingReqId = v; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String v) { this.createdBy = v; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }
    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String v) { this.updatedBy = v; }
    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String v) { this.updatedAt = v; }
}
