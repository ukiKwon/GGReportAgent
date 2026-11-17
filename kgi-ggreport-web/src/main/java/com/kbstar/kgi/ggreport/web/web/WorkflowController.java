package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.config.AccessLogInterceptor;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.WorkflowOverviewResponse;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.service.PermissionService;
import com.kbstar.kgi.ggreport.web.service.WorkflowOverviewService;
import com.kbstar.kgi.ggreport.web.support.Teams;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;

/** 제안서 진행 현황 목록 — NEXT 33 기능 1. 읽기 전용. */
@RestController
@RequestMapping("/workflow")
public class WorkflowController {

    private final MenuGuard guard;
    private final PermissionService permissions;
    private final SysUserMapper users;
    private final WorkflowOverviewService overview;

    public WorkflowController(MenuGuard guard, PermissionService permissions, SysUserMapper users,
                              WorkflowOverviewService overview) {
        this.guard = guard;
        this.permissions = permissions;
        this.users = users;
        this.overview = overview;
    }

    /**
     * workflow 메뉴 조회 권한, 또는 디자이너·디자이너팀장(입찰 현황판에서 진행 단계 보기 — 사용자 결정 2026-11-17).
     * 사번 없음 401, 그 밖 403(DENIED 기록). 역할 예외 경로는 담당자 칸(assignees)을 비워 주고 접근 이력에 사유를 남긴다.
     * 쿼리 파라미터는 받지 않는다.
     *
     * <p>⚠️ 역할 예외는 권한관리에서 workflow 를 꺼도 열린다(수용 위험). X-Emp-No 자기신고 위의 업무 규칙이며 사칭 방지가 아니다.
     * 이 판정은 일부러 이 컨트롤러 안에 둔다 — MenuGuard 의 공용 메서드로 올리면 다른 화면이 메뉴 권한을 우회하는 데 재사용된다.
     */
    @GetMapping("/overview")
    public WorkflowOverviewResponse overview(HttpServletRequest req) {
        Actor actor = Actor.of(req);
        if (!actor.isKnown()) {
            throw guard.denied(req, new ApiException(401, "로그인이 필요합니다."));
        }
        if (permissions.canView(actor.getEmpNo(), "workflow")) {
            return overview.overview(actor, true);
        }
        String role = designerReadRole(actor);
        if (role == null) {
            throw guard.denied(req, new ApiException(403, "이 기능을 쓸 권한이 없습니다."));
        }
        req.setAttribute(AccessLogInterceptor.DETAIL, "role exception: " + role);   // 본문·값 없음, 고정 문구 + 역할 이름만
        return overview.overview(actor, false);
    }

    /**
     * 활성 사용자이고 역할이 정확히 디자이너면 그 역할 이름, 아니면 null.
     * 디자이너의 팀장(Teams.leadOf)은 영업팀장이라 메뉴 권한으로 이미 보고, 예외에 넣으면 전산이 그 팀장의 메뉴를 꺼도 열려 우회가 넓어지므로 넣지 않는다(11-17).
     * ⚠️ 이 예외는 권한관리 화면으로 끌 수 없다(수용 위험, NEXT 94).
     */
    private String designerReadRole(Actor actor) {
        SysUser u = users.selectByEmpNo(actor.getEmpNo());
        if (u == null || !"ACTIVE".equals(u.getStatus()) || u.getRole() == null) {
            return null;
        }
        String role = u.getRole().trim();
        return role.equals(Teams.DESIGNER_TEAM) ? role : null;
    }
}
