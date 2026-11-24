package com.kb.uploader.dto;

/** 사업계획 CSV 업로드 한 파일의 결과 (NEXT 56 U1). */
public class PlanCsvResultItem {
    private final String filename;
    private final boolean saved;
    private final String sha256;   // 저장된 것만, 아니면 null
    private final String message;

    public PlanCsvResultItem(String filename, boolean saved, String sha256, String message) {
        this.filename = filename;
        this.saved = saved;
        this.sha256 = sha256;
        this.message = message;
    }

    public String getFilename() { return filename; }
    public boolean isSaved() { return saved; }
    public String getSha256() { return sha256; }
    public String getMessage() { return message; }
}
