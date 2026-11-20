package com.kbstar.kgi.ggreport.web.domain;

/** DOC_CHECK 한 줄(057). */
public class DocCheckRow {
    private String taskId;
    private String nameKey;
    private String fileSha256;
    private long fileSize;
    private long fileMtimeMs;
    private String institutionId;
    private String stateCd;
    private String reasonCd;
    private int hasImages;
    private int hasEmbedded;
    private int orderApprox;
    private int hitRows;
    private int checkerVer;
    private String checkedAt;

    public String getTaskId() { return taskId; }
    public void setTaskId(String v) { taskId = v; }
    public String getNameKey() { return nameKey; }
    public void setNameKey(String v) { nameKey = v; }
    public String getFileSha256() { return fileSha256; }
    public void setFileSha256(String v) { fileSha256 = v; }
    public long getFileSize() { return fileSize; }
    public void setFileSize(long v) { fileSize = v; }
    public long getFileMtimeMs() { return fileMtimeMs; }
    public void setFileMtimeMs(long v) { fileMtimeMs = v; }
    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String v) { institutionId = v; }
    public String getStateCd() { return stateCd; }
    public void setStateCd(String v) { stateCd = v; }
    public String getReasonCd() { return reasonCd; }
    public void setReasonCd(String v) { reasonCd = v; }
    public int getHasImages() { return hasImages; }
    public void setHasImages(int v) { hasImages = v; }
    public int getHasEmbedded() { return hasEmbedded; }
    public void setHasEmbedded(int v) { hasEmbedded = v; }
    public int getOrderApprox() { return orderApprox; }
    public void setOrderApprox(int v) { orderApprox = v; }
    public int getHitRows() { return hitRows; }
    public void setHitRows(int v) { hitRows = v; }
    public int getCheckerVer() { return checkerVer; }
    public void setCheckerVer(int v) { checkerVer = v; }
    public String getCheckedAt() { return checkedAt; }
    public void setCheckedAt(String v) { checkedAt = v; }
}
