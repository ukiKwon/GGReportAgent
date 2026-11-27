package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/** 목표 기관 변경 일괄 본문(NEXT 105). 결재자·상신자·수정자 칸은 받지 않는다(서버가 정함). */
@JsonIgnoreProperties(ignoreUnknown = true)
public class TargetChangeIn {
    @JsonProperty("reason") private String reason;   // 결재 요청 1~200자(영업부장 바로 반영이면 선택·저장 안 함)
    @JsonProperty("items")  private List<Item> items; // 1~20, 같은 기관 한 번

    public String getReason() { return reason; } public void setReason(String v) { reason = v; }
    public List<Item> getItems() { return items; } public void setItems(List<Item> v) { items = v; }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Item {
        @JsonProperty("institution_id")    private String institutionId;
        @JsonProperty("op_cd")             private String opCd;            // ADD|EDIT|CANCEL|TO_WATCH|TO_GOAL
        @JsonProperty("target_no")         private Integer targetNo;       // ADD 외 필수(ADD 는 보내면 400)
        @JsonProperty("base_rev_no")       private Integer baseRevNo;      // ADD 외 필수
        @JsonProperty("target_year")       private Integer targetYear;     // ADD(비우면 올해)·EDIT(비우면 그대로)·TO_GOAL(필수)
        @JsonProperty("tag_cd")            private String tagCd;           // ADD·EDIT
        @JsonProperty("memo")              private String memo;            // ADD·EDIT
        @JsonProperty("owner_emp_no")      private String ownerEmpNo;      // ADD·EDIT
        @JsonProperty("cancel_reason_cd")  private String cancelReasonCd;  // CANCEL
        @JsonProperty("cancel_reason_etc") private String cancelReasonEtc; // CANCEL
        @JsonProperty("aim_rank_cd")       private String aimRankCd;       // EDIT(063 금고 방식, null=그대로 ""=지움). ADD 에서 비어 있지 않으면 400
        @JsonProperty("aim_rank_etc")      private String aimRankEtc;      // NEXT 125 — aim_rank_cd=OTHER 일 때만 1~30자
        @JsonProperty("bid_subject_cd")    private String bidSubjectCd;    // NEXT 125 — ADD·TO_GOAL(비우면 MAIN_BANK), EDIT 는 지금과 같은 값만
        @JsonProperty("bid_subject_etc")   private String bidSubjectEtc;   // NEXT 125 — ETC 일 때만 1~50자

        public String getInstitutionId() { return institutionId; } public void setInstitutionId(String v) { institutionId = v; }
        public String getOpCd() { return opCd; } public void setOpCd(String v) { opCd = v; }
        public Integer getTargetNo() { return targetNo; } public void setTargetNo(Integer v) { targetNo = v; }
        public Integer getBaseRevNo() { return baseRevNo; } public void setBaseRevNo(Integer v) { baseRevNo = v; }
        public Integer getTargetYear() { return targetYear; } public void setTargetYear(Integer v) { targetYear = v; }
        public String getTagCd() { return tagCd; } public void setTagCd(String v) { tagCd = v; }
        public String getMemo() { return memo; } public void setMemo(String v) { memo = v; }
        public String getOwnerEmpNo() { return ownerEmpNo; } public void setOwnerEmpNo(String v) { ownerEmpNo = v; }
        public String getCancelReasonCd() { return cancelReasonCd; } public void setCancelReasonCd(String v) { cancelReasonCd = v; }
        public String getCancelReasonEtc() { return cancelReasonEtc; } public void setCancelReasonEtc(String v) { cancelReasonEtc = v; }
        public String getAimRankCd() { return aimRankCd; } public void setAimRankCd(String v) { aimRankCd = v; }
        public String getAimRankEtc() { return aimRankEtc; } public void setAimRankEtc(String v) { aimRankEtc = v; }
        public String getBidSubjectCd() { return bidSubjectCd; } public void setBidSubjectCd(String v) { bidSubjectCd = v; }
        public String getBidSubjectEtc() { return bidSubjectEtc; } public void setBidSubjectEtc(String v) { bidSubjectEtc = v; }
    }
}
