package com.kbstar.kgi.ggreport.web.domain;

/** BOARD_MATERIAL_ACT 한 행(+ 이름 조회용). */
public class BoardMaterialAct {
    private Long actId;
    private Long materialId;
    private String bidCaseId;
    private String actionCd;
    private String outcome;
    private String statusCd;
    private String resultCd;
    private Integer snapNo;
    private String actorEmpNo;
    private String actorName;
    private int empVerified;
    private String screenId;
    private String buttonId;
    private int uiValid;
    private String loggedAt;

    public Long getActId() { return actId; }
    public void setActId(Long v) { this.actId = v; }
    public Long getMaterialId() { return materialId; }
    public void setMaterialId(Long v) { this.materialId = v; }
    public String getBidCaseId() { return bidCaseId; }
    public void setBidCaseId(String v) { this.bidCaseId = v; }
    public String getActionCd() { return actionCd; }
    public void setActionCd(String v) { this.actionCd = v; }
    public String getOutcome() { return outcome; }
    public void setOutcome(String v) { this.outcome = v; }
    public String getStatusCd() { return statusCd; }
    public void setStatusCd(String v) { this.statusCd = v; }
    public String getResultCd() { return resultCd; }
    public void setResultCd(String v) { this.resultCd = v; }
    public Integer getSnapNo() { return snapNo; }
    public void setSnapNo(Integer v) { this.snapNo = v; }
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
