package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.dto.TaskListRow;
import com.kbstar.kgi.ggreport.web.service.TaskQueryService;
import org.springframework.web.bind.annotation.GetMapping;
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
 * <p>작업 상세({@code GET /tasks/{id}})와 쓰기(임시저장·제출·결재·파일)는 아직
 * 없다 — 단계 2는 조회 목록까지다.
 */
@RestController
@RequestMapping("/tasks")
public class TaskController {

    private final TaskQueryService tasks;

    public TaskController(TaskQueryService tasks) {
        this.tasks = tasks;
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
}
