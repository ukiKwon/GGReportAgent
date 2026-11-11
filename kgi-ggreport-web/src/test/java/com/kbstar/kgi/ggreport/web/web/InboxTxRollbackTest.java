package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * NEXT 72 S4 — 반입 DB 단계는 한 트랜잭션이라 중간 레코드가 실패하면 앞 레코드도 남지 않는다.
 *
 * <p>⚠️ 일부러 {@code @Transactional} 을 붙이지 않는다 — 테스트 트랜잭션이 서비스 트랜잭션을 삼키면
 * 롤백 여부를 볼 수 없다. 대신 직접 만든 행을 앞뒤로 지운다.
 */
@RunWith(SpringRunner.class)
@AppTest
public class InboxTxRollbackTest {

    private static final String BATCH_ID = "2026-09-01_0900_tx";
    private static final Path INBOX = Paths.get("target/inbox-test/inbox");
    private static final String MEMBER = "3918264";   // 영업팀
    private static final String CSV_HEADER = "기관명,기관구분,지역코드,입찰주기,지난입찰일,입찰예상일";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;

    @Before
    public void 앞정리() throws IOException { clean(); }

    @After
    public void 뒤정리() throws IOException { clean(); }

    private void clean() throws IOException {
        jdbc.update("DELETE FROM TASKS WHERE BID_CASE_ID IN (SELECT BID_CASE_ID FROM BID_CASES WHERE NOTICE_ID IN ('N-R1','N-R2'))");
        jdbc.update("DELETE FROM BID_CASES WHERE NOTICE_ID IN ('N-R1','N-R2')");
        jdbc.update("DELETE FROM INSTITUTIONS WHERE NAME_KO IN ('롤백구청A')");
        Path dir = INBOX.resolve(BATCH_ID);
        if (Files.exists(dir)) {
            Files.walkFileTree(dir, new SimpleFileVisitor<Path>() {
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
    }

    private void writeBatch(String records) throws IOException {
        Path dir = INBOX.resolve(BATCH_ID);
        Files.createDirectories(dir.resolve("files"));
        String manifest = "{\"schema_version\":1,\"batch_id\":\"" + BATCH_ID + "\","
                + "\"collected_at\":\"2026-09-01T09:00:00\",\"source\":{\"slug\":\"g2b\"},"
                + "\"records\":[" + records + "]}";
        Files.write(dir.resolve("manifest.json"), manifest.getBytes(StandardCharsets.UTF_8));
        Files.write(dir.resolve("institutions.csv"),
                (CSV_HEADER + "\n롤백구청A,자치구,11110,3,,\n").getBytes(StandardCharsets.UTF_8));
    }

    private static String record(String noticeId, String nameKo) {
        return "{\"notice_id\":\"" + noticeId + "\",\"title\":\"용역 공고\","
                + "\"institution\":{\"name_ko\":\"" + nameKo + "\"},"
                + "\"evidence\":{\"url\":\"http://example/" + noticeId + "\"},"
                + "\"schedule\":{\"deadline_at\":\"2026-12-01\",\"confidence\":\"확정\"},\"attachments\":[]}";
    }

    private MockHttpServletResponse importAsMember() throws Exception {
        MockHttpServletResponse res = mockMvc.perform(
                post("/inbox/" + BATCH_ID + "/import").header("X-Emp-No", MEMBER)).andReturn().getResponse();
        res.setCharacterEncoding("UTF-8");
        return res;
    }

    @Test
    public void 두번째_레코드가_422면_첫_레코드의_기관과_공고도_남지_않는다() throws Exception {
        writeBatch(record("N-R1", "롤백구청A") + "," + record("N-R2", "명단에없는구청"));

        MockHttpServletResponse res = importAsMember();

        assertEquals(res.getContentAsString(), 422, res.getStatus());
        assertTrue(res.getContentAsString().contains("records[1]"));
        assertEquals("기관 upsert 가 롤백돼야 한다", 0, (int) jdbc.queryForObject(
                "SELECT COUNT(*) FROM INSTITUTIONS WHERE NAME_KO=?", Integer.class, "롤백구청A"));
        assertEquals("앞 레코드의 공고 생성이 롤백돼야 한다", 0, (int) jdbc.queryForObject(
                "SELECT COUNT(*) FROM BID_CASES WHERE NOTICE_ID='N-R1'", Integer.class));
        assertTrue("실패하면 배치는 inbox 에 남는다", Files.isDirectory(INBOX.resolve(BATCH_ID)));
    }
}
