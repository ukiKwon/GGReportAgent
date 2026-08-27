package com.kbstar.kgi.ggreport.web.dto;

import java.util.ArrayList;
import java.util.List;

/**
 * {@code GET /institutions/{id}/status} — 워크플로 탭이 폴링하는 상태. 골든 {@code 30}.
 *
 * <p>{@code running}·{@code pendingGate}·{@code failed} 는 {@code ORCH_RUN} 을 실제로
 * 조회한 값이다(단계 4). {@code pendingGate} 는 화면이 <b>무엇을 묻는 결재인지</b>
 * 정하는 문자열이다 — {@code 기획승인}·{@code 이관결재}·{@code 최종결재}.
 */
public class WorkflowStatusResponse {

    private Integer stage;
    private boolean running;
    /** 사람 승인을 기다리는 게이트 이름. 없으면 null. */
    private String pendingGate;
    private boolean failed;
    private List<WorkflowStatusTask> tasks = new ArrayList<WorkflowStatusTask>();
    private int notificationsUnread;

    public Integer getStage() { return stage; }
    public void setStage(Integer stage) { this.stage = stage; }

    public boolean isRunning() { return running; }
    public void setRunning(boolean running) { this.running = running; }

    public String getPendingGate() { return pendingGate; }
    public void setPendingGate(String pendingGate) { this.pendingGate = pendingGate; }

    public boolean isFailed() { return failed; }
    public void setFailed(boolean failed) { this.failed = failed; }

    public List<WorkflowStatusTask> getTasks() { return tasks; }
    public void setTasks(List<WorkflowStatusTask> tasks) { this.tasks = tasks; }

    public int getNotificationsUnread() { return notificationsUnread; }
    public void setNotificationsUnread(int notificationsUnread) {
        this.notificationsUnread = notificationsUnread;
    }
}
