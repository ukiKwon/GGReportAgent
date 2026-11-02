package com.kbstar.kgi.ggreport.web.config;

import com.kbstar.kgi.ggreport.web.service.AccessLogService;
import com.kbstar.kgi.ggreport.web.web.Actor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartHttpServletRequest;

import javax.servlet.*;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

/**
 * 작성 경로 전용 본문 크기 사전 차단 — multipart 해석(전역 50MB)·JSON 파싱 <b>전에</b> Content-Length 로 413.
 * 엑셀: 한도(5MB)+여유 1MB, 초안 JSON: 256KB. 길이가 없으면(chunked) 411 LENGTH_REQUIRED.
 * 경로는 MVC 가 매칭하는 모양으로 정규화해서 본다({@link #normalize}) — 세그먼트마다 ';' 뒤(경로 매개변수)를 버리고
 * %XX 를 한 번 푼다. 끝 '/'·중간 빈 세그먼트·대소문자 차이·앞의 context path 는 모두 같은 경로로 친다
 * (넓게 잡는 쪽이 안전하다 — 넓게 잡혀도 크기 한도만 걸릴 뿐 기능은 같다).
 * ⚠️ 이미 해석된 MultipartHttpServletRequest(MockMvc 전용 — 실제 컨테이너에선 이 시점에 없다)는 통과시킨다.
 * ⚠️ getParameter 를 부르지 않는다(부르면 컨테이너가 본문을 해석한다). 응답에 Connection: close 를 붙여 남은 본문을 읽지 않는다.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class BoardWriteLimitFilter implements Filter {

    static final long MB = 1024L * 1024;
    static final long SLACK = MB;
    static final long DRAFT_MAX = 256L * 1024;
    private static final Pattern EXCEL = Pattern.compile("(?:^|/)board-forms/.+/excel/*$", Pattern.CASE_INSENSITIVE);
    private static final Pattern DRAFT = Pattern.compile("(?:^|/)board-forms/.+/draft-docx/*$", Pattern.CASE_INSENSITIVE);

    private final AccessLogService accessLog;
    private final int maxMb;

    public BoardWriteLimitFilter(AccessLogService accessLog, @Value("${ggreport.board-write.max-mb:5}") int maxMb) {
        this.accessLog = accessLog;
        this.maxMb = maxMb;
    }

    @Override
    public void init(FilterConfig filterConfig) {
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        if (!(request instanceof HttpServletRequest) || request instanceof MultipartHttpServletRequest
                || !"POST".equalsIgnoreCase(((HttpServletRequest) request).getMethod())) {
            chain.doFilter(request, response);
            return;
        }
        HttpServletRequest req = (HttpServletRequest) request;
        String path = normalize(req.getRequestURI());
        boolean excel = EXCEL.matcher(path).find();
        long limit = excel ? maxMb * MB + SLACK : DRAFT.matcher(path).find() ? DRAFT_MAX : -1;
        long len = req.getContentLengthLong();
        if (limit < 0 || (len >= 0 && len <= limit)) {
            chain.doFilter(request, response);
            return;
        }
        int status = len < 0 ? 411 : 413;
        String code = len < 0 ? "LENGTH_REQUIRED" : excel ? "FILE_TOO_LARGE" : "BODY_TOO_LARGE";
        String extra = excel ? ",\"max_mb\":" + maxMb : ",\"max_kb\":" + (DRAFT_MAX / 1024);
        HttpServletResponse res = (HttpServletResponse) response;
        res.setStatus(status);
        res.setHeader("Connection", "close");
        res.setContentType("application/json;charset=UTF-8");
        res.getOutputStream().write(("{\"detail\":{\"code\":\"" + code + "\"" + extra + "}}")
                .getBytes(StandardCharsets.UTF_8));
        accessLog.record(Actor.of(req), "API", req.getMethod(), req.getRequestURI(), status,
                req.getRemoteAddr(), req.getHeader("User-Agent"), null,
                "board-write code=" + code + " size=" + len);
    }

    /**
     * 원시 요청 URI → 비교용 경로. 세그먼트마다 ';' 이후를 버리고(MVC 의 경로 매개변수 제거와 같은 순서) %XX 를 한 번 푼다.
     * 잘못된 %XX 는 글자 그대로 둔다(예외 없음). 결과는 비교에만 쓰고 응답·이력에는 싣지 않는다.
     */
    static String normalize(String rawUri) {
        if (rawUri == null) {
            return "";
        }
        String[] segs = rawUri.split("/", -1);
        StringBuilder out = new StringBuilder(rawUri.length());
        for (int i = 0; i < segs.length; i++) {
            String s = segs[i];
            int semi = s.indexOf(';');
            if (semi >= 0) {
                s = s.substring(0, semi);
            }
            if (i > 0) {
                out.append('/');
            }
            out.append(decode(s));
        }
        return out.toString();
    }

    private static String decode(String s) {
        if (s.indexOf('%') < 0) {
            return s;
        }
        ByteArrayOutputStream b = new ByteArrayOutputStream(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            int hi = c == '%' && i + 2 < s.length() ? Character.digit(s.charAt(i + 1), 16) : -1;
            int lo = hi >= 0 ? Character.digit(s.charAt(i + 2), 16) : -1;
            if (lo >= 0) {
                b.write((hi << 4) | lo);
                i += 2;
            } else {
                byte[] raw = String.valueOf(c).getBytes(StandardCharsets.UTF_8);
                b.write(raw, 0, raw.length);
            }
        }
        return new String(b.toByteArray(), StandardCharsets.UTF_8);
    }

    @Override
    public void destroy() {
    }
}
