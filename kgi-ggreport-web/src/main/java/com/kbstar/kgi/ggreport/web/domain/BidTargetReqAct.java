package com.kbstar.kgi.ggreport.web.domain;

/** INST_BID_TARGET_REQ_ACT(056) 한 행 — 목표 변경 결재의 상신·승인·반려·취소 1회. */
public class BidTargetReqAct {
    private Long reqId;
    private String actCd, actorBasis, actorEmpNo, actorName, screenId, buttonId, actedAt;
    private int empVerified, uiValid;

    public Long getReqId() { return reqId; } public void setReqId(Long v) { reqId = v; }
    public String getActCd() { return actCd; } public void setActCd(String v) { actCd = v; }
    public String getActorBasis() { return actorBasis; } public void setActorBasis(String v) { actorBasis = v; }
    public String getActorEmpNo() { return actorEmpNo; } public void setActorEmpNo(String v) { actorEmpNo = v; }
    public String getActorName() { return actorName; } public void setActorName(String v) { actorName = v; }
    public int getEmpVerified() { return empVerified; } public void setEmpVerified(int v) { empVerified = v; }
    public String getScreenId() { return screenId; } public void setScreenId(String v) { screenId = v; }
    public String getButtonId() { return buttonId; } public void setButtonId(String v) { buttonId = v; }
    public int getUiValid() { return uiValid; } public void setUiValid(int v) { uiValid = v; }
    public String getActedAt() { return actedAt; } public void setActedAt(String v) { actedAt = v; }
}
