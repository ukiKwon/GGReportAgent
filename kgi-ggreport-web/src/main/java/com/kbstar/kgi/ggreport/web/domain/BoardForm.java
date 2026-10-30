package com.kbstar.kgi.ggreport.web.domain;

/** 양식 헤더 1행(BOARD_FORM). */
public class BoardForm {
    private Long formId;
    private String teamKey;
    private String name;
    private String baseDoc;
    private String status;
    private int currentVer;
    private String createdBy;
    private String createdAt;
    private String updatedBy;
    private String updatedAt;

    public Long getFormId() { return formId; }
    public void setFormId(Long formId) { this.formId = formId; }
    public String getTeamKey() { return teamKey; }
    public void setTeamKey(String teamKey) { this.teamKey = teamKey; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getBaseDoc() { return baseDoc; }
    public void setBaseDoc(String baseDoc) { this.baseDoc = baseDoc; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public int getCurrentVer() { return currentVer; }
    public void setCurrentVer(int currentVer) { this.currentVer = currentVer; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }
}
