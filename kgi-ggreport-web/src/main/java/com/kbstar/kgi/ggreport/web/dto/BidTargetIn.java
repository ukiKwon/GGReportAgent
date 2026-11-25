package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * 목표 기관 넣기·고치기 본문. 고치기는 전체 값을 다시 보낸다(039 와 같음 — owner_emp_no 를 빼면 '주 담당 없음'). 수정자 칸은 받지 않는다.
 * NEXT 114 예외: memo·aim_rank_cd 는 빼면(null) 지금 값 그대로, 빈 문자열이면 지움(화면에서 메모를 없앴다 — 빠진 본문이 옛 메모를 덮지 않게).
 * tag_cd 는 비워도 된다(구분 '-' = NULL, 사용자 11-25).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class BidTargetIn {
    @JsonProperty("target_no")    private Integer targetNo;     // 없으면 넣기
    @JsonProperty("base_rev_no")  private Integer baseRevNo;    // 고치기 필수
    @JsonProperty("target_year")  private Integer targetYear;   // 없으면 넣기=올해, 고치기=그대로
    @JsonProperty("tag_cd")       private String tagCd;         // TARGET_TAG, 비우면 구분 없음(NULL)
    @JsonProperty("memo")         private String memo;          // 100자
    @JsonProperty("owner_emp_no") private String ownerEmpNo;    // 선택
    @JsonProperty("kind_cd")      private String kindCd;        // 넣기만: GOAL(기본)|WATCH. 고치기에서 다른 값이면 400
    @JsonProperty("aim_rank_cd")  private String aimRankCd;     // 063 금고 방식(TARGET_AIM_RANK), 목표 고치기만(넣기에서 비어 있지 않으면 400). null=그대로, ""=지움

    public Integer getTargetNo() { return targetNo; } public void setTargetNo(Integer v) { targetNo = v; }
    public Integer getBaseRevNo() { return baseRevNo; } public void setBaseRevNo(Integer v) { baseRevNo = v; }
    public Integer getTargetYear() { return targetYear; } public void setTargetYear(Integer v) { targetYear = v; }
    public String getTagCd() { return tagCd; } public void setTagCd(String v) { tagCd = v; }
    public String getMemo() { return memo; } public void setMemo(String v) { memo = v; }
    public String getOwnerEmpNo() { return ownerEmpNo; } public void setOwnerEmpNo(String v) { ownerEmpNo = v; }
    public String getKindCd() { return kindCd; } public void setKindCd(String v) { kindCd = v; }
    public String getAimRankCd() { return aimRankCd; } public void setAimRankCd(String v) { aimRankCd = v; }
}
