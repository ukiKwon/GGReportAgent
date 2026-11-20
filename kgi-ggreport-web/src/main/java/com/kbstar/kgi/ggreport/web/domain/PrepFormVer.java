package com.kbstar.kgi.ggreport.web.domain;

/** BID_PREP_FORM_VER 한 행(049) — 판은 추가만 한다. contentJson 이 정규 JSON 이고 contentSha256 은 그 문자열 UTF-8 의 SHA-256(hex)이다. */
public class PrepFormVer {
    private String bidCaseId; private String formCd; private int verNo; private String kindCd; private int baseVer;
    private int tplVer; private int renderVer; private String contentJson; private String contentSha256; private int contentBytes;
    private String savedBy; private int savedVerified; private String savedAt;
    private String savedByName;   // 조회 전용(조인)

    public String getBidCaseId() { return bidCaseId; } public void setBidCaseId(String v) { bidCaseId = v; }
    public String getFormCd() { return formCd; } public void setFormCd(String v) { formCd = v; }
    public int getVerNo() { return verNo; } public void setVerNo(int v) { verNo = v; }
    public String getKindCd() { return kindCd; } public void setKindCd(String v) { kindCd = v; }
    public int getBaseVer() { return baseVer; } public void setBaseVer(int v) { baseVer = v; }
    public int getTplVer() { return tplVer; } public void setTplVer(int v) { tplVer = v; }
    public int getRenderVer() { return renderVer; } public void setRenderVer(int v) { renderVer = v; }
    public String getContentJson() { return contentJson; } public void setContentJson(String v) { contentJson = v; }
    public String getContentSha256() { return contentSha256; } public void setContentSha256(String v) { contentSha256 = v; }
    public int getContentBytes() { return contentBytes; } public void setContentBytes(int v) { contentBytes = v; }
    public String getSavedBy() { return savedBy; } public void setSavedBy(String v) { savedBy = v; }
    public int getSavedVerified() { return savedVerified; } public void setSavedVerified(int v) { savedVerified = v; }
    public String getSavedAt() { return savedAt; } public void setSavedAt(String v) { savedAt = v; }
    public String getSavedByName() { return savedByName; } public void setSavedByName(String v) { savedByName = v; }
}
