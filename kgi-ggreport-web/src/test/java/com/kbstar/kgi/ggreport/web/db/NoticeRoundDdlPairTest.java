package com.kbstar.kgi.ggreport.web.db;

import org.junit.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * 공고 상태 기록 037 DDL 쌍 — Oracle 정본과 MySQL 미러의 COMMON_CODE INSERT 블록이 글자 그대로 같고 13행이다.
 * 파일을 직접 읽는다(Spring 불필요). InstPlanDdlPairTest 와 같은 방식.
 */
public class NoticeRoundDdlPairTest {

    private static final Path DB = Paths.get("src/main/resources/db");
    private static final String FILE = "037_notice_round.sql";
    private static final String START = "[INSERT 블록 시작";
    private static final String END = "[INSERT 블록 끝";

    private static List<String> inserts(String dialect) throws IOException {
        Path f = DB.resolve(dialect).resolve(FILE);
        assertTrue(f + " 가 없다 — 작업 디렉터리가 kgi-ggreport-web/ 인지 확인", Files.exists(f));
        List<String> out = new ArrayList<>();
        boolean in = false;
        for (String line : Files.readAllLines(f, StandardCharsets.UTF_8)) {
            if (line.contains(START)) {
                in = true;
            } else if (line.contains(END)) {
                in = false;
            } else if (in && line.startsWith("INSERT INTO COMMON_CODE")) {
                out.add(line);
            }
        }
        return out;
    }

    @Test
    public void 두_파일의_INSERT_블록이_같고_13행이다() throws IOException {
        List<String> oracle = inserts("oracle");
        List<String> mysql = inserts("mysql");
        assertEquals(13, oracle.size());
        assertEquals(13, mysql.size());
        assertEquals("중복 줄이 없다", 13, new HashSet<>(oracle).size());
        assertEquals("글자 그대로(순서까지) 같다", oracle, mysql);
    }

    @Test
    public void 두_표가_두_파일에_모두_있다() throws IOException {
        for (String dialect : new String[]{"oracle", "mysql"}) {
            String sql = new String(Files.readAllBytes(DB.resolve(dialect).resolve(FILE)), StandardCharsets.UTF_8);
            assertTrue(dialect + " 에 NOTICE_ROUND 가 없다", sql.contains("CREATE TABLE NOTICE_ROUND ("));
            assertTrue(dialect + " 에 NOTICE_ROUND_LOG 가 없다", sql.contains("CREATE TABLE NOTICE_ROUND_LOG ("));
        }
    }
}
