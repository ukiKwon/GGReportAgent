package com.kbstar.kgi.ggreport.web.domain;

/** NEXT 125 — 목표 건과 이을 제안 건(BID_PREP + BID_CASES 공고 대상·순위·제목) 한 줄. 읽기 전용(BidTargetMapper.selectCasesForYear·selectCasesOfInst). */
public class TargetCaseRef {
    private String bidCaseId, institutionId, stateCd, confirmedAt, openedAt, bidSubjectCd, bidSubjectEtc, bidRankCd, bidTitle;

    public String getBidCaseId() { return bidCaseId; } public void setBidCaseId(String v) { bidCaseId = v; }
    public String getInstitutionId() { return institutionId; } public void setInstitutionId(String v) { institutionId = v; }
    public String getStateCd() { return stateCd; } public void setStateCd(String v) { stateCd = v; }
    public String getConfirmedAt() { return confirmedAt; } public void setConfirmedAt(String v) { confirmedAt = v; }
    public String getOpenedAt() { return openedAt; } public void setOpenedAt(String v) { openedAt = v; }
    public String getBidSubjectCd() { return bidSubjectCd; } public void setBidSubjectCd(String v) { bidSubjectCd = v; }
    public String getBidSubjectEtc() { return bidSubjectEtc; } public void setBidSubjectEtc(String v) { bidSubjectEtc = v; }
    public String getBidRankCd() { return bidRankCd; } public void setBidRankCd(String v) { bidRankCd = v; }
    public String getBidTitle() { return bidTitle; } public void setBidTitle(String v) { bidTitle = v; }
}
