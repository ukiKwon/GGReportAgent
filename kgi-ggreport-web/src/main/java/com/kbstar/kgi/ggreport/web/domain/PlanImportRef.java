package com.kbstar.kgi.ggreport.web.domain;

/** 기관의 최신 사업계획 반입 판(INST_PLAN_IMPORT)을 가리키는 값 — 번호와 파일 날짜(확인일 중 가장 늦은 날). */
public class PlanImportRef {
    private Long importId; private String fileDate;

    public Long getImportId() { return importId; } public void setImportId(Long v) { importId = v; }
    public String getFileDate() { return fileDate; } public void setFileDate(String v) { fileDate = v; }
}
