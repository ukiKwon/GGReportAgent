package com.kbstar.kgi.ggreport.web.domain;

/** BID_PREP_LOG 한 행 + 사건·행위자 이름(조인). */
public class BidPrepLogView {

    private String eventCd;
    private String eventName;
    private String fromState;
    private String toState;
    private String taskCd;
    private Long reqId;
    private String reason;
    private String actorEmpNo;
    private String actorName;
    private int empVerified;
    private String loggedAt;

    public String getEventCd() { return eventCd; }
    public void setEventCd(String v) { this.eventCd = v; }
    public String getEventName() { return eventName; }
    public void setEventName(String v) { this.eventName = v; }
    public String getFromState() { return fromState; }
    public void setFromState(String v) { this.fromState = v; }
    public String getToState() { return toState; }
    public void setToState(String v) { this.toState = v; }
    public String getTaskCd() { return taskCd; }
    public void setTaskCd(String v) { this.taskCd = v; }
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
