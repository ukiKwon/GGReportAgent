package com.kbstar.kgi.ggreport.web.domain;

/** 양식 버전 1행(BOARD_FORM_VER) — 불변. 목록 조회에서는 specJson 이 null 이다. */
public class BoardFormVer {
    private Long formId;
    private int verNo;
    private String name;
    private int catalogVer;
    private String specJson;
    private String createdBy;
    private String createdAt;

    public Long getFormId() { return formId; }
    public void setFormId(Long formId) { this.formId = formId; }
    public int getVerNo() { return verNo; }
    public void setVerNo(int verNo) { this.verNo = verNo; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public int getCatalogVer() { return catalogVer; }
    public void setCatalogVer(int catalogVer) { this.catalogVer = catalogVer; }
    public String getSpecJson() { return specJson; }
    public void setSpecJson(String specJson) { this.specJson = specJson; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
