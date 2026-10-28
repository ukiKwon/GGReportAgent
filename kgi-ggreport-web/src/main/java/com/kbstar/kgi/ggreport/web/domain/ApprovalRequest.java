package com.kbstar.kgi.ggreport.web.domain;

/** 결재 요청 1행({@code APPROVAL_REQUEST}). */
public class ApprovalRequest {
    private Long reqId;
    private String reqType;
    private String requesterEmpNo;
    private String title;
    private String payload;
    private String status;
    private int currentStep;
    private String resultNote;
    private String createdAt;
    private String decidedAt;

    public Long getReqId() { return reqId; }
    public void setReqId(Long reqId) { this.reqId = reqId; }
    public String getReqType() { return reqType; }
    public void setReqType(String reqType) { this.reqType = reqType; }
    public String getRequesterEmpNo() { return requesterEmpNo; }
    public void setRequesterEmpNo(String requesterEmpNo) { this.requesterEmpNo = requesterEmpNo; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getPayload() { return payload; }
    public void setPayload(String payload) { this.payload = payload; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public int getCurrentStep() { return currentStep; }
    public void setCurrentStep(int currentStep) { this.currentStep = currentStep; }
    public String getResultNote() { return resultNote; }
    public void setResultNote(String resultNote) { this.resultNote = resultNote; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public String getDecidedAt() { return decidedAt; }
    public void setDecidedAt(String decidedAt) { this.decidedAt = decidedAt; }
}
