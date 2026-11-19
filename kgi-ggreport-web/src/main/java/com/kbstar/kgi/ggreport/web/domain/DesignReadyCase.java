package com.kbstar.kgi.ggreport.web.domain;

/** 디자인 작업을 시작할 수 있는 건(세 팀 모두 2차완료, 디자이너 작업 아직 없음). */
public class DesignReadyCase {

    private String bidCaseId;
    private String institutionId;
    private String institutionName;

    public String getBidCaseId() { return bidCaseId; }
    public void setBidCaseId(String v) { this.bidCaseId = v; }
    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String v) { this.institutionId = v; }
    public String getInstitutionName() { return institutionName; }
    public void setInstitutionName(String v) { this.institutionName = v; }
}
