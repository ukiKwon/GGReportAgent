package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.Task;
import com.kbstar.kgi.ggreport.web.domain.TaskApprovalIn;
import com.kbstar.kgi.ggreport.web.domain.TaskDraftIn;
import com.kbstar.kgi.ggreport.web.dto.TaskContext;
import com.kbstar.kgi.ggreport.web.mapper.NotificationMapper;
import com.kbstar.kgi.ggreport.web.mapper.TaskMapper;
import com.kbstar.kgi.ggreport.web.support.Teams;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * 팀 작업 결재 흐름 — 임시저장 · 제출 · 결재. Python {@code routers/tasks.py} +
 * {@code task_repository.py}. 골든 {@code 15}~{@code 23}.
 *
 * <p><b>결재 라인</b>(사용자 확정): 팀원 → 그 팀의 팀장. 디자이너만 한 단 더 간다
 * (디자이너 → 영업팀장 → 영업부장). 그래서 팀 작업의 종점은 {@code 2차완료} 다.
 *
 * <p><b>선점 관행</b>: 미배정({@code ASSIGNEE IS NULL}) 작업은 <b>먼저 손댄 사람이</b>
 * 담당이 된다(오케스트레이터가 만든 작업은 담당이 비어 있다). 남의 것이면 403.
 */
@Service
public class TaskCommandService {

    private final TaskMapper tasks;
    private final NotificationMapper notificationMapper;
    private final NotificationCommandService notifications;

    public TaskCommandService(TaskMapper tasks, NotificationMapper notificationMapper,
                              NotificationCommandService notifications) {
        this.tasks = tasks;
        this.notificationMapper = notificationMapper;
        this.notifications = notifications;
    }

    /**
     * 임시저장 — 골든 {@code 15}·{@code 18}·{@code 21}.
     *
     * <p><b>기록을 남기지 않는다.</b> {@code POST /tasks/{id}/upload} 를 재사용하지 않는
     * 이유가 그것이다 — 그쪽은 호출마다 '업로드 즉시검사' agent 메시지를 남기는데,
     * 임시저장을 누를 때마다 로그가 쌓이면 작업 로그가 못 읽을 것이 된다.
     *
     * <p>첫 임시저장이 담당을 선점하고 상태를 {@code 대기 → 작성중} 으로 올린다.
     */
    @Transactional
    public Task patchDraft(String taskId, TaskDraftIn body, String userId) {
        String actor = actor(body.getBy(), userId);
        TaskContext ctx = requireContext(taskId);
        requireOwner(ctx.getAssignee(), actor, "only the assignee can modify this task");

        tasks.claimAssigneeIfUnset(taskId, actor);
        tasks.updateDraftContent(taskId, body.getContent());
        return tasks.selectById(taskId);
    }

    /**
     * 제출 — 골든 {@code 16}·{@code 19}·{@code 22}.
     *
     * <p>제출은 <b>알림까지가 한 동작</b>이다. 예전에는 상태만 바꾸고 아무에게도 알리지
     * 않았는데, 그건 "제출해도 아무 일이 일어나지 않는다"는 뜻이었다. 결재 라인대로
     * 그 팀 팀장에게 {@code 결재요청} 을 보낸다.
     *
     * <p>⚠️ 디자이너 작업은 3팀이 모두 {@code 2차완료} 여야 제출할 수 있고, 제출 시
     * 3팀에도 쪽지가 간다. 그 분기는 <b>디자이너 작업이 생기는 단계</b>(오케스트레이터)와
     * 함께 온다 — 지금 만드는 건 팀 작업 3건뿐이라 여기서는 해당 사항이 없다.
     */
    @Transactional
    public Task submit(String taskId, String by, String userId) {
        String actor = actor(by, userId);
        Task task = requireTask(taskId);
        if (!actor.equals(task.getAssignee())) {
            throw new ApiException(403, "only the assignee can submit");
        }
        if (!Teams.isWorking(task.getStatus())) {
            throw new ApiException(409, "task not in a submittable state");
        }
        requireTeamsDone(task);

        tasks.updateStatus(taskId, Teams.SUBMITTED_STATUS);

        TaskContext ctx = requireContext(taskId);
        for (String recipient : submitRecipients(ctx.getTeam())) {
            notifications.create(recipient, "결재요청",
                    ctx.getInstitutionName() + " " + ctx.getTeam()
                            + " 작업물 제출 — 결재를 부탁드립니다.",
                    ctx.getInstitutionId(), taskId, null, ctx.getStage(), null);
        }
        if (Teams.DESIGNER_TEAM.equals(ctx.getTeam())) {
            List<String> recipients = notificationMapper.selectDistinctRecipients();
            for (String team : Teams.AUTHORING_TEAMS) {
                notifications.create(Teams.inboxName(team, recipients), "쪽지",
                        ctx.getInstitutionName() + " 디자이너 작업물이 제출됐습니다"
                                + " — 작업함에서 확인하세요.",
                        ctx.getInstitutionId(), taskId, null, ctx.getStage(), null);
            }
        }
        return tasks.selectById(taskId);
    }

    /**
     * 결재 — 골든 {@code 17}·{@code 20}·{@code 23}.
     *
     * <p>⚠️ <b>결재자 선점은 단계마다 따로 본다.</b> 한 칸으로 합치면 1차를 본
     * 영업팀장이 최종 결재까지 잠가버려 영업부장이 403 을 받는다.
     *
     * <p>반려({@code approved=false})는 두 단계 모두 {@code 작성중} 으로 되돌리고
     * 담당자에게 사유를 알린다 — 예전에는 조용히 되돌리기만 해서 아무도 몰랐다.
     */
    @Transactional
    public Task approve(String taskId, TaskApprovalIn body, String userId) {
        String actor = actor(body.getBy(), userId);
        Task task = requireTask(taskId);

        boolean finalStage = isFinalStage(task);
        String held = finalStage ? task.getFinalApprover() : task.getApprover();
        if (held != null && !held.equals(actor)) {
            throw new ApiException(403, "only the approver can approve");
        }
        if (!finalStage && !Teams.SUBMITTED_STATUS.equals(task.getStatus())) {
            throw new ApiException(409, "task not submitted yet");
        }

        if (finalStage) {
            tasks.claimFinalApproverIfUnset(taskId, actor);
        } else {
            tasks.claimApproverIfUnset(taskId, actor);
        }
        tasks.updateStatus(taskId, approvedStatus(body.isApproved(), finalStage));

        TaskContext ctx = requireContext(taskId);
        // 담당이 없는(미배정) 작업은 보낼 상대가 없으므로 조용히 넘어간다 —
        // 반려 자체는 유효하다.
        if (!body.isApproved() && task.getAssignee() != null) {
            String reason = body.getComment() == null || body.getComment().trim().isEmpty()
                    ? "(사유 없음)" : body.getComment().trim();
            notifications.create(task.getAssignee(), "쪽지",
                    ctx.getInstitutionName() + " " + ctx.getTeam()
                            + " 작업물이 반려되었습니다 — " + reason,
                    ctx.getInstitutionId(), taskId, null, ctx.getStage(), actor);
        }
        // 영업팀장이 디자이너 최종본을 승인하면 **그 승인이 곧 상신**이다(사용자 확정).
        // 별도의 상신 버튼을 두면 승인해 놓고 안 올리는 상태가 생긴다.
        if (body.isApproved() && !finalStage && Teams.DESIGNER_TEAM.equals(task.getTeam())) {
            notifications.create(Teams.FINAL_APPROVER, "결재요청",
                    ctx.getInstitutionName() + " 디자이너 최종본 상신 — 최종 결재를 부탁드립니다.",
                    ctx.getInstitutionId(), taskId, null, ctx.getStage(), actor);
        }
        return tasks.selectById(taskId);
    }

    /**
     * 지금 이 결재가 <b>영업부장의 최종 결재</b>인가. 디자이너 최종본만 2단으로
     * 올라간다 — 팀 작업은 팀장 승인({@code 2차완료})이 종점이다.
     */
    private boolean isFinalStage(Task task) {
        return Teams.DESIGNER_TEAM.equals(task.getTeam())
                && Teams.APPROVED_STATUS.equals(task.getStatus());
    }

    private String approvedStatus(boolean approved, boolean finalStage) {
        if (!approved) {
            // 반려는 두 단계 모두 '작성중'으로 되돌린다 — 결국 담당자가 다시 손봐야 하고,
            // 중간 상태를 하나 더 만들면 '누가 다음에 무엇을 하나'가 흐려진다.
            return "작성중";
        }
        return finalStage ? Teams.FINAL_STATUS : Teams.APPROVED_STATUS;
    }

    /** 제출을 결재할 사람. 팀 작업은 그 팀 팀장, <b>디자이너 작업도 영업팀장</b>이다. */
    private List<String> submitRecipients(String team) {
        List<String> out = new ArrayList<String>();
        out.add(Teams.leadOf(team));
        return out;
    }

    /**
     * 디자이너 제출은 3팀이 <b>{@code 2차완료}</b> 인 뒤라야 한다(사용자 확정).
     * 디자이너 작업물은 팀 산출물을 받아서 만든 것이라, 팀이 아직 쓰는 중이면 그 위에서
     * 만든 결과물을 결재에 올리는 것이 앞뒤가 안 맞는다.
     *
     * <p><b>디자이너에게만 건다</b> — 3팀에 걸면 서로를 기다리다 아무도 제출하지 못한다.
     */
    private void requireTeamsDone(Task task) {
        if (!Teams.DESIGNER_TEAM.equals(task.getTeam())) {
            return;
        }
        List<String> pending = new ArrayList<String>();
        for (com.kbstar.kgi.ggreport.web.domain.TaskSummary other
                : tasks.selectSummaries(task.getBidCaseId())) {
            if (other.getTeam().equals(task.getTeam())
                    || !Teams.isAuthoringTeam(other.getTeam())) {
                continue;
            }
            if (!Teams.APPROVED_STATUS.equals(other.getStatus())) {
                pending.add(other.getTeam());
            }
        }
        if (!pending.isEmpty()) {
            throw new ApiException(409, "아직 승인되지 않은 팀이 있습니다: "
                    + String.join(", ", pending)
                    + " — 각 팀장 결재가 끝난 뒤에 제출할 수 있습니다");
        }
    }

    /**
     * 이 요청을 실제로 한 사람. <b>본문의 {@code by} 가 헤더를 이긴다.</b>
     *
     * <p>{@code X-User-Id} 에는 ASCII 만 실을 수 있어서 한글 이름은 본문으로 온다.
     * 이걸 안 보면 담당자 이름이 한글인 작업은 API 로 아무것도 못 한다 —
     * 데모의 '최 디자이너'가 자기 작업에 파일 하나 못 올리고 403 을 받았다.
     */
    private static String actor(String by, String userId) {
        String trimmed = by == null ? "" : by.trim();
        return trimmed.isEmpty() ? userId : trimmed;
    }

    /** 미배정이면 먼저 손댄 사람이 맡고, 남의 것이면 403(업로드와 같은 선점 관행). */
    private static void requireOwner(String assignee, String actor, String detail) {
        if (assignee != null && !assignee.equals(actor)) {
            throw new ApiException(403, detail);
        }
    }

    private Task requireTask(String taskId) {
        Task task = tasks.selectById(taskId);
        if (task == null) {
            throw ApiException.notFound("task not found");
        }
        return task;
    }

    private TaskContext requireContext(String taskId) {
        TaskContext ctx = tasks.selectContext(taskId);
        if (ctx == null) {
            throw ApiException.notFound("task not found");
        }
        return ctx;
    }
}
