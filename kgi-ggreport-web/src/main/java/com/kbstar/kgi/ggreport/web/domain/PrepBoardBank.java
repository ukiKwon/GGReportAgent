package com.kbstar.kgi.ggreport.web.domain;

/** 대시보드 목록 묶음 조회용 — 기관별 '지금 유효한 약정 줄'(NEXT 102 P3-8). 조회 전용. */
public class PrepBoardBank {
    private String institutionId;
    private int contractNo;
    private String rankCd;
    private String bankName;   // COMMON_CODE BANK 이름, 없으면 BANK_NAME_ETC
    private String termTo;

    public String getInstitutionId() { return institutionId; } public void setInstitutionId(String v) { institutionId = v; }
    public int getContractNo() { return contractNo; } public void setContractNo(int v) { contractNo = v; }
    public String getRankCd() { return rankCd; } public void setRankCd(String v) { rankCd = v; }
    public String getBankName() { return bankName; } public void setBankName(String v) { bankName = v; }
    public String getTermTo() { return termTo; } public void setTermTo(String v) { termTo = v; }
}
