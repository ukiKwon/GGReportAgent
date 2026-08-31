package com.kbstar.kgi.ggreport.web.domain;

/**
 * 팀별 작업. Python {@code server/models.Task}.
 *
 * <p>⚠️ <b>{@code draftContent} 는 절대 {@code null} 로 나가지 않는다.</b>
 * SQLite 원본은 {@code TEXT NOT NULL DEFAULT ''} 였지만 Oracle 은 {@code ''} 를
 * NULL 로 바꾸므로 컬럼을 NULL 허용으로 두기로 했다(db/oracle/001_schema.sql 주석).
 * 그 차이를 <b>세터 안에서 끝낸다</b> — 프런트가 받는 JSON 은 현재와 같이 {@code ""} 다.
 * 이 정규화를 빼면 프런트 JSON 이 달라지는데, <b>MySQL 에서는 드러나지 않는다</b>
 * (MySQL 은 {@code ''} 와 NULL 을 구분해 저장한다). 골든 {@code 15}~{@code 24} 가 계약이다.
 */
public class Task {

    private String taskId;
    private String bidCaseId;
    private String team;
    private String status = "대기";
    private int progressPct;
    /** 위 클래스 주석 참조 — 읽을 때 null → "" 로 정규화한다. */
    private String draftContent = "";
    private String assignee;
    private String approver;
    /** 디자이너 최종본을 결재한 영업부장. {@link TaskSummary} 와 달리 여기서는 채운다. */
    private String finalApprover;

    public Task() {
    }

    /**
     * 같은 행에서 {@link TaskDetail} 을 만들 때 쓴다 — 원본의
     * {@code TaskDetail(**task.model_dump(), messages=…)} 자리에 대응한다.
     *
     * <p>⚠️ <b>필드를 추가하면 여기도 고쳐야 한다</b>({@code BidCase} 와 같은 이유).
     * {@code TaskCopyTest} 가 리플렉션으로 누락을 잡는다.
     */
    protected Task(Task src) {
        this.taskId = src.taskId;
        this.bidCaseId = src.bidCaseId;
        this.team = src.team;
        this.status = src.status;
        this.progressPct = src.progressPct;
        this.draftContent = src.draftContent;
        this.assignee = src.assignee;
        this.approver = src.approver;
        this.finalApprover = src.finalApprover;
    }

    public String getTaskId() { return taskId; }
    public void setTaskId(String taskId) { this.taskId = taskId; }

    public String getBidCaseId() { return bidCaseId; }
    public void setBidCaseId(String bidCaseId) { this.bidCaseId = bidCaseId; }

    public String getTeam() { return team; }
    public void setTeam(String team) { this.team = team; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public int getProgressPct() { return progressPct; }
    public void setProgressPct(int progressPct) { this.progressPct = progressPct; }

    public String getDraftContent() { return draftContent; }
    public void setDraftContent(String draftContent) {
        this.draftContent = (draftContent == null) ? "" : draftContent;
    }

    public String getAssignee() { return assignee; }
    public void setAssignee(String assignee) { this.assignee = assignee; }

    public String getApprover() { return approver; }
    public void setApprover(String approver) { this.approver = approver; }

    public String getFinalApprover() { return finalApprover; }
    public void setFinalApprover(String finalApprover) { this.finalApprover = finalApprover; }
}
