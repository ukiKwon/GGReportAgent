package com.kbstar.kgi.ggreport.web.domain;

/** (기관, 값) 한 쌍 — 공고 건수·최신 공고 상태·담당자 조회가 같이 쓴다. 건수는 문자열로 와서 서비스가 정수로 바꾼다. */
public class OverviewPair {
    private String institutionId;
    private String value;

    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String v) { this.institutionId = v; }
    public String getValue() { return value; }
    public void setValue(String v) { this.value = v; }
}
