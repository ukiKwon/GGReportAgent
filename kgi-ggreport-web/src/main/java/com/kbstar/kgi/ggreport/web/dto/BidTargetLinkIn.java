package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/** NEXT 125 — 추정 연결을 명시로 굳히는 본문(POST /institutions/{id}/bid-targets/{no}/link). 둘 다 필수. */
@JsonIgnoreProperties(ignoreUnknown = true)
public class BidTargetLinkIn {
    @JsonProperty("base_rev_no") private Integer baseRevNo;   // 화면이 본 목표 건 REV
    @JsonProperty("bid_case_id") private String bidCaseId;    // 화면이 본 추정 연결 건([A-Za-z0-9._-]{1,64})

    public Integer getBaseRevNo() { return baseRevNo; } public void setBaseRevNo(Integer v) { baseRevNo = v; }
    public String getBidCaseId() { return bidCaseId; } public void setBidCaseId(String v) { bidCaseId = v; }
}
