package com.kbstar.kgi.ggreport.web.domain;

/** NOTICE_ROUND(037) 한 행. */
public class NoticeRound {

    private String institutionId;
    private Integer roundSeq;
    private String sourceCd;
    private String anchorLastBid;
    private Integer targetTermYear;
    private String openedAt;
    private String openedBy;
    private String closedAt;
    private String closeReasonCd;
    private String closedBy;
    private String closedLastBid;

    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String v) { this.institutionId = v; }

    public Integer getRoundSeq() { return roundSeq; }
    public void setRoundSeq(Integer v) { this.roundSeq = v; }

    public String getSourceCd() { return sourceCd; }
    public void setSourceCd(String v) { this.sourceCd = v; }

    public String getAnchorLastBid() { return anchorLastBid; }
    public void setAnchorLastBid(String v) { this.anchorLastBid = v; }

    public Integer getTargetTermYear() { return targetTermYear; }
    public void setTargetTermYear(Integer v) { this.targetTermYear = v; }

    public String getOpenedAt() { return openedAt; }
    public void setOpenedAt(String v) { this.openedAt = v; }

    public String getOpenedBy() { return openedBy; }
    public void setOpenedBy(String v) { this.openedBy = v; }

    public String getClosedAt() { return closedAt; }
    public void setClosedAt(String v) { this.closedAt = v; }

    public String getCloseReasonCd() { return closeReasonCd; }
    public void setCloseReasonCd(String v) { this.closeReasonCd = v; }

    public String getClosedBy() { return closedBy; }
    public void setClosedBy(String v) { this.closedBy = v; }

    public String getClosedLastBid() { return closedLastBid; }
    public void setClosedLastBid(String v) { this.closedLastBid = v; }
}
