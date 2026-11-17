package com.kbstar.kgi.ggreport.web.domain;

/** EXT_CHECK_FILE(042) 한 줄. storedName 은 '<check_key>/<check_id>_<순번>.<확장자>' — 서버가 만든 값이다. */
public class ExtCheckFile {
    private String checkKey, formatCd, storedName, sha256;
    private int fileSeq;
    private long fileSize;

    public ExtCheckFile() { }
    public ExtCheckFile(String checkKey, int fileSeq, String formatCd, String storedName, String sha256, long fileSize) {
        this.checkKey = checkKey; this.fileSeq = fileSeq; this.formatCd = formatCd;
        this.storedName = storedName; this.sha256 = sha256; this.fileSize = fileSize;
    }
    public String getCheckKey() { return checkKey; } public void setCheckKey(String v) { checkKey = v; }
    public int getFileSeq() { return fileSeq; } public void setFileSeq(int v) { fileSeq = v; }
    public String getFormatCd() { return formatCd; } public void setFormatCd(String v) { formatCd = v; }
    public String getStoredName() { return storedName; } public void setStoredName(String v) { storedName = v; }
    public String getSha256() { return sha256; } public void setSha256(String v) { sha256 = v; }
    public long getFileSize() { return fileSize; } public void setFileSize(long v) { fileSize = v; }
}
