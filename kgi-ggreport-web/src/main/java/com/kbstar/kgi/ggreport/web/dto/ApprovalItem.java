package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * 결재함 카드 한 장. Python {@code routers/approvals.get_approvals} 의 {@code items[]}.
 *
 * <p><b>두 종류가 한 목록에 섞인다</b> — {@code kind} 로 가른다.
 * <ul>
 *   <li>{@code task} — 팀·디자이너 작업물 결재. {@code POST /tasks/{id}/approve}</li>
 *   <li>{@code gate} — 오케스트레이터 게이트. {@code POST /institutions/{id}/checkpoint}</li>
 * </ul>
 * 같은 카드로 보이지만 <b>뒤는 다른 흐름</b>이라 화면이 부르는 곳도 다르다
 * ({@code frontend/js/approvals.js} 의 {@code endpoint()}).
 *
 * <p>⚠️ <b>원본과 한 가지 다르다(의도).</b> 파이썬은 종류마다 <b>키 자체를 다르게</b>
 * 실었는데, 여기서는 한 타입이라 안 쓰는 필드가 {@code null} 로 함께 나간다. 이 리포의
 * JSON 계약이 "{@code null} 도 그대로 싣는다"({@code JacksonConfig})이고, 화면도
 * {@code it.task_id || null} 로 읽어 동작이 같다. 골든에 이 경로는 없다(캡처 제외).
 */
public class ApprovalItem {

    /** {@code task} 또는 {@code gate}. */
    private String kind;

    private String institutionId;
    private String institutionName;
    private Integer stage;

    // ── kind=task ────────────────────────────────────────────────────
    private String taskId;
    private String team;
    private String status;
    private String assignee;
    private String approver;
    private String draftContent;
    private List<TaskFileEntry> files;

    /**
     * 이 카드가 <b>최종 결재</b>인가.
     *
     * <p>⚠️ 서버가 정한다 — 화면이 상태 문자열을 다시 해석하면 규칙이 두 벌이 된다.
     * 같은 디자이너 작업이 팀장(1차)과 부장(최종) 결재함에 각각 뜨는데, 어느 쪽인지는
     * 여기서만 판단한다.
     *
     * <p>{@code final} 은 자바 예약어라 필드 이름으로 못 쓴다 — JSON 키는
     * {@link JsonProperty} 로 맞춘다(명명 전략보다 우선한다).
     */
    @JsonProperty("final")
    private Boolean finalApproval;

    // ── kind=gate ────────────────────────────────────────────────────
    private String gate;

    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }

    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String institutionId) { this.institutionId = institutionId; }

    public String getInstitutionName() { return institutionName; }
    public void setInstitutionName(String institutionName) { this.institutionName = institutionName; }

    public Integer getStage() { return stage; }
    public void setStage(Integer stage) { this.stage = stage; }

    public String getTaskId() { return taskId; }
    public void setTaskId(String taskId) { this.taskId = taskId; }

    public String getTeam() { return team; }
    public void setTeam(String team) { this.team = team; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getAssignee() { return assignee; }
    public void setAssignee(String assignee) { this.assignee = assignee; }

    public String getApprover() { return approver; }
    public void setApprover(String approver) { this.approver = approver; }

    public String getDraftContent() { return draftContent; }
    public void setDraftContent(String draftContent) { this.draftContent = draftContent; }

    public List<TaskFileEntry> getFiles() { return files; }
    public void setFiles(List<TaskFileEntry> files) { this.files = files; }

    @JsonProperty("final")
    public Boolean getFinalApproval() { return finalApproval; }

    @JsonProperty("final")
    public void setFinalApproval(Boolean finalApproval) { this.finalApproval = finalApproval; }

    public String getGate() { return gate; }
    public void setGate(String gate) { this.gate = gate; }
}
