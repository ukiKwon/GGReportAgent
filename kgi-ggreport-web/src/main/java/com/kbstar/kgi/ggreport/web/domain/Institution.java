package com.kbstar.kgi.ggreport.web.domain;

/**
 * 기관 마스터. Python {@code server/models.Institution} 의 이관본이다.
 *
 * <p>JSON 키는 <b>snake_case</b> 이고 {@code null} 필드도 그대로 실린다 — 골든
 * {@code 00}·{@code 01} 이 고정한 계약이다. 변환은 전역 설정
 * ({@code com.kbstar.kgi.ggreport.web.config.JacksonConfig}) 이 한다.
 *
 * <p>⚠️ {@code scoring_table} 은 <b>없는 것이 맞다.</b> 2026-08-06 에 제거됐고
 * (아무도 채우지 않아 늘 null 이었다) 배점표는 {@code rfp_scoring.json} 을 읽는
 * {@code GET /institutions/{id}/coverage-map} 이 서빙한다. 옛 DB 에는 컬럼이
 * 남아 있을 수 있으나 Mapper 가 컬럼을 명시해 뽑으므로 실려 오지 않는다.
 */
public class Institution {

    private String institutionId;
    private String nameKo;
    private String regionCode;
    private String type;
    private String contractEnd;
    private String lastBid;
    private Integer term;
    /** 9단계 워크플로의 현재 단계. 원본 pydantic 기본값이 1 이다. */
    private int stage = 1;
    private String giganlistDir;
    private String rfpPath;
    private String pptxPath;

    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String institutionId) { this.institutionId = institutionId; }

    public String getNameKo() { return nameKo; }
    public void setNameKo(String nameKo) { this.nameKo = nameKo; }

    public String getRegionCode() { return regionCode; }
    public void setRegionCode(String regionCode) { this.regionCode = regionCode; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getContractEnd() { return contractEnd; }
    public void setContractEnd(String contractEnd) { this.contractEnd = contractEnd; }

    public String getLastBid() { return lastBid; }
    public void setLastBid(String lastBid) { this.lastBid = lastBid; }

    public Integer getTerm() { return term; }
    public void setTerm(Integer term) { this.term = term; }

    public int getStage() { return stage; }
    public void setStage(int stage) { this.stage = stage; }

    public String getGiganlistDir() { return giganlistDir; }
    public void setGiganlistDir(String giganlistDir) { this.giganlistDir = giganlistDir; }

    public String getRfpPath() { return rfpPath; }
    public void setRfpPath(String rfpPath) { this.rfpPath = rfpPath; }

    public String getPptxPath() { return pptxPath; }
    public void setPptxPath(String pptxPath) { this.pptxPath = pptxPath; }
}
