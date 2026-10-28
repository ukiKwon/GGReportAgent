package com.kbstar.kgi.ggreport.web.dto;

import java.util.ArrayList;
import java.util.List;

/** 결재 API 입력. */
public class ApprovalIn {

    private ApprovalIn() {
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
