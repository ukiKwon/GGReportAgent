package com.kbstar.kgi.ggreport.web.domain;

/** 대시보드 칸 체크 한 줄(054 BID_PREP_CHECK, NEXT 102). 추가 전용 — 현재 값은 (건, 열)의 최대 REV_NO. */
public class PrepBoardCheck {
    private String bidCaseId;
    private String colCd;
    private int revNo;
    private String markCd;
    private String prevMarkCd;
    private String markDate;
    private String actorEmpNo;
    private String actorName;
    private int empVerified;
    private String screenId;
    private String buttonId;
    private int uiValid;
    private String savedAt;

    public String getBidCaseId() { return bidCaseId; } public void setBidCaseId(String v) { bidCaseId = v; }
    public String getColCd() { return colCd; } public void setColCd(String v) { colCd = v; }
    public int getRevNo() { return revNo; } public void setRevNo(int v) { revNo = v; }
    public String getMarkCd() { return markCd; } public void setMarkCd(String v) { markCd = v; }
    public String getPrevMarkCd() { return prevMarkCd; } public void setPrevMarkCd(String v) { prevMarkCd = v; }
    public String getMarkDate() { return markDate; } public void setMarkDate(String v) { markDate = v; }
    public String getActorEmpNo() { return actorEmpNo; } public void setActorEmpNo(String v) { actorEmpNo = v; }
    public String getActorName() { return actorName; } public void setActorName(String v) { actorName = v; }
    public int getEmpVerified() { return empVerified; } public void setEmpVerified(int v) { empVerified = v; }
    public String getScreenId() { return screenId; } public void setScreenId(String v) { screenId = v; }
    public String getButtonId() { return buttonId; } public void setButtonId(String v) { buttonId = v; }
    public int getUiValid() { return uiValid; } public void setUiValid(int v) { uiValid = v; }
    public String getSavedAt() { return savedAt; } public void setSavedAt(String v) { savedAt = v; }
}
