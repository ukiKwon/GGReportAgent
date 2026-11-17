package com.kbstar.kgi.ggreport.web.domain;

import java.util.ArrayList;
import java.util.List;

/** EXT_CHECK(042) 한 줄. files 는 매퍼가 채우지 않는다(저장 때 함께 넘기는 용도). */
public class ExtCheck {
    private String checkKey, institutionId, batchId, checkId, checkedAt, sourceKind, sourceSlug, statusCd, errorCd;
    private String matchConf, matchBasis, title, itemNo, publisher, postedAt, deadlineAt, srcUrl, importedAt;
    private List<ExtCheckFile> files = new ArrayList<ExtCheckFile>();

    public String getCheckKey() { return checkKey; } public void setCheckKey(String v) { checkKey = v; }
    public String getInstitutionId() { return institutionId; } public void setInstitutionId(String v) { institutionId = v; }
    public String getBatchId() { return batchId; } public void setBatchId(String v) { batchId = v; }
    public String getCheckId() { return checkId; } public void setCheckId(String v) { checkId = v; }
    public String getCheckedAt() { return checkedAt; } public void setCheckedAt(String v) { checkedAt = v; }
    public String getSourceKind() { return sourceKind; } public void setSourceKind(String v) { sourceKind = v; }
    public String getSourceSlug() { return sourceSlug; } public void setSourceSlug(String v) { sourceSlug = v; }
    public String getStatusCd() { return statusCd; } public void setStatusCd(String v) { statusCd = v; }
    public String getErrorCd() { return errorCd; } public void setErrorCd(String v) { errorCd = v; }
    public String getMatchConf() { return matchConf; } public void setMatchConf(String v) { matchConf = v; }
    public String getMatchBasis() { return matchBasis; } public void setMatchBasis(String v) { matchBasis = v; }
    public String getTitle() { return title; } public void setTitle(String v) { title = v; }
    public String getItemNo() { return itemNo; } public void setItemNo(String v) { itemNo = v; }
    public String getPublisher() { return publisher; } public void setPublisher(String v) { publisher = v; }
    public String getPostedAt() { return postedAt; } public void setPostedAt(String v) { postedAt = v; }
    public String getDeadlineAt() { return deadlineAt; } public void setDeadlineAt(String v) { deadlineAt = v; }
    public String getSrcUrl() { return srcUrl; } public void setSrcUrl(String v) { srcUrl = v; }
    public String getImportedAt() { return importedAt; } public void setImportedAt(String v) { importedAt = v; }
    public List<ExtCheckFile> getFiles() { return files; } public void setFiles(List<ExtCheckFile> v) { files = v; }
}
