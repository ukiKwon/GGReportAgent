package com.kbstar.kgi.ggreport.web.domain;

/** INST_BID_TARGET_REQ_ITEM(056) 한 행 + 조회 조인값(기관 이름·태그 이름·빼는 사유 이름·요청 때 본 기록). */
public class BidTargetReqItem {
    private Long reqId;
    private String institutionId, opCd, baseKindCd, tagCd, memo, ownerEmpNo, ownerName, cancelReasonCd, cancelReasonEtc, warnCd;
    private String requesterEmpNo, requesterName, createdAt;
    private int itemNo;
    private Integer targetNo, baseRevNo, baseYear, toYear;
    // 조인 칸
    private String institutionName, tagName, cancelReasonName, baseTagCd, baseTagName, baseMemo, baseOwnerName, reqCreatedAt;
    private String aimRankCd, aimRankName, baseAimRankCd, baseAimRankName;   // 063 금고 방식
    private String aimRankEtc, baseAimRankEtc;                               // 066 기타 금고 방식 이름(요청 때 값·요청 때 본 기록 값)
    private String bidSubjectCd, bidSubjectEtc, bidSubjectName, bidTitle;    // 066 입찰 대상 스냅샷·조인 이름·이은 공고 제목

    public Long getReqId() { return reqId; } public void setReqId(Long v) { reqId = v; }
    public String getInstitutionId() { return institutionId; } public void setInstitutionId(String v) { institutionId = v; }
    public int getItemNo() { return itemNo; } public void setItemNo(int v) { itemNo = v; }
    public String getOpCd() { return opCd; } public void setOpCd(String v) { opCd = v; }
    public Integer getTargetNo() { return targetNo; } public void setTargetNo(Integer v) { targetNo = v; }
    public Integer getBaseRevNo() { return baseRevNo; } public void setBaseRevNo(Integer v) { baseRevNo = v; }
    public String getBaseKindCd() { return baseKindCd; } public void setBaseKindCd(String v) { baseKindCd = v; }
    public Integer getBaseYear() { return baseYear; } public void setBaseYear(Integer v) { baseYear = v; }
    public Integer getToYear() { return toYear; } public void setToYear(Integer v) { toYear = v; }
    public String getTagCd() { return tagCd; } public void setTagCd(String v) { tagCd = v; }
    public String getMemo() { return memo; } public void setMemo(String v) { memo = v; }
    public String getOwnerEmpNo() { return ownerEmpNo; } public void setOwnerEmpNo(String v) { ownerEmpNo = v; }
    public String getOwnerName() { return ownerName; } public void setOwnerName(String v) { ownerName = v; }
    public String getCancelReasonCd() { return cancelReasonCd; } public void setCancelReasonCd(String v) { cancelReasonCd = v; }
    public String getCancelReasonEtc() { return cancelReasonEtc; } public void setCancelReasonEtc(String v) { cancelReasonEtc = v; }
    public String getWarnCd() { return warnCd; } public void setWarnCd(String v) { warnCd = v; }
    public String getRequesterEmpNo() { return requesterEmpNo; } public void setRequesterEmpNo(String v) { requesterEmpNo = v; }
    public String getRequesterName() { return requesterName; } public void setRequesterName(String v) { requesterName = v; }
    public String getCreatedAt() { return createdAt; } public void setCreatedAt(String v) { createdAt = v; }
    public String getInstitutionName() { return institutionName; } public void setInstitutionName(String v) { institutionName = v; }
    public String getTagName() { return tagName; } public void setTagName(String v) { tagName = v; }
    public String getCancelReasonName() { return cancelReasonName; } public void setCancelReasonName(String v) { cancelReasonName = v; }
    public String getBaseTagCd() { return baseTagCd; } public void setBaseTagCd(String v) { baseTagCd = v; }
    public String getBaseTagName() { return baseTagName; } public void setBaseTagName(String v) { baseTagName = v; }
    public String getBaseMemo() { return baseMemo; } public void setBaseMemo(String v) { baseMemo = v; }
    public String getBaseOwnerName() { return baseOwnerName; } public void setBaseOwnerName(String v) { baseOwnerName = v; }
    public String getReqCreatedAt() { return reqCreatedAt; } public void setReqCreatedAt(String v) { reqCreatedAt = v; }
    public String getAimRankCd() { return aimRankCd; } public void setAimRankCd(String v) { aimRankCd = v; }
    public String getAimRankName() { return aimRankName; } public void setAimRankName(String v) { aimRankName = v; }
    public String getBaseAimRankCd() { return baseAimRankCd; } public void setBaseAimRankCd(String v) { baseAimRankCd = v; }
    public String getBaseAimRankName() { return baseAimRankName; } public void setBaseAimRankName(String v) { baseAimRankName = v; }
    public String getAimRankEtc() { return aimRankEtc; } public void setAimRankEtc(String v) { aimRankEtc = v; }
    public String getBaseAimRankEtc() { return baseAimRankEtc; } public void setBaseAimRankEtc(String v) { baseAimRankEtc = v; }
    public String getBidSubjectCd() { return bidSubjectCd; } public void setBidSubjectCd(String v) { bidSubjectCd = v; }
    public String getBidSubjectEtc() { return bidSubjectEtc; } public void setBidSubjectEtc(String v) { bidSubjectEtc = v; }
    public String getBidSubjectName() { return bidSubjectName; } public void setBidSubjectName(String v) { bidSubjectName = v; }
    public String getBidTitle() { return bidTitle; } public void setBidTitle(String v) { bidTitle = v; }
}
