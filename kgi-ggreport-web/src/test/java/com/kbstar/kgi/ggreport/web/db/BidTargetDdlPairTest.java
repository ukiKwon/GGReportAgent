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

/** 목표 기관 043 DDL 쌍 — Oracle 정본과 MySQL 미러의 COMMON_CODE INSERT 블록이 글자 그대로 같고 6행이다. */
public class BidTargetDdlPairTest {
    private static final Path DB = Paths.get("src/main/resources/db");
    private static final String FILE = "043_bid_target.sql";

    private static List<String> inserts(String dialect) throws IOException {
        Path f = DB.resolve(dialect).resolve(FILE);
        assertTrue(f + " 가 없다 — 작업 디렉터리가 kgi-ggreport-web/ 인지 확인", Files.exists(f));
        List<String> out = new ArrayList<>();
        boolean in = false;
        for (String line : Files.readAllLines(f, StandardCharsets.UTF_8)) {
            if (line.contains("[INSERT 블록 시작")) in = true;
            else if (line.contains("[INSERT 블록 끝")) in = false;
            else if (in && line.startsWith("INSERT INTO COMMON_CODE")) out.add(line);
        }
        return out;
    }

    @Test
    public void 두_파일의_INSERT_블록이_같고_6행이다() throws IOException {
        List<String> oracle = inserts("oracle"), mysql = inserts("mysql");
        assertEquals(6, oracle.size());
        assertEquals(6, mysql.size());
        assertEquals(6, new HashSet<>(oracle).size());
        assertEquals("글자 그대로(순서까지) 같다", oracle, mysql);
    }

    /** CREATE TABLE INST_BID_TARGET ( … ) 안의 칸 이름 목록(순서대로). 제약·키·인덱스 줄은 뺀다. */
    private static List<String> columns(String dialect) throws IOException {
        Path f = DB.resolve(dialect).resolve(FILE);
        assertTrue(f + " 가 없다", Files.exists(f));
        List<String> out = new ArrayList<>();
        boolean in = false;
        for (String line : Files.readAllLines(f, StandardCharsets.UTF_8)) {
            String t = line.trim();
            if (!in) {
                if (t.startsWith("CREATE TABLE INST_BID_TARGET")) in = true;
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
    public void 두_파일의_CREATE_TABLE_칸_이름이_순서까지_같다() throws IOException {
        List<String> oracle = columns("oracle"), mysql = columns("mysql");
        assertEquals("칸 18개", 18, oracle.size());
        assertEquals(oracle, mysql);
        assertEquals(18, new HashSet<>(oracle).size());
    }

    @Test
    public void 표와_칸이_두_파일에_모두_있다() throws IOException {
        for (String d : new String[]{"oracle", "mysql"}) {
            String sql = new String(Files.readAllBytes(DB.resolve(d).resolve(FILE)), StandardCharsets.UTF_8);
            assertTrue(d, sql.contains("CREATE TABLE INST_BID_TARGET ("));
            assertTrue(d + " 에 TARGET_YEAR", sql.contains("TARGET_YEAR"));
            assertTrue(d + " 에 OWNER_EMP_NO", sql.contains("OWNER_EMP_NO"));
            assertTrue(d + " 에 CANCEL_REASON_CD", sql.contains("CANCEL_REASON_CD"));
        }
    }
}
