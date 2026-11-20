package com.kbstar.kgi.ggreport.web.config;

import com.kbstar.kgi.ggreport.web.service.AccessLogService;
import com.kbstar.kgi.ggreport.web.web.Actor;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartHttpServletRequest;

import javax.servlet.Filter;
import javax.servlet.FilterChain;
import javax.servlet.FilterConfig;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

/**
 * 이사회 회의록(047) 경로 전용 — ① 모든 회의록 응답(오류 포함)에 {@code Cache-Control: no-store}, ② 쓰기 본문 크기 사전 차단(multipart 해석·JSON 파싱 <b>전에</b> Content-Length 로 413).
 * 업로드·미리보기(POST /board-materials/{mid}/minutes[/preview]): 파일 3개 한도 + 여유 1MB(기본 2MB×3+1MB = 7MB, 래퍼 없이 통과 — multipart 는 컨테이너가 해석),
 * 수정 PUT(utterances·items): 128KB, 그 밖의 작은 쓰기(meta·done·scope·delete): 16KB. 길이가 없으면(chunked) 411 LENGTH_REQUIRED.
 * JSON 경로는 헤더만 믿지 않고 실제로 읽은 바이트도 센다({@link BoardWriteLimitFilter.CountingRequest}).
 * 경로 정규화·카운팅 래퍼는 {@link BoardWriteLimitFilter} 것을 그대로 쓴다(같은 패키지 — 그 필터는 고치지 않는다).
 * 기능이 꺼져 있으면(enabled=false) 크기 검사를 하지 않고 통과시킨다(컨트롤러가 404). 이미 해석된 MultipartHttpServletRequest(MockMvc 전용)는 통과.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 2)
public class MinutesLimitFilter implements Filter {

    static final long MB = 1024L * 1024;
    static final long EDIT_MAX = 128L * 1024;
    static final long SMALL_MAX = 16L * 1024;

    private static final Pattern ANY = Pattern.compile(
            "(?:^|/)(?:board-minutes(?:/|$)|board-materials/+[^/]+/+minutes(?:/|$))", Pattern.CASE_INSENSITIVE);
    private static final Pattern UPLOAD = Pattern.compile(
            "(?:^|/)board-materials/+[^/]+/+minutes(?:/+preview)?/*$", Pattern.CASE_INSENSITIVE);
    private static final Pattern EDIT = Pattern.compile(
            "(?:^|/)board-minutes/+[^/]+/+(?:utterances|items)/+[^/]+/*$", Pattern.CASE_INSENSITIVE);
    private static final Pattern SMALL = Pattern.compile(
            "(?:^|/)board-minutes/+[^/]+/+(?:meta|speakers/+[^/]+|items/+[^/]+/+done|scope/+(?:add|remove)|delete)/*$", Pattern.CASE_INSENSITIVE);

    private final AccessLogService accessLog;
    private final MinutesSettings settings;

    public MinutesLimitFilter(AccessLogService accessLog, MinutesSettings settings) {
        this.accessLog = accessLog;
        this.settings = settings;
    }

    @Override
    public void init(FilterConfig filterConfig) {
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        if (!(request instanceof HttpServletRequest) || !(response instanceof HttpServletResponse)) {
            chain.doFilter(request, response);
            return;
        }
        HttpServletRequest req = (HttpServletRequest) request;
        HttpServletResponse res = (HttpServletResponse) response;
        String path = BoardWriteLimitFilter.normalize(req.getRequestURI());
        if (ANY.matcher(path).find()) {
            res.setHeader("Cache-Control", "no-store");   // 오류 응답 포함 — 본문이 프록시·브라우저에 남지 않게
        } else {
            chain.doFilter(request, response);
            return;
        }
        boolean post = "POST".equalsIgnoreCase(req.getMethod());
        boolean put = "PUT".equalsIgnoreCase(req.getMethod());
        if (request instanceof MultipartHttpServletRequest || !settings.isEnabled() || (!post && !put)) {
            chain.doFilter(request, response);
            return;
        }
        boolean upload = post && UPLOAD.matcher(path).find();
        long limit = upload ? 3 * settings.getMaxFileBytes() + MB
                : put && EDIT.matcher(path).find() ? EDIT_MAX
                : SMALL.matcher(path).find() ? SMALL_MAX : -1;
        if (limit < 0) {
            chain.doFilter(request, response);
            return;
        }
        long len = req.getContentLengthLong();
        if (len >= 0 && len <= limit) {
            // JSON 경로는 헤더 값을 믿지 않고 실제로 읽은 바이트도 센다. 업로드는 컨테이너가 multipart 로 해석하므로 래퍼 없이 통과.
            chain.doFilter(upload ? request : new BoardWriteLimitFilter.CountingRequest(req, limit), response);
            return;
        }
        int status = len < 0 ? 411 : 413;
        String code = len < 0 ? "LENGTH_REQUIRED" : upload ? "FILE_TOO_LARGE" : "BODY_TOO_LARGE";
        // message 는 고정 문구 + 설정 숫자뿐 — 따옴표·역슬래시를 넣지 않는다(이스케이프 없이 직접 조립한다).
        String message = len < 0 ? "요청 본문의 길이를 알 수 없어 처리하지 않았습니다. 다시 시도해 주세요."
                : upload ? "파일이 너무 큽니다. 파일 하나당 " + (settings.getMaxFileBytes() / MB) + "MB 이하만 올릴 수 있습니다."
                : "요청 내용이 너무 큽니다. " + (limit / 1024) + "KB 이하로 줄여 주세요.";
        res.setStatus(status);
        res.setHeader("Connection", "close");
        res.setContentType("application/json;charset=UTF-8");
        res.getOutputStream().write(("{\"detail\":{\"code\":\"" + code + "\",\"message\":\"" + message + "\"}}")
                .getBytes(StandardCharsets.UTF_8));
        accessLog.record(Actor.of(req), "API", req.getMethod(),
                StaticCacheFilter.stripContext(req.getRequestURI(), req.getContextPath()), status,
                req.getRemoteAddr(), req.getHeader("User-Agent"), null,
                "minutes-write code=" + code + " size=" + len);
    }

    @Override
    public void destroy() {
    }
}
