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

/** NEXT 125 — 065(BID_CASES.BID_RANK_CD)·067(DASH_MARK WON·LOST) DDL 쌍. */
public class BidCaseRankResultMarksDdlPairTest {
    private static final Path DB = Paths.get("src/main/resources/db");
    private static final String F065 = "065_bid_case_rank.sql", F067 = "067_prep_result_marks.sql";

    private static Path file(String dialect, String name) {
        Path f = DB.resolve(dialect).resolve(name);
        assertTrue(f + " 가 없다 — 작업 디렉터리가 kgi-ggreport-web/ 인지 확인", Files.exists(f));
        return f;
    }

    private static List<String> statements(String dialect, String name) throws IOException {
        List<String> out = new ArrayList<>();
        for (String line : Files.readAllLines(file(dialect, name), StandardCharsets.UTF_8)) {
            String t = line.trim();
            if (!t.isEmpty() && !t.startsWith("--")) out.add(t.replaceAll("\\s+", " ").toUpperCase());
        }
        return out;
    }

    private static List<String> inserts(String dialect, String name) throws IOException {
        List<String> out = new ArrayList<>();
        boolean in = false;
        for (String line : Files.readAllLines(file(dialect, name), StandardCharsets.UTF_8)) {
            if (line.contains("[INSERT 블록 시작")) in = true;
            else if (line.contains("[INSERT 블록 끝")) in = false;
            else if (in && line.startsWith("INSERT INTO COMMON_CODE")) out.add(line);
        }
        return out;
    }

    @Test
    public void 순위칸_065_두_파일_모두_BID_RANK_CD_한_칸만_더하고_NULL을_허용한다() throws IOException {
        for (String d : new String[]{"oracle", "mysql"}) {
            int alters = 0;
            for (String x : statements(d, F065)) {
                if (x.startsWith("ALTER TABLE BID_CASES ADD")) {
                    alters++;
                    assertTrue(d + " " + x, x.contains("BID_RANK_CD") && !x.contains("NOT NULL") && !x.contains("DEFAULT"));
                }
            }
            assertEquals(d + " ALTER 개수", 1, alters);
        }
    }

    @Test
    public void 순위칸_065_헤더_코드_목록에_OTHER가_있다() throws IOException {
        for (String d : new String[]{"oracle", "mysql"}) {
            String all = new String(Files.readAllBytes(file(d, F065)), StandardCharsets.UTF_8);
            assertTrue(d, all.contains("FIRST·SECOND·SINGLE·MAIN_BANK·OTHER"));
        }
    }

    @Test
    public void 결과표시_067_두_파일의_INSERT_블록이_같고_2행이다() throws IOException {
        List<String> oracle = inserts("oracle", F067), mysql = inserts("mysql", F067);
        assertEquals(2, oracle.size());
        assertEquals(oracle, mysql);
        assertTrue(oracle.get(0).contains("'DASH_MARK', 'WON', '선정', 5, 1"));
        assertTrue(oracle.get(1).contains("'DASH_MARK', 'LOST', '탈락', 6, 1"));
    }

    @Test
    public void 결과표시_067_표나_칸을_바꾸지_않는다() throws IOException {
        for (String d : new String[]{"oracle", "mysql"}) {
            for (String x : statements(d, F067)) {
                assertTrue(d + " " + x, x.startsWith("INSERT INTO COMMON_CODE") || x.equals("COMMIT;"));
            }
        }
    }

    @Test
    public void 시험용_properties에서_065_067이_064_뒤_054_뒤에_온다() throws IOException {
        String all = new String(Files.readAllBytes(Paths.get("src/test/resources/application.properties")), StandardCharsets.UTF_8);
        int s054 = all.indexOf("db/oracle/054_prep_board_check.sql"), s064 = all.indexOf("db/oracle/064_bid_subject.sql");
        int s065 = all.indexOf("db/oracle/065_bid_case_rank.sql"), s067 = all.indexOf("db/oracle/067_prep_result_marks.sql");
        assertTrue(s054 >= 0 && s064 >= 0 && s065 > s064 && s067 > s065 && s067 > s054);
    }
}
