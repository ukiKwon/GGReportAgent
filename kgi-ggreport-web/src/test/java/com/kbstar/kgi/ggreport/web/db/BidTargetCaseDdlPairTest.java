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

/** NEXT 125 — 066 DDL 쌍: INSERT 블록이 글자 그대로 같고 1행(기타), 두 표에 칸 추가·PK 교체 문장이 양쪽에 있다. */
public class BidTargetCaseDdlPairTest {
    private static final Path DB = Paths.get("src/main/resources/db");
    private static final String FILE = "066_bid_target_case.sql";

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

    private static boolean has(String dialect, String head, String... parts) throws IOException {
        for (String x : statements(dialect)) {
            if (!x.startsWith(head)) continue;
            boolean all = true;
            for (String p : parts) if (!x.contains(p)) all = false;
            if (all) return true;
        }
        return false;
    }

    @Test
    public void 두_파일의_INSERT_블록이_같고_기타_1행이다() throws IOException {
        List<String> oracle = inserts("oracle"), mysql = inserts("mysql");
        assertEquals(1, oracle.size());
        assertEquals(oracle, mysql);
        assertTrue(oracle.get(0).contains("'TARGET_AIM_RANK', 'OTHER', '기타', 5, 1"));
    }

    @Test
    public void 두_파일_모두_두_표에_AIM_RANK_ETC_칸을_더한다() throws IOException {
        for (String d : new String[]{"oracle", "mysql"}) {
            assertTrue(d + " INST_BID_TARGET.AIM_RANK_ETC", has(d, "ALTER TABLE INST_BID_TARGET ADD", "AIM_RANK_ETC"));
            assertTrue(d + " INST_BID_TARGET_REQ_ITEM.AIM_RANK_ETC", has(d, "ALTER TABLE INST_BID_TARGET_REQ_ITEM ADD", "AIM_RANK_ETC"));
        }
    }

    @Test
    public void 두_파일_모두_대상_연결_칸과_결재_항목_PK_교체가_있다() throws IOException {
        for (String d : new String[]{"oracle", "mysql"}) {
            assertTrue(d + " BID_SUBJECT_CD 기본 MAIN_BANK", has(d, "ALTER TABLE INST_BID_TARGET ADD", "BID_SUBJECT_CD", "DEFAULT 'MAIN_BANK'", "NOT NULL"));
            assertTrue(d + " BID_CASE_ID", has(d, "ALTER TABLE INST_BID_TARGET ADD", "BID_CASE_ID"));
            assertTrue(d + " REQ_ITEM BID_SUBJECT_CD", has(d, "ALTER TABLE INST_BID_TARGET_REQ_ITEM ADD", "BID_SUBJECT_CD", "DEFAULT 'MAIN_BANK'"));
            boolean pk = false;
            for (String x : statements(d)) if (x.startsWith("ALTER TABLE INST_BID_TARGET_REQ_ITEM") && x.contains("PRIMARY KEY") && x.contains("(REQ_ID, ITEM_NO)")) pk = true;
            assertTrue(d + " PK (REQ_ID, ITEM_NO)", pk);
        }
    }

    @Test
    public void 시험용_properties에서_066이_065_뒤에_온다() throws IOException {
        String all = new String(Files.readAllBytes(Paths.get("src/test/resources/application.properties")), StandardCharsets.UTF_8);
        int a = all.indexOf("db/oracle/065_bid_case_rank.sql"), b = all.indexOf("db/oracle/066_bid_target_case.sql");
        assertTrue(a >= 0 && b > a);
    }
}
