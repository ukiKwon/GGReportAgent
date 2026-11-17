package com.kbstar.kgi.ggreport.web.domain;

/** EXT_CHECK_EXCL(042) 한 줄 — 제외 사유·위치·건수만. 원문·파일명·경로는 담지 않는다. */
public class ExtCheckExcl {
    private final String batchId, checkId, reasonCd, locatorCd, excludedAt;
    private final int fileSeq, hitCnt;

    public ExtCheckExcl(String batchId, String checkId, int fileSeq, String reasonCd, String locatorCd, int hitCnt, String excludedAt) {
        this.batchId = batchId; this.checkId = checkId; this.fileSeq = fileSeq; this.reasonCd = reasonCd;
        this.locatorCd = locatorCd; this.hitCnt = hitCnt; this.excludedAt = excludedAt;
    }
    public String getBatchId() { return batchId; }
    public String getCheckId() { return checkId; }
    public int getFileSeq() { return fileSeq; }
    public String getReasonCd() { return reasonCd; }
    public String getLocatorCd() { return locatorCd; }
    public int getHitCnt() { return hitCnt; }
    public String getExcludedAt() { return excludedAt; }
}
