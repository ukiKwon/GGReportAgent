package com.kbstar.kgi.ggreport.web.golden;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.io.UnsupportedEncodingException;
import java.net.URI;
import java.util.Map;

/**
 * 골든 스냅샷 한 건을 MockMvc 로 재생하고 결과를 대조한다.
 *
 * <p>단계 2부터 조회 컨트롤러가 생기면 이 러너에 스냅샷을 하나씩 물린다.
 * 단계 1 에서는 러너 자체가 옳게 도는지만 검증한다({@code GoldenRunnerTest}).
 *
 * <p>작업 디렉터리·리포 루트는 {@link #withPaths} 로 넣는다. 이관 시나리오가
 * 임시 디렉터리를 쓰기 시작하면 그 경로를 {@code <WORK>} 로 지워야 하기 때문이다.
 */
public final class GoldenRunner {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final MockMvc mockMvc;
    private final String workDir;
    private final String repoRoot;

    public GoldenRunner(MockMvc mockMvc) {
        this(mockMvc, null, GoldenSnapshot.repoRoot().toString());
    }

    private GoldenRunner(MockMvc mockMvc, String workDir, String repoRoot) {
        this.mockMvc = mockMvc;
        this.workDir = workDir;
        this.repoRoot = repoRoot;
    }

    public GoldenRunner withPaths(String workDir, String repoRoot) {
        return new GoldenRunner(this.mockMvc, workDir, repoRoot);
    }

    /**
     * 스냅샷을 재생하고 결과를 돌려준다. <b>스스로 예외를 던지지 않는다</b> —
     * 여러 건을 돌리며 실패를 모아 한 번에 보고할 수 있어야 하기 때문이다.
     */
    public Result run(GoldenSnapshot snapshot) throws Exception {
        MockHttpServletRequestBuilder req = build(snapshot);
        MockHttpServletResponse res = mockMvc.perform(req).andReturn().getResponse();

        String raw = readBody(res);
        JsonNode actual;
        try {
            actual = raw.isEmpty() ? MAPPER.nullNode() : MAPPER.readTree(raw);
        } catch (Exception parseFailure) {
            // JSON 이 아니면 그 사실 자체가 실패다 — 원문 일부를 남겨 진단할 수 있게 한다.
            return new Result(snapshot, res.getStatus(), null, null,
                    "응답이 JSON 이 아니다: "
                            + (raw.length() <= 300 ? raw : raw.substring(0, 300) + "…"));
        }
        JsonNode normalized = GoldenNormalizer.normalize(actual, workDir, repoRoot);

        if (res.getStatus() != snapshot.status()) {
            return new Result(snapshot, res.getStatus(), normalized, actual,
                    "HTTP 상태가 다르다. 기대 " + snapshot.status()
                            + " / 실제 " + res.getStatus());
        }
        String bodyDiff = GoldenComparator.describe(
                snapshot.name(), snapshot.body(), normalized);
        return new Result(snapshot, res.getStatus(), normalized, actual, bodyDiff);
    }

    private MockHttpServletRequestBuilder build(GoldenSnapshot s) throws Exception {
        // ⚠️ 반드시 URI 를 넘긴다. 문자열을 넘기면 MockMvc 가 그것을 **URI 템플릿**으로
        //    보고 한 번 더 인코딩한다 — 골든 URL 은 capture.py 가 이미 퍼센트 인코딩해
        //    저장했으므로 `%EC` 가 `%25EC` 가 되고, 서블릿이 한 번 디코드하면 파라미터에
        //    `%EC...` 라는 **문자 그대로의 문자열**이 들어온다. 증상은 인코딩 오류가
        //    아니라 "그런 파일 없음 404" 라서 원인을 컨트롤러에서 찾게 된다(골든 06).
        URI url = URI.create(s.url());
        MockHttpServletRequestBuilder req;
        switch (s.method()) {
            case "GET":    req = MockMvcRequestBuilders.get(url); break;
            case "POST":   req = MockMvcRequestBuilders.post(url); break;
            case "PUT":    req = MockMvcRequestBuilders.put(url); break;
            case "PATCH":  req = MockMvcRequestBuilders.patch(url); break;
            case "DELETE": req = MockMvcRequestBuilders.delete(url); break;
            default:
                throw new IllegalArgumentException(
                        "지원하지 않는 메서드: " + s.method() + " (" + s.name() + ")");
        }
        if (s.requestBody() != null && !s.requestBody().isNull()) {
            req = req.contentType(MediaType.APPLICATION_JSON)
                     .content(MAPPER.writeValueAsBytes(s.requestBody()));
        }
        // ⚠️ 결재 시나리오(15~24번)는 X-User-Id 로 행위자를 정한다. 이 헤더가 빠지면
        //    요청은 성공하지만 다른 사람이 한 것으로 기록돼 assignee/approver 가 어긋난다.
        for (Map.Entry<String, String> h : s.headers().entrySet()) {
            req = req.header(h.getKey(), h.getValue());
        }
        // ⚠️ Accept 를 강제하지 않는다. capture.py 는 Accept 를 지정하지 않았고,
        //    여기서 application/json 을 강요하면 JSON 이 아닌 응답을 내는 엔드포인트가
        //    실제 동작과 무관하게 406 을 받는다 — 골든과 다른 조건으로 재생하는 셈이다.
        return req;
    }

    private static String readBody(MockHttpServletResponse res)
            throws UnsupportedEncodingException {
        // ⚠️ 인코딩을 명시하지 않으면 한글이 깨져 비교가 통째로 어긋난다.
        res.setCharacterEncoding("UTF-8");
        return res.getContentAsString();
    }

    /** 한 건의 재생 결과. {@code failure} 가 null 이면 통과다. */
    public static final class Result {
        private final GoldenSnapshot snapshot;
        private final int status;
        private final JsonNode normalizedBody;
        private final JsonNode rawBody;
        private final String failure;

        Result(GoldenSnapshot snapshot, int status, JsonNode normalizedBody,
               JsonNode rawBody, String failure) {
            this.snapshot = snapshot;
            this.status = status;
            this.normalizedBody = normalizedBody;
            this.rawBody = rawBody;
            this.failure = failure;
        }

        public boolean passed()            { return failure == null; }
        public String failure()            { return failure; }
        public int status()                { return status; }
        public JsonNode normalizedBody()   { return normalizedBody; }
        public GoldenSnapshot snapshot()   { return snapshot; }

        /**
         * <b>정규화 전</b> 응답. 비교에는 쓰지 않는다 — 쓰기 시나리오가 다음 요청 URL 에
         * 끼울 <b>실제 id</b>(정규화하면 {@code bc-<ID>} 로 지워진다)를 꺼내는 용도다.
         * JSON 이 아니면 null.
         */
        public JsonNode rawBody()          { return rawBody; }
    }
}
