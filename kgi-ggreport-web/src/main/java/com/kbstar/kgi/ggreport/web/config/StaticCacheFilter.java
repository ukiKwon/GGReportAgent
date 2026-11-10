package com.kbstar.kgi.ggreport.web.config;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import javax.servlet.Filter;
import javax.servlet.FilterChain;
import javax.servlet.FilterConfig;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Locale;

/**
 * 화면 정적 파일의 캐시 정책. 배포 뒤 옛 JS 가 실행되는 것(NEXT 53, qa 2026-11-10 P2-1)을 막는다.
 * HTML·JS·CSS 는 no-cache(매번 재검증 — Last-Modified 로 304), 이미지·폰트는 5분.
 * 확장자 허용 목록만 대상이라 API 응답에는 붙지 않는다. GET/HEAD 만.
 * 상태(200/304/404)와 무관하게 요청 경로로 붙인다(404 가 캐시되는 것도 막는다).
 * WebLogic(Servlet 3.1) 이식: SecurityHeadersFilter 와 같이 init/destroy 를 직접 구현한다.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class StaticCacheFilter implements Filter {

    static final String REVALIDATE = "no-cache";
    static final String SHORT = "private, max-age=300";

    @Override
    public void init(FilterConfig c) {
    }

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {
        if (req instanceof HttpServletRequest && res instanceof HttpServletResponse) {
            HttpServletRequest rq = (HttpServletRequest) req;
            String m = rq.getMethod();
            if ("GET".equals(m) || "HEAD".equals(m)) {
                String policy = policyFor(rq.getRequestURI(), rq.getContextPath());
                if (policy != null) {
                    ((HttpServletResponse) res).setHeader("Cache-Control", policy);
                }
            }
        }
        chain.doFilter(req, res);
    }

    @Override
    public void destroy() {
    }

    /** 정책 문자열, 대상 아니면 null. 쿼리는 getRequestURI 에 없고 ;jsessionid 는 잘라낸다. */
    public static String policyFor(String uri, String ctx) {
        if (uri == null) {
            return null;
        }
        String p = uri;
        if (ctx != null && !ctx.isEmpty() && p.startsWith(ctx)) {
            p = p.substring(ctx.length());
        }
        int semi = p.indexOf(';');
        if (semi >= 0) {
            p = p.substring(0, semi);
        }
        if (p.isEmpty() || "/".equals(p)) {
            return REVALIDATE;          // 진입점
        }
        if (!isStaticPath(p)) {
            return null;           // API 경로(…/files/x.png 등)에는 붙이지 않는다 — 권한 회수 뒤 브라우저 캐시 잔존 방지(NEXT 70 D9)
        }
        int dot = p.lastIndexOf('.');
        if (dot < 0 || dot < p.lastIndexOf('/')) {
            return null;
        }
        switch (p.substring(dot + 1).toLowerCase(Locale.ROOT)) {
            case "html": case "htm": case "js": case "css": case "map":
                return REVALIDATE;
            case "png": case "jpg": case "jpeg": case "gif": case "svg": case "ico":
            case "woff": case "woff2": case "ttf":
                return SHORT;
            default:
                return null;
        }
    }

    /** 화면 정적 파일의 최상위 폴더. frontend/ 에 새 폴더를 만들면 여기도 더한다(StaticCacheApiTest 가 대조한다). */
    static final java.util.Set<String> STATIC_DIRS = new java.util.HashSet<String>(
            java.util.Arrays.asList("js", "css", "img", "geo", "data", "vendor", "fonts"));

    /** 컨텍스트 경로·세미콜론을 뗀 경로가 화면 정적 파일인가: 루트 직속 파일이거나 정적 폴더 아래. */
    public static boolean isStaticPath(String p) {
        if (p == null || !p.startsWith("/")) {
            return false;
        }
        int second = p.indexOf('/', 1);
        return second < 0 || STATIC_DIRS.contains(p.substring(1, second));
    }
}
