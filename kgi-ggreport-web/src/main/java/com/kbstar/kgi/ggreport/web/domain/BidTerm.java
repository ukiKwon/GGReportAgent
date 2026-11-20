package com.kbstar.kgi.ggreport.web.domain;

/** INST_BID_TERM(056) 한 행 — 기관·목표 연도(입찰한 해)별 RFP 협약 개시일 기록(추가 전용, 현재 = 최대 REV). */
public class BidTerm {
    private String institutionId, actionCd, termStart, editorEmpNo, editorName, screenId, buttonId, savedAt;
    private int targetYear, revNo, empVerified, uiValid;

    public String getInstitutionId() { return institutionId; } public void setInstitutionId(String v) { institutionId = v; }
    public int getTargetYear() { return targetYear; } public void setTargetYear(int v) { targetYear = v; }
    public int getRevNo() { return revNo; } public void setRevNo(int v) { revNo = v; }
    public String getActionCd() { return actionCd; } public void setActionCd(String v) { actionCd = v; }
    public String getTermStart() { return termStart; } public void setTermStart(String v) { termStart = v; }
    public String getEditorEmpNo() { return editorEmpNo; } public void setEditorEmpNo(String v) { editorEmpNo = v; }
    public String getEditorName() { return editorName; } public void setEditorName(String v) { editorName = v; }
    public int getEmpVerified() { return empVerified; } public void setEmpVerified(int v) { empVerified = v; }
    public String getScreenId() { return screenId; } public void setScreenId(String v) { screenId = v; }
    public String getButtonId() { return buttonId; } public void setButtonId(String v) { buttonId = v; }
    public int getUiValid() { return uiValid; } public void setUiValid(int v) { uiValid = v; }
    public String getSavedAt() { return savedAt; } public void setSavedAt(String v) { savedAt = v; }
}
