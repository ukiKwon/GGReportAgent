package com.kbstar.kgi.ggreport.web.domain;

/** BOARD_MINUTES_SPEAKER 한 행(058) — 화자 번호에 붙인 역할 라벨(서버 고정 어휘). 사번 칸 없음. */
public class BoardMinutesSpeaker {
    private Long minutesId;
    private int speakerNo;
    private String label;

    public Long getMinutesId() { return minutesId; }
    public void setMinutesId(Long v) { this.minutesId = v; }
    public int getSpeakerNo() { return speakerNo; }
    public void setSpeakerNo(int v) { this.speakerNo = v; }
    public String getLabel() { return label; }
    public void setLabel(String v) { this.label = v; }
}
