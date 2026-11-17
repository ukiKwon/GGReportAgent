package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/** 금고 약정 저장 본문. 수정자 칸은 일부러 없다 — 본문에 와도 무시하고 서버가 Actor 로 채운다. */
@JsonIgnoreProperties(ignoreUnknown = true)
public class BankContractIn {
    @JsonProperty("contract_no")     private Integer contractNo;     // null = 새 줄
    @JsonProperty("base_rev_no")     private Integer baseRevNo;      // 고치기 때 화면이 본 REV
    @JsonProperty("rank_cd")         private String rankCd;
    @JsonProperty("bank_cd")         private String bankCd;
    @JsonProperty("bank_name_etc")   private String bankNameEtc;
    @JsonProperty("term_from")       private String termFrom;
    @JsonProperty("term_to")         private String termTo;
    @JsonProperty("src_kind")        private String srcKind;
    @JsonProperty("src_url")         private String srcUrl;
    @JsonProperty("src_no")          private String srcNo;
    @JsonProperty("checked_date")    private String checkedDate;
    @JsonProperty("checked_dept")    private String checkedDept;
    private String note;
    @JsonProperty("account_cd")      private String accountCd;       // 선택. 지자체·교육청만
    @JsonProperty("account_etc")     private String accountEtc;      // ETC 일 때 필수, 30자
    @JsonProperty("confirm_overlap") private Boolean confirmOverlap; // true = 같은 순위 기간 겹침을 알고 저장

    public Integer getContractNo() { return contractNo; } public void setContractNo(Integer v) { contractNo = v; }
    public Integer getBaseRevNo() { return baseRevNo; } public void setBaseRevNo(Integer v) { baseRevNo = v; }
    public String getRankCd() { return rankCd; } public void setRankCd(String v) { rankCd = v; }
    public String getBankCd() { return bankCd; } public void setBankCd(String v) { bankCd = v; }
    public String getBankNameEtc() { return bankNameEtc; } public void setBankNameEtc(String v) { bankNameEtc = v; }
    public String getTermFrom() { return termFrom; } public void setTermFrom(String v) { termFrom = v; }
    public String getTermTo() { return termTo; } public void setTermTo(String v) { termTo = v; }
    public String getSrcKind() { return srcKind; } public void setSrcKind(String v) { srcKind = v; }
    public String getSrcUrl() { return srcUrl; } public void setSrcUrl(String v) { srcUrl = v; }
    public String getSrcNo() { return srcNo; } public void setSrcNo(String v) { srcNo = v; }
    public String getCheckedDate() { return checkedDate; } public void setCheckedDate(String v) { checkedDate = v; }
    public String getCheckedDept() { return checkedDept; } public void setCheckedDept(String v) { checkedDept = v; }
    public String getNote() { return note; } public void setNote(String v) { note = v; }
    public String getAccountCd() { return accountCd; } public void setAccountCd(String v) { accountCd = v; }
    public String getAccountEtc() { return accountEtc; } public void setAccountEtc(String v) { accountEtc = v; }
    public Boolean getConfirmOverlap() { return confirmOverlap; } public void setConfirmOverlap(Boolean v) { confirmOverlap = v; }
}
