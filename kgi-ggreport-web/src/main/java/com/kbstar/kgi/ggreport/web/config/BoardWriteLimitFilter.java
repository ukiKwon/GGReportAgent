package com.kbstar.kgi.ggreport.web.config;

import com.kbstar.kgi.ggreport.web.service.AccessLogService;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartHttpServletRequest;

import javax.servlet.*;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletRequestWrapper;
import javax.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

/**
 * 작성 경로 전용 본문 크기 사전 차단 — multipart 해석(전역 50MB)·JSON 파싱 <b>전에</b> Content-Length 로 413.
 * 엑셀: 한도(5MB)+여유 1MB, 초안 JSON: 256KB, 양식 저장 PUT /board-forms/{id}: 512KB, 양식 복제 POST /board-forms/copy: 16KB.
 * 길이가 없으면(chunked) 411 LENGTH_REQUIRED. JSON 경로는 헤더만 믿지 않고 <b>실제로 읽은 바이트</b>도 센다({@link CountingRequest}).
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
    /** POST /board-forms/copy — 이름·원본 번호뿐이라 16KB 면 넉넉하다. */
    static final long COPY_MAX = 16L * 1024;
    /** PUT /board-forms/{id} — 양식 저장(구조 편집 포함)의 정상 상한은 수십 KB. 512KB 초과는 비정상. 중간 빈 세그먼트('//')도 같은 경로로 친다. */
    static final long SAVE_MAX = 512L * 1024;
    private static final Pattern COPY = Pattern.compile("(?:^|/)board-forms/+copy/*$", Pattern.CASE_INSENSITIVE);
    private static final Pattern SAVE = Pattern.compile("(?:^|/)board-forms/+[^/]+/*$", Pattern.CASE_INSENSITIVE);

    private final AccessLogService accessLog;
    private final int maxMb;

    public BoardWriteLimitFilter(AccessLogService accessLog, @Value("${ggreport.board-write.max-mb:5}") int maxMb) {
        this.accessLog = accessLog;
        this.maxMb = maxMb;
    }

    /** 엑셀 업로드 경로인가 — 전역 413 처리기가 작성 모드 한도로 문구를 맞추는 데 쓴다. */
    public static boolean isExcelUpload(HttpServletRequest req) {
        return "POST".equalsIgnoreCase(req.getMethod()) && EXCEL.matcher(normalize(req.getRequestURI())).find();
    }

    @Override
    public void init(FilterConfig filterConfig) {
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        if (!(request instanceof HttpServletRequest) || request instanceof MultipartHttpServletRequest) {
            chain.doFilter(request, response);
            return;
        }
        HttpServletRequest req = (HttpServletRequest) request;
        boolean post = "POST".equalsIgnoreCase(req.getMethod());
        boolean put = "PUT".equalsIgnoreCase(req.getMethod());
        if (!post && !put) {
            chain.doFilter(request, response);
            return;
        }
        String path = normalize(req.getRequestURI());
        boolean excel = post && EXCEL.matcher(path).find();
        long limit = excel ? maxMb * MB + SLACK
                : post && DRAFT.matcher(path).find() ? DRAFT_MAX
                : post && COPY.matcher(path).find() ? COPY_MAX
                : put && SAVE.matcher(path).find() ? SAVE_MAX : -1;
        long len = req.getContentLengthLong();
        if (limit < 0 || (len >= 0 && len <= limit)) {
            // JSON 경로는 헤더 값을 믿지 않고 실제로 읽은 바이트도 센다(거짓 Content-Length·chunked 우회 방지).
            chain.doFilter(limit < 0 || excel ? request : new CountingRequest(req, limit), response);
            return;
        }
        int status = len < 0 ? 411 : 413;
        String code = len < 0 ? "LENGTH_REQUIRED" : excel ? "FILE_TOO_LARGE" : "BODY_TOO_LARGE";
        String extra = excel ? ",\"max_mb\":" + maxMb : ",\"max_kb\":" + (limit / 1024);
        // message 는 고정 문구 + 설정 숫자뿐 — 따옴표·역슬래시를 넣지 않는다(이스케이프 없이 직접 조립한다).
        String message = len < 0 ? "요청 본문의 길이를 알 수 없어 처리하지 않았습니다. 다시 시도해 주세요."
                : excel ? "파일이 너무 큽니다. " + maxMb + "MB 이하만 올릴 수 있습니다."
                : "요청 내용이 너무 큽니다. " + (limit / 1024) + "KB 이하로 줄여 주세요.";
        HttpServletResponse res = (HttpServletResponse) response;
        res.setStatus(status);
        res.setHeader("Connection", "close");
        res.setContentType("application/json;charset=UTF-8");
        res.getOutputStream().write(("{\"detail\":{\"code\":\"" + code + "\",\"message\":\"" + message + "\""
                + extra + "}}")
                .getBytes(StandardCharsets.UTF_8));
        accessLog.record(Actor.of(req), "API", req.getMethod(), req.getRequestURI(), status,
                req.getRemoteAddr(), req.getHeader("User-Agent"), null,
                "board-write code=" + code + " size=" + len);
    }

    /**
     * 실제로 읽은 바이트를 세는 요청 래퍼. 한도를 넘는 순간 413({@code BODY_TOO_LARGE}) ApiException 을 던져 읽기를 끊는다 —
     * Content-Length 가 없거나 거짓인 요청(chunked 포함)이 헤더 검사를 우회하지 못하게 한다.
     * 예외는 RuntimeException 이라 Jackson 을 그대로 통과해 전역/작성 오류 처리기가 같은 413 객체로 응답한다.
     */
    static final class CountingRequest extends HttpServletRequestWrapper {
        private final long limit;
        private ServletInputStream counted;

        CountingRequest(HttpServletRequest req, long limit) {
            super(req);
            this.limit = limit;
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            if (counted == null) {
                counted = new CountingStream(super.getInputStream(), limit);
            }
            return counted;
        }

        @Override
        public BufferedReader getReader() throws IOException {
            String enc = getCharacterEncoding();
            return new BufferedReader(new InputStreamReader(getInputStream(),
                    enc == null ? StandardCharsets.UTF_8.name() : enc));
        }
    }

    private static final class CountingStream extends ServletInputStream {
        private final ServletInputStream in;
        private final long limit;
        private long count;

        CountingStream(ServletInputStream in, long limit) {
            this.in = in;
            this.limit = limit;
        }

        private void add(long n) {
            if (n > 0) {
                count += n;
                if (count > limit) {
                    java.util.Map<String, Object> d = new java.util.LinkedHashMap<>();
                    d.put("code", "BODY_TOO_LARGE");
                    d.put("message", "요청 내용이 너무 큽니다. " + (limit / 1024) + "KB 이하로 줄여 주세요.");
                    d.put("max_kb", limit / 1024);
                    throw ApiException.withDetail(413, d);
                }
            }
        }

        @Override
        public int read() throws IOException {
            int b = in.read();
            if (b >= 0) {
                add(1);
            }
            return b;
        }

        @Override
        public int read(byte[] buf, int off, int len) throws IOException {
            int n = in.read(buf, off, len);
            add(n);
            return n;
        }

        @Override
        public boolean isFinished() { return in.isFinished(); }

        @Override
        public boolean isReady() { return in.isReady(); }

        @Override
        public void setReadListener(ReadListener listener) { in.setReadListener(listener); }
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
