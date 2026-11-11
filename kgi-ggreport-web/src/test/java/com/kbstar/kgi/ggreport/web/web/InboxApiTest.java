package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
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
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 반입 배치 검사·반영 — Task 5B.5. {@code POST /inbox/{batch}/validate} · {@code /import}.
 *
 * <p>골든에 없는 경로라 <b>계약 테스트</b>로 고정한다. 여기서 지키는 것은 넷이다 —
 * <b>batch_id 형식이 경로 방어</b>, <b>검사는 200 / 반입은 422</b>,
 * <b>배치가 계약을 어기면 조용히 넘어가지 않는다</b>, 그리고
 * <b>반입 뒤 배치가 inbox 에서 사라진다</b>.
 *
 * <p>⚠️ 뿌리 셋은 {@code src/test/resources/application.properties} 에서
 * {@code target/} 아래로 돌려 놓는다. 실제 {@code corpus/inbox} 를 쓰면 테스트가 리포
 * 파일을 <b>옮겨 버리기</b> 때문이다(반입은 이동이다 — 복사가 아니다).
 *
 * <p>⚠️ <b>그 설정을 여기 {@code @TestPropertySource} 로 붙이면 안 된다</b> —
 * 컨텍스트가 둘이 되어 001 DDL 이 같은 H2 에 두 번 돌고 죽는다({@code AppTest} 주석).
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InboxApiTest {

    private static final String BATCH_ID = "2026-08-31_1200_test";
    private static final Path INBOX = Paths.get("target/inbox-test/inbox");
    private static final Path RFP = Paths.get("target/inbox-test/rfp");
    private static final Path BATCHES = Paths.get("target/inbox-test/batches");

    @Autowired
    private MockMvc mockMvc;

    private final ObjectMapper json = new ObjectMapper();

    @Before
    public void 뿌리를_비운다() throws IOException {
        for (Path p : new Path[]{INBOX, RFP, BATCHES}) {
            if (Files.exists(p)) {
                deleteTree(p);
            }
            createWithRetry(p);
        }
    }

    /** Windows 는 방금 지운 폴더가 '삭제 대기'로 남아 곧바로 만들면 AccessDenied 가 날 수 있다 — 잠깐 기다려 다시 만든다. */
    private static void createWithRetry(Path p) throws IOException {
        for (int attempt = 1; ; attempt++) {
            try {
                Files.createDirectories(p);
                return;
            } catch (java.nio.file.AccessDeniedException exc) {
                if (attempt >= 10) {
                    throw exc;
                }
                try {
                    Thread.sleep(100L * attempt);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw exc;
                }
            }
        }
    }

    // ── 배치 만들기 ───────────────────────────────────────────────────

    private Path batchDir(String batchId) {
        return INBOX.resolve(batchId);
    }

    /** 계약을 지키는 배치 한 벌. 각 테스트는 여기서 <b>한 가지만</b> 망가뜨린다. */
    private Path makeBatch(String batchId, String manifest, String csv) throws IOException {
        Path dir = batchDir(batchId);
        Files.createDirectories(dir.resolve("files"));
        Files.write(dir.resolve("manifest.json"), manifest.getBytes(StandardCharsets.UTF_8));
        Files.write(dir.resolve("institutions.csv"), csv.getBytes(StandardCharsets.UTF_8));
        return dir;
    }

    private String manifest(String batchId, String records) {
        return "{\"schema_version\":1,\"batch_id\":\"" + batchId + "\","
                + "\"collected_at\":\"2026-08-31T12:00:00\","
                + "\"source\":{\"slug\":\"g2b\"},"
                + "\"records\":[" + records + "]}";
    }

    private String record(String noticeId, String nameKo, String attachments) {
        return "{\"notice_id\":\"" + noticeId + "\",\"title\":\"용역 공고\","
                + "\"institution\":{\"name_ko\":\"" + nameKo + "\"},"
                + "\"evidence\":{\"url\":\"http://example/" + noticeId + "\"},"
                + "\"schedule\":{\"deadline_at\":\"2026-12-01\",\"confidence\":\"확정\"},"
                + "\"attachments\":[" + attachments + "]}";
    }

    private static final String CSV_HEADER = "기관명,기관구분,지역코드,입찰주기,지난입찰일,입찰예상일";

    private static final String MEMBER = "3918264";     // 영업팀
    private static final String LEAD = "5047192";       // 영업팀장
    private static final String HEAD = "2674805";       // 영업부장
    private static final String DESIGNER = "7130526";   // 디자이너 — 반입 불가
    private static final String ADMIN = "8203417";      // 시스템 관리자
    private static final String UNKNOWN = "9999999";    // 미등록 사번

    /** 기본 호출자는 영업팀원 — 기존 계약 테스트는 가드(NEXT 72 S1)를 통과한 뒤의 동작을 본다. */
    private MockHttpServletResponse call(String batchId, String suffix) throws Exception {
        return callAs(batchId, suffix, MEMBER);
    }

    /** emp 가 null 이면 X-Emp-No 헤더를 보내지 않는다. */
    private MockHttpServletResponse callAs(String batchId, String suffix, String emp) throws Exception {
        org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder b = post("/inbox/" + batchId + suffix);
        if (emp != null) {
            b = b.header("X-Emp-No", emp);
        }
        MockHttpServletResponse res = mockMvc.perform(b).andReturn().getResponse();
        res.setCharacterEncoding("UTF-8");
        return res;
    }

    // ── 경로 방어 ─────────────────────────────────────────────────────

    /**
     * ⚠️ <b>이 테스트가 이 클래스의 이유다.</b> {@code batch_id} 는 그대로 경로에
     * 붙는다. 차단 목록이 아니라 <b>형식(허용 목록)</b> 으로 막으므로
     * {@code ..} · {@code /} · {@code :} 가 애초에 통과하지 못한다 — 새 우회 문자를
     * 쫓아다닐 필요가 없는 구조다.
     */
    @Test
    public void batch_id_형식이_아니면_400이다() throws Exception {
        assertEquals(400, call("..", "/validate").getStatus());
        assertEquals(400, call("2026-08-31_1200_대문자X", "/validate").getStatus());
        assertEquals(400, call("nope", "/validate").getStatus());
        assertEquals(400, call("nope", "/import").getStatus());
    }

    @Test
    public void inbox에_없는_배치는_404다() throws Exception {
        MockHttpServletResponse res = call("2026-08-31_1200_missing", "/validate");
        assertEquals(404, res.getStatus());
        assertTrue(json.readTree(res.getContentAsString()).path("detail").asText().contains("배치가 없습니다"));
    }

    // ── 검사 vs 반입 ──────────────────────────────────────────────────

    /** ⚠️ 코퍼스 검사와 달리 <b>경고 칸이 없다</b> — 배치는 형식 계약이라 중간이 없다. */
    @Test
    public void 계약을_지킨_배치는_검사를_통과한다() throws Exception {
        makeBatch(BATCH_ID, manifest(BATCH_ID, record("N-1", "반입구청", "")),
                CSV_HEADER + "\n반입구청,자치구,11110,3,,\n");

        MockHttpServletResponse res = call(BATCH_ID, "/validate");
        assertEquals(200, res.getStatus());
        JsonNode body = json.readTree(res.getContentAsString());
        assertTrue(res.getContentAsString(), body.path("ok").asBoolean());
        assertEquals(0, body.path("errors").size());
        assertEquals(BATCH_ID, body.path("batch_id").asText());
    }

    /** 검사는 계약 위반이어도 200 이다 — 사람이 고칠 목록을 받아 보는 자리다. */
    @Test
    public void 계약을_어겨도_검사는_200이고_ok_false다() throws Exception {
        makeBatch(BATCH_ID, "{\"schema_version\":1,\"batch_id\":\"" + BATCH_ID + "\"}",
                CSV_HEADER + "\n");

        MockHttpServletResponse res = call(BATCH_ID, "/validate");
        assertEquals(200, res.getStatus());
        JsonNode body = json.readTree(res.getContentAsString());
        assertFalse(body.path("ok").asBoolean());
        assertTrue(body.path("errors").size() > 0);
    }

    /** ⚠️ 같은 입력에서 <b>반입은 422</b> 다. 검사와 갈리는 지점이 정확히 여기다. */
    @Test
    public void 계약을_어기면_반입은_422다() throws Exception {
        makeBatch(BATCH_ID, "{\"schema_version\":1,\"batch_id\":\"" + BATCH_ID + "\"}",
                CSV_HEADER + "\n");

        MockHttpServletResponse res = call(BATCH_ID, "/import");
        assertEquals(422, res.getStatus());
        assertTrue(json.readTree(res.getContentAsString())
                .path("detail").path("errors").isArray());
    }

    /** 상위 버전을 아는 만큼만 읽으면 빠진 필드가 "없는 값"으로 반입된다(SCHEMA §⑨). */
    @Test
    public void 모르는_schema_version은_거부한다() throws Exception {
        makeBatch(BATCH_ID, "{\"schema_version\":2,\"batch_id\":\"" + BATCH_ID + "\"}",
                CSV_HEADER + "\n");

        assertFalse(json.readTree(call(BATCH_ID, "/validate").getContentAsString())
                .path("ok").asBoolean());
    }

    // ── 반입 본류 ─────────────────────────────────────────────────────

    @Test
    public void 반입하면_기관과_공고가_생기고_배치가_치워진다() throws Exception {
        makeBatch(BATCH_ID, manifest(BATCH_ID, record("N-1", "반입구청", "")),
                CSV_HEADER + "\n반입구청,자치구,11110,3,,\n");

        MockHttpServletResponse res = call(BATCH_ID, "/import");
        assertEquals(res.getContentAsString(), 200, res.getStatus());

        JsonNode body = json.readTree(res.getContentAsString());
        assertEquals(1, body.path("imported_institutions").asInt());
        assertEquals(1, body.path("bid_cases").path("created").size());
        assertEquals(0, body.path("bid_cases").path("updated").size());

        assertFalse("반입된 배치는 inbox 에 남으면 안 된다 — 그래야 inbox 가 '미처리만'이 된다",
                Files.exists(batchDir(BATCH_ID)));
        assertTrue("감사 근거라 지우지 않고 옮겨 둔다", Files.isDirectory(BATCHES.resolve(BATCH_ID)));
    }

    /**
     * ⚠️ 같은 공고를 다시 수집하는 것은 <b>정상</b>이고 나중 배치가 이긴다(SCHEMA §④).
     * 두 번째가 {@code created} 로 잡히면 같은 공고가 두 건이 된다.
     */
    @Test
    public void 같은_공고를_다시_반입하면_updated다() throws Exception {
        String csv = CSV_HEADER + "\n재반입구청,자치구,11120,3,,\n";
        makeBatch(BATCH_ID, manifest(BATCH_ID, record("N-9", "재반입구청", "")), csv);
        call(BATCH_ID, "/import");

        String second = "2026-08-31_1300_test";
        makeBatch(second, manifest(second, record("N-9", "재반입구청", "")), csv);

        JsonNode body = json.readTree(call(second, "/import").getContentAsString());
        assertEquals(0, body.path("bid_cases").path("created").size());
        assertEquals("같은 (source_slug, notice_id) 는 갱신이어야 한다",
                1, body.path("bid_cases").path("updated").size());
    }

    /**
     * ⚠️ CSV 에 없는 기관명을 <b>조용히 건너뛰지 않는다.</b> SCHEMA §④ 가 두 값을
     * 같게 못 박으므로 못 찾는 것은 배치가 계약을 어긴 것이고, 넘어가면 일정 없는
     * <b>유령 공고</b>가 남는다.
     */
    @Test
    public void CSV에_없는_기관명은_422다() throws Exception {
        makeBatch(BATCH_ID, manifest(BATCH_ID, record("N-2", "명단에없는구청", "")),
                CSV_HEADER + "\n다른구청,자치구,11130,3,,\n");

        MockHttpServletResponse res = call(BATCH_ID, "/import");
        assertEquals(422, res.getStatus());
        assertTrue(res.getContentAsString().contains("CSV에 없는 기관명"));
    }

    // ── 첨부 ──────────────────────────────────────────────────────────

    @Test
    public void 첨부는_rfp로_옮겨지고_기관에_첫_번째만_붙는다() throws Exception {
        Path dir = makeBatch(BATCH_ID,
                manifest(BATCH_ID, record("N-3", "첨부구청", "\"files/N-3_공고문.pdf\",\"files/N-3_붙임.pdf\"")),
                CSV_HEADER + "\n첨부구청,자치구,11140,3,,\n");
        Files.write(dir.resolve("files/N-3_공고문.pdf"), "pdf".getBytes(StandardCharsets.UTF_8));
        Files.write(dir.resolve("files/N-3_붙임.pdf"), "pdf".getBytes(StandardCharsets.UTF_8));

        JsonNode body = json.readTree(call(BATCH_ID, "/import").getContentAsString());

        assertEquals("공고당 한 건만 DB 에 남는다", 1, body.path("rfp_files").size());
        assertTrue(body.path("rfp_files").get(0).path("rfp_path").asText().contains("N-3_공고문.pdf"));
        assertTrue("두 번째 첨부도 파일은 옮겨져야 한다",
                Files.isRegularFile(RFP.resolve("N-3_붙임.pdf")));
    }

    /** 파일이 없는 첨부를 적어 보내면 계약 위반이다 — 반입 전에 걸러야 한다. */
    @Test
    public void 없는_첨부를_가리키면_422다() throws Exception {
        makeBatch(BATCH_ID, manifest(BATCH_ID, record("N-4", "없는첨부구청", "\"files/없음.pdf\"")),
                CSV_HEADER + "\n없는첨부구청,자치구,11150,3,,\n");

        assertEquals(422, call(BATCH_ID, "/import").getStatus());
    }

    /** 첨부 경로도 신뢰할 수 없는 입력이다 — 배치는 망 밖에서 만들어져 들어온다. */
    @Test
    public void 첨부의_상위경로_참조는_거부한다() throws Exception {
        makeBatch(BATCH_ID, manifest(BATCH_ID, record("N-5", "탈출구청", "\"files/../../etc/passwd\"")),
                CSV_HEADER + "\n탈출구청,자치구,11160,3,,\n");

        MockHttpServletResponse res = call(BATCH_ID, "/validate");
        assertFalse(json.readTree(res.getContentAsString()).path("ok").asBoolean());
        assertTrue(res.getContentAsString().contains("상위 경로 참조"));
    }

    // ── 호출자 가드 (NEXT 72 S1) ──────────────────────────────────────

    @Test
    public void 사번_없이_부르면_401이고_배치는_그대로다() throws Exception {
        makeBatch(BATCH_ID, manifest(BATCH_ID, record("N-G1", "가드구청", "")),
                CSV_HEADER + "\n가드구청,자치구,11110,3,,\n");
        assertEquals(401, callAs(BATCH_ID, "/validate", null).getStatus());
        assertEquals(401, callAs(BATCH_ID, "/import", null).getStatus());
        assertTrue(Files.isDirectory(batchDir(BATCH_ID)));
    }

    @Test
    public void 영업_계열이_아니면_403이고_배치_존재도_알리지_않는다() throws Exception {
        makeBatch(BATCH_ID, manifest(BATCH_ID, record("N-G2", "가드구청2", "")),
                CSV_HEADER + "\n가드구청2,자치구,11110,3,,\n");
        for (String emp : new String[]{DESIGNER, ADMIN, UNKNOWN}) {
            assertEquals(emp, 403, callAs(BATCH_ID, "/validate", emp).getStatus());
            assertEquals(emp, 403, callAs(BATCH_ID, "/import", emp).getStatus());
        }
        assertEquals(403, callAs("nope", "/validate", DESIGNER).getStatus());   // 형식 오류 400 보다 가드가 먼저
        assertTrue(Files.isDirectory(batchDir(BATCH_ID)));
    }

    @Test
    public void 영업팀_영업팀장_영업부장은_검사_200이고_팀장이_반입할_수_있다() throws Exception {
        makeBatch(BATCH_ID, manifest(BATCH_ID, record("N-G3", "가드구청3", "")),
                CSV_HEADER + "\n가드구청3,자치구,11110,3,,\n");
        for (String emp : new String[]{MEMBER, LEAD, HEAD}) {
            assertEquals(emp, 200, callAs(BATCH_ID, "/validate", emp).getStatus());
        }
        assertEquals(200, callAs(BATCH_ID, "/import", LEAD).getStatus());
    }

    // ── 보관본 보존 (S9) · 크기 상한 (S5 일부) ───────────────────────

    @Test
    public void 같은_batch_id를_다시_반입해도_보관본이_지워지지_않는다() throws Exception {
        String csv = CSV_HEADER + "\n재보관구청,자치구,11120,3,,\n";
        makeBatch(BATCH_ID, manifest(BATCH_ID, record("N-A1", "재보관구청", "")), csv);
        JsonNode first = json.readTree(call(BATCH_ID, "/import").getContentAsString());
        Files.write(BATCHES.resolve(BATCH_ID).resolve("marker.txt"), "first".getBytes(StandardCharsets.UTF_8));

        makeBatch(BATCH_ID, manifest(BATCH_ID, record("N-A2", "재보관구청", "")), csv);
        MockHttpServletResponse secondRes = call(BATCH_ID, "/import");
        assertEquals(secondRes.getContentAsString(), 200, secondRes.getStatus());
        JsonNode second = json.readTree(secondRes.getContentAsString());

        assertTrue("첫 보관본(감사 근거)이 남아 있어야 한다",
                Files.isRegularFile(BATCHES.resolve(BATCH_ID).resolve("marker.txt")));
        assertTrue(second.toString(), Files.isDirectory(BATCHES.resolve(BATCH_ID + "_2")));
        assertTrue(first.path("archived_to").asText().endsWith(BATCH_ID));
        assertTrue(second.path("archived_to").asText().endsWith(BATCH_ID + "_2"));
    }

    @Test
    public void manifest가_상한을_넘으면_검사는_ok_false_반입은_422다() throws Exception {
        Path dir = makeBatch(BATCH_ID, "{}", CSV_HEADER + "\n");
        byte[] big = new byte[8 * 1024 * 1024 + 1];
        java.util.Arrays.fill(big, (byte) 'a');
        Files.write(dir.resolve("manifest.json"), big);

        MockHttpServletResponse v = call(BATCH_ID, "/validate");
        assertEquals(200, v.getStatus());
        assertFalse(json.readTree(v.getContentAsString()).path("ok").asBoolean());
        assertTrue(v.getContentAsString().contains("크기 상한"));
        assertEquals(422, call(BATCH_ID, "/import").getStatus());
    }

    // ── 도구 ──────────────────────────────────────────────────────────

    private static void deleteTree(Path dir) throws IOException {
        Files.walkFileTree(dir, new java.nio.file.SimpleFileVisitor<Path>() {
            @Override
            public java.nio.file.FileVisitResult visitFile(Path file,
                    java.nio.file.attribute.BasicFileAttributes attrs) throws IOException {
                Files.delete(file);
                return java.nio.file.FileVisitResult.CONTINUE;
            }

            @Override
            public java.nio.file.FileVisitResult postVisitDirectory(Path d, IOException exc)
                    throws IOException {
                Files.delete(d);
                return java.nio.file.FileVisitResult.CONTINUE;
            }
        });
    }
}
