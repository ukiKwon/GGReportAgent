package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/** 공고 상태 기록 저장 본문. 처리자 칸은 일부러 없다 — 서버가 Actor 로 채운다(본문에 와도 무시). */
public class NoticeRoundIn {

    @JsonProperty("round_seq")
    private Integer roundSeq;      // 화면이 본 열린 회차(없으면 null)
    @JsonProperty("base_rev_no")
    private Integer baseRevNo;     // 화면이 본 최신 REV(없으면 0)
    @JsonProperty("status_cd")
    private String statusCd;
    private String opinion;
    @JsonProperty("next_check_date")
    private String nextCheckDate;
    private Snapshot snapshot;

    public Integer getRoundSeq() { return roundSeq; }
    public void setRoundSeq(Integer v) { this.roundSeq = v; }

    public Integer getBaseRevNo() { return baseRevNo; }
    public void setBaseRevNo(Integer v) { this.baseRevNo = v; }

    public String getStatusCd() { return statusCd; }
    public void setStatusCd(String v) { this.statusCd = v; }

    public String getOpinion() { return opinion; }
    public void setOpinion(String v) { this.opinion = v; }

    public String getNextCheckDate() { return nextCheckDate; }
    public void setNextCheckDate(String v) { this.nextCheckDate = v; }

    public Snapshot getSnapshot() { return snapshot; }
    public void setSnapshot(Snapshot v) { this.snapshot = v; }

    /** 저장 때 화면이 계산한 값(참고용). due_basis = notice|cycle|expiry(logic.effectiveBid), auto_kind = before|receiving|deadline_unknown|deadline_passed|overdue. */
    public static class Snapshot {
        @JsonProperty("due_date")
        private String dueDate;
        @JsonProperty("due_basis")
        private String dueBasis;
        @JsonProperty("due_confirmed")
        private Boolean dueConfirmed;
        @JsonProperty("auto_kind")
        private String autoKind;
        @JsonProperty("auto_days")
        private Integer autoDays;

        public String getDueDate() { return dueDate; }
        public void setDueDate(String v) { this.dueDate = v; }

        public String getDueBasis() { return dueBasis; }
        public void setDueBasis(String v) { this.dueBasis = v; }

        public Boolean getDueConfirmed() { return dueConfirmed; }
        public void setDueConfirmed(Boolean v) { this.dueConfirmed = v; }

        public String getAutoKind() { return autoKind; }
        public void setAutoKind(String v) { this.autoKind = v; }

        public Integer getAutoDays() { return autoDays; }
        public void setAutoDays(Integer v) { this.autoDays = v; }
    }
}
