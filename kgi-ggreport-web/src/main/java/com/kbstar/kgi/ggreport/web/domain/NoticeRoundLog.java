package com.kbstar.kgi.ggreport.web.domain;

/** NOTICE_ROUND_LOG(037) 한 행 — 판정 이력(추가 전용). */
public class NoticeRoundLog {

    private String institutionId;
    private Integer roundSeq;
    private Integer revNo;
    private String statusCd;
    private String prevStatusCd;
    private String opinion;
    private String nextCheckDate;
    private String prevNextCheck;
    private int activePrep;
    private String activePrepState;
    private String snapDueDate;
    private String snapDueBasis;
    private int snapDueConfirmed;
    private String snapAutoKind;
    private Integer snapAutoDays;
    private String snapLastBid;
    private String handlerEmpNo;
    private String handlerName;
    private int empVerified;
    private String screenId;
    private String buttonId;
    private int uiValid;
    private String handledAt;

    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String v) { this.institutionId = v; }

    public Integer getRoundSeq() { return roundSeq; }
    public void setRoundSeq(Integer v) { this.roundSeq = v; }

    public Integer getRevNo() { return revNo; }
    public void setRevNo(Integer v) { this.revNo = v; }

    public String getStatusCd() { return statusCd; }
    public void setStatusCd(String v) { this.statusCd = v; }

    public String getPrevStatusCd() { return prevStatusCd; }
    public void setPrevStatusCd(String v) { this.prevStatusCd = v; }

    public String getOpinion() { return opinion; }
    public void setOpinion(String v) { this.opinion = v; }

    public String getNextCheckDate() { return nextCheckDate; }
    public void setNextCheckDate(String v) { this.nextCheckDate = v; }

    public String getPrevNextCheck() { return prevNextCheck; }
    public void setPrevNextCheck(String v) { this.prevNextCheck = v; }

    public int getActivePrep() { return activePrep; }
    public void setActivePrep(int v) { this.activePrep = v; }

    public String getActivePrepState() { return activePrepState; }
    public void setActivePrepState(String v) { this.activePrepState = v; }

    public String getSnapDueDate() { return snapDueDate; }
    public void setSnapDueDate(String v) { this.snapDueDate = v; }

    public String getSnapDueBasis() { return snapDueBasis; }
    public void setSnapDueBasis(String v) { this.snapDueBasis = v; }

    public int getSnapDueConfirmed() { return snapDueConfirmed; }
    public void setSnapDueConfirmed(int v) { this.snapDueConfirmed = v; }

    public String getSnapAutoKind() { return snapAutoKind; }
    public void setSnapAutoKind(String v) { this.snapAutoKind = v; }

    public Integer getSnapAutoDays() { return snapAutoDays; }
    public void setSnapAutoDays(Integer v) { this.snapAutoDays = v; }

    public String getSnapLastBid() { return snapLastBid; }
    public void setSnapLastBid(String v) { this.snapLastBid = v; }

    public String getHandlerEmpNo() { return handlerEmpNo; }
    public void setHandlerEmpNo(String v) { this.handlerEmpNo = v; }

    public String getHandlerName() { return handlerName; }
    public void setHandlerName(String v) { this.handlerName = v; }

    public int getEmpVerified() { return empVerified; }
    public void setEmpVerified(int v) { this.empVerified = v; }

    public String getScreenId() { return screenId; }
    public void setScreenId(String v) { this.screenId = v; }

    public String getButtonId() { return buttonId; }
    public void setButtonId(String v) { this.buttonId = v; }

    public int getUiValid() { return uiValid; }
    public void setUiValid(int v) { this.uiValid = v; }

    public String getHandledAt() { return handledAt; }
    public void setHandledAt(String v) { this.handledAt = v; }
}
