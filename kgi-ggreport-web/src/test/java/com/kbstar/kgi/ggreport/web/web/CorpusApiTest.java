package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 코퍼스 검사·등록 API — Task 5B.5.
 * {@code POST /institutions/{id}/corpus/validate} · {@code POST /institutions/{id}/corpus}.
 *
 * <p>여기서 지키는 것은 셋이다 — <b>경로 탈출 방어</b>, <b>검사는 200 / 등록은 422</b>,
 * 그리고 등록의 부수효과인 <b>밀린 입찰건 활성화</b>.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class CorpusApiTest {

    @Autowired
    private MockMvc mockMvc;

    private final ObjectMapper json = new ObjectMapper();

    private String institutionId;

    /**
     * ⚠️ <b>기동 디렉터리(= {@code repo-root} 기본값 {@code "."})는 테스트에서 모듈
     * 폴더다</b>(Maven 이 모듈에서 돈다). 그래서 리포의 실제 {@code corpus/} 를 쓰면
     * 경로가 안 맞아 전부 400 이 된다 — 처음에 그렇게 짰다가 걸렸다.
     *
     * <p>대신 {@code target/} 아래에 코퍼스를 <b>직접 만들어</b> 쓴다. 리포 내용에
     * 기대지 않으므로 어느 체크아웃에서도 같은 결과가 나오고, 실제 코퍼스를 고쳐도
     * 이 테스트가 깨지지 않는다.
     */
    private static final String OK_DIR = "target/corpus-api-test/ok";
    private static final String BROKEN_DIR = "target/corpus-api-test/broken";

    @Before
    public void 기관과_코퍼스를_준비한다() throws Exception {
        MockHttpServletResponse res = mockMvc.perform(post("/institutions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name_ko\":\"코퍼스구청\"}"))
                .andReturn().getResponse();
        res.setCharacterEncoding("UTF-8");
        institutionId = json.readTree(res.getContentAsString()).path("institution_id").asText();

        makeValidCorpus(Paths.get(OK_DIR));
        Files.createDirectories(Paths.get(BROKEN_DIR));  // spec/plan 이 없어 규격 위반이다
    }

    /** {@code CorpusValidatorTest} 의 최소 규격 코퍼스와 같은 구성. */
    private static void makeValidCorpus(Path root) throws IOException {
        Files.createDirectories(root.resolve("spec"));
        Files.createDirectories(root.resolve("plan"));

        write(root, "spec/00_인덱스.txt", "총 8건 확인함");
        write(root, "spec/01_사업목록.txt", "내용");
        write(root, "spec/02_예산.txt", "내용");
        write(root, "spec/03_홈페이지검색확인결과.txt", "확인됨");
        write(root, "spec/04_민원게시판_2026년정리.txt", "내용");
        write(root, "spec/05_기타.txt", "내용");
        write(root, "spec/06_기타2.txt", "내용");
        write(root, "spec/07_기타3.txt", "내용");

        write(root, "plan/00_제안개요.txt", "내용");
        write(root, "plan/01_요약표.txt", "IT-1 FN-1");
        write(root, "plan/02_IT.txt", "내용");
        write(root, "plan/03_금전.txt", "내용");
        write(root, "plan/04_로드맵.txt", "내용");
        write(root, "plan/05_검증결과.txt", "신뢰도 74/100");

        write(root, "bank_ideas_draft.txt",
                "연계 구청사업/근거: spec/01\n구체적 상품/협력 형태: 대출\n은행 기대효과: 수익\n");
    }

    private static void write(Path root, String rel, String text) throws IOException {
        Files.write(root.resolve(rel), text.getBytes(StandardCharsets.UTF_8));
    }

    private MockHttpServletResponse call(String suffix, String path) throws Exception {
        MockHttpServletResponse res = mockMvc.perform(
                        post("/institutions/" + institutionId + "/corpus" + suffix)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"path\":\"" + path + "\"}"))
                .andReturn().getResponse();
        res.setCharacterEncoding("UTF-8");
        return res;
    }

    // ── 경로 방어 ─────────────────────────────────────────────────────

    /**
     * ⚠️ <b>이 테스트가 이 클래스의 이유다.</b> 이 API 는 사용자가 준 문자열을 그대로
     * 파일시스템에 대는 몇 안 되는 자리다. 문자열만 보고 통과시키면
     * {@code corpus/../../etc} 가 빠져나간다 — 정규화한 <b>뒤에</b> 울타리를 봐야 한다.
     */
    @Test
    public void 리포_밖으로_빠져나가는_경로는_400이다() throws Exception {
        assertEquals(400, call("/validate", "../../etc").getStatus());
        assertEquals(400, call("/validate", "corpus/../../..").getStatus());
        assertEquals(400, call("", "../..").getStatus());
    }

    @Test
    public void 절대경로는_400이다() throws Exception {
        assertEquals(400, call("/validate", "/etc").getStatus());
        assertEquals(400, call("/validate", "C:/Windows").getStatus());
    }

    @Test
    public void 디렉터리가_아니면_400이다() throws Exception {
        assertEquals(400, call("/validate", "pom.xml").getStatus());
    }

    @Test
    public void 빈_경로는_400이다() throws Exception {
        assertEquals(400, call("/validate", "").getStatus());
    }

    // ── 없는 기관 ─────────────────────────────────────────────────────

    /** ⚠️ 기관 확인이 <b>경로 검사보다 먼저다</b> — 원본과 같은 순서다. */
    @Test
    public void 없는_기관이면_404다() throws Exception {
        MockHttpServletResponse res = mockMvc.perform(
                        post("/institutions/new-deadbeef/corpus/validate")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"path\":\"corpus\"}"))
                .andReturn().getResponse();
        res.setCharacterEncoding("UTF-8");

        assertEquals(404, res.getStatus());
        assertEquals("institution not found",
                json.readTree(res.getContentAsString()).path("detail").asText());
    }

    // ── 검사 vs 등록 ──────────────────────────────────────────────────

    /**
     * ⚠️ <b>검사는 오류가 있어도 200 이다.</b> 사람이 고칠 목록을 받아 보는 화면이
     * 소비하므로, 여기서 4xx 를 내면 화면이 목록 대신 오류 배너를 띄운다.
     */
    @Test
    public void 규격에_안_맞아도_검사는_200이고_ok_false다() throws Exception {
        MockHttpServletResponse res = call("/validate", BROKEN_DIR);

        assertEquals(200, res.getStatus());
        JsonNode body = json.readTree(res.getContentAsString());
        assertTrue("ok 가 false 여야 한다", !body.path("ok").asBoolean());
        assertTrue("무엇이 틀렸는지 목록이 있어야 한다", body.path("errors").size() > 0);
        assertTrue("규칙 번호가 실려야 한다", body.path("errors").get(0).path("rule").asInt() > 0);
    }

    /** ⚠️ <b>등록은 같은 입력에서 422 다.</b> 검사와 갈리는 지점이 정확히 여기다. */
    @Test
    public void 규격에_안_맞으면_등록은_422다() throws Exception {
        MockHttpServletResponse res = call("", BROKEN_DIR);

        assertEquals(422, res.getStatus());
        JsonNode detail = json.readTree(res.getContentAsString()).path("detail");
        assertTrue("본문이 {\"detail\": {\"errors\": [...]}} 모양이어야 한다",
                detail.path("errors").isArray() && detail.path("errors").size() > 0);
    }

    // ── 실제 코퍼스로 등록 ────────────────────────────────────────────

    /**
     * 규격을 지킨 코퍼스를 등록하면 <b>상대경로가 저장된다</b> — 절대경로를 넣으면
     * 환경이 바뀔 때 전부 깨진다.
     *
     * <p>{@code activated_bid_cases} 는 비어 있는 것이 정상이다(이 기관에는 밀린 건이
     * 없다). 키가 <b>있다는 것</b>이 계약이라 존재만 확인한다 — 화면이 "작업이
     * 생겼습니다"를 안내하는 근거다.
     */
    @Test
    public void 규격을_지킨_코퍼스는_등록되고_상대경로가_저장된다() throws Exception {
        MockHttpServletResponse res = call("", OK_DIR);
        assertEquals(res.getContentAsString(), 200, res.getStatus());

        JsonNode body = json.readTree(res.getContentAsString());
        assertEquals(OK_DIR, body.path("giganlist_dir").asText());
        assertTrue("밀린 건이 없으면 빈 배열이 정상이다", body.path("activated_bid_cases").isArray());

        MockHttpServletResponse after = mockMvc.perform(
                        org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                                .get("/institutions/" + institutionId))
                .andReturn().getResponse();
        after.setCharacterEncoding("UTF-8");
        assertEquals("기관에 실제로 붙어야 한다", OK_DIR,
                json.readTree(after.getContentAsString()).path("giganlist_dir").asText());
    }

    /** 검사는 통과해도 아무것도 바뀌지 않는다 — 등록과 갈리는 나머지 절반이다. */
    @Test
    public void 검사는_통과해도_기관을_바꾸지_않는다() throws Exception {
        MockHttpServletResponse res = call("/validate", OK_DIR);
        assertEquals(200, res.getStatus());
        assertTrue(json.readTree(res.getContentAsString()).path("ok").asBoolean());

        MockHttpServletResponse after = mockMvc.perform(
                        org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                                .get("/institutions/" + institutionId))
                .andReturn().getResponse();
        after.setCharacterEncoding("UTF-8");
        assertTrue("검사만 했는데 경로가 붙으면 안 된다",
                json.readTree(after.getContentAsString()).path("giganlist_dir").isNull()
                        || json.readTree(after.getContentAsString()).path("giganlist_dir").isMissingNode());
    }
}
