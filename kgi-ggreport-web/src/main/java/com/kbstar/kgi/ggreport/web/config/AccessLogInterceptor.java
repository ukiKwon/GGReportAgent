package com.kbstar.kgi.ggreport.web.config;

import com.kbstar.kgi.ggreport.web.service.AccessLogService;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.AdminGuard;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/**
 * 모든 API 요청을 접근 이력({@code API})으로 남긴다 — <b>누가(자기신고/검증), 언제, 무엇을, 결과 코드</b>.
 *
 * <p><b>남기지 않는 것</b>: 요청·응답 본문, 쿼리스트링(값에 개인정보가 섞일 수 있다), 정적 파일
 * (경로 마지막 조각에 점이 있으면 정적으로 본다), 2초 폴링인 {@code GET …/status}(로그를 삼킨다),
 * {@code /auth/**}(컨트롤러가 이벤트 유형을 정해 직접 남긴다), 이미 {@code DENIED} 로 남긴 요청.
 *
 * <p>⚠️ 응답이 끝난 뒤({@code afterCompletion})에 쓰므로 업무 응답 시간에 영향이 작고, 기록 실패는
 * {@link AccessLogService#record} 안에서 삼킨다 — 로그 때문에 업무가 멈추지 않는다.
 */
@Component
public class AccessLogInterceptor implements HandlerInterceptor {

    private static final String START = "ggreport.access.start";

    private final AccessLogService accessLog;

    public AccessLogInterceptor(AccessLogService accessLog) {
        this.accessLog = accessLog;
    }

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) {
        req.setAttribute(START, System.nanoTime());
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest req, HttpServletResponse res, Object handler, Exception ex) {
        String path = req.getRequestURI();
        if (skip(req.getMethod(), path) || req.getAttribute(AdminGuard.DENIED_LOGGED) != null) {
            return;
        }
        Object start = req.getAttribute(START);
        Integer ms = start == null ? null : (int) ((System.nanoTime() - (Long) start) / 1_000_000L);
        accessLog.record(Actor.of(req), "API", req.getMethod(), path, res.getStatus(),
                req.getRemoteAddr(), req.getHeader("User-Agent"), ms, null);
    }

    static boolean skip(String method, String path) {
        if (path == null || path.startsWith("/auth/")) {
            return true;
        }
        String last = path.substring(path.lastIndexOf('/') + 1);
        if (last.indexOf('.') >= 0) {
            return true;                                   // 정적 파일
        }
        return "GET".equals(method) && path.endsWith("/status");   // 폴링
    }
}
