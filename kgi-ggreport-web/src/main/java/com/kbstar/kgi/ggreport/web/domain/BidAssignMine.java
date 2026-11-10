package com.kbstar.kgi.ggreport.web.domain;

/** 내가 현재 담당인 입찰 건 1건. */
public class BidAssignMine {

    private String bidCaseId;
    private String assignedAt;

    public String getBidCaseId() { return bidCaseId; }
    public void setBidCaseId(String v) { this.bidCaseId = v; }
    public String getAssignedAt() { return assignedAt; }
    public void setAssignedAt(String v) { this.assignedAt = v; }
}
