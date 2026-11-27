package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/** 061 지도 ♥ 켬 본문(없어도 됨) — 구분 코드 선택. 안 보내면 서버 기본값. */
@JsonIgnoreProperties(ignoreUnknown = true)
public class MyWatchIn {
    @JsonProperty("tag_cd") private String tagCd;   // RETAIN | RETAIN_PRIVATE | NEW | NEW_PRIVATE (코드표 TARGET_TAG, 072 — REGAIN 은 사용 안 함)
    public String getTagCd() { return tagCd; } public void setTagCd(String v) { tagCd = v; }
}
