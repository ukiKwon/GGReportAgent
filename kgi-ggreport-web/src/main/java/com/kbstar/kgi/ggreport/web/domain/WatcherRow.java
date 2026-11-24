package com.kbstar.kgi.ggreport.web.domain;

/** 061 — 살아 있는 관심 기록 한 줄: 기관 id + 주인 이름(USERS). 사번은 담지 않는다. */
public class WatcherRow {
    private String institutionId, name;
    public String getInstitutionId() { return institutionId; } public void setInstitutionId(String v) { institutionId = v; }
    public String getName() { return name; } public void setName(String v) { name = v; }
}
