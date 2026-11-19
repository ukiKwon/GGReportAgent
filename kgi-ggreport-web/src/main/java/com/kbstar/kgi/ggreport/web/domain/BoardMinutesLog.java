package com.kbstar.kgi.ggreport.web.domain;

/** BOARD_MINUTES_LOG 한 행(047) — 변경 이력(추가 전용). SCOPE_BEFORE·AFTER 는 사번 목록만. actorName 은 JOIN 으로만 채워진다. */
public class BoardMinutesLog {
    private Long logId;
    private Long minutesId;
    private Long materialId;
    private String eventCd;
    private Integer revNo;
    private String targetKind;
    private Integer targetNo;
    private String scopeBefore;
    private String scopeAfter;
    private String actorEmpNo;
    private String actorName;
    private int empVerified;
    private String loggedAt;

    public Long getLogId() { return logId; }
    public void setLogId(Long v) { this.logId = v; }
    public Long getMinutesId() { return minutesId; }
    public void setMinutesId(Long v) { this.minutesId = v; }
    public Long getMaterialId() { return materialId; }
    public void setMaterialId(Long v) { this.materialId = v; }
    public String getEventCd() { return eventCd; }
    public void setEventCd(String v) { this.eventCd = v; }
    public Integer getRevNo() { return revNo; }
    public void setRevNo(Integer v) { this.revNo = v; }
    public String getTargetKind() { return targetKind; }
    public void setTargetKind(String v) { this.targetKind = v; }
    public Integer getTargetNo() { return targetNo; }
    public void setTargetNo(Integer v) { this.targetNo = v; }
    public String getScopeBefore() { return scopeBefore; }
    public void setScopeBefore(String v) { this.scopeBefore = v; }
    public String getScopeAfter() { return scopeAfter; }
    public void setScopeAfter(String v) { this.scopeAfter = v; }
    public String getActorEmpNo() { return actorEmpNo; }
    public void setActorEmpNo(String v) { this.actorEmpNo = v; }
    public String getActorName() { return actorName; }
    public void setActorName(String v) { this.actorName = v; }
    public int getEmpVerified() { return empVerified; }
    public void setEmpVerified(int v) { this.empVerified = v; }
    public String getLoggedAt() { return loggedAt; }
    public void setLoggedAt(String v) { this.loggedAt = v; }
}
