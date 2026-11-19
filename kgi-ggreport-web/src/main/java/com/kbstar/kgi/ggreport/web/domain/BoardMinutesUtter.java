package com.kbstar.kgi.ggreport.web.domain;

/** BOARD_MINUTES_UTTER 한 행(047) — 가린 뒤의 발언. 참석자 번호는 N 만(이름·사번과 잇는 칸 없음). */
public class BoardMinutesUtter {
    private Long minutesId;
    private int seqNo;
    private int speakerNo;
    private int startSec;
    private int noiseYn;
    private int editedYn;
    private String body;

    public Long getMinutesId() { return minutesId; }
    public void setMinutesId(Long v) { this.minutesId = v; }
    public int getSeqNo() { return seqNo; }
    public void setSeqNo(int v) { this.seqNo = v; }
    public int getSpeakerNo() { return speakerNo; }
    public void setSpeakerNo(int v) { this.speakerNo = v; }
    public int getStartSec() { return startSec; }
    public void setStartSec(int v) { this.startSec = v; }
    public int getNoiseYn() { return noiseYn; }
    public void setNoiseYn(int v) { this.noiseYn = v; }
    public int getEditedYn() { return editedYn; }
    public void setEditedYn(int v) { this.editedYn = v; }
    public String getBody() { return body; }
    public void setBody(String v) { this.body = v; }
}
