package com.kbstar.kgi.ggreport.web.domain;

/** BID_PREP_ATTACH 한 행(025) — 사전준비 첨부 원본의 메타. 파일 본체는 서버 디스크(STORE_KEY 이름). */
public class BidPrepAttach {

    private Long attachId;
    private String bidCaseId;
    private String taskCd;
    private String origName;
    private String extCd;
    private long sizeBytes;
    private String sha256;
    private String storeKey;
    private String piiState;
    private String piiNote;
    private int validYn = 1;
    private String uploadedBy;
    private String uploadedAt;
    private int uploadedVerified;
    private String voidedBy;
    private String voidedAt;

    public Long getAttachId() { return attachId; }
    public void setAttachId(Long v) { this.attachId = v; }
    public String getBidCaseId() { return bidCaseId; }
    public void setBidCaseId(String v) { this.bidCaseId = v; }
    public String getTaskCd() { return taskCd; }
    public void setTaskCd(String v) { this.taskCd = v; }
    public String getOrigName() { return origName; }
    public void setOrigName(String v) { this.origName = v; }
    public String getExtCd() { return extCd; }
    public void setExtCd(String v) { this.extCd = v; }
    public long getSizeBytes() { return sizeBytes; }
    public void setSizeBytes(long v) { this.sizeBytes = v; }
    public String getSha256() { return sha256; }
    public void setSha256(String v) { this.sha256 = v; }
    public String getStoreKey() { return storeKey; }
    public void setStoreKey(String v) { this.storeKey = v; }
    public String getPiiState() { return piiState; }
    public void setPiiState(String v) { this.piiState = v; }
    public String getPiiNote() { return piiNote; }
    public void setPiiNote(String v) { this.piiNote = v; }
    public int getValidYn() { return validYn; }
    public void setValidYn(int v) { this.validYn = v; }
    public String getUploadedBy() { return uploadedBy; }
    public void setUploadedBy(String v) { this.uploadedBy = v; }
    public String getUploadedAt() { return uploadedAt; }
    public void setUploadedAt(String v) { this.uploadedAt = v; }
    public int getUploadedVerified() { return uploadedVerified; }
    public void setUploadedVerified(int v) { this.uploadedVerified = v; }
    public String getVoidedBy() { return voidedBy; }
    public void setVoidedBy(String v) { this.voidedBy = v; }
    public String getVoidedAt() { return voidedAt; }
    public void setVoidedAt(String v) { this.voidedAt = v; }
}
