package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/** 목표 기관 넣기·고치기 본문. 고치기는 전체 값을 다시 보낸다(039 와 같음 — owner_emp_no 를 빼면 '주 담당 없음'). 수정자 칸은 받지 않는다. */
@JsonIgnoreProperties(ignoreUnknown = true)
public class BidTargetIn {
    @JsonProperty("target_no")    private Integer targetNo;     // 없으면 넣기
    @JsonProperty("base_rev_no")  private Integer baseRevNo;    // 고치기 필수
    @JsonProperty("target_year")  private Integer targetYear;   // 없으면 넣기=올해, 고치기=그대로
    @JsonProperty("tag_cd")       private String tagCd;         // TARGET_TAG 필수
    @JsonProperty("memo")         private String memo;          // 100자
    @JsonProperty("owner_emp_no") private String ownerEmpNo;    // 선택

    public Integer getTargetNo() { return targetNo; } public void setTargetNo(Integer v) { targetNo = v; }
    public Integer getBaseRevNo() { return baseRevNo; } public void setBaseRevNo(Integer v) { baseRevNo = v; }
    public Integer getTargetYear() { return targetYear; } public void setTargetYear(Integer v) { targetYear = v; }
    public String getTagCd() { return tagCd; } public void setTagCd(String v) { tagCd = v; }
    public String getMemo() { return memo; } public void setMemo(String v) { memo = v; }
    public String getOwnerEmpNo() { return ownerEmpNo; } public void setOwnerEmpNo(String v) { ownerEmpNo = v; }
}
