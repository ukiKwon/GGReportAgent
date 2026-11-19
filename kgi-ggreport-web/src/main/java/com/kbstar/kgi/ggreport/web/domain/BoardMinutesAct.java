package com.kbstar.kgi.ggreport.web.domain;

/** BOARD_MINUTES_ACT 한 행(047) — 접근 감사(추가 전용). 화면·버튼·사번은 자기신고 값이다. actorName 은 JOIN 으로만 채워진다. */
public class BoardMinutesAct {
    private Long actId;
    private Long minutesId;
    private Long materialId;
    private String actionCd;
    private String outcome;
    private String viaCd;
    private String actorEmpNo;
    private String actorName;
    private int empVerified;
    private String screenId;
    private String buttonId;
    private int uiValid;
    private String loggedAt;

    public Long getActId() { return actId; }
    public void setActId(Long v) { this.actId = v; }
    public Long getMinutesId() { return minutesId; }
    public void setMinutesId(Long v) { this.minutesId = v; }
    public Long getMaterialId() { return materialId; }
    public void setMaterialId(Long v) { this.materialId = v; }
    public String getActionCd() { return actionCd; }
    public void setActionCd(String v) { this.actionCd = v; }
    public String getOutcome() { return outcome; }
    public void setOutcome(String v) { this.outcome = v; }
    public String getViaCd() { return viaCd; }
    public void setViaCd(String v) { this.viaCd = v; }
    public String getActorEmpNo() { return actorEmpNo; }
    public void setActorEmpNo(String v) { this.actorEmpNo = v; }
    public String getActorName() { return actorName; }
    public void setActorName(String v) { this.actorName = v; }
    public int getEmpVerified() { return empVerified; }
    public void setEmpVerified(int v) { this.empVerified = v; }
    public String getScreenId() { return screenId; }
    public void setScreenId(String v) { this.screenId = v; }
    public String getButtonId() { return buttonId; }
    public void setButtonId(String v) { this.buttonId = v; }
    public int getUiValid() { return uiValid; }
    public void setUiValid(int v) { this.uiValid = v; }
    public String getLoggedAt() { return loggedAt; }
    public void setLoggedAt(String v) { this.loggedAt = v; }
}
