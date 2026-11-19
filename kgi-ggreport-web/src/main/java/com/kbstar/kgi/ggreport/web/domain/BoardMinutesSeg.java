package com.kbstar.kgi.ggreport.web.domain;

/** BOARD_MINUTES_SEG 한 행(047) — 시간대별 요약의 구간. 구간↔발언 연결은 저장하지 않고 읽을 때 계산한다. */
public class BoardMinutesSeg {
    private Long minutesId;
    private int segNo;
    private int startSec;
    private int endSec;
    private String keywords;

    public Long getMinutesId() { return minutesId; }
    public void setMinutesId(Long v) { this.minutesId = v; }
    public int getSegNo() { return segNo; }
    public void setSegNo(int v) { this.segNo = v; }
    public int getStartSec() { return startSec; }
    public void setStartSec(int v) { this.startSec = v; }
    public int getEndSec() { return endSec; }
    public void setEndSec(int v) { this.endSec = v; }
    public String getKeywords() { return keywords; }
    public void setKeywords(String v) { this.keywords = v; }
}
