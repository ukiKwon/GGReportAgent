package com.kbstar.kgi.ggreport.web.domain;

/** BOARD_MINUTES_ITEM 한 행(047) — 요약 항목(KIND_CD: SEG·TOPIC·TODO·OTHER). doneByName 은 JOIN 으로만 채워진다. */
public class BoardMinutesItem {
    private Long minutesId;
    private int itemNo;
    private String kindCd;
    private Integer segNo;
    private Integer sectionNo;
    private String sectionTitle;
    private int sortNo;
    private String body;
    private int editedYn;
    private int doneYn;
    private String doneBy;
    private String doneByName;
    private String doneAt;

    public Long getMinutesId() { return minutesId; }
    public void setMinutesId(Long v) { this.minutesId = v; }
    public int getItemNo() { return itemNo; }
    public void setItemNo(int v) { this.itemNo = v; }
    public String getKindCd() { return kindCd; }
    public void setKindCd(String v) { this.kindCd = v; }
    public Integer getSegNo() { return segNo; }
    public void setSegNo(Integer v) { this.segNo = v; }
    public Integer getSectionNo() { return sectionNo; }
    public void setSectionNo(Integer v) { this.sectionNo = v; }
    public String getSectionTitle() { return sectionTitle; }
    public void setSectionTitle(String v) { this.sectionTitle = v; }
    public int getSortNo() { return sortNo; }
    public void setSortNo(int v) { this.sortNo = v; }
    public String getBody() { return body; }
    public void setBody(String v) { this.body = v; }
    public int getEditedYn() { return editedYn; }
    public void setEditedYn(int v) { this.editedYn = v; }
    public int getDoneYn() { return doneYn; }
    public void setDoneYn(int v) { this.doneYn = v; }
    public String getDoneBy() { return doneBy; }
    public void setDoneBy(String v) { this.doneBy = v; }
    public String getDoneByName() { return doneByName; }
    public void setDoneByName(String v) { this.doneByName = v; }
    public String getDoneAt() { return doneAt; }
    public void setDoneAt(String v) { this.doneAt = v; }
}
