package com.kbstar.kgi.ggreport.web.domain;

/** INST_PLAN_DOC(034) — 계획 문서 한 권(판 안). collectorAgent 는 수집 프로그램 식별자(사람 정보 아님). */
public class InstPlanDoc {

    private Long docId;
    private Long importId;
    private String institutionId;
    private Integer docSeq;
    private String title;
    private String srcKindCd;
    private Integer periodFrom;
    private Integer periodTo;
    private String srcUrl;
    private Integer urlMissing;
    private String checkedOn;
    private String collectorAgent;
    private String pageRange;
    private String note;

    public Long getDocId() { return docId; }
    public void setDocId(Long docId) { this.docId = docId; }
    public Long getImportId() { return importId; }
    public void setImportId(Long importId) { this.importId = importId; }
    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String institutionId) { this.institutionId = institutionId; }
    public Integer getDocSeq() { return docSeq; }
    public void setDocSeq(Integer docSeq) { this.docSeq = docSeq; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getSrcKindCd() { return srcKindCd; }
    public void setSrcKindCd(String srcKindCd) { this.srcKindCd = srcKindCd; }
    public Integer getPeriodFrom() { return periodFrom; }
    public void setPeriodFrom(Integer periodFrom) { this.periodFrom = periodFrom; }
    public Integer getPeriodTo() { return periodTo; }
    public void setPeriodTo(Integer periodTo) { this.periodTo = periodTo; }
    public String getSrcUrl() { return srcUrl; }
    public void setSrcUrl(String srcUrl) { this.srcUrl = srcUrl; }
    public Integer getUrlMissing() { return urlMissing; }
    public void setUrlMissing(Integer urlMissing) { this.urlMissing = urlMissing; }
    public String getCheckedOn() { return checkedOn; }
    public void setCheckedOn(String checkedOn) { this.checkedOn = checkedOn; }
    public String getCollectorAgent() { return collectorAgent; }
    public void setCollectorAgent(String collectorAgent) { this.collectorAgent = collectorAgent; }
    public String getPageRange() { return pageRange; }
    public void setPageRange(String pageRange) { this.pageRange = pageRange; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
}
