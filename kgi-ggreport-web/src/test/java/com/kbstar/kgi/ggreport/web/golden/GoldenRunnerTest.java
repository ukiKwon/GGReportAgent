package com.kbstar.kgi.ggreport.web.golden;

import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * 러너가 <b>통과시켜야 할 것은 통과시키고 잡아야 할 것은 잡는지</b> 확인한다.
 *
 * <p>진짜 컨트롤러는 단계 2에서 생기므로, 여기서는 스텁 컨트롤러를 standalone MockMvc 로
 * 세워 러너 자체를 검증한다. <b>이 검증이 없으면 단계 2에서 "테스트가 통과했다"가
 * "러너가 아무것도 안 봤다"와 구분되지 않는다.</b>
 */
public class GoldenRunnerTest {

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private GoldenRunner runner;

    @RestController
    static class StubController {

        @GetMapping("/stub/ok")
        public Map<String, Object> ok() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", "도봉구");                       // 한글 인코딩 확인용
            m.put("id", "bc-1a2b3c4d");                   // 랜덤 id — <ID> 로 정규화돼야 한다
            m.put("at", "2026-08-26T14:30:00");           // 타임스탬프 — <TS> 로
            m.put("count", 3);
            return m;
        }

        /** 키 순서만 다르고 값은 같다 — 통과해야 한다. */
        @GetMapping("/stub/reordered")
        public Map<String, Object> reordered() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("count", 3);
            m.put("at", "2026-08-26T14:30:00");
            m.put("id", "bc-1a2b3c4d");
            m.put("name", "도봉구");
            return m;
        }

        /** 값 하나가 다르다 — 잡아야 한다. */
        @GetMapping("/stub/wrong-value")
        public Map<String, Object> wrongValue() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", "노원구");
            m.put("id", "bc-1a2b3c4d");
            m.put("at", "2026-08-26T14:30:00");
            m.put("count", 3);
            return m;
        }

        @GetMapping("/stub/not-found")
        public ResponseEntity<Map<String, Object>> notFound() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("detail", "institution not found");
            return ResponseEntity.status(404).body(m);
        }

        @GetMapping(value = "/stub/plain", produces = MediaType.TEXT_PLAIN_VALUE)
        public String plain() {
            return "not json at all";
        }

        @PostMapping("/stub/echo")
        public Map<String, Object> echo(@RequestBody Map<String, Object> in) {
            return in;
        }

        /** 받은 X-User-Id 를 되돌려준다 — 헤더가 실제로 전달되는지 보는 용도. */
        @GetMapping("/stub/whoami")
        public Map<String, Object> whoami(
                @org.springframework.web.bind.annotation.RequestHeader(
                        value = "X-User-Id", required = false) String userId) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("user", userId == null ? "(없음)" : userId);
            return m;
        }
    }

    @Before
    public void setUp() {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new StubController()).build();
        runner = new GoldenRunner(mvc);
    }

    @Test
    public void 값이_같으면_통과한다() throws Exception {
        GoldenSnapshot s = snapshot("ok", "GET", "/stub/ok", 200,
                "{\"name\":\"도봉구\",\"id\":\"bc-<ID>\",\"at\":\"<TS>\",\"count\":3}", null);
        GoldenRunner.Result r = runner.run(s);
        assertTrue("정상 응답을 실패로 판정했다: " + r.failure(), r.passed());
    }

    @Test
    public void 객체_키_순서가_달라도_통과한다() throws Exception {
        // Python(pydantic 필드 순서)과 Java(POJO 필드 순서)가 다르다는 이유로
        // 실패하면 잡아야 할 진짜 차이가 소음에 묻힌다.
        GoldenSnapshot s = snapshot("reordered", "GET", "/stub/reordered", 200,
                "{\"name\":\"도봉구\",\"id\":\"bc-<ID>\",\"at\":\"<TS>\",\"count\":3}", null);
        assertTrue(runner.run(s).passed());
    }

    @Test
    public void 값이_다르면_잡고_어디가_다른지_알려준다() throws Exception {
        GoldenSnapshot s = snapshot("wrong", "GET", "/stub/wrong-value", 200,
                "{\"name\":\"도봉구\",\"id\":\"bc-<ID>\",\"at\":\"<TS>\",\"count\":3}", null);
        GoldenRunner.Result r = runner.run(s);
        assertFalse("차이를 못 잡았다", r.passed());
        assertTrue("어느 필드인지 안 알려준다: " + r.failure(), r.failure().contains("/name"));
        assertTrue("기대값이 안 보인다: " + r.failure(), r.failure().contains("도봉구"));
        assertTrue("실제값이 안 보인다: " + r.failure(), r.failure().contains("노원구"));
    }

    @Test
    public void 한글이_깨지지_않는다() throws Exception {
        // 인코딩을 놓치면 모든 한글 필드가 통째로 불일치가 돼 진단이 불가능해진다.
        GoldenSnapshot s = snapshot("ko", "GET", "/stub/ok", 200,
                "{\"name\":\"틀린이름\",\"id\":\"bc-<ID>\",\"at\":\"<TS>\",\"count\":3}", null);
        GoldenRunner.Result r = runner.run(s);
        assertFalse(r.passed());
        assertTrue("응답의 한글이 깨졌다: " + r.failure(), r.failure().contains("도봉구"));
    }

    @Test
    public void 상태코드가_다르면_잡는다() throws Exception {
        GoldenSnapshot s = snapshot("status", "GET", "/stub/not-found", 200,
                "{\"detail\":\"institution not found\"}", null);
        GoldenRunner.Result r = runner.run(s);
        assertFalse(r.passed());
        assertTrue(r.failure(), r.failure().contains("HTTP 상태"));
    }

    @Test
    public void 오류_응답도_그대로_대조한다() throws Exception {
        GoldenSnapshot s = snapshot("404", "GET", "/stub/not-found", 404,
                "{\"detail\":\"institution not found\"}", null);
        assertTrue(runner.run(s).failure(), runner.run(s).passed());
    }

    @Test
    public void JSON이_아니면_실패로_보고한다() throws Exception {
        GoldenSnapshot s = snapshot("plain", "GET", "/stub/plain", 200, "{}", null);
        GoldenRunner.Result r = runner.run(s);
        assertFalse(r.passed());
        assertTrue("JSON 이 아니라는 사실이 드러나야 한다: " + r.failure(),
                r.failure().contains("JSON"));
    }

    @Test
    public void 요청_헤더를_실어_보낸다() throws Exception {
        // ⚠️ 결재 시나리오(15~24번) 10건이 X-User-Id 로 행위자를 정한다.
        //    헤더가 빠지면 요청은 성공하지만 다른 사람이 한 것으로 기록돼
        //    assignee/approver 가 어긋난다 — 원인을 찾기 어려운 실패다.
        String json = "{\"request\":{\"method\":\"GET\",\"url\":\"/stub/whoami\","
                + "\"headers\":{\"X-User-Id\":\"dave\"}},"
                + "\"status\":200,\"body\":{\"user\":\"dave\"}}";
        File f = tmp.newFile("hdr.json");
        Files.write(f.toPath(), json.getBytes(StandardCharsets.UTF_8));
        GoldenSnapshot s = GoldenSnapshot.load(f.toPath());

        assertEquals("dave", s.headers().get("X-User-Id"));
        GoldenRunner.Result r = runner.run(s);
        assertTrue("헤더가 전달되지 않았다: " + r.failure(), r.passed());
    }

    @Test
    public void 실제_골든의_결재_스냅샷이_헤더를_들고_있다() {
        // 로더가 headers 를 흘리면 여기서 걸린다.
        int withUser = 0;
        for (GoldenSnapshot s : GoldenSnapshot.loadAll()) {
            if (s.headers().containsKey("X-User-Id")) {
                withUser++;
            }
        }
        assertEquals("X-User-Id 를 가진 골든 스냅샷 수가 다르다", 10, withUser);
    }

    @Test
    public void 요청_본문을_실어_보낸다() throws Exception {
        // 결재 시나리오(10~24번)가 전부 POST 라 이게 안 되면 단계 2 후반이 통째로 막힌다.
        GoldenSnapshot s = snapshot("echo", "POST", "/stub/echo", 200,
                "{\"choice\":\"참여\",\"by\":\"alice\"}",
                "{\"choice\":\"참여\",\"by\":\"alice\"}");
        GoldenRunner.Result r = runner.run(s);
        assertTrue("요청 본문이 전달되지 않았다: " + r.failure(), r.passed());
    }

    @Test
    public void 배열_길이가_다르면_잡는다() {
        com.fasterxml.jackson.databind.node.ArrayNode exp =
                com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode();
        exp.add(1).add(2).add(3);
        com.fasterxml.jackson.databind.node.ArrayNode act =
                com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode();
        act.add(1).add(2);
        String d = GoldenComparator.describe("t", exp, act);
        assertNotNull(d);
        assertTrue(d, d.contains("배열 길이"));
    }

    @Test
    public void 배열_순서가_다르면_잡는다() {
        // 목록 API 의 정렬은 화면에 그대로 보이는 계약이다 — 순서는 비교해야 한다.
        com.fasterxml.jackson.databind.node.ArrayNode exp =
                com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode();
        exp.add("dobong").add("nowon");
        com.fasterxml.jackson.databind.node.ArrayNode act =
                com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode();
        act.add("nowon").add("dobong");
        assertNotNull(GoldenComparator.describe("t", exp, act));
    }

    /** 임시 파일에 골든 형식으로 써서 로더를 거쳐 만든다 — 실제 경로와 같은 코드를 탄다. */
    private GoldenSnapshot snapshot(String name, String method, String url, int status,
                                    String bodyJson, String requestBodyJson) throws Exception {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"request\":{\"method\":\"").append(method)
          .append("\",\"url\":\"").append(url).append('"');
        if (requestBodyJson != null) {
            sb.append(",\"body\":").append(requestBodyJson);
        }
        sb.append("},\"status\":").append(status)
          .append(",\"body\":").append(bodyJson).append('}');

        File f = tmp.newFile(name + ".json");
        Files.write(f.toPath(), sb.toString().getBytes(StandardCharsets.UTF_8));
        return GoldenSnapshot.load(f.toPath());
    }
}
