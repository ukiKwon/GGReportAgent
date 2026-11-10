package com.kbstar.kgi.ggreport.web.domain;

/** BOARD_MATERIAL_LOG + 이름·상태명 조회용. */
public class BoardMaterialLogView {
    private Long reqId;
    private String reason;
    private String fromResultName;
    private String toResultName;
    private String eventCd;
    private String fromStatus;
    private String fromStatusName;
    private String toStatus;
    private String toStatusName;
    private String meetingDate;
    private String fromEmpNo;
    private String fromName;
    private String toEmpNo;
    private String toName;
    private String actorEmpNo;
    private String actorName;
    private int empVerified;
    private String loggedAt;

    public String getEventCd() { return eventCd; }
    public void setEventCd(String v) { this.eventCd = v; }
    public String getFromStatus() { return fromStatus; }
    public void setFromStatus(String v) { this.fromStatus = v; }
    public String getFromStatusName() { return fromStatusName; }
    public void setFromStatusName(String v) { this.fromStatusName = v; }
    public String getToStatus() { return toStatus; }
    public void setToStatus(String v) { this.toStatus = v; }
    public String getToStatusName() { return toStatusName; }
    public void setToStatusName(String v) { this.toStatusName = v; }
    public String getMeetingDate() { return meetingDate; }
    public void setMeetingDate(String v) { this.meetingDate = v; }
    public String getFromEmpNo() { return fromEmpNo; }
    public void setFromEmpNo(String v) { this.fromEmpNo = v; }
    public String getFromName() { return fromName; }
    public void setFromName(String v) { this.fromName = v; }
    public String getToEmpNo() { return toEmpNo; }
    public void setToEmpNo(String v) { this.toEmpNo = v; }
    public String getToName() { return toName; }
    public void setToName(String v) { this.toName = v; }
    public String getActorEmpNo() { return actorEmpNo; }
    public void setActorEmpNo(String v) { this.actorEmpNo = v; }
    public String getActorName() { return actorName; }
    public void setActorName(String v) { this.actorName = v; }
    public int getEmpVerified() { return empVerified; }
    public void setEmpVerified(int v) { this.empVerified = v; }
    public String getLoggedAt() { return loggedAt; }
    public void setLoggedAt(String v) { this.loggedAt = v; }
    public Long getReqId() { return reqId; }
    public void setReqId(Long v) { this.reqId = v; }
    public String getReason() { return reason; }
    public void setReason(String v) { this.reason = v; }
    public String getFromResultName() { return fromResultName; }
    public void setFromResultName(String v) { this.fromResultName = v; }
    public String getToResultName() { return toResultName; }
    public void setToResultName(String v) { this.toResultName = v; }
}
