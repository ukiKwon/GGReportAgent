package com.kbstar.kgi.ggreport.web.domain;

/** 지금 열린 회차(또는 입찰 없음으로 닫힌 마지막 회차) + 그 회차의 최신 판정 + 기관의 현재 LAST_BID(037·040) — 목록 한 줄. */
public class NoticeRoundView {

    private String institutionId;
    private Integer roundSeq;
    private String anchorLastBid;
    private String curLastBid;
    private String closedLastBid;     // 닫힌 회차 쿼리에서만 채워진다
    private String closeReasonCd;     // 닫힌 회차 쿼리에서만 채워진다
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

    public String getClosedLastBid() { return closedLastBid; }
    public void setClosedLastBid(String v) { this.closedLastBid = v; }

    public String getCloseReasonCd() { return closeReasonCd; }
    public void setCloseReasonCd(String v) { this.closeReasonCd = v; }

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
