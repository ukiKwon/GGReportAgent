package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/** 대시보드 손 체크(NEXT 102) — 아이콘 값과 화면이 본 개정 번호만 받는다. 날짜·사람·화면·시각은 받지 않는다(서버가 정함). 모르는 키(done_date 등)는 무시. */
public class PrepBoardIn {
    private PrepBoardIn() {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Check {
        private String markCd;    // mark_cd: DONE / IN_PROGRESS / NA / NONE
        private Integer baseRev;  // base_rev: 화면이 본 그 칸의 개정 번호(처음이면 0)

        public String getMarkCd() { return markCd; }
        public void setMarkCd(String v) { this.markCd = v; }
        public Integer getBaseRev() { return baseRev; }
        public void setBaseRev(Integer v) { this.baseRev = v; }
    }
}
