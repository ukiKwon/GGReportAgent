package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.service.AccessLogService;
import com.kbstar.kgi.ggreport.web.service.PermissionService;
import org.springframework.stereotype.Component;

import javax.servlet.http.HttpServletRequest;

/**
 * 메뉴 조회 권한 문지기 — {@link AdminGuard} 의 일반형. 호출자가 등록된 활성 사용자이고 그 메뉴를 볼 수 있을 때만 통과.
 *
 * <p>⚠️ 호출자 사번은 {@link Actor} 가 정한다(X-Emp-No 자기신고면 위조 가능). 앞단 인증 전에는 보안 경계가 아니다.
 * 거부는 {@code DENIED} 로 접근 이력에 남기되 본문·쿼리값은 남기지 않는다(AdminGuard 와 같은 호출).
 */
@Component
public class MenuGuard {

    private final PermissionService permissions;
    private final AccessLogService accessLog;

    private final SysUserMapper users;

    public MenuGuard(PermissionService permissions, AccessLogService accessLog, SysUserMapper users) {
        this.permissions = permissions;
        this.accessLog = accessLog;
        this.users = users;
    }

    public Actor require(HttpServletRequest req, String menuKey) {
        Actor actor = Actor.of(req);
        if (!actor.isKnown()) {
            deny(req, actor, 401, "no employee number");
            throw new ApiException(401, "로그인이 필요합니다.");
        }
        if (!permissions.canView(actor.getEmpNo(), menuKey)) {
            deny(req, actor, 403, "no view permission: " + menuKey);
            throw new ApiException(403, "이 기능을 쓸 권한이 없습니다.");
        }
        return actor;
    }

    /**
     * 기관 레코드 편집 문지기 — map·regions 중 하나라도 조회+수정이면 통과({@link PermissionService#canEditInstitution}).
     * 401(사번 없음)/403(권한 없음)은 DENIED 로 접근 이력에 남기되 본문·쿼리값은 남기지 않는다.
     * ⚠️ X-Emp-No 자기신고라 위조 가능하다. 앞단 인증 전에는 보안 경계가 아니다.
     */
    public Actor requireInstitutionEdit(HttpServletRequest req) {
        Actor actor = Actor.of(req);
        if (!actor.isKnown()) {
            deny(req, actor, 401, "no employee number");
            throw new ApiException(401, "로그인이 필요합니다.");
        }
        if (!permissions.canEditInstitution(actor.getEmpNo())) {
            deny(req, actor, 403, "no edit permission: "
                    + String.join("|", PermissionService.INSTITUTION_EDIT_MENUS));
            throw new ApiException(403, "이 기능을 쓸 권한이 없습니다.");
        }
        return actor;
    }

    /**
     * {@link #require} 에 더해 그 메뉴의 수정 권한(또는 관리자)을 본다. 401/403 모두 DENIED 로 남기되
     * 본문·쿼리값은 남기지 않는다. 메시지는 호출하는 기능이 정한다.
     */
    public Actor requireEdit(HttpServletRequest req, String menuKey, String deniedMessage) {
        Actor actor = require(req, menuKey);
        if (!permissions.canEdit(actor.getEmpNo(), menuKey)) {
            deny(req, actor, 403, "no edit permission: " + menuKey);
            throw new ApiException(403, deniedMessage);
        }
        return actor;
    }

    /** {@link #require} 에 더해 그 메뉴의 작성 권한(사용자 예외 CAN_WRITE 또는 관리자). 401/403 은 DENIED(본문 없음). */
    public Actor requireWrite(HttpServletRequest req, String menuKey, String deniedMessage) {
        Actor actor = require(req, menuKey);
        if (!permissions.canWrite(actor.getEmpNo(), menuKey)) {
            deny(req, actor, 403, "no write permission: " + menuKey);
            throw new ApiException(403, deniedMessage);
        }
        return actor;
    }

    /**
     * 메뉴와 무관하게 "등록된 활성 사용자"만 요구한다(사번 없음 401, 미등록·비활성 403 — 둘 다 DENIED, 고정 문구).
     * 역할 판정은 호출하는 기능이 한다. 영업부장처럼 특정 메뉴가 꺼진 역할도 통과시키려는 용도다.
     * ⚠️ X-Emp-No 자기신고면 위조 가능하다.
     */
    public SysUser requireActiveUser(HttpServletRequest req) {
        Actor actor = Actor.of(req);
        if (!actor.isKnown()) {
            deny(req, actor, 401, "no employee number");
            throw new ApiException(401, "로그인이 필요합니다.");
        }
        SysUser u = users.selectByEmpNo(actor.getEmpNo());
        if (u == null || !"ACTIVE".equals(u.getStatus())) {
            deny(req, actor, 403, "inactive or unknown user");
            throw new ApiException(403, "사용할 수 없는 계정입니다.");
        }
        return u;
    }

    /** {@link #require} 통과 후 호출자의 USERS 행. 401/403 은 DENIED(본문 없음). */
    public SysUser requireUser(HttpServletRequest req, String menuKey) {
        Actor actor = require(req, menuKey);
        return userOf(req, actor);
    }

    /**
     * {@link #require} 에 더해 USERS.ROLE 이 정확히 {@code role} 일 때만 통과.
     * ⚠️ X-Emp-No 자기신고 위에 선 <b>업무 규칙</b>이다(실수 방지) — 사칭 방지가 아니다.
     */
    public SysUser requireRole(HttpServletRequest req, String menuKey, String role, String deniedMessage) {
        Actor actor = require(req, menuKey);
        SysUser u = userOf(req, actor);
        if (!role.equals(u.getRole() == null ? null : u.getRole().trim())) {
            deny(req, actor, 403, "role required: " + role);
            throw new ApiException(403, deniedMessage);
        }
        return u;
    }

    /** 서비스·컨트롤러가 낸 403 을 DENIED 로 접근 이력에 남기고 같은 예외를 돌려준다(던지는 것은 호출자). 사유는 고정 문구만. */
    public ApiException denied(HttpServletRequest req, ApiException e) {
        deny(req, Actor.of(req), e.getStatus(), e.getMessage());
        return e;
    }

    private SysUser userOf(HttpServletRequest req, Actor actor) {
        SysUser u = users.selectByEmpNo(actor.getEmpNo());
        if (u == null) {   // require() 가 canView 로 걸러 정상 경로에선 오지 않는다(방어)
            deny(req, actor, 403, "user not found");
            throw new ApiException(403, "이 기능을 쓸 권한이 없습니다.");
        }
        return u;
    }

    private void deny(HttpServletRequest req, Actor actor, int status, String why) {
        req.setAttribute(AdminGuard.DENIED_LOGGED, Boolean.TRUE);
        accessLog.record(actor, "DENIED", req.getMethod(), req.getRequestURI(), status,
                req.getRemoteAddr(), req.getHeader("User-Agent"), null, why);
    }
}
