package com.kbstar.kgi.ggreport.web.db;

import org.junit.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/** 입찰 대상 064 DDL 쌍 — INSERT 블록이 글자 그대로 같고 4행이며, BID_CASES 칸 추가 두 문장이 양쪽에 있다. */
public class BidSubjectDdlPairTest {
    private static final Path DB = Paths.get("src/main/resources/db");
    private static final String FILE = "064_bid_subject.sql";

    private static Path file(String dialect) {
        Path f = DB.resolve(dialect).resolve(FILE);
        assertTrue(f + " 가 없다 — 작업 디렉터리가 kgi-ggreport-web/ 인지 확인", Files.exists(f));
        return f;
    }

    private static List<String> statements(String dialect) throws IOException {
        List<String> out = new ArrayList<>();
        for (String line : Files.readAllLines(file(dialect), StandardCharsets.UTF_8)) {
            String t = line.trim();
            if (!t.isEmpty() && !t.startsWith("--")) out.add(t.replaceAll("\\s+", " ").toUpperCase());
        }
        return out;
    }

    private static List<String> inserts(String dialect) throws IOException {
        List<String> out = new ArrayList<>();
        boolean in = false;
        for (String line : Files.readAllLines(file(dialect), StandardCharsets.UTF_8)) {
            if (line.contains("[INSERT 블록 시작")) in = true;
            else if (line.contains("[INSERT 블록 끝")) in = false;
            else if (in && line.startsWith("INSERT INTO COMMON_CODE")) out.add(line);
        }
        return out;
    }

    @Test
    public void 두_파일의_INSERT_블록이_같고_4행이다() throws IOException {
        List<String> oracle = inserts("oracle"), mysql = inserts("mysql");
        assertEquals(4, oracle.size());
        assertEquals(oracle, mysql);
        assertTrue(oracle.get(0).contains("'BID_SUBJECT', 'MAIN_BANK', '주거래은행·금고', 1, 1"));
    }

    @Test
    public void 두_파일_모두_BID_CASES에_두_칸을_더하고_기본값은_MAIN_BANK이다() throws IOException {
        for (String d : new String[]{"oracle", "mysql"}) {
            boolean cd = false, etc = false;
            for (String x : statements(d)) {
                if (x.startsWith("ALTER TABLE BID_CASES ADD") && x.contains("BID_SUBJECT_CD")
                        && x.contains("DEFAULT 'MAIN_BANK'") && x.contains("NOT NULL")) cd = true;
                if (x.startsWith("ALTER TABLE BID_CASES ADD") && x.contains("BID_SUBJECT_ETC")) etc = true;
            }
            assertTrue(d + " 에 BID_SUBJECT_CD 추가가 없다", cd);
            assertTrue(d + " 에 BID_SUBJECT_ETC 추가가 없다", etc);
        }
    }

    @Test
    public void 시험용_properties에서_064가_063_뒤에_온다() throws IOException {
        String all = new String(Files.readAllBytes(Paths.get("src/test/resources/application.properties")), StandardCharsets.UTF_8);
        int a = all.indexOf("db/oracle/063_bid_target_aim_rank.sql"), b = all.indexOf("db/oracle/064_bid_subject.sql");
        assertTrue(a >= 0 && b > a);
    }
}
