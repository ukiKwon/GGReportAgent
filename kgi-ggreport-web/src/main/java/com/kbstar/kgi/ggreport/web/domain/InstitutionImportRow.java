package com.kbstar.kgi.ggreport.web.domain;

/**
 * CSV 반입 1행 / '기관 추가' 입력. Python {@code server/models.InstitutionImportRow}.
 *
 * <p>{@code institution_id} 가 없는 것이 이 타입의 요점이다 — 슬러그는 서버가
 * 발급한다({@code new-<hex8>}). 반입은 {@code name_ko} 로 기존 행을 찾아 upsert 하고,
 * 사람이 누르는 '기관 추가'는 같은 이름이면 만들지 않고 409 로 알린다.
 */
public class InstitutionImportRow {

    private String nameKo;
    private String regionCode;
    private String type;
    private Integer term;
    private String lastBid;
    private String contractEnd;

    public String getNameKo() { return nameKo; }
    public void setNameKo(String nameKo) { this.nameKo = nameKo; }

    public String getRegionCode() { return regionCode; }
    public void setRegionCode(String regionCode) { this.regionCode = regionCode; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public Integer getTerm() { return term; }
    public void setTerm(Integer term) { this.term = term; }

    public String getLastBid() { return lastBid; }
    public void setLastBid(String lastBid) { this.lastBid = lastBid; }

    public String getContractEnd() { return contractEnd; }
    public void setContractEnd(String contractEnd) { this.contractEnd = contractEnd; }
}
