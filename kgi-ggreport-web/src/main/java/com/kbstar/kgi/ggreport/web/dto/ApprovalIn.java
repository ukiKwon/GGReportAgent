package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.ArrayList;
import java.util.List;

/** 결재 API 입력. */
public class ApprovalIn {

    private ApprovalIn() {
    }

    /**
     * {@code POST /approval-requests/assignee-change} 본문. 상신자·역할·결재자 사번은 받지 않는다
     * (서버가 Actor·USERS 로 정하고, 모르는 키는 무시한다).
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class AssigneeChange {
        private String bidCaseId;
        private List<String> addEmpNos = new ArrayList<>();
        private List<String> removeEmpNos = new ArrayList<>();
        private String reason;

        public String getBidCaseId() { return bidCaseId; }
        public void setBidCaseId(String v) { this.bidCaseId = v; }
        public List<String> getAddEmpNos() { return addEmpNos; }
        public void setAddEmpNos(List<String> v) { this.addEmpNos = v; }
        public List<String> getRemoveEmpNos() { return removeEmpNos; }
        public void setRemoveEmpNos(List<String> v) { this.removeEmpNos = v; }
        public String getReason() { return reason; }
        public void setReason(String v) { this.reason = v; }
    }

    public static class DeputyForm {
        private String principalEmpNo;   // 비우면 호출자 본인. 관리자만 다른 사람 몫을 대신 지정
        private String deputyEmpNo;
        private String startDate;
        private String endDate;
        private String reason;

        public String getPrincipalEmpNo() { return principalEmpNo; }
        public void setPrincipalEmpNo(String v) { this.principalEmpNo = v; }
        public String getDeputyEmpNo() { return deputyEmpNo; }
        public void setDeputyEmpNo(String v) { this.deputyEmpNo = v; }
        public String getStartDate() { return startDate; }
        public void setStartDate(String v) { this.startDate = v; }
        public String getEndDate() { return endDate; }
        public void setEndDate(String v) { this.endDate = v; }
        public String getReason() { return reason; }
        public void setReason(String v) { this.reason = v; }
    }

    public static class PermRequest {
        private String reason;
        private List<SysAdminIn.Perm> changes = new ArrayList<>();

        public String getReason() { return reason; }
        public void setReason(String reason) { this.reason = reason; }
        public List<SysAdminIn.Perm> getChanges() { return changes; }
        public void setChanges(List<SysAdminIn.Perm> changes) { this.changes = changes; }
    }

    public static class Decision {
        private String decision;   // APPROVE / REJECT
        private String comment;

        public String getDecision() { return decision; }
        public void setDecision(String decision) { this.decision = decision; }
        public String getComment() { return comment; }
        public void setComment(String comment) { this.comment = comment; }
    }
}
