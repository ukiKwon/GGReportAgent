package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/** 금고 약정 취소 본문 — 사유 코드 필수. */
@JsonIgnoreProperties(ignoreUnknown = true)
public class BankContractCancelIn {
    @JsonProperty("base_rev_no")        private Integer baseRevNo;
    @JsonProperty("cancel_reason_cd")   private String cancelReasonCd;    // WRONG | DUP | CHANGED | ETC (필수)
    @JsonProperty("cancel_reason_etc")  private String cancelReasonEtc;   // ETC 일 때 필수, 50자

    public Integer getBaseRevNo() { return baseRevNo; } public void setBaseRevNo(Integer v) { baseRevNo = v; }
    public String getCancelReasonCd() { return cancelReasonCd; } public void setCancelReasonCd(String v) { cancelReasonCd = v; }
    public String getCancelReasonEtc() { return cancelReasonEtc; } public void setCancelReasonEtc(String v) { cancelReasonEtc = v; }
}
