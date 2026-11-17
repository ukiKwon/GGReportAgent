package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.service.ExtCheckFixtures;
import org.junit.After;
import org.junit.Assume;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Stream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** NEXT 90 2단계 — checks 반입: 검사·제외·보관, 원본 삭제, 구조 거부. DB 쓰기 없음. 번호는 가상이다. */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InboxExtCheckApiTest {

    private static final String BATCH_ID = "2026-11-17_0700_extcheck";
    private Path INBOX, BATCHES, EXT;              // 시험마다 고유 폴더(InboxTestRoots)
    private InboxTestRoots roots;
    private static final String MEMBER = "3918264";     // 영업팀
    private static final String INST = "확인구청";
    private static final String CSV_HEADER = "기관명,기관구분,지역코드,입찰주기,지난입찰일,입찰예상일";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private com.kbstar.kgi.ggreport.web.config.AppProperties props;
    private final ObjectMapper json = new ObjectMapper();

    @After
    public void 치운다() {
        if (roots != null) {
            roots.close();
        }
    }

    @Before
    public void 비운다() throws Exception {
        roots = InboxTestRoots.open(props);
        INBOX = roots.inbox;
        BATCHES = roots.batches;
        EXT = roots.ext;
        String created = mockMvc.perform(post("/institutions").header("X-Emp-No", MEMBER)
                .contentType(MediaType.APPLICATION_JSON).content("{\"name_ko\":\"" + INST + "\"}"))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertTrue(created, created.contains("institution_id"));
    }

    // ── 배치 만들기 ──
    private ObjectNode check(String id, String inst, String title) {
        ObjectNode c = json.createObjectNode();
        c.put("check_id", id);
        c.putObject("institution").put("name_ko", inst).put("region_code", "11");
        c.put("status", "found");
        c.put("checked_at", "2026-11-17T07:02:11+09:00");
        c.put("source_kind", "notice");
        c.put("source_slug", "eminwon");
        ObjectNode m = c.putObject("match");
        m.put("confidence", "high");
        m.putArray("basis").add("domain_match");
        c.putObject("notice").put("title", title).put("deadline_at", "2026-12-02");
        return c;
    }

    private static String sha(byte[] b) throws Exception {
        StringBuilder sb = new StringBuilder();
        for (byte x : MessageDigest.getInstance("SHA-256").digest(b)) {
            sb.append(String.format("%02x", x));
        }
        return sb.toString();
    }

    private ObjectNode attach(ObjectNode c, Map<String, byte[]> files, String name, byte[] data, String declaredSha) throws Exception {
        ObjectNode a = json.createObjectNode();
        a.put("path", "files/" + name);
        a.put("sha256", declaredSha == null ? sha(data) : declaredSha);
        a.put("size", data.length);
        ArrayNode arr = c.has("attachments") ? (ArrayNode) c.get("attachments") : c.putArray("attachments");
        arr.add(a);
        files.put(name, data);
        return a;
    }

    private Path writeBatch(ObjectNode root) throws IOException {
        Path dir = INBOX.resolve(BATCH_ID);
        Files.createDirectories(dir);
        Files.write(dir.resolve("manifest.json"), root.toString().getBytes(StandardCharsets.UTF_8));
        Files.write(dir.resolve("institutions.csv"), (CSV_HEADER + "\n").getBytes(StandardCharsets.UTF_8));
        return dir;
    }

    private ObjectNode root(ObjectNode... checks) {
        ObjectNode m = json.createObjectNode();
        m.put("schema_version", 1);
        m.put("schema_minor", 1);
        m.put("batch_id", BATCH_ID);
        m.put("collected_at", "2026-11-17T07:00:00");
        m.putObject("source").put("slug", "extcheck-daily");
        m.putArray("records");
        ArrayNode arr = m.putArray("checks");
        for (ObjectNode c : checks) {
            arr.add(c);
        }
        return m;
    }

    private Path makeBatch(ObjectNode root, Map<String, byte[]> files) throws IOException {
        Path dir = writeBatch(root);
        Files.createDirectories(dir.resolve("files"));
        for (Map.Entry<String, byte[]> e : files.entrySet()) {
            Files.write(dir.resolve("files").resolve(e.getKey()), e.getValue());
        }
        return dir;
    }

    private MockHttpServletResponse importAs(String emp) throws Exception {
        MockHttpServletResponse res = mockMvc.perform(post("/inbox/" + BATCH_ID + "/import").header("X-Emp-No", emp)).andReturn().getResponse();
        res.setCharacterEncoding("UTF-8");
        return res;
    }

    private static void deleteTree(Path p) throws IOException {
        if (!Files.exists(p)) {
            return;
        }
        Files.walkFileTree(p, new SimpleFileVisitor<Path>() {
            @Override public FileVisitResult visitFile(Path f, BasicFileAttributes a) throws IOException {
                Files.delete(f);
                return FileVisitResult.CONTINUE;
            }
            @Override public FileVisitResult postVisitDirectory(Path d, IOException e) throws IOException {
                Files.delete(d);
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private long extDirs() throws IOException {
        try (Stream<Path> s = Files.list(EXT)) {
            return s.count();
        }
    }

    // ── 시험 ──
    @Test
    public void 깨끗한_첨부는_보관되고_원본은_사라지고_DB는_그대로다() throws Exception {
        Map<String, byte[]> files = new LinkedHashMap<String, byte[]>();
        ObjectNode c = check("c-0001", INST, "금고 공고");
        byte[] pdf = ExtCheckFixtures.pdf(ExtCheckFixtures.PLAIN);
        attach(c, files, "c-0001_1.pdf", pdf, null);
        Path dir = makeBatch(root(c), files);
        int before = jdbc.queryForObject("SELECT COUNT(*) FROM BID_CASES", Integer.class);

        MockHttpServletResponse res = importAs(MEMBER);
        assertEquals(res.getContentAsString(), 200, res.getStatus());
        JsonNode body = json.readTree(res.getContentAsString());
        assertEquals(1, body.path("passed").size());
        assertEquals(0, body.path("excluded").size());
        assertTrue(body.path("originals_deleted").asBoolean());
        String stored = body.path("passed").get(0).path("files").get(0).path("stored_name").asText();
        assertTrue(stored.endsWith("/c-0001_1.pdf"));
        assertTrue(java.util.Arrays.equals(pdf, Files.readAllBytes(EXT.resolve(stored))));
        assertFalse(res.getContentAsString().contains(sha(pdf)));
        assertFalse(res.getContentAsString().contains("files/"));
        assertFalse(Files.exists(dir));
        Path arch = BATCHES.resolve(BATCH_ID);
        assertTrue(Files.isRegularFile(arch.resolve("manifest.json")));
        assertFalse(Files.exists(arch.resolve("files")));
        assertFalse(Files.exists(arch.resolve("institutions.csv")));
        assertFalse(new String(Files.readAllBytes(arch.resolve("manifest.json")), StandardCharsets.UTF_8).contains(sha(pdf)));
        assertEquals(before, jdbc.queryForObject("SELECT COUNT(*) FROM BID_CASES", Integer.class).intValue());
    }

    @Test
    public void 휴대폰_든_첨부와_제목은_그_check만_제외되고_값이_어디에도_없다() throws Exception {
        Map<String, byte[]> files = new LinkedHashMap<String, byte[]>();
        ObjectNode ok = check("c-0001", INST, "금고 공고");
        attach(ok, files, "c-0001_1.pdf", ExtCheckFixtures.pdf(ExtCheckFixtures.PLAIN), null);
        ObjectNode badFile = check("c-0002", INST, "다른 공고");
        attach(badFile, files, "c-0002_1.pdf", ExtCheckFixtures.pdf("Contact " + ExtCheckFixtures.PHONE + " now"), null);
        ObjectNode badTitle = check("c-0003", INST, "문의 " + ExtCheckFixtures.PHONE);
        makeBatch(root(ok, badFile, badTitle), files);

        MockHttpServletResponse res = importAs(MEMBER);
        assertEquals(res.getContentAsString(), 200, res.getStatus());
        JsonNode body = json.readTree(res.getContentAsString());
        assertEquals(1, body.path("passed_count").asInt());
        assertEquals(2, body.path("excluded_count").asInt());
        boolean fileHit = false;
        boolean titleHit = false;
        for (JsonNode e : body.path("excluded")) {
            if ("c-0002".equals(e.path("check_id").asText())) {
                fileHit = "PII_MOBILE".equals(e.path("reason").asText()) && e.path("file_seq").asInt() == 1;
            }
            if ("c-0003".equals(e.path("check_id").asText())) {
                titleHit = "PII_MOBILE".equals(e.path("reason").asText()) && "notice".equals(e.path("locator").asText());
            }
        }
        assertTrue(res.getContentAsString(), fileHit && titleHit);
        assertEquals(1, extDirs());
        assertFalse(res.getContentAsString().contains("5678"));
        String archived = new String(Files.readAllBytes(BATCHES.resolve(BATCH_ID).resolve("manifest.json")), StandardCharsets.UTF_8);
        assertFalse(archived, archived.contains("5678"));
        assertTrue(archived.contains("\"excluded\":true"));
    }

    @Test
    public void sha256이_다르면_묶음_422이고_원본은_지워지고_보관되지_않는다() throws Exception {
        Map<String, byte[]> files = new LinkedHashMap<String, byte[]>();
        ObjectNode c = check("c-0001", INST, "금고 공고");
        attach(c, files, "c-0001_1.pdf", ExtCheckFixtures.pdf(ExtCheckFixtures.PLAIN),
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        Path dir = makeBatch(root(c), files);

        MockHttpServletResponse res = importAs(MEMBER);
        assertEquals(res.getContentAsString(), 422, res.getStatus());
        assertTrue(res.getContentAsString().contains("SHA256_MISMATCH"));
        assertTrue(json.readTree(res.getContentAsString()).path("detail").path("originals_deleted").asBoolean());
        assertFalse(res.getContentAsString().contains("c-0001_1.pdf"));
        assertFalse(Files.exists(dir));
        Path arch = BATCHES.resolve(BATCH_ID);
        assertFalse(Files.exists(arch.resolve("files")));
        assertTrue(new String(Files.readAllBytes(arch.resolve("manifest.json")), StandardCharsets.UTF_8).contains("SHA256_MISMATCH"));
        assertEquals(0, extDirs());
    }

    @Test
    public void records와_checks를_섞으면_422이고_아무것도_지우지_않는다() throws Exception {
        Map<String, byte[]> files = new LinkedHashMap<String, byte[]>();
        ObjectNode c = check("c-0001", INST, "금고 공고");
        attach(c, files, "c-0001_1.pdf", ExtCheckFixtures.pdf(ExtCheckFixtures.PLAIN), null);
        ObjectNode r = root(c);
        ObjectNode rec = json.createObjectNode();
        rec.put("notice_id", "N-1");
        rec.put("title", "용역 공고");
        rec.putObject("institution").put("name_ko", INST);
        rec.putObject("evidence").put("url", "http://example/N-1");
        rec.putObject("schedule").put("deadline_at", "2026-12-01").put("confidence", "확정");
        rec.putArray("attachments");
        ((ArrayNode) r.get("records")).add(rec);
        Path dir = makeBatch(r, files);

        MockHttpServletResponse res = importAs(MEMBER);
        assertEquals(res.getContentAsString(), 422, res.getStatus());
        assertTrue(res.getContentAsString().contains("MIXED_BATCH_NOT_SUPPORTED"));
        assertFalse(json.readTree(res.getContentAsString()).path("detail").path("originals_deleted").asBoolean(true));
        assertTrue(Files.isRegularFile(dir.resolve("files/c-0001_1.pdf")));
        assertFalse(Files.exists(BATCHES.resolve(BATCH_ID)));
        assertEquals(0, extDirs());
    }

    @Test
    public void 기관표에_없는_기관은_그_check만_제외된다() throws Exception {
        Map<String, byte[]> files = new LinkedHashMap<String, byte[]>();
        ObjectNode c = check("c-0001", "표에없는구청", "금고 공고");
        attach(c, files, "c-0001_1.pdf", ExtCheckFixtures.pdf(ExtCheckFixtures.PLAIN), null);
        makeBatch(root(c), files);

        MockHttpServletResponse res = importAs(MEMBER);
        assertEquals(res.getContentAsString(), 200, res.getStatus());
        JsonNode body = json.readTree(res.getContentAsString());
        assertEquals(0, body.path("passed_count").asInt());
        assertEquals("INSTITUTION_NOT_FOUND", body.path("excluded").get(0).path("reason").asText());
        assertEquals(0, extDirs());
    }

    @Test
    public void 영업팀이_아니면_403이고_배치는_그대로다() throws Exception {
        Map<String, byte[]> files = new LinkedHashMap<String, byte[]>();
        ObjectNode c = check("c-0001", INST, "금고 공고");
        attach(c, files, "c-0001_1.pdf", ExtCheckFixtures.pdf(ExtCheckFixtures.PLAIN), null);
        Path dir = makeBatch(root(c), files);

        MockHttpServletResponse res = importAs("7130526");   // 디자이너
        assertEquals(403, res.getStatus());
        assertTrue(Files.isRegularFile(dir.resolve("files/c-0001_1.pdf")));
    }

    /** Windows 에서만: 열려 있는 파일은 지워지지 않는다. 옛 IO 의 FileInputStream 은 삭제 공유 없이 열린다(NIO newInputStream 은 막지 못한다). */
    @Test
    public void 원본을_다_못_지우면_보관으로_옮기지_않고_originals_deleted는_false다() throws Exception {
        Assume.assumeTrue(System.getProperty("os.name").toLowerCase().contains("win"));
        Map<String, byte[]> files = new LinkedHashMap<String, byte[]>();
        ObjectNode c = check("c-0001", INST, "금고 공고");
        attach(c, files, "c-0001_1.pdf", ExtCheckFixtures.pdf(ExtCheckFixtures.PLAIN), null);
        Path dir = makeBatch(root(c), files);
        Path extra = dir.resolve("extra.bin");
        Files.write(extra, new byte[]{1});
        try (java.io.FileInputStream hold = new java.io.FileInputStream(extra.toFile())) {
            MockHttpServletResponse res = importAs(MEMBER);
            assertEquals(res.getContentAsString(), 200, res.getStatus());
            JsonNode body = json.readTree(res.getContentAsString());
            assertFalse(body.path("originals_deleted").asBoolean());
            assertTrue(body.path("archived_to").isNull());
            assertTrue(Files.isDirectory(dir));
            assertFalse(Files.exists(BATCHES.resolve(BATCH_ID)));
        }
    }

    /** Windows 에서만: files/ 가 junction 이면 거부하고, junction 이 가리키는 폴더 밖 파일을 건드리지 않는다. */
    @Test
    public void files가_junction이면_422이고_대상_폴더는_그대로다() throws Exception {
        Assume.assumeTrue(System.getProperty("os.name").toLowerCase().contains("win"));
        Path outside = Files.createTempDirectory("extchk-out-");
        byte[] pdf = ExtCheckFixtures.pdf(ExtCheckFixtures.PLAIN);
        Files.write(outside.resolve("c-0001_1.pdf"), pdf);
        Map<String, byte[]> files = new LinkedHashMap<String, byte[]>();
        ObjectNode c = check("c-0001", INST, "금고 공고");
        attach(c, files, "c-0001_1.pdf", pdf, null);
        Path dir = writeBatch(root(c));
        Path link = dir.resolve("files");
        Process p = new ProcessBuilder("cmd", "/c", "mklink", "/J", link.toAbsolutePath().toString(), outside.toAbsolutePath().toString())
                .redirectErrorStream(true).start();
        java.io.InputStream in = p.getInputStream();
        while (in.read() != -1) {
            // 출력 비우기
        }
        Assume.assumeTrue(p.waitFor() == 0);
        try {
            MockHttpServletResponse res = importAs(MEMBER);
            assertEquals(res.getContentAsString(), 422, res.getStatus());
            assertTrue(res.getContentAsString().contains("LINK_NOT_ALLOWED"));
            assertFalse(json.readTree(res.getContentAsString()).path("detail").path("originals_deleted").asBoolean(true));
            assertTrue("대상 폴더 밖 파일은 그대로여야 한다", Files.isRegularFile(outside.resolve("c-0001_1.pdf")));
            assertTrue(Files.isDirectory(dir));
        } finally {
            Files.delete(link);          // junction 자체만 지운다
            deleteTree(outside);
        }
    }

    // ═══ 3단계: 저장·열람 (042) ═══
    private static final String LEAD = "5047192";       // 영업팀장
    private static final String HEAD = "2674805";       // 영업부장
    private static final String DESIGNER = "7130526";
    private static final String ADMIN = "8203417";      // 전산팀
    private static final String UNKNOWN = "9999999";

    private MockHttpServletResponse getAs(String url, String emp) throws Exception {
        org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder b =
                org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(url);
        if (emp != null) {
            b = b.header("X-Emp-No", emp);
        }
        MockHttpServletResponse res = mockMvc.perform(b).andReturn().getResponse();
        res.setCharacterEncoding("UTF-8");
        return res;
    }

    private byte[] importOnePdf() throws Exception {
        Map<String, byte[]> files = new LinkedHashMap<String, byte[]>();
        ObjectNode c = check("c-0001", INST, "금고 공고");
        byte[] pdf = ExtCheckFixtures.pdf(ExtCheckFixtures.PLAIN);
        attach(c, files, "c-0001_1.pdf", pdf, null);
        makeBatch(root(c), files);
        MockHttpServletResponse res = importAs(MEMBER);
        assertEquals(res.getContentAsString(), 200, res.getStatus());
        return pdf;
    }

    private int count(String sql) {
        return jdbc.queryForObject(sql, Integer.class);
    }

    @Test
    public void 통과분은_DB에_저장되고_제외는_사유_위치_건수만_남는다() throws Exception {
        Map<String, byte[]> files = new LinkedHashMap<String, byte[]>();
        ObjectNode ok = check("c-0001", INST, "금고 공고");
        byte[] pdf = ExtCheckFixtures.pdf(ExtCheckFixtures.PLAIN);
        attach(ok, files, "c-0001_1.pdf", pdf, null);
        ObjectNode bad = check("c-0002", INST, "다른 공고");
        attach(bad, files, "c-0002_1.pdf", ExtCheckFixtures.pdf("Contact " + ExtCheckFixtures.PHONE + " now"), null);
        makeBatch(root(ok, bad), files);

        MockHttpServletResponse res = importAs(MEMBER);
        assertEquals(res.getContentAsString(), 200, res.getStatus());
        JsonNode body = json.readTree(res.getContentAsString());
        assertEquals(1, body.path("saved_count").asInt());
        String key = body.path("passed").get(0).path("check_key").asText();

        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM EXT_CHECK");
        assertEquals(key, row.get("CHECK_KEY"));
        assertTrue(key.matches("[0-9a-f]{32}"));
        assertEquals(BATCH_ID, row.get("BATCH_ID"));
        assertEquals("c-0001", row.get("CHECK_ID"));
        assertEquals("found", row.get("STATUS_CD"));
        assertEquals("금고 공고", row.get("TITLE"));
        assertEquals("2026-12-02", row.get("DEADLINE_AT"));
        assertEquals("domain_match", row.get("MATCH_BASIS"));
        Map<String, Object> f = jdbc.queryForMap("SELECT * FROM EXT_CHECK_FILE");
        assertEquals(key, f.get("CHECK_KEY"));
        assertEquals(1, ((Number) f.get("FILE_SEQ")).intValue());
        assertEquals("pdf", f.get("FORMAT_CD"));
        assertEquals(key + "/c-0001_1.pdf", f.get("STORED_NAME"));
        assertEquals(sha(pdf), f.get("SHA256"));
        assertEquals(pdf.length, ((Number) f.get("FILE_SIZE")).longValue());

        assertEquals(1, count("SELECT COUNT(*) FROM EXT_CHECK_EXCL WHERE CHECK_ID = 'c-0002' AND FILE_SEQ = 1 AND REASON_CD = 'PII_MOBILE'"));
        String excl = jdbc.queryForList("SELECT * FROM EXT_CHECK_EXCL").toString();
        assertFalse(excl, excl.contains(ExtCheckFixtures.PHONE) || excl.contains("5678") || excl.contains("c-0002_1.pdf"));
        assertEquals(1, count("SELECT COUNT(*) FROM EXT_CHECK"));
    }

    @Test
    public void 기관표에_없는_check는_저장되지_않고_제외_이력만_남는다() throws Exception {
        Map<String, byte[]> files = new LinkedHashMap<String, byte[]>();
        ObjectNode c = check("c-0001", "표에없는구청", "금고 공고");
        attach(c, files, "c-0001_1.pdf", ExtCheckFixtures.pdf(ExtCheckFixtures.PLAIN), null);
        makeBatch(root(c), files);
        assertEquals(200, importAs(MEMBER).getStatus());
        assertEquals(0, count("SELECT COUNT(*) FROM EXT_CHECK"));
        assertEquals(1, count("SELECT COUNT(*) FROM EXT_CHECK_EXCL WHERE REASON_CD = 'INSTITUTION_NOT_FOUND' AND FILE_SEQ = 0"));
    }

    @Test
    public void 같은_batch_id_재반입은_422이고_한_번만_저장되며_원본은_그대로다() throws Exception {
        importOnePdf();
        Map<String, byte[]> files = new LinkedHashMap<String, byte[]>();
        ObjectNode c = check("c-0001", INST, "금고 공고");
        attach(c, files, "c-0001_1.pdf", ExtCheckFixtures.pdf(ExtCheckFixtures.PLAIN), null);
        Path dir = makeBatch(root(c), files);

        MockHttpServletResponse res = importAs(MEMBER);
        assertEquals(res.getContentAsString(), 422, res.getStatus());
        assertTrue(res.getContentAsString().contains("BATCH_ALREADY_IMPORTED"));
        assertFalse(json.readTree(res.getContentAsString()).path("detail").path("originals_deleted").asBoolean(true));
        assertTrue(Files.isRegularFile(dir.resolve("files/c-0001_1.pdf")));
        assertEquals(1, count("SELECT COUNT(*) FROM EXT_CHECK"));
        assertEquals(1, extDirs());
    }

    @Test
    public void 열람_목록은_최신_notice_1건과_이력을_주고_저장_이름과_해시는_내지_않는다() throws Exception {
        byte[] pdf = importOnePdf();
        String inst = jdbc.queryForObject("SELECT INSTITUTION_ID FROM EXT_CHECK", String.class);
        MockHttpServletResponse res = getAs("/ext-checks?institution_id=" + inst, MEMBER);
        assertEquals(res.getContentAsString(), 200, res.getStatus());
        JsonNode b = json.readTree(res.getContentAsString());
        assertEquals(inst, b.path("institution_id").asText());
        assertEquals("금고 공고", b.path("notice").path("title").asText());
        assertEquals("found", b.path("notice").path("status").asText());
        assertEquals("high", b.path("notice").path("match").path("confidence").asText());
        assertTrue(b.path("last_error_at").isNull());
        assertEquals(1, b.path("history").size());
        assertEquals(1, b.path("notice").path("files").get(0).path("seq").asInt());
        assertEquals((long) pdf.length, b.path("notice").path("files").get(0).path("size").asLong());
        String text = res.getContentAsString();
        assertFalse(text, text.contains("stored_name"));
        assertFalse(text, text.contains(sha(pdf)));
        assertFalse(text, text.contains("c-0001_1.pdf"));
    }

    @Test
    public void error는_이전_found를_덮지_않고_최근_실패_시각이_따로_나온다() throws Exception {
        importOnePdf();
        String inst = jdbc.queryForObject("SELECT INSTITUTION_ID FROM EXT_CHECK", String.class);
        jdbc.update("INSERT INTO EXT_CHECK (CHECK_KEY, INSTITUTION_ID, BATCH_ID, CHECK_ID, CHECKED_AT, SOURCE_KIND, SOURCE_SLUG, STATUS_CD, ERROR_CD, IMPORTED_AT)"
                + " VALUES ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', ?, '2026-11-18_0700_extcheck', 'c-0009', '2026-11-18T07:00:00+09:00', 'notice', 'eminwon', 'error', 'timeout', '2026-11-18T07:01:00+09:00')", inst);
        JsonNode b = json.readTree(getAs("/ext-checks?institution_id=" + inst, LEAD).getContentAsString());
        assertEquals("found", b.path("notice").path("status").asText());
        assertEquals("금고 공고", b.path("notice").path("title").asText());
        assertEquals("2026-11-18T07:00:00+09:00", b.path("last_error_at").asText());
        assertEquals(2, b.path("history").size());
        assertEquals("error", b.path("history").get(0).path("status").asText());   // 최신순
    }

    @Test
    public void 목록의_기관_번호가_없거나_모르면_400_404이고_받은_값을_되돌리지_않는다() throws Exception {
        assertEquals(400, getAs("/ext-checks", MEMBER).getStatus());
        assertEquals(400, getAs("/ext-checks?institution_id=", MEMBER).getStatus());
        MockHttpServletResponse r = getAs("/ext-checks?institution_id=zzz-secret-id", MEMBER);
        assertEquals(404, r.getStatus());
        assertFalse(r.getContentAsString().contains("zzz-secret-id"));
    }

    @Test
    public void 다운로드는_본문과_보안_헤더를_준다() throws Exception {
        byte[] pdf = importOnePdf();
        String key = jdbc.queryForObject("SELECT CHECK_KEY FROM EXT_CHECK", String.class);
        for (String emp : new String[]{MEMBER, LEAD, HEAD}) {
            MockHttpServletResponse res = getAs("/ext-checks/" + key + "/files/1", emp);
            assertEquals(emp, 200, res.getStatus());
            assertTrue(java.util.Arrays.equals(pdf, res.getContentAsByteArray()));
            // getAs 가 setCharacterEncoding 을 불러 MockHttpServletResponse 가 charset 을 붙인다 — 시험 도구의 흔적이지 운영 응답이 아니다.
            assertTrue(res.getContentType(), res.getContentType().startsWith("application/octet-stream"));
            assertEquals("attachment; filename=\"c-0001_1.pdf\"", res.getHeader("Content-Disposition"));
            assertEquals("nosniff", res.getHeader("X-Content-Type-Options"));
            assertEquals("no-store", res.getHeader("Cache-Control"));
            assertEquals("no-cache", res.getHeader("Pragma"));
            assertEquals("sandbox; default-src 'none'", res.getHeader("Content-Security-Policy"));
            assertEquals("noopen", res.getHeader("X-Download-Options"));
        }
    }

    @Test
    public void 키_형식이_틀리거나_없거나_번호가_이상하면_모두_404다() throws Exception {
        importOnePdf();
        String key = jdbc.queryForObject("SELECT CHECK_KEY FROM EXT_CHECK", String.class);
        String[] urls = {
            "/ext-checks/" + key.toUpperCase() + "/files/1",
            "/ext-checks/" + key.substring(1) + "/files/1",
            "/ext-checks/" + key + "0/files/1",
            "/ext-checks/" + "z" + key.substring(1) + "/files/1",
            "/ext-checks/" + key + "/files/x",
            "/ext-checks/" + key + "/files/1.pdf",
            "/ext-checks/" + key + "/files/2",
            "/ext-checks/" + key + "/files/-1",
            "/ext-checks/" + "00000000000000000000000000000000" + "/files/1",
        };
        for (String u : urls) {
            MockHttpServletResponse r = getAs(u, MEMBER);
            assertEquals(u, 404, r.getStatus());
            assertFalse(u, r.getContentAsString().contains("ext_check") || r.getContentAsString().contains(key));
        }
    }

    @Test
    public void 저장된_이름이_루트_밖이나_형식_밖을_가리켜도_404다() throws Exception {
        String k1 = "b0000000000000000000000000000000";
        String k2 = "c0000000000000000000000000000000";
        for (String[] kv : new String[][]{{k1, "../../../pom.xml"}, {k2, "dddddddddddddddddddddddddddddddd/c-0001_1.pdf"}}) {
            jdbc.update("INSERT INTO EXT_CHECK_FILE (CHECK_KEY, FILE_SEQ, FORMAT_CD, STORED_NAME, SHA256, FILE_SIZE) VALUES (?, 1, 'pdf', ?, ?, 1)",
                    kv[0], kv[1], "0000000000000000000000000000000000000000000000000000000000000000");
            assertEquals(kv[1], 404, getAs("/ext-checks/" + kv[0] + "/files/1", MEMBER).getStatus());
        }
    }

    @Test
    public void 영업팀_밖은_403이고_사번_없음은_401이며_접근_이력에_DENIED가_남는다() throws Exception {
        importOnePdf();
        String key = jdbc.queryForObject("SELECT CHECK_KEY FROM EXT_CHECK", String.class);
        String inst = jdbc.queryForObject("SELECT INSTITUTION_ID FROM EXT_CHECK", String.class);
        String listUrl = "/ext-checks?institution_id=" + inst;
        String fileUrl = "/ext-checks/" + key + "/files/1";
        int deniedBefore = count("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE = 'DENIED' AND REQ_PATH LIKE '/ext-checks%'");
        assertEquals(401, getAs(listUrl, null).getStatus());
        assertEquals(401, getAs(fileUrl, null).getStatus());
        for (String emp : new String[]{DESIGNER, ADMIN, UNKNOWN}) {
            MockHttpServletResponse l = getAs(listUrl, emp);
            MockHttpServletResponse d = getAs(fileUrl, emp);
            assertEquals(emp, 403, l.getStatus());
            assertEquals(emp, 403, d.getStatus());
            assertFalse(d.getContentAsString().contains("%PDF"));
        }
        assertEquals(2 + 6, count("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE = 'DENIED' AND REQ_PATH LIKE '/ext-checks%'") - deniedBefore);
    }

    @Test
    public void 열람_성공은_접근_이력에_경로와_요약만_남고_질의_값은_없다() throws Exception {
        importOnePdf();
        String key = jdbc.queryForObject("SELECT CHECK_KEY FROM EXT_CHECK", String.class);
        String inst = jdbc.queryForObject("SELECT INSTITUTION_ID FROM EXT_CHECK", String.class);
        // 접근 이력은 시험 트랜잭션 밖에 남을 수 있어(앞선 시험의 같은 경로 행) 이 시험이 만든 증가분만 센다.
        int listBefore = count("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE = 'API' AND REQ_PATH = '/ext-checks' AND STATUS_CODE = 200 AND DETAIL LIKE 'ext_check list%'");
        int queryBefore = count("SELECT COUNT(*) FROM ACCESS_LOG WHERE REQ_PATH LIKE '%institution_id%' OR DETAIL LIKE '%" + inst + "%'");
        assertEquals(200, getAs("/ext-checks?institution_id=" + inst, MEMBER).getStatus());
        assertEquals(200, getAs("/ext-checks/" + key + "/files/1", MEMBER).getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE = 'API' AND REQ_PATH = '/ext-checks/" + key + "/files/1' AND STATUS_CODE = 200 AND EMP_NO = '" + MEMBER + "'"));
        assertEquals(1, count("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE = 'API' AND REQ_PATH = '/ext-checks' AND STATUS_CODE = 200 AND DETAIL LIKE 'ext_check list%'") - listBefore);
        assertEquals(0, count("SELECT COUNT(*) FROM ACCESS_LOG WHERE REQ_PATH LIKE '%institution_id%' OR DETAIL LIKE '%" + inst + "%'") - queryBefore);
    }
}
