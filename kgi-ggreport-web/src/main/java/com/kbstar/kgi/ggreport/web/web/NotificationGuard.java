package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.service.AccessLogService;
import com.kbstar.kgi.ggreport.web.service.CallerService;
import com.kbstar.kgi.ggreport.web.support.Teams;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import javax.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 쪽지 1차 방어 — 호출자 본인의 사번·이름·소속(역할)·(팀장/부장이면) 소속 팀 앞으로 온 쪽지만 읽게 한다.
 *
 * <p>⚠️ 호출자 사번은 {@link Actor} 가 정한다. X-Emp-No 자기신고면 위조할 수 있으므로
 * 앞단 인증(SSO) 전에는 보안 경계가 아니다. 여기서 하는 일은 "화면이 남의 쪽지함을 실수로/쉽게
 * 열지 못하게" 막는 것까지다.
 *
 * <p>스위치 {@value #PROP}: 기본 true. false 면 검사를 하지 않는다(골든 27·구 테스트 호환용).
 * 요청마다 읽으므로 테스트가 런타임에 바꿀 수 있다.
 * 거부는 {@code DENIED} 로 접근 이력에 남기되 본문·쿼리값은 남기지 않는다(MenuGuard 와 같은 호출).
 */
@Component
public class NotificationGuard {

    public static final String PROP = "ggreport.notifications.enforce-recipient";

    private final Environment env;
    private final CallerService callers;
    private final AccessLogService accessLog;

    public NotificationGuard(Environment env, CallerService callers, AccessLogService accessLog) {
        this.env = env;
        this.callers = callers;
        this.accessLog = accessLog;
    }

    public boolean enforced() {
        return env.getProperty(PROP, Boolean.class, Boolean.TRUE);
    }

    /**
     * 요청한 recipient 중 호출자 것만 돌려준다(순서 유지, 중복 제거). 하나도 없으면 403.
     * 검사가 꺼져 있으면 입력 그대로.
     */
    public List<String> readable(HttpServletRequest req, List<String> asked) {
        if (!enforced()) {
            return asked;
        }
        Actor actor = Actor.of(req);
        Set<String> mine = ownNames(caller(req, actor));
        List<String> ok = new ArrayList<>();
        for (String r : asked) {
            String t = r == null ? "" : r.trim();
            if (mine.contains(t) && !ok.contains(t)) {
                ok.add(t);
            }
        }
        if (ok.isEmpty()) {
            deny(req, actor, 403, "recipient not owned");
            throw new ApiException(403, "이 쪽지함을 볼 권한이 없습니다.");
        }
        return ok;
    }

    /**
     * 읽음 처리용. 로그인·등록 여부를 먼저 보고, 쪽지가 있으면(owner != null) 호출자 몫인지 확인한다.
     * 쪽지가 없으면 통과시켜 호출 쪽이 404 를 낸다.
     */
    public void requireOwner(HttpServletRequest req, String owner) {
        if (!enforced()) {
            return;
        }
        Actor actor = Actor.of(req);
        Set<String> mine = ownNames(caller(req, actor));
        if (owner != null && !mine.contains(owner.trim())) {
            deny(req, actor, 403, "notification not owned");
            throw new ApiException(403, "이 쪽지를 처리할 권한이 없습니다.");
        }
    }

    private SysUser caller(HttpServletRequest req, Actor actor) {
        try {
            return callers.require(actor);
        } catch (ApiException e) {
            deny(req, actor, e.getStatus(), e.getStatus() == 401 ? "no employee number" : "inactive or unknown user");
            throw e;
        }
    }

    /** 사번·이름·역할, 그리고 팀장/부장이면 소속 팀("영업팀장" -> "영업팀"). 팀원은 상위 역할 쪽지를 못 본다. */
    private static Set<String> ownNames(SysUser u) {
        Set<String> s = new LinkedHashSet<>();
        add(s, u.getEmpNo());
        add(s, u.getName());
        add(s, u.getRole());
        String team = Teams.teamOf(u.getRole());
        if (u.getRole() != null && !team.equals(u.getRole().trim())) {
            add(s, team + Teams.TEAM_SUFFIX);
        }
        return s;
    }

    private static void add(Set<String> s, String v) {
        if (v != null && !v.trim().isEmpty()) {
            s.add(v.trim());
        }
    }

    private void deny(HttpServletRequest req, Actor actor, int status, String why) {
        req.setAttribute(AdminGuard.DENIED_LOGGED, Boolean.TRUE);
        accessLog.record(actor, "DENIED", req.getMethod(), req.getRequestURI(), status,
                req.getRemoteAddr(), req.getHeader("User-Agent"), null, why);
    }
}
