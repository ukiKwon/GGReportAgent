package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.service.ExtCheckFixtures;
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
    private static final Path INBOX = Paths.get("target/inbox-test/inbox");
    private static final Path BATCHES = Paths.get("target/inbox-test/batches");
    private static final Path EXT = Paths.get("target/inbox-test/ext_check");
    private static final String MEMBER = "3918264";     // 영업팀
    private static final String INST = "확인구청";
    private static final String CSV_HEADER = "기관명,기관구분,지역코드,입찰주기,지난입찰일,입찰예상일";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    private final ObjectMapper json = new ObjectMapper();

    @Before
    public void 비운다() throws Exception {
        for (Path p : new Path[]{INBOX, BATCHES, EXT}) {
            deleteTree(p);
            Files.createDirectories(p);
        }
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
            assertTrue("대상 폴더 밖 파일은 그대로여야 한다", Files.isRegularFile(outside.resolve("c-0001_1.pdf")));
            assertTrue(Files.isDirectory(dir));
        } finally {
            Files.delete(link);          // junction 자체만 지운다
            deleteTree(outside);
        }
    }
}
