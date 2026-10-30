package com.kbstar.kgi.ggreport.web.web;

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

    public MenuGuard(PermissionService permissions, AccessLogService accessLog) {
        this.permissions = permissions;
        this.accessLog = accessLog;
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

    private void deny(HttpServletRequest req, Actor actor, int status, String why) {
        req.setAttribute(AdminGuard.DENIED_LOGGED, Boolean.TRUE);
        accessLog.record(actor, "DENIED", req.getMethod(), req.getRequestURI(), status,
                req.getRemoteAddr(), req.getHeader("User-Agent"), null, why);
    }
}
