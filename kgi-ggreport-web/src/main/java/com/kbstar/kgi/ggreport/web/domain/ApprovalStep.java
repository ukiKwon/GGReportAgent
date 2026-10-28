package com.kbstar.kgi.ggreport.web.domain;

/** 결재 단계 1행({@code APPROVAL_STEP}). */
public class ApprovalStep {
    private Long stepId;
    private Long reqId;
    private int stepNo;
    private String kind;
    private String approverEmpNo;
    private String status;
    private String actedBy;
    private int actedAsDeputy;
    private String commentText;
    private String actedAt;

    public Long getStepId() { return stepId; }
    public void setStepId(Long stepId) { this.stepId = stepId; }
    public Long getReqId() { return reqId; }
    public void setReqId(Long reqId) { this.reqId = reqId; }
    public int getStepNo() { return stepNo; }
    public void setStepNo(int stepNo) { this.stepNo = stepNo; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getApproverEmpNo() { return approverEmpNo; }
    public void setApproverEmpNo(String approverEmpNo) { this.approverEmpNo = approverEmpNo; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getActedBy() { return actedBy; }
    public void setActedBy(String actedBy) { this.actedBy = actedBy; }
    public int getActedAsDeputy() { return actedAsDeputy; }
    public void setActedAsDeputy(int actedAsDeputy) { this.actedAsDeputy = actedAsDeputy; }
    public String getCommentText() { return commentText; }
    public void setCommentText(String commentText) { this.commentText = commentText; }
    public String getActedAt() { return actedAt; }
    public void setActedAt(String actedAt) { this.actedAt = actedAt; }
}
