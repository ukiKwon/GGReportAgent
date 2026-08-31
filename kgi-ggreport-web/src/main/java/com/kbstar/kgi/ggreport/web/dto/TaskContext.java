package com.kbstar.kgi.ggreport.web.dto;

/**
 * 작업 하나가 속한 <b>기관·공고</b> 맥락 — Python {@code routers/tasks._context}.
 *
 * <p>결재 경로가 이걸 세 군데서 쓴다: 쪽지 본문의 기관명, 쪽지에 붙이는 단계,
 * 작업물 파일 경로({@code {output_root}/{기관명}/}). 세 번 조회하지 않으려고 한 번에 뽑는다.
 *
 * <p>⚠️ <b>응답 DTO 가 아니다.</b> 화면에 나가지 않으므로 snake_case 계약과 무관하다.
 */
public class TaskContext {

    private String taskId;
    private String team;
    private String status;
    private String assignee;
    private String bidCaseId;
    private String institutionId;
    /** {@code INSTITUTIONS.NAME_KO} — 산출물 폴더 이름이기도 하다. */
    private String institutionName;
    private Integer stage;

    public String getTaskId() { return taskId; }
    public void setTaskId(String taskId) { this.taskId = taskId; }

    public String getTeam() { return team; }
    public void setTeam(String team) { this.team = team; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getAssignee() { return assignee; }
    public void setAssignee(String assignee) { this.assignee = assignee; }

    public String getBidCaseId() { return bidCaseId; }
    public void setBidCaseId(String bidCaseId) { this.bidCaseId = bidCaseId; }

    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String institutionId) { this.institutionId = institutionId; }

    public String getInstitutionName() { return institutionName; }
    public void setInstitutionName(String institutionName) { this.institutionName = institutionName; }

    public Integer getStage() { return stage; }
    public void setStage(Integer stage) { this.stage = stage; }
}
