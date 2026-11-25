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

/** 금고 방식 063 DDL 쌍 — INSERT 블록이 글자 그대로 같고 4행이며, 두 표의 AIM_RANK_CD 추가와 TAG_CD NULL 허용이 양쪽에 있다. */
public class BidTargetAimRankDdlPairTest {
    private static final Path DB = Paths.get("src/main/resources/db");
    private static final String FILE = "063_bid_target_aim_rank.sql";

    private static Path file(String dialect) {
        Path f = DB.resolve(dialect).resolve(FILE);
        assertTrue(f + " 가 없다 — 작업 디렉터리가 kgi-ggreport-web/ 인지 확인", Files.exists(f));
        return f;
    }

    /** -- 주석 줄을 뺀 문장 줄들(공백 정리). */
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
        assertTrue(oracle.get(0).contains("'TARGET_AIM_RANK', 'FIRST', '1금고', 1, 1"));
        assertTrue(oracle.get(1).contains("'TARGET_AIM_RANK', 'SECOND', '2금고', 2, 1"));
        assertTrue(oracle.get(2).contains("'TARGET_AIM_RANK', 'SINGLE', '단수금고', 3, 1"));
        assertTrue(oracle.get(3).contains("'TARGET_AIM_RANK', 'MAIN_BANK', '주거래', 4, 1"));   // '주거래은행' 아님(사용자 11-25)
    }

    @Test
    public void 두_파일_모두_두_표에_AIM_RANK_CD를_더하고_TAG_CD를_NULL_허용으로_바꾼다() throws IOException {
        for (String d : new String[]{"oracle", "mysql"}) {
            List<String> s = statements(d);
            boolean target = false, item = false, tag = false;
            for (String x : s) {
                if (x.startsWith("ALTER TABLE INST_BID_TARGET ADD") && x.contains("AIM_RANK_CD")) target = true;
                if (x.startsWith("ALTER TABLE INST_BID_TARGET_REQ_ITEM ADD") && x.contains("AIM_RANK_CD")) item = true;
                if (x.startsWith("ALTER TABLE INST_BID_TARGET MODIFY") && x.contains("TAG_CD") && x.contains("NULL") && !x.contains("NOT NULL")) tag = true;
            }
            assertTrue(d + " 에 INST_BID_TARGET.AIM_RANK_CD 추가가 없다", target);
            assertTrue(d + " 에 INST_BID_TARGET_REQ_ITEM.AIM_RANK_CD 추가가 없다", item);
            assertTrue(d + " 에 INST_BID_TARGET.TAG_CD NULL 허용이 없다", tag);
        }
    }

    @Test
    public void 시험용_properties에서_063이_062_뒤에_온다() throws IOException {
        String all = new String(Files.readAllBytes(Paths.get("src/test/resources/application.properties")), StandardCharsets.UTF_8);
        int a = all.indexOf("db/oracle/062_prep_open_start.sql"), b = all.indexOf("db/oracle/063_bid_target_aim_rank.sql");
        assertTrue(a >= 0 && b > a);
    }
}
