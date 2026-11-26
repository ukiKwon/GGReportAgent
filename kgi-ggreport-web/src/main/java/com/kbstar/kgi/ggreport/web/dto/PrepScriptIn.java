package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * POST /bidcases/{id}/prep/board-script-docx 본문 — 발표 대본 손 입력 칸(저장하지 않는다). 키는 snake_case(meeting, round, agenda_no, speaker_dept,
 * speaker_name, speaker_title, term_years, review_when, intro, status_note, effect, profit_note, accounting, amount_mode, ai_fields). 모두 선택.
 * ai_fields 는 'AI 초안을 넣은 칸'(intro·effect) 목록 — 감사 기록 전용이고 Word 에는 표시하지 않는다(서비스는 읽지 않는다).
 * 서버가 아는 값(기관·금액 등)은 받지 않는다 — 모르는 키는 무시한다.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class PrepScriptIn {
    private String meeting;
    private String round;
    private String agendaNo;
    private String speakerDept;
    private String speakerName;
    private String speakerTitle;
    private Integer termYears;
    private String reviewWhen;
    private String intro;
    private String statusNote;
    private String effect;
    private String profitNote;
    private String accounting;
    private String amountMode;
    private java.util.List<String> aiFields;   // AI 초안에서 온 칸 키(intro·effect) — 감사 전용

    public java.util.List<String> getAiFields() { return aiFields; }
    public void setAiFields(java.util.List<String> v) { this.aiFields = v; }
    public String getMeeting() { return meeting; }
    public void setMeeting(String v) { this.meeting = v; }
    public String getRound() { return round; }
    public void setRound(String v) { this.round = v; }
    public String getAgendaNo() { return agendaNo; }
    public void setAgendaNo(String v) { this.agendaNo = v; }
    public String getSpeakerDept() { return speakerDept; }
    public void setSpeakerDept(String v) { this.speakerDept = v; }
    public String getSpeakerName() { return speakerName; }
    public void setSpeakerName(String v) { this.speakerName = v; }
    public String getSpeakerTitle() { return speakerTitle; }
    public void setSpeakerTitle(String v) { this.speakerTitle = v; }
    public Integer getTermYears() { return termYears; }
    public void setTermYears(Integer v) { this.termYears = v; }
    public String getReviewWhen() { return reviewWhen; }
    public void setReviewWhen(String v) { this.reviewWhen = v; }
    public String getIntro() { return intro; }
    public void setIntro(String v) { this.intro = v; }
    public String getStatusNote() { return statusNote; }
    public void setStatusNote(String v) { this.statusNote = v; }
    public String getEffect() { return effect; }
    public void setEffect(String v) { this.effect = v; }
    public String getProfitNote() { return profitNote; }
    public void setProfitNote(String v) { this.profitNote = v; }
    public String getAccounting() { return accounting; }
    public void setAccounting(String v) { this.accounting = v; }
    public String getAmountMode() { return amountMode; }
    public void setAmountMode(String v) { this.amountMode = v; }
}
