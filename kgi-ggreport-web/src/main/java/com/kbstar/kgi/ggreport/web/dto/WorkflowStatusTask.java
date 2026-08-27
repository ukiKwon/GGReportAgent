package com.kbstar.kgi.ggreport.web.dto;

/**
 * {@code GET /institutions/{id}/status} 의 작업 한 줄 — 골든 {@code 30}.
 *
 * <p>⚠️ {@link TaskListRow}·{@code TaskSummary} 와 <b>키 구성이 다르다</b>.
 * 여기에는 {@code approver} 가 없다 — 원본 SELECT 에 없어서다. 셋을 하나로 합치면
 * 어느 화면인가에 없던 키가 생기거나 있던 키가 사라진다.
 *
 * <p>{@code task_id} 는 프런트가 작업 로그({@code GET /tasks/{id}})를 여는 열쇠다.
 */
public class WorkflowStatusTask {

    private String taskId;
    private String team;
    private String status;
    private int progressPct;
    private String assignee;

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
}
