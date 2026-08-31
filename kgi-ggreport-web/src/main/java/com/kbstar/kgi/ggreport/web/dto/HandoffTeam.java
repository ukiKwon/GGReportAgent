package com.kbstar.kgi.ggreport.web.dto;

import java.util.ArrayList;
import java.util.List;

/**
 * 이관 패키지에 실리는 팀 한 줄. Python {@code get_handoff} 의 {@code teams[]} 원소.
 *
 * <p>디자이너는 "각 팀이 작업한 내용을 <b>받아서</b>" 작업한다. 그래서 텍스트 작성물
 * ({@code draftContent})만이 아니라 <b>첨부까지</b> 함께 싣는다 — 파일을 빼면 정작
 * 받아야 할 실물이 화면에 없다. {@code taskId} 를 함께 주므로 화면이
 * {@code GET /tasks/{taskId}/files/{name}} 으로 바로 내려받는다.
 */
public class HandoffTeam {

    private String team;
    private String taskId;
    private String status;
    private String assignee;
    private String approver;
    private String draftContent;

    /**
     * 이 팀에 문의할 때 쓰는 <b>쪽지 수신자 이름</b>. 팀명(`영업`)과 다르다(`영업팀`).
     *
     * <p>변환은 서버가 한다({@code Teams.inboxName}) — 화면이 {@code '영업' + '팀'}
     * 규칙을 복제하면 계정 전환기와 답이 갈라진다.
     */
    private String contact;

    private List<TaskFileEntry> files = new ArrayList<>();

    /**
     * 아직 자기 일을 끝내지 않았는가. 디자이너 제출을 막는 근거다(계획 I).
     *
     * <p>⚠️ <b>{@code 최종완료} 도 끝난 것으로 본다.</b> 디자이너 작업 자신도 이 목록에
     * 섞여 오기 때문이다 — 안 그러면 디자이너가 자기 자신을 기다린다.
     */
    private boolean working;

    public String getTeam() { return team; }
    public void setTeam(String team) { this.team = team; }

    public String getTaskId() { return taskId; }
    public void setTaskId(String taskId) { this.taskId = taskId; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getAssignee() { return assignee; }
    public void setAssignee(String assignee) { this.assignee = assignee; }

    public String getApprover() { return approver; }
    public void setApprover(String approver) { this.approver = approver; }

    public String getDraftContent() { return draftContent; }
    public void setDraftContent(String draftContent) { this.draftContent = draftContent; }

    public String getContact() { return contact; }
    public void setContact(String contact) { this.contact = contact; }

    public List<TaskFileEntry> getFiles() { return files; }
    public void setFiles(List<TaskFileEntry> files) { this.files = files; }

    public boolean isWorking() { return working; }
    public void setWorking(boolean working) { this.working = working; }
}
