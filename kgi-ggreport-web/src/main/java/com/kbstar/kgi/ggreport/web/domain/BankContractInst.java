package com.kbstar.kgi.ggreport.web.domain;

/** 금고 약정 저장 때 잠그고 확인하는 기관 참조(ID·종류). */
public class BankContractInst {
    private String institutionId; private String type;
    public String getInstitutionId() { return institutionId; } public void setInstitutionId(String v) { institutionId = v; }
    public String getType() { return type; } public void setType(String v) { type = v; }
}
