package com.kbstar.kgi.ggreport.web.domain;

/** INST_HEAD_ITEM 한 행(026) — 칸 값 1개(후보·확정·대체 모두). 출처는 행마다. */
public class InstHeadItem {

    private Long itemId;
    private Long headId;
    private String institutionId;
    private String fieldCd;
    private String stateCd;
    private String originCd;
    private String batchId;
    private String valText;
    private String valDate;
    private String valFrom;
    private String valTo;
    private Integer valFlag;
    private String srcKindCd;
    private String srcTitle;
    private String srcUrl;
    private String srcPublished;
    private String checkedOn;
    private String createdBy;
    private String createdAt;
    private int createdVerified;
    private String decidedBy;
    private String decidedAt;
    private Long supersededById;
    private String voidedBy;
    private String voidedAt;
    /** 조회 전용(조인) — 이 칸이 속한 머리의 상태. 저장하지 않는다. */
    private String headStatus;

    public Long getItemId() { return itemId; }
    public void setItemId(Long v) { this.itemId = v; }
    public Long getHeadId() { return headId; }
    public void setHeadId(Long v) { this.headId = v; }
    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String v) { this.institutionId = v; }
    public String getFieldCd() { return fieldCd; }
    public void setFieldCd(String v) { this.fieldCd = v; }
    public String getStateCd() { return stateCd; }
    public void setStateCd(String v) { this.stateCd = v; }
    public String getOriginCd() { return originCd; }
    public void setOriginCd(String v) { this.originCd = v; }
    public String getBatchId() { return batchId; }
    public void setBatchId(String v) { this.batchId = v; }
    public String getValText() { return valText; }
    public void setValText(String v) { this.valText = v; }
    public String getValDate() { return valDate; }
    public void setValDate(String v) { this.valDate = v; }
    public String getValFrom() { return valFrom; }
    public void setValFrom(String v) { this.valFrom = v; }
    public String getValTo() { return valTo; }
    public void setValTo(String v) { this.valTo = v; }
    public Integer getValFlag() { return valFlag; }
    public void setValFlag(Integer v) { this.valFlag = v; }
    public String getSrcKindCd() { return srcKindCd; }
    public void setSrcKindCd(String v) { this.srcKindCd = v; }
    public String getSrcTitle() { return srcTitle; }
    public void setSrcTitle(String v) { this.srcTitle = v; }
    public String getSrcUrl() { return srcUrl; }
    public void setSrcUrl(String v) { this.srcUrl = v; }
    public String getSrcPublished() { return srcPublished; }
    public void setSrcPublished(String v) { this.srcPublished = v; }
    public String getCheckedOn() { return checkedOn; }
    public void setCheckedOn(String v) { this.checkedOn = v; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String v) { this.createdBy = v; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }
    public int getCreatedVerified() { return createdVerified; }
    public void setCreatedVerified(int v) { this.createdVerified = v; }
    public String getDecidedBy() { return decidedBy; }
    public void setDecidedBy(String v) { this.decidedBy = v; }
    public String getDecidedAt() { return decidedAt; }
    public void setDecidedAt(String v) { this.decidedAt = v; }
    public Long getSupersededById() { return supersededById; }
    public void setSupersededById(Long v) { this.supersededById = v; }
    public String getVoidedBy() { return voidedBy; }
    public void setVoidedBy(String v) { this.voidedBy = v; }
    public String getVoidedAt() { return voidedAt; }
    public void setVoidedAt(String v) { this.voidedAt = v; }
    public String getHeadStatus() { return headStatus; }
    public void setHeadStatus(String v) { this.headStatus = v; }
}
