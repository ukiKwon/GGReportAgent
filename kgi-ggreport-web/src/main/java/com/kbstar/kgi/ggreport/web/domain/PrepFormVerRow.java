package com.kbstar.kgi.ggreport.web.domain;

/** 판 목록 한 줄(049) — 내용(CONTENT_JSON)은 싣지 않는다. 저장한 사람은 이름만(사번 없음). */
public class PrepFormVerRow {
    private int verNo; private String kindCd; private int baseVer; private String savedByName; private String savedAt; private String contentSha256;

    public int getVerNo() { return verNo; } public void setVerNo(int v) { verNo = v; }
    public String getKindCd() { return kindCd; } public void setKindCd(String v) { kindCd = v; }
    public int getBaseVer() { return baseVer; } public void setBaseVer(int v) { baseVer = v; }
    public String getSavedByName() { return savedByName; } public void setSavedByName(String v) { savedByName = v; }
    public String getSavedAt() { return savedAt; } public void setSavedAt(String v) { savedAt = v; }
    public String getContentSha256() { return contentSha256; } public void setContentSha256(String v) { contentSha256 = v; }
}
