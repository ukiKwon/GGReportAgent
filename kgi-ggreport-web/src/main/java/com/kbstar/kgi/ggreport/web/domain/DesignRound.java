package com.kbstar.kgi.ggreport.web.domain;

/** 디자인 검토 회차 1행(DESIGN_ROUND, 051). openedByName 은 조회용 USERS 조인 값(없을 수 있다). */
public class DesignRound {

    private String taskId;
    private int roundNo;
    private String bidCaseId;
    private String openedBy;
    private String openedByName;
    private String openedAt;
    private int recipCount;
    private String closedAt;
    private String closeCd;
    private String closedBy;

    public String getTaskId() { return taskId; }
    public void setTaskId(String v) { this.taskId = v; }
    public int getRoundNo() { return roundNo; }
    public void setRoundNo(int v) { this.roundNo = v; }
    public String getBidCaseId() { return bidCaseId; }
    public void setBidCaseId(String v) { this.bidCaseId = v; }
    public String getOpenedBy() { return openedBy; }
    public void setOpenedBy(String v) { this.openedBy = v; }
    public String getOpenedByName() { return openedByName; }
    public void setOpenedByName(String v) { this.openedByName = v; }
    public String getOpenedAt() { return openedAt; }
    public void setOpenedAt(String v) { this.openedAt = v; }
    public int getRecipCount() { return recipCount; }
    public void setRecipCount(int v) { this.recipCount = v; }
    public String getClosedAt() { return closedAt; }
    public void setClosedAt(String v) { this.closedAt = v; }
    public String getCloseCd() { return closeCd; }
    public void setCloseCd(String v) { this.closeCd = v; }
    public String getClosedBy() { return closedBy; }
    public void setClosedBy(String v) { this.closedBy = v; }

    public boolean isOpen() { return closedAt == null; }
}
