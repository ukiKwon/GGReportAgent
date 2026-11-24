package com.kbstar.kgi.ggreport.web.domain;

/** INST_NEWS_ITEM(060) — 기사 1건. 본문은 없다(SUMMARY 는 직접 쓴 요약). */
public class InstNewsItem {
    private Long newsId;
    private Long importId;
    private String institutionId;
    private Integer rowNo;
    private String fieldCd;
    private String title;
    private String press;
    private String publishedOn;
    private String srcUrl;
    private String summary;
    private String checkedOn;
    private String collectorAgent;

    public Long getNewsId() { return newsId; }
    public void setNewsId(Long v) { this.newsId = v; }
    public Long getImportId() { return importId; }
    public void setImportId(Long v) { this.importId = v; }
    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String v) { this.institutionId = v; }
    public Integer getRowNo() { return rowNo; }
    public void setRowNo(Integer v) { this.rowNo = v; }
    public String getFieldCd() { return fieldCd; }
    public void setFieldCd(String v) { this.fieldCd = v; }
    public String getTitle() { return title; }
    public void setTitle(String v) { this.title = v; }
    public String getPress() { return press; }
    public void setPress(String v) { this.press = v; }
    public String getPublishedOn() { return publishedOn; }
    public void setPublishedOn(String v) { this.publishedOn = v; }
    public String getSrcUrl() { return srcUrl; }
    public void setSrcUrl(String v) { this.srcUrl = v; }
    public String getSummary() { return summary; }
    public void setSummary(String v) { this.summary = v; }
    public String getCheckedOn() { return checkedOn; }
    public void setCheckedOn(String v) { this.checkedOn = v; }
    public String getCollectorAgent() { return collectorAgent; }
    public void setCollectorAgent(String v) { this.collectorAgent = v; }
}
