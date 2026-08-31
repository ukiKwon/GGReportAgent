package com.kbstar.kgi.ggreport.web.domain;

/**
 * 입찰 건 상세에 딸려 나가는 팀별 작업 요약. Python {@code server/models.TaskSummary}.
 *
 * <p>⚠️ <b>{@code finalApprover} 는 언제나 {@code null} 이다.</b> 원본
 * {@code list_task_summaries} 의 SELECT 목록에 그 컬럼이 없어서 pydantic 기본값이
 * 나가는 것이고, <b>골든 {@code 14} 가 이를 계약으로 고정했다.</b> Mapper 가 친절하게
 * {@code FINAL_APPROVER} 를 뽑아 채우면 <b>골든이 깨진다</b> — 이관의 기준은
 * "동작 동일"이지 "더 나은 동작"이 아니다. (키 자체는 JSON 에 있어야 한다.)
 *
 * <p>진짜 최종결재자가 필요한 화면은 작업 상세({@link Task})를 따로 읽는다.
 */
public class TaskSummary {

    private String taskId;
    private String team;
    private String status;
    private int progressPct;
    private String assignee;
    private String approver;
    /** 위 클래스 주석 참조 — 채우지 않는다. */
    private String finalApprover;

    public String getTaskId() { return taskId; }
    public void setTaskId(String taskId) { this.taskId = taskId; }

    public String getTeam() { return team; }
    public void setTeam(String team) { this.team = team; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public int getProgressPct() { return progressPct; }
    public void setProgressPct(int progressPct) { this.progressPct = progressPct; }

    public String getAssignee() { return assignee; }
    public void setAssignee(String assignee) { this.assignee = assignee; }

    public String getApprover() { return approver; }
    public void setApprover(String approver) { this.approver = approver; }

    public String getFinalApprover() { return finalApprover; }
    public void setFinalApprover(String finalApprover) { this.finalApprover = finalApprover; }
}
