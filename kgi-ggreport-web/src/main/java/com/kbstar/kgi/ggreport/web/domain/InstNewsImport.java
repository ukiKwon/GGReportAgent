package com.kbstar.kgi.ggreport.web.domain;

/** INST_NEWS_IMPORT(060) — 반입 1건 = 판 1개. */
public class InstNewsImport {
    private Long importId;
    private String institutionId;
    private String fileDate;
    private String fileSha256;
    private Long fileBytes;
    private Integer itemCount;
    private String batchId;
    private String importedBy;
    private String importedAt;
    private Integer importedVerified;

    public Long getImportId() { return importId; }
    public void setImportId(Long v) { this.importId = v; }
    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String v) { this.institutionId = v; }
    public String getFileDate() { return fileDate; }
    public void setFileDate(String v) { this.fileDate = v; }
    public String getFileSha256() { return fileSha256; }
    public void setFileSha256(String v) { this.fileSha256 = v; }
    public Long getFileBytes() { return fileBytes; }
    public void setFileBytes(Long v) { this.fileBytes = v; }
    public Integer getItemCount() { return itemCount; }
    public void setItemCount(Integer v) { this.itemCount = v; }
    public String getBatchId() { return batchId; }
    public void setBatchId(String v) { this.batchId = v; }
    public String getImportedBy() { return importedBy; }
    public void setImportedBy(String v) { this.importedBy = v; }
    public String getImportedAt() { return importedAt; }
    public void setImportedAt(String v) { this.importedAt = v; }
    public Integer getImportedVerified() { return importedVerified; }
    public void setImportedVerified(Integer v) { this.importedVerified = v; }
}
