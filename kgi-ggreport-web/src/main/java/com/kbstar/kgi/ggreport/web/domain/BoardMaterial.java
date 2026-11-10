package com.kbstar.kgi.ggreport.web.domain;

/** BOARD_MATERIAL 한 행 + 조회용 이름 칸(institutionName·ownerName·statusName 은 JOIN 으로만 채워진다). */
public class BoardMaterial {
    private Long materialId;
    private String bidCaseId;
    private String institutionId;
    private int boardYear;
    private String statusCd;
    private String meetingDate;
    private String formId;
    private int formVer;
    private int curSnap;
    private String lastSavedBy;
    private String lastSavedAt;
    private String createdBy;
    private String createdAt;
    private String updatedBy;
    private String updatedAt;
    private String institutionName;
    private String statusName;
    private String resultCd;
    private String resultName;
    private Long submitReqId;
    private Integer submitSnap;
    private Integer confirmedSnap;
    private String confirmedBy;
    private String confirmedAt;

    public Long getMaterialId() { return materialId; }
    public void setMaterialId(Long v) { this.materialId = v; }
    public String getBidCaseId() { return bidCaseId; }
    public void setBidCaseId(String v) { this.bidCaseId = v; }
    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String v) { this.institutionId = v; }
    public int getBoardYear() { return boardYear; }
    public void setBoardYear(int v) { this.boardYear = v; }
    public String getStatusCd() { return statusCd; }
    public void setStatusCd(String v) { this.statusCd = v; }
    public String getMeetingDate() { return meetingDate; }
    public void setMeetingDate(String v) { this.meetingDate = v; }
    public String getFormId() { return formId; }
    public void setFormId(String v) { this.formId = v; }
    public int getFormVer() { return formVer; }
    public void setFormVer(int v) { this.formVer = v; }
    public int getCurSnap() { return curSnap; }
    public void setCurSnap(int v) { this.curSnap = v; }
    public String getLastSavedBy() { return lastSavedBy; }
    public void setLastSavedBy(String v) { this.lastSavedBy = v; }
    public String getLastSavedAt() { return lastSavedAt; }
    public void setLastSavedAt(String v) { this.lastSavedAt = v; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String v) { this.createdBy = v; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }
    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String v) { this.updatedBy = v; }
    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String v) { this.updatedAt = v; }
    public String getInstitutionName() { return institutionName; }
    public void setInstitutionName(String v) { this.institutionName = v; }
    public String getStatusName() { return statusName; }
    public void setStatusName(String v) { this.statusName = v; }
    public String getResultCd() { return resultCd; }
    public void setResultCd(String v) { this.resultCd = v; }
    public String getResultName() { return resultName; }
    public void setResultName(String v) { this.resultName = v; }
    public Long getSubmitReqId() { return submitReqId; }
    public void setSubmitReqId(Long v) { this.submitReqId = v; }
    public Integer getSubmitSnap() { return submitSnap; }
    public void setSubmitSnap(Integer v) { this.submitSnap = v; }
    public Integer getConfirmedSnap() { return confirmedSnap; }
    public void setConfirmedSnap(Integer v) { this.confirmedSnap = v; }
    public String getConfirmedBy() { return confirmedBy; }
    public void setConfirmedBy(String v) { this.confirmedBy = v; }
    public String getConfirmedAt() { return confirmedAt; }
    public void setConfirmedAt(String v) { this.confirmedAt = v; }
}
