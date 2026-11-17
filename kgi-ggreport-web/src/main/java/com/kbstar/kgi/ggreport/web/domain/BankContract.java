package com.kbstar.kgi.ggreport.web.domain;

/** INST_BANK_CONTRACT(039) 한 행 — 추가 전용. bankName·cancelReasonName·accountName 은 조회 때 COMMON_CODE 표시명(LEFT JOIN). */
public class BankContract {
    private String institutionId; private int contractNo; private int revNo;
    private String actionCd; private String originCd; private String rankCd; private String bankCd; private String bankNameEtc;
    private String termFrom; private String termTo; private String srcKind; private String srcUrl; private String srcNo;
    private String checkedDate; private String checkedDept; private String note;
    private String accountCd; private String accountEtc;
    private int overlapConfirmed; private String cancelReasonCd; private String cancelReasonEtc;
    private String editorEmpNo; private String editorName; private int empVerified;
    private String screenId; private String buttonId; private int uiValid; private String savedAt;
    private String bankName; private String cancelReasonName; private String accountName;   // 조회 전용
    private String firstEditorEmpNo; private String firstEditorName; private String firstSavedAt;   // 조회 전용 — 줄의 REV_NO=1 행(처음 입력자). 사번은 서버 안에서만 쓴다

    public String getInstitutionId() { return institutionId; } public void setInstitutionId(String v) { institutionId = v; }
    public int getContractNo() { return contractNo; } public void setContractNo(int v) { contractNo = v; }
    public int getRevNo() { return revNo; } public void setRevNo(int v) { revNo = v; }
    public String getActionCd() { return actionCd; } public void setActionCd(String v) { actionCd = v; }
    public String getOriginCd() { return originCd; } public void setOriginCd(String v) { originCd = v; }
    public String getRankCd() { return rankCd; } public void setRankCd(String v) { rankCd = v; }
    public String getBankCd() { return bankCd; } public void setBankCd(String v) { bankCd = v; }
    public String getBankNameEtc() { return bankNameEtc; } public void setBankNameEtc(String v) { bankNameEtc = v; }
    public String getTermFrom() { return termFrom; } public void setTermFrom(String v) { termFrom = v; }
    public String getTermTo() { return termTo; } public void setTermTo(String v) { termTo = v; }
    public String getSrcKind() { return srcKind; } public void setSrcKind(String v) { srcKind = v; }
    public String getSrcUrl() { return srcUrl; } public void setSrcUrl(String v) { srcUrl = v; }
    public String getSrcNo() { return srcNo; } public void setSrcNo(String v) { srcNo = v; }
    public String getCheckedDate() { return checkedDate; } public void setCheckedDate(String v) { checkedDate = v; }
    public String getCheckedDept() { return checkedDept; } public void setCheckedDept(String v) { checkedDept = v; }
    public String getNote() { return note; } public void setNote(String v) { note = v; }
    public String getAccountCd() { return accountCd; } public void setAccountCd(String v) { accountCd = v; }
    public String getAccountEtc() { return accountEtc; } public void setAccountEtc(String v) { accountEtc = v; }
    public int getOverlapConfirmed() { return overlapConfirmed; } public void setOverlapConfirmed(int v) { overlapConfirmed = v; }
    public String getCancelReasonCd() { return cancelReasonCd; } public void setCancelReasonCd(String v) { cancelReasonCd = v; }
    public String getCancelReasonEtc() { return cancelReasonEtc; } public void setCancelReasonEtc(String v) { cancelReasonEtc = v; }
    public String getEditorEmpNo() { return editorEmpNo; } public void setEditorEmpNo(String v) { editorEmpNo = v; }
    public String getEditorName() { return editorName; } public void setEditorName(String v) { editorName = v; }
    public int getEmpVerified() { return empVerified; } public void setEmpVerified(int v) { empVerified = v; }
    public String getScreenId() { return screenId; } public void setScreenId(String v) { screenId = v; }
    public String getButtonId() { return buttonId; } public void setButtonId(String v) { buttonId = v; }
    public int getUiValid() { return uiValid; } public void setUiValid(int v) { uiValid = v; }
    public String getSavedAt() { return savedAt; } public void setSavedAt(String v) { savedAt = v; }
    public String getBankName() { return bankName; } public void setBankName(String v) { bankName = v; }
    public String getCancelReasonName() { return cancelReasonName; } public void setCancelReasonName(String v) { cancelReasonName = v; }
    public String getAccountName() { return accountName; } public void setAccountName(String v) { accountName = v; }
    public String getFirstEditorEmpNo() { return firstEditorEmpNo; } public void setFirstEditorEmpNo(String v) { firstEditorEmpNo = v; }
    public String getFirstEditorName() { return firstEditorName; } public void setFirstEditorName(String v) { firstEditorName = v; }
    public String getFirstSavedAt() { return firstSavedAt; } public void setFirstSavedAt(String v) { firstSavedAt = v; }
}
