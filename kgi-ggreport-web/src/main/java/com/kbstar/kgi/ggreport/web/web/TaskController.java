package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.domain.Task;
import com.kbstar.kgi.ggreport.web.domain.TaskActorIn;
import com.kbstar.kgi.ggreport.web.domain.TaskApprovalIn;
import com.kbstar.kgi.ggreport.web.domain.TaskDraftIn;
import com.kbstar.kgi.ggreport.web.dto.TaskListRow;
import com.kbstar.kgi.ggreport.web.service.TaskCommandService;
import com.kbstar.kgi.ggreport.web.service.TaskQueryService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 역할별 작업 목록 — <b>기관 횡단</b>이다. 골든 {@code 26}.
 *
 * <p>{@code team} 은 필수다. {@code status} 는 여러 개 올 수 있고, 없으면 상태로
 * 거르지 않는다.
 *
 * <p>결재 흐름(임시저장·제출·결재)이 여기 있다 — 골든 {@code 15}~{@code 23}.
 * 작업 상세({@code GET /tasks/{id}})·파일·대화는 아직 없다.
 *
 * <p>⚠️ <b>{@code X-User-Id} 헤더가 필수다.</b> 누가 한 요청인지가 담당·결재자로 그대로
 * 박히므로 기본값을 주지 않는다 — 빠지면 400 이지, 익명으로 진행되지 않는다.
 * 한글 이름은 이 헤더에 못 실어서(ASCII 전용) 본문의 {@code by} 가 헤더를 이긴다.
 */
@RestController
@RequestMapping("/tasks")
public class TaskController {

    private final TaskQueryService tasks;
    private final TaskCommandService commands;

    public TaskController(TaskQueryService tasks, TaskCommandService commands) {
        this.tasks = tasks;
        this.commands = commands;
    }

    @GetMapping
    public List<TaskListRow> list(
            @RequestParam("team") String team,
            @RequestParam(name = "status", required = false) List<String> status) {
        if (team.isEmpty()) {
            throw ApiException.badRequest("team이 비어 있습니다");
        }
        return tasks.listForTeam(team, status);
    }

    /** 임시저장 — 골든 {@code 15}. 기록을 남기지 않고, 첫 저장이 담당을 선점한다. */
    @PatchMapping("/{taskId}/draft")
    public Task draft(@PathVariable String taskId,
                      @RequestBody TaskDraftIn body,
                      @RequestHeader("X-User-Id") String userId) {
        return commands.patchDraft(taskId, body, userId);
    }

    /**
     * 제출 — 골든 {@code 16}. 본문은 <b>없어도 된다</b>(원본 {@code TaskActorIn | None}).
     * 한글 이름 담당자만 {@code {"by": …}} 를 싣는다.
     */
    @PostMapping("/{taskId}/submit")
    public Task submit(@PathVariable String taskId,
                       @RequestBody(required = false) TaskActorIn body,
                       @RequestHeader("X-User-Id") String userId) {
        return commands.submit(taskId, body == null ? null : body.getBy(), userId);
    }

    /** 결재 — 골든 {@code 17}. {@code approved=false} 면 반려 사유가 담당자에게 간다. */
    @PostMapping("/{taskId}/approve")
    public Task approve(@PathVariable String taskId,
                        @RequestBody TaskApprovalIn body,
                        @RequestHeader("X-User-Id") String userId) {
        return commands.approve(taskId, body, userId);
    }
}
