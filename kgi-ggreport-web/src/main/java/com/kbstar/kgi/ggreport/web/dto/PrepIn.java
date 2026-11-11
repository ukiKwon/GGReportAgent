package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.ArrayList;
import java.util.List;

/**
 * 제안서 사전준비(NEXT 70) API 입력. 상신자·역할·결재자·상태 값은 받지 않는다(서버가 Actor·USERS·BID_PREP 로 정한다) —
 * 모르는 키는 무시한다.
 */
public class PrepIn {

    private PrepIn() {
    }

    /** {@code POST /preps} — 제안 확정. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Confirm {
        private String institutionId;
        private String bidCaseId;   // 선택 — 공고 반입으로 이미 생긴(사전준비 행이 없는) 건에 붙일 때

        public String getInstitutionId() { return institutionId; }
        public void setInstitutionId(String v) { this.institutionId = v; }
        public String getBidCaseId() { return bidCaseId; }
        public void setBidCaseId(String v) { this.bidCaseId = v; }
    }

    /** 확정 취소·중단 — 사유 필수. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Reason {
        private String reason;

        public String getReason() { return reason; }
        public void setReason(String v) { this.reason = v; }
    }

    /** {@code POST /bidcases/{id}/prep/open-requests} — 개설 신청(담당자 지명 1~10명). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Open {
        private List<String> empNos = new ArrayList<>();
        private String comment;

        public List<String> getEmpNos() { return empNos; }
        public void setEmpNos(List<String> v) { this.empNos = v; }
        public String getComment() { return comment; }
        public void setComment(String v) { this.comment = v; }
    }
}
