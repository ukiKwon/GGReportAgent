package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/** 목표↔관심 옮기기 본문(044). 수정자 칸은 받지 않는다. */
@JsonIgnoreProperties(ignoreUnknown = true)
public class BidTargetMoveIn {
    @JsonProperty("base_rev_no") private Integer baseRevNo;   // 필수
    @JsonProperty("to_kind_cd")  private String toKindCd;     // 필수 GOAL | WATCH
    @JsonProperty("target_year") private Integer targetYear;  // GOAL 로 옮길 때 필수(올해~+2), WATCH 로 옮길 때 보내면 400

    public Integer getBaseRevNo() { return baseRevNo; } public void setBaseRevNo(Integer v) { baseRevNo = v; }
    public String getToKindCd() { return toKindCd; } public void setToKindCd(String v) { toKindCd = v; }
    public Integer getTargetYear() { return targetYear; } public void setTargetYear(Integer v) { targetYear = v; }
}
