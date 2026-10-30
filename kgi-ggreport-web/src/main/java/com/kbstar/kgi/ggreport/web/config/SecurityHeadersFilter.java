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
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

/**
 * 모든 응답(API·정적 파일·오류)에 보안 헤더 3개를 붙인다.
 *
 * <ul>
 *   <li>{@code X-Content-Type-Options: nosniff} — 브라우저가 타입을 추측해 업로드 파일을 스크립트로 실행하는 것을 막는다.</li>
 *   <li>{@code X-Frame-Options: SAMEORIGIN} — 다른 출처 페이지의 iframe 삽입(클릭재킹)을 막는다.</li>
 *   <li>{@code Referrer-Policy: same-origin} — 같은 출처 이동에만 Referer 를 보낸다. {@code no-referrer} 보다
 *       내부 이동 분석·디버깅이 가능하고, 폐쇄망이라 외부로 새는 값은 어차피 없다.</li>
 * </ul>
 *
 * <p>⚠️ CSP 는 일부러 넣지 않았다 — 화면에 인라인 스크립트가 있어 지금 넣으면 화면이 멈춘다.
 * <p>⚠️ WebLogic(Servlet 3.1) 이식을 위해 {@code init}/{@code destroy} 를 직접 구현한다(Servlet 4 의 default 메서드에 기대지 않는다).
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class SecurityHeadersFilter implements Filter {

    @Override
    public void init(FilterConfig filterConfig) {
    }

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {
        if (res instanceof HttpServletResponse) {
            HttpServletResponse r = (HttpServletResponse) res;
            r.setHeader("X-Content-Type-Options", "nosniff");
            r.setHeader("X-Frame-Options", "SAMEORIGIN");
            r.setHeader("Referrer-Policy", "same-origin");
        }
        chain.doFilter(req, res);
    }

    @Override
    public void destroy() {
    }
}
