package com.kbstar.kgi.ggreport.web.dto;

/**
 * {@code GET /tasks?team=…} 의 한 줄 — <b>기관 횡단</b> 작업 목록. 골든 {@code 26}.
 *
 * <p>기존 조회는 전부 기관 단위인데 디자이너의 작업은 여러 기관에 걸쳐 있다.
 * 그래서 기관 이름·단계·입찰일을 함께 실어 화면이 재조회하지 않게 한다.
 *
 * <p>⚠️ <b>{@code draftContent} 를 싣지 않는다</b>(무겁다). 상세
 * ({@code GET /tasks/{id}})에서만 준다 — 작업함이 100건이면 CLOB 100개가 따라온다.
 *
 * <p>⚠️ {@code bidDate} 는 <b>확정일이 예상일을 이긴다.</b> 이 선택을 화면이
 * 복제하면 두 곳이 어긋나므로 서버가 골라서 준다.
 */
public class TaskListRow {

    private String taskId;
    private String team;
    private String status;
    private int progressPct;
    private String assignee;
    private String approver;
    private String bidCaseId;
    private String institutionId;
    private String institutionName;
    private int stage;
    /** 확정일 우선, 없으면 예상일. 둘 다 없으면 null. */
    private String bidDate;
    private String scheduleConfidence;
    /** 디자이너가 올려 둔 작업물 파일 수. DB 가 아니라 파일 시스템에서 센다. */
    private int fileCount;

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

    public String getBidCaseId() { return bidCaseId; }
    public void setBidCaseId(String bidCaseId) { this.bidCaseId = bidCaseId; }

    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String institutionId) { this.institutionId = institutionId; }

    public String getInstitutionName() { return institutionName; }
    public void setInstitutionName(String institutionName) { this.institutionName = institutionName; }

    public int getStage() { return stage; }
    public void setStage(int stage) { this.stage = stage; }

    public String getBidDate() { return bidDate; }
    public void setBidDate(String bidDate) { this.bidDate = bidDate; }

    public String getScheduleConfidence() { return scheduleConfidence; }
    public void setScheduleConfidence(String scheduleConfidence) {
        this.scheduleConfidence = scheduleConfidence;
    }

    public int getFileCount() { return fileCount; }
    public void setFileCount(int fileCount) { this.fileCount = fileCount; }
}
