package com.kbstar.kgi.ggreport.web.domain;

/** 대시보드 목록 묶음 조회용(건 번호 + 사번 + 이름) — 담당자·확정자 질의 결과(NEXT 102). */
public class PrepBoardRef {
    private String bidCaseId;
    private String empNo;
    private String name;

    public String getBidCaseId() { return bidCaseId; } public void setBidCaseId(String v) { bidCaseId = v; }
    public String getEmpNo() { return empNo; } public void setEmpNo(String v) { empNo = v; }
    public String getName() { return name; } public void setName(String v) { name = v; }
}
