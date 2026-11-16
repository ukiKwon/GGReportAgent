package com.kbstar.kgi.ggreport.web.domain;

/** INST_PLAN_IMPORT(034) — 반입 1건 = 판 1개. 칸 이름은 camelCase 로 매핑된다. */
public class InstPlanImport {

    private Long importId;
    private String institutionId;
    private String originCd;
    private String fileDate;
    private String fileSha256;
    private Long fileBytes;
    private Integer itemCount;
    private Integer docCount;
    private Integer warnCount;
    private String batchId;
    private String importedBy;
    private String importedAt;
    private Integer importedVerified;

    public Long getImportId() { return importId; }
    public void setImportId(Long importId) { this.importId = importId; }
    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String institutionId) { this.institutionId = institutionId; }
    public String getOriginCd() { return originCd; }
    public void setOriginCd(String originCd) { this.originCd = originCd; }
    public String getFileDate() { return fileDate; }
    public void setFileDate(String fileDate) { this.fileDate = fileDate; }
    public String getFileSha256() { return fileSha256; }
    public void setFileSha256(String fileSha256) { this.fileSha256 = fileSha256; }
    public Long getFileBytes() { return fileBytes; }
    public void setFileBytes(Long fileBytes) { this.fileBytes = fileBytes; }
    public Integer getItemCount() { return itemCount; }
    public void setItemCount(Integer itemCount) { this.itemCount = itemCount; }
    public Integer getDocCount() { return docCount; }
    public void setDocCount(Integer docCount) { this.docCount = docCount; }
    public Integer getWarnCount() { return warnCount; }
    public void setWarnCount(Integer warnCount) { this.warnCount = warnCount; }
    public String getBatchId() { return batchId; }
    public void setBatchId(String batchId) { this.batchId = batchId; }
    public String getImportedBy() { return importedBy; }
    public void setImportedBy(String importedBy) { this.importedBy = importedBy; }
    public String getImportedAt() { return importedAt; }
    public void setImportedAt(String importedAt) { this.importedAt = importedAt; }
    public Integer getImportedVerified() { return importedVerified; }
    public void setImportedVerified(Integer importedVerified) { this.importedVerified = importedVerified; }
}
