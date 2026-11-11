package com.kbstar.kgi.ggreport.web.domain;

/** INST_HEAD_PHOTO 한 행(026) — 서버가 다시 만든 JPEG 의 메타. 파일 본체는 서버 디스크(STORE_KEY 이름). 원래 파일 이름은 보관하지 않는다. */
public class InstHeadPhoto {

    private Long photoId;
    private Long headId;
    private String institutionId;
    private String stateCd;
    private String storeKey;
    private String sha256;
    private String origSha256;
    private String origExt;
    private long sizeBytes;
    private int imgW;
    private int imgH;
    private String licenseCd;
    private String srcKindCd;
    private String srcTitle;
    private String srcUrl;
    private String checkedOn;
    private String uploadedBy;
    private String uploadedAt;
    private int uploadedVerified;
    private String endedBy;
    private String endedAt;

    public Long getPhotoId() { return photoId; }
    public void setPhotoId(Long v) { this.photoId = v; }
    public Long getHeadId() { return headId; }
    public void setHeadId(Long v) { this.headId = v; }
    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String v) { this.institutionId = v; }
    public String getStateCd() { return stateCd; }
    public void setStateCd(String v) { this.stateCd = v; }
    public String getStoreKey() { return storeKey; }
    public void setStoreKey(String v) { this.storeKey = v; }
    public String getSha256() { return sha256; }
    public void setSha256(String v) { this.sha256 = v; }
    public String getOrigSha256() { return origSha256; }
    public void setOrigSha256(String v) { this.origSha256 = v; }
    public String getOrigExt() { return origExt; }
    public void setOrigExt(String v) { this.origExt = v; }
    public long getSizeBytes() { return sizeBytes; }
    public void setSizeBytes(long v) { this.sizeBytes = v; }
    public int getImgW() { return imgW; }
    public void setImgW(int v) { this.imgW = v; }
    public int getImgH() { return imgH; }
    public void setImgH(int v) { this.imgH = v; }
    public String getLicenseCd() { return licenseCd; }
    public void setLicenseCd(String v) { this.licenseCd = v; }
    public String getSrcKindCd() { return srcKindCd; }
    public void setSrcKindCd(String v) { this.srcKindCd = v; }
    public String getSrcTitle() { return srcTitle; }
    public void setSrcTitle(String v) { this.srcTitle = v; }
    public String getSrcUrl() { return srcUrl; }
    public void setSrcUrl(String v) { this.srcUrl = v; }
    public String getCheckedOn() { return checkedOn; }
    public void setCheckedOn(String v) { this.checkedOn = v; }
    public String getUploadedBy() { return uploadedBy; }
    public void setUploadedBy(String v) { this.uploadedBy = v; }
    public String getUploadedAt() { return uploadedAt; }
    public void setUploadedAt(String v) { this.uploadedAt = v; }
    public int getUploadedVerified() { return uploadedVerified; }
    public void setUploadedVerified(int v) { this.uploadedVerified = v; }
    public String getEndedBy() { return endedBy; }
    public void setEndedBy(String v) { this.endedBy = v; }
    public String getEndedAt() { return endedAt; }
    public void setEndedAt(String v) { this.endedAt = v; }
}
