package com.kbstar.kgi.ggreport.web.domain;

/** 권한 변경 이력 1행({@code PERM_CHANGE_LOG}). */
public class PermChange {

    private Long chgId;
    private String changedAt;
    private String actorEmpNo;
    private String targetEmpNo;
    private String item;
    private String beforeValue;
    private String afterValue;

    public Long getChgId() { return chgId; }
    public void setChgId(Long chgId) { this.chgId = chgId; }

    public String getChangedAt() { return changedAt; }
    public void setChangedAt(String changedAt) { this.changedAt = changedAt; }

    public String getActorEmpNo() { return actorEmpNo; }
    public void setActorEmpNo(String actorEmpNo) { this.actorEmpNo = actorEmpNo; }

    public String getTargetEmpNo() { return targetEmpNo; }
    public void setTargetEmpNo(String targetEmpNo) { this.targetEmpNo = targetEmpNo; }

    public String getItem() { return item; }
    public void setItem(String item) { this.item = item; }

    public String getBeforeValue() { return beforeValue; }
    public void setBeforeValue(String beforeValue) { this.beforeValue = beforeValue; }

    public String getAfterValue() { return afterValue; }
    public void setAfterValue(String afterValue) { this.afterValue = afterValue; }
}
