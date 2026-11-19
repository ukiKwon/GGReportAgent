package com.kbstar.kgi.ggreport.web.domain;

/** 회차 받는 사람 1행(DESIGN_ROUND_RECIP, 051) + 확인함 시각 + 그 회차 의견 수(조회용 조인). */
public class DesignRecipient {

    private int roundNo;
    private String empNo;
    private String name;
    private String reasonCd;
    private String ackedAt;
    private int commentCount;

    public int getRoundNo() { return roundNo; }
    public void setRoundNo(int v) { this.roundNo = v; }
    public String getEmpNo() { return empNo; }
    public void setEmpNo(String v) { this.empNo = v; }
    public String getName() { return name; }
    public void setName(String v) { this.name = v; }
    public String getReasonCd() { return reasonCd; }
    public void setReasonCd(String v) { this.reasonCd = v; }
    public String getAckedAt() { return ackedAt; }
    public void setAckedAt(String v) { this.ackedAt = v; }
    public int getCommentCount() { return commentCount; }
    public void setCommentCount(int v) { this.commentCount = v; }
}
