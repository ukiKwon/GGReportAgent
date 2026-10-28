package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.service.AccessLogService;
import com.kbstar.kgi.ggreport.web.service.PermissionService;
import org.springframework.stereotype.Component;

import javax.servlet.http.HttpServletRequest;

/**
 * {@code /sysadmin/**} 의 문지기 — 호출자가 <b>등록된 활성 사용자이고 권한관리 조회 권한이 있을 때만</b> 통과.
 *
 * <p>⚠️ 호출자 사번은 {@link Actor} 가 정한다. 앞단 인증이 없으면 헤더 자기신고라 <b>위조할 수 있다</b> —
 * 이 문지기는 화면 노출 제어보다 한 걸음 더 나간 "서버 측 확인"이지만, 앞단 인증(SSO·Basic Auth)이
 * 붙기 전에는 보안 경계가 아니다. 거부는 {@code DENIED} 로 접근 이력에 남긴다.
 */
@Component
public class AdminGuard {

    public static final String DENIED_LOGGED = "ggreport.denied.logged";

    private final PermissionService permissions;
    private final AccessLogService accessLog;

    public AdminGuard(PermissionService permissions, AccessLogService accessLog) {
        this.permissions = permissions;
        this.accessLog = accessLog;
    }

    public Actor require(HttpServletRequest req) {
        Actor actor = Actor.of(req);
        if (!actor.isKnown()) {
            deny(req, actor, 401, "no employee number");
            throw new ApiException(401, "로그인이 필요합니다.");
        }
        if (!permissions.canAdmin(actor.getEmpNo())) {
            deny(req, actor, 403, "not an administrator");
            throw new ApiException(403, "이 기능을 쓸 권한이 없습니다.");
        }
        return actor;
    }

    private void deny(HttpServletRequest req, Actor actor, int status, String why) {
        req.setAttribute(DENIED_LOGGED, Boolean.TRUE);
        accessLog.record(actor, "DENIED", req.getMethod(), req.getRequestURI(), status,
                req.getRemoteAddr(), req.getHeader("User-Agent"), null, why);
    }
}
