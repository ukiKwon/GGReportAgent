package com.kbstar.kgi.ggreport.web.domain;

/** BID_PREP_FORM 한 행(049) — 사전준비 양식 헤더(건·양식당 1행). 확정 판·해시는 확정할 때 박제한다. */
public class PrepForm {
    private String bidCaseId; private String formCd; private String taskCd;
    private int curVer; private Integer confirmedVer; private String confirmedSha256;
    private String confirmedBy; private int confirmedVerified; private String confirmedAt;
    private String createdBy; private String createdAt; private String updatedBy; private String updatedAt;
    private String confirmedByName;   // 조회 전용(조인) — 사번은 응답에 내지 않고 이름만 낸다

    public String getBidCaseId() { return bidCaseId; } public void setBidCaseId(String v) { bidCaseId = v; }
    public String getFormCd() { return formCd; } public void setFormCd(String v) { formCd = v; }
    public String getTaskCd() { return taskCd; } public void setTaskCd(String v) { taskCd = v; }
    public int getCurVer() { return curVer; } public void setCurVer(int v) { curVer = v; }
    public Integer getConfirmedVer() { return confirmedVer; } public void setConfirmedVer(Integer v) { confirmedVer = v; }
    public String getConfirmedSha256() { return confirmedSha256; } public void setConfirmedSha256(String v) { confirmedSha256 = v; }
    public String getConfirmedBy() { return confirmedBy; } public void setConfirmedBy(String v) { confirmedBy = v; }
    public int getConfirmedVerified() { return confirmedVerified; } public void setConfirmedVerified(int v) { confirmedVerified = v; }
    public String getConfirmedAt() { return confirmedAt; } public void setConfirmedAt(String v) { confirmedAt = v; }
    public String getCreatedBy() { return createdBy; } public void setCreatedBy(String v) { createdBy = v; }
    public String getCreatedAt() { return createdAt; } public void setCreatedAt(String v) { createdAt = v; }
    public String getUpdatedBy() { return updatedBy; } public void setUpdatedBy(String v) { updatedBy = v; }
    public String getUpdatedAt() { return updatedAt; } public void setUpdatedAt(String v) { updatedAt = v; }
    public String getConfirmedByName() { return confirmedByName; } public void setConfirmedByName(String v) { confirmedByName = v; }
}
