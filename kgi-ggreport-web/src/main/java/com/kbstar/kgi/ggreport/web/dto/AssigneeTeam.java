package com.kbstar.kgi.ggreport.web.dto;

/**
 * {@code SELECT DISTINCT ASSIGNEE, TEAM FROM TASKS} 한 줄. 계정 목록의 재료다.
 * JSON 으로 나가지 않는다 — {@link Account} 로 바뀌어 나간다.
 */
public class AssigneeTeam {

    private String assignee;
    private String team;

    public String getAssignee() { return assignee; }
    public void setAssignee(String assignee) { this.assignee = assignee; }

    public String getTeam() { return team; }
    public void setTeam(String team) { this.team = team; }
}
