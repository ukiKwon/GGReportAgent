package com.kbstar.kgi.ggreport.web.domain;

/** BID_PREP_TASK 한 행(024) + 정의 쪽 이름·준비중 여부(PREP_TASK_DEF 를 실시간으로 읽는다). */
public class BidPrepTask {

    private String bidCaseId;
    private String taskCd;
    private int sortNo;
    private String kindCd;
    private String judgeCd;
    private String factKey;
    private String precondKey;
    private String prereqCd;
    private String condKey;
    private int doneYn;
    private String doneBy;
    private String doneAt;
    private Long refAttachId;
    private String refSha256;
    private String refBy;
    private String refAt;
    /** PREP_TASK_DEF 에서(조인). 정의 행이 없으면 이름 null, 준비중 아님(readyYn=1). */
    private String taskName;
    private int readyYn = 1;

    public String getBidCaseId() { return bidCaseId; }
    public void setBidCaseId(String v) { this.bidCaseId = v; }
    public String getTaskCd() { return taskCd; }
    public void setTaskCd(String v) { this.taskCd = v; }
    public int getSortNo() { return sortNo; }
    public void setSortNo(int v) { this.sortNo = v; }
    public String getKindCd() { return kindCd; }
    public void setKindCd(String v) { this.kindCd = v; }
    public String getJudgeCd() { return judgeCd; }
    public void setJudgeCd(String v) { this.judgeCd = v; }
    public String getFactKey() { return factKey; }
    public void setFactKey(String v) { this.factKey = v; }
    public String getPrecondKey() { return precondKey; }
    public void setPrecondKey(String v) { this.precondKey = v; }
    public String getPrereqCd() { return prereqCd; }
    public void setPrereqCd(String v) { this.prereqCd = v; }
    public String getCondKey() { return condKey; }
    public void setCondKey(String v) { this.condKey = v; }
    public int getDoneYn() { return doneYn; }
    public void setDoneYn(int v) { this.doneYn = v; }
    public String getDoneBy() { return doneBy; }
    public void setDoneBy(String v) { this.doneBy = v; }
    public String getDoneAt() { return doneAt; }
    public void setDoneAt(String v) { this.doneAt = v; }
    public Long getRefAttachId() { return refAttachId; }
    public void setRefAttachId(Long v) { this.refAttachId = v; }
    public String getRefSha256() { return refSha256; }
    public void setRefSha256(String v) { this.refSha256 = v; }
    public String getRefBy() { return refBy; }
    public void setRefBy(String v) { this.refBy = v; }
    public String getRefAt() { return refAt; }
    public void setRefAt(String v) { this.refAt = v; }
    public String getTaskName() { return taskName; }
    public void setTaskName(String v) { this.taskName = v; }
    public int getReadyYn() { return readyYn; }
    public void setReadyYn(int v) { this.readyYn = v; }
}
