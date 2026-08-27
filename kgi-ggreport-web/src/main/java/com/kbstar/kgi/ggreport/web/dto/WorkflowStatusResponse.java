package com.kbstar.kgi.ggreport.web.dto;

import java.util.ArrayList;
import java.util.List;

/**
 * {@code GET /institutions/{id}/status} — 워크플로 탭이 폴링하는 상태. 골든 {@code 30}.
 *
 * <p>⚠️ {@code running}·{@code pendingGate}·{@code failed} 는 <b>오케스트레이터가
 * 답할 것</b>이다. 아직 이관 전이라 지금은 "안 돌고 있고 대기 중인 게이트도 없다"로
 * 고정된다({@code WorkflowStatusService} 주석). 골든 {@code 30} 도 그 상태를 찍은
 * 것이라 값이 맞지만, <b>단계 4 후반에 실제 값으로 바꿔야 한다.</b>
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
