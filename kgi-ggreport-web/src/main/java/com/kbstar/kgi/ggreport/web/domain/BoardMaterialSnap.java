package com.kbstar.kgi.ggreport.web.domain;

/** BOARD_MATERIAL_SNAP 한 행. 목록 조회에서는 valuesJson 을 싣지 않는다. */
public class BoardMaterialSnap {
    private Long materialId;
    private int snapNo;
    private String valuesJson;
    private String note;
    private String savedBy;
    private String savedByName;
    private String savedAt;

    public Long getMaterialId() { return materialId; }
    public void setMaterialId(Long v) { this.materialId = v; }
    public int getSnapNo() { return snapNo; }
    public void setSnapNo(int v) { this.snapNo = v; }
    public String getValuesJson() { return valuesJson; }
    public void setValuesJson(String v) { this.valuesJson = v; }
    public String getNote() { return note; }
    public void setNote(String v) { this.note = v; }
    public String getSavedBy() { return savedBy; }
    public void setSavedBy(String v) { this.savedBy = v; }
    public String getSavedByName() { return savedByName; }
    public void setSavedByName(String v) { this.savedByName = v; }
    public String getSavedAt() { return savedAt; }
    public void setSavedAt(String v) { this.savedAt = v; }
}
