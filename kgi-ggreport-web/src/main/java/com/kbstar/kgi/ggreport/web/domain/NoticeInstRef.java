package com.kbstar.kgi.ggreport.web.domain;

/** 잠금·존재 확인용 기관 조각(037). */
public class NoticeInstRef {

    private String institutionId;
    private String lastBid;

    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String v) { this.institutionId = v; }

    public String getLastBid() { return lastBid; }
    public void setLastBid(String v) { this.lastBid = v; }
}
