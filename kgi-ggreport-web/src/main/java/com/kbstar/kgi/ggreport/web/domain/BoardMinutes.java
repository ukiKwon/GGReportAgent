package com.kbstar.kgi.ggreport.web.domain;

/** BOARD_MINUTES 한 행(047) + 조회용 이름 칸(institutionName·createdByName 은 JOIN 으로만 채워진다). 본문은 가린 뒤의 글만 담긴다. */
public class BoardMinutes {
    private Long minutesId;
    private Long materialId;
    private String bidCaseId;
    private String institutionId;
    private int boardYear;
    private String meetingDate;
    private String title;
    private String encTranscript;
    private String encTimeline;
    private String encSummary;
    private int utterCnt;
    private int speakerCnt;
    private int durationSec;
    private int noiseCnt;
    private int segCnt;
    private int maskPiiCnt;
    private int maskNameCnt;
    private int maskTitleCnt;
    private int maskTermCnt;
    private int maskLineCnt;
    private int maskLabelCnt;
    private int releaseCnt;
    private String ruleVer;
    private String contentDigest;
    private int revNo;
    private int deletedYn;
    private String deletedBy;
    private String deletedAt;
    private String createdBy;
    private String createdAt;
    private String updatedBy;
    private String updatedAt;
    private String institutionName;
    private String createdByName;

    public Long getMinutesId() { return minutesId; }
    public void setMinutesId(Long v) { this.minutesId = v; }
    public Long getMaterialId() { return materialId; }
    public void setMaterialId(Long v) { this.materialId = v; }
    public String getBidCaseId() { return bidCaseId; }
    public void setBidCaseId(String v) { this.bidCaseId = v; }
    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String v) { this.institutionId = v; }
    public int getBoardYear() { return boardYear; }
    public void setBoardYear(int v) { this.boardYear = v; }
    public String getMeetingDate() { return meetingDate; }
    public void setMeetingDate(String v) { this.meetingDate = v; }
    public String getTitle() { return title; }
    public void setTitle(String v) { this.title = v; }
    public String getEncTranscript() { return encTranscript; }
    public void setEncTranscript(String v) { this.encTranscript = v; }
    public String getEncTimeline() { return encTimeline; }
    public void setEncTimeline(String v) { this.encTimeline = v; }
    public String getEncSummary() { return encSummary; }
    public void setEncSummary(String v) { this.encSummary = v; }
    public int getUtterCnt() { return utterCnt; }
    public void setUtterCnt(int v) { this.utterCnt = v; }
    public int getSpeakerCnt() { return speakerCnt; }
    public void setSpeakerCnt(int v) { this.speakerCnt = v; }
    public int getDurationSec() { return durationSec; }
    public void setDurationSec(int v) { this.durationSec = v; }
    public int getNoiseCnt() { return noiseCnt; }
    public void setNoiseCnt(int v) { this.noiseCnt = v; }
    public int getSegCnt() { return segCnt; }
    public void setSegCnt(int v) { this.segCnt = v; }
    public int getMaskPiiCnt() { return maskPiiCnt; }
    public void setMaskPiiCnt(int v) { this.maskPiiCnt = v; }
    public int getMaskNameCnt() { return maskNameCnt; }
    public void setMaskNameCnt(int v) { this.maskNameCnt = v; }
    public int getMaskTitleCnt() { return maskTitleCnt; }
    public void setMaskTitleCnt(int v) { this.maskTitleCnt = v; }
    public int getMaskTermCnt() { return maskTermCnt; }
    public void setMaskTermCnt(int v) { this.maskTermCnt = v; }
    public int getMaskLineCnt() { return maskLineCnt; }
    public void setMaskLineCnt(int v) { this.maskLineCnt = v; }
    public int getMaskLabelCnt() { return maskLabelCnt; }
    public void setMaskLabelCnt(int v) { this.maskLabelCnt = v; }
    public int getReleaseCnt() { return releaseCnt; }
    public void setReleaseCnt(int v) { this.releaseCnt = v; }
    public String getRuleVer() { return ruleVer; }
    public void setRuleVer(String v) { this.ruleVer = v; }
    public String getContentDigest() { return contentDigest; }
    public void setContentDigest(String v) { this.contentDigest = v; }
    public int getRevNo() { return revNo; }
    public void setRevNo(int v) { this.revNo = v; }
    public int getDeletedYn() { return deletedYn; }
    public void setDeletedYn(int v) { this.deletedYn = v; }
    public boolean isDeleted() { return deletedYn == 1; }
    public String getDeletedBy() { return deletedBy; }
    public void setDeletedBy(String v) { this.deletedBy = v; }
    public String getDeletedAt() { return deletedAt; }
    public void setDeletedAt(String v) { this.deletedAt = v; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String v) { this.createdBy = v; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }
    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String v) { this.updatedBy = v; }
    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String v) { this.updatedAt = v; }
    public String getInstitutionName() { return institutionName; }
    public void setInstitutionName(String v) { this.institutionName = v; }
    public String getCreatedByName() { return createdByName; }
    public void setCreatedByName(String v) { this.createdByName = v; }
}
