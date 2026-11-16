package com.kbstar.kgi.ggreport.web.domain;

/** 지금 열린 회차 + 그 회차의 최신 판정 + 기관의 현재 LAST_BID(037) — 목록 한 줄. */
public class NoticeRoundView {

    private String institutionId;
    private Integer roundSeq;
    private String anchorLastBid;
    private String curLastBid;
    private Integer revNo;
    private String statusCd;
    private String nextCheckDate;
    private String handlerName;
    private int empVerified;
    private String handledAt;

    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String v) { this.institutionId = v; }

    public Integer getRoundSeq() { return roundSeq; }
    public void setRoundSeq(Integer v) { this.roundSeq = v; }

    public String getAnchorLastBid() { return anchorLastBid; }
    public void setAnchorLastBid(String v) { this.anchorLastBid = v; }

    public String getCurLastBid() { return curLastBid; }
    public void setCurLastBid(String v) { this.curLastBid = v; }

    public Integer getRevNo() { return revNo; }
    public void setRevNo(Integer v) { this.revNo = v; }

    public String getStatusCd() { return statusCd; }
    public void setStatusCd(String v) { this.statusCd = v; }

    public String getNextCheckDate() { return nextCheckDate; }
    public void setNextCheckDate(String v) { this.nextCheckDate = v; }

    public String getHandlerName() { return handlerName; }
    public void setHandlerName(String v) { this.handlerName = v; }

    public int getEmpVerified() { return empVerified; }
    public void setEmpVerified(int v) { this.empVerified = v; }

    public String getHandledAt() { return handledAt; }
    public void setHandledAt(String v) { this.handledAt = v; }
}
