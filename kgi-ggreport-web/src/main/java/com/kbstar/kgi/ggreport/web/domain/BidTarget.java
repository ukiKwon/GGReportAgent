package com.kbstar.kgi.ggreport.web.domain;

/** INST_BID_TARGET(043) 한 행 + 조회 조인값(기관 이름·지역·태그 이름·취소 사유 이름·처음 입력자). */
public class BidTarget {
    private String institutionId, institutionName, regionCode, actionCd, tagCd, tagName, memo, ownerEmpNo, ownerName;
    private String cancelReasonCd, cancelReasonEtc, cancelReasonName, editorEmpNo, editorName, screenId, buttonId, savedAt;
    private String firstEditorEmpNo, firstEditorName, firstSavedAt;
    private int targetNo, revNo, empVerified, uiValid;
    private Integer targetYear;   // 044 — 관심(WATCH)은 NULL
    private String kindCd;        // 044 — GOAL | WATCH

    public String getInstitutionId() { return institutionId; } public void setInstitutionId(String v) { institutionId = v; }
    public String getInstitutionName() { return institutionName; } public void setInstitutionName(String v) { institutionName = v; }
    public String getRegionCode() { return regionCode; } public void setRegionCode(String v) { regionCode = v; }
    public int getTargetNo() { return targetNo; } public void setTargetNo(int v) { targetNo = v; }
    public int getRevNo() { return revNo; } public void setRevNo(int v) { revNo = v; }
    public String getActionCd() { return actionCd; } public void setActionCd(String v) { actionCd = v; }
    public Integer getTargetYear() { return targetYear; } public void setTargetYear(Integer v) { targetYear = v; }
    public String getKindCd() { return kindCd; } public void setKindCd(String v) { kindCd = v; }
    public String getTagCd() { return tagCd; } public void setTagCd(String v) { tagCd = v; }
    public String getTagName() { return tagName; } public void setTagName(String v) { tagName = v; }
    public String getMemo() { return memo; } public void setMemo(String v) { memo = v; }
    public String getOwnerEmpNo() { return ownerEmpNo; } public void setOwnerEmpNo(String v) { ownerEmpNo = v; }
    public String getOwnerName() { return ownerName; } public void setOwnerName(String v) { ownerName = v; }
    public String getCancelReasonCd() { return cancelReasonCd; } public void setCancelReasonCd(String v) { cancelReasonCd = v; }
    public String getCancelReasonEtc() { return cancelReasonEtc; } public void setCancelReasonEtc(String v) { cancelReasonEtc = v; }
    public String getCancelReasonName() { return cancelReasonName; } public void setCancelReasonName(String v) { cancelReasonName = v; }
    public String getEditorEmpNo() { return editorEmpNo; } public void setEditorEmpNo(String v) { editorEmpNo = v; }
    public String getEditorName() { return editorName; } public void setEditorName(String v) { editorName = v; }
    public int getEmpVerified() { return empVerified; } public void setEmpVerified(int v) { empVerified = v; }
    public String getScreenId() { return screenId; } public void setScreenId(String v) { screenId = v; }
    public String getButtonId() { return buttonId; } public void setButtonId(String v) { buttonId = v; }
    public int getUiValid() { return uiValid; } public void setUiValid(int v) { uiValid = v; }
    public String getSavedAt() { return savedAt; } public void setSavedAt(String v) { savedAt = v; }
    public String getFirstEditorEmpNo() { return firstEditorEmpNo; } public void setFirstEditorEmpNo(String v) { firstEditorEmpNo = v; }
    public String getFirstEditorName() { return firstEditorName; } public void setFirstEditorName(String v) { firstEditorName = v; }
    public String getFirstSavedAt() { return firstSavedAt; } public void setFirstSavedAt(String v) { firstSavedAt = v; }
}
