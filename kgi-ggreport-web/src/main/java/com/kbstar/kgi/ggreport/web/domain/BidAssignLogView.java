package com.kbstar.kgi.ggreport.web.domain;

/** BID_ASSIGN_LOG 1행 + 코드 표시명·이름(추가 전용 이력). */
public class BidAssignLogView {

    private String actionCd;
    private String actionName;
    private String targetEmpNo;
    private String targetName;
    private Long reqId;
    private String reason;
    private String actorEmpNo;
    private String actorName;
    /** 1 = 앞단 인증 주체, 0 = 자기신고(위조 가능). */
    private int empVerified;
    private String loggedAt;

    public String getActionCd() { return actionCd; }
    public void setActionCd(String v) { this.actionCd = v; }
    public String getActionName() { return actionName; }
    public void setActionName(String v) { this.actionName = v; }
    public String getTargetEmpNo() { return targetEmpNo; }
    public void setTargetEmpNo(String v) { this.targetEmpNo = v; }
    public String getTargetName() { return targetName; }
    public void setTargetName(String v) { this.targetName = v; }
    public Long getReqId() { return reqId; }
    public void setReqId(Long v) { this.reqId = v; }
    public String getReason() { return reason; }
    public void setReason(String v) { this.reason = v; }
    public String getActorEmpNo() { return actorEmpNo; }
    public void setActorEmpNo(String v) { this.actorEmpNo = v; }
    public String getActorName() { return actorName; }
    public void setActorName(String v) { this.actorName = v; }
    public int getEmpVerified() { return empVerified; }
    public void setEmpVerified(int v) { this.empVerified = v; }
    public String getLoggedAt() { return loggedAt; }
    public void setLoggedAt(String v) { this.loggedAt = v; }
}
