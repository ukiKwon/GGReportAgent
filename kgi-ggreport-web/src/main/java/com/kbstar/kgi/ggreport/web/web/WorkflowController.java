package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.dto.WorkflowOverviewResponse;
import com.kbstar.kgi.ggreport.web.service.WorkflowOverviewService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;

/** 제안서 진행 현황 목록 — NEXT 33 기능 1. 읽기 전용. */
@RestController
@RequestMapping("/workflow")
public class WorkflowController {

    private final MenuGuard guard;
    private final WorkflowOverviewService overview;

    public WorkflowController(MenuGuard guard, WorkflowOverviewService overview) {
        this.guard = guard;
        this.overview = overview;
    }

    /** workflow 메뉴 조회 권한 필요: 사번 없음 401, 권한 없음 403. 쿼리 파라미터는 받지 않는다. */
    @GetMapping("/overview")
    public WorkflowOverviewResponse overview(HttpServletRequest req) {
        Actor actor = guard.require(req, "workflow");
        return overview.overview(actor);
    }
}
