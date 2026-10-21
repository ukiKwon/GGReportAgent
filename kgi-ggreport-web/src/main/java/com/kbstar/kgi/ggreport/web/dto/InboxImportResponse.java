package com.kbstar.kgi.ggreport.web.dto;

import java.util.List;
import java.util.Map;

/**
 * {@code POST /inbox/{batch}/import} 의 응답 — Python {@code import_batch} 의 dict.
 *
 * <p>{@code bidCases} 는 {@code {"created": [...], "updated": [...]}} 다. 같은 공고를
 * 다시 수집하는 것이 <b>정상</b>이므로 둘을 나눠 보여 준다 — 전부 updated 인 것은
 * 실패가 아니라 "새 공고가 없었다"는 뜻이다.
 *
 * <p>{@code archivedTo} 는 배치가 옮겨 간 자리다. inbox 를 "미처리만"으로 유지하려고
 * 치우되, 반입 근거({@code evidence.url}·수집 시각)는 감사용으로 남긴다.
 */
public class InboxImportResponse {

    private String batchId;
    private int importedInstitutions;
    private List<String> institutionIds;
    private Map<String, List<String>> bidCases;
    private List<RfpFileEntry> rfpFiles;
    private String archivedTo;

    public InboxImportResponse() {
    }

    public InboxImportResponse(String batchId, List<String> institutionIds,
                               Map<String, List<String>> bidCases,
                               List<RfpFileEntry> rfpFiles, String archivedTo) {
        this.batchId = batchId;
        this.institutionIds = institutionIds;
        this.importedInstitutions = institutionIds.size();
        this.bidCases = bidCases;
        this.rfpFiles = rfpFiles;
        this.archivedTo = archivedTo;
    }

    public String getBatchId() { return batchId; }
    public void setBatchId(String batchId) { this.batchId = batchId; }

    public int getImportedInstitutions() { return importedInstitutions; }
    public void setImportedInstitutions(int importedInstitutions) { this.importedInstitutions = importedInstitutions; }

    public List<String> getInstitutionIds() { return institutionIds; }
    public void setInstitutionIds(List<String> institutionIds) { this.institutionIds = institutionIds; }

    public Map<String, List<String>> getBidCases() { return bidCases; }
    public void setBidCases(Map<String, List<String>> bidCases) { this.bidCases = bidCases; }

    public List<RfpFileEntry> getRfpFiles() { return rfpFiles; }
    public void setRfpFiles(List<RfpFileEntry> rfpFiles) { this.rfpFiles = rfpFiles; }

    public String getArchivedTo() { return archivedTo; }
    public void setArchivedTo(String archivedTo) { this.archivedTo = archivedTo; }
}
