package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/** RFP 협약 개시일 저장 본문(NEXT 105). 수정자 칸은 받지 않는다. */
@JsonIgnoreProperties(ignoreUnknown = true)
public class BidTermIn {
    @JsonProperty("target_year")  private Integer targetYear;   // 입찰한 해(목표 연도) 필수
    @JsonProperty("term_start")   private String termStart;     // YYYY-MM-DD, 비우면 지움
    @JsonProperty("base_rev_no")  private Integer baseRevNo;    // 없으면 0(처음 기록)

    public Integer getTargetYear() { return targetYear; } public void setTargetYear(Integer v) { targetYear = v; }
    public String getTermStart() { return termStart; } public void setTermStart(String v) { termStart = v; }
    public Integer getBaseRevNo() { return baseRevNo; } public void setBaseRevNo(Integer v) { baseRevNo = v; }
}
