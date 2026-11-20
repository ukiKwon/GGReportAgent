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

/** 목표 기관 변경 056 DDL 쌍 — 새 표 둘의 칸 이름이 순서까지 같고, COMMON_CODE INSERT 블록이 글자 그대로 같으며 1행이다. */
public class BidTargetChangeDdlPairTest {
    private static final Path DB = Paths.get("src/main/resources/db");
    private static final String FILE = "056_bid_target_change.sql";

    private static String sql(String dialect) throws IOException {
        Path f = DB.resolve(dialect).resolve(FILE);
        assertTrue(f + " 가 없다 — 작업 디렉터리가 kgi-ggreport-web/ 인지 확인", Files.exists(f));
        return new String(Files.readAllBytes(f), StandardCharsets.UTF_8);
    }

    private static List<String> inserts(String dialect) throws IOException {
        List<String> out = new ArrayList<>();
        boolean in = false;
        for (String line : sql(dialect).split("\\r?\\n")) {
            if (line.contains("[INSERT 블록 시작")) in = true;
            else if (line.contains("[INSERT 블록 끝")) in = false;
            else if (in && line.startsWith("INSERT INTO COMMON_CODE")) out.add(line);
        }
        return out;
    }

    /** CREATE TABLE {table} ( … ) 안의 칸 이름 목록(순서대로). 제약·키·인덱스 줄은 뺀다. */
    private static List<String> columns(String dialect, String table) throws IOException {
        List<String> out = new ArrayList<>();
        boolean in = false;
        for (String line : sql(dialect).split("\\r?\\n")) {
            String t = line.trim();
            if (!in) {
                if (t.startsWith("CREATE TABLE " + table + " (")) in = true;
                continue;
            }
            if (t.startsWith(")")) break;
            String first = t.split("\\s+")[0];
            if (!first.matches("[A-Z][A-Z0-9_]*")) continue;
            if (first.equals("CONSTRAINT") || first.equals("PRIMARY") || first.equals("KEY") || first.equals("UNIQUE") || first.equals("INDEX")) continue;
            out.add(first);
        }
        return out;
    }

    @Test
    public void 두_파일의_INSERT_블록이_같고_1행이다() throws IOException {
        List<String> oracle = inserts("oracle"), mysql = inserts("mysql");
        assertEquals(1, oracle.size());
        assertEquals(1, mysql.size());
        assertEquals("글자 그대로 같다", oracle, mysql);
        assertTrue(oracle.get(0).contains("'CARRY_REVOKED'"));
    }

    @Test
    public void 항목_표_칸_이름이_순서까지_같고_19개() throws IOException {
        List<String> oracle = columns("oracle", "INST_BID_TARGET_REQ_ITEM"), mysql = columns("mysql", "INST_BID_TARGET_REQ_ITEM");
        assertEquals(19, oracle.size());
        assertEquals(oracle, mysql);
        assertEquals(19, new HashSet<>(oracle).size());
    }

    @Test
    public void 감사_표_칸_이름이_순서까지_같고_10개() throws IOException {
        List<String> oracle = columns("oracle", "INST_BID_TARGET_REQ_ACT"), mysql = columns("mysql", "INST_BID_TARGET_REQ_ACT");
        assertEquals(10, oracle.size());
        assertEquals(oracle, mysql);
    }

    @Test
    public void 협약_개시일_표_칸_이름이_순서까지_같고_12개() throws IOException {
        List<String> oracle = columns("oracle", "INST_BID_TERM"), mysql = columns("mysql", "INST_BID_TERM");
        assertEquals(12, oracle.size());
        assertEquals(oracle, mysql);
        assertEquals(12, new HashSet<>(oracle).size());
        assertTrue(oracle.contains("TERM_START"));
    }

    @Test
    public void 목표_표에_붙는_칸_셋이_두_파일에_모두_있다() throws IOException {
        for (String d : new String[]{"oracle", "mysql"}) {
            String s = sql(d);
            assertTrue(d + " APPROVAL_REQ_ID", s.contains("APPROVAL_REQ_ID"));
            assertTrue(d + " CARRY_FROM_NO", s.contains("CARRY_FROM_NO"));
            assertTrue(d + " CARRY_BASIS_CD", s.contains("CARRY_BASIS_CD"));
        }
    }
}
