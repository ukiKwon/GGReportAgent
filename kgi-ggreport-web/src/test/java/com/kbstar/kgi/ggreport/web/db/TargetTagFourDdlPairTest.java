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

/** 목표 구분 4값 072 DDL 쌍 — INSERT 블록이 글자 그대로 같고 2행이며, REGAIN 중지·이관 UPDATE·기록 칸·사후 확인이 양쪽에 있고 문장 순서가 맞다. */
public class TargetTagFourDdlPairTest {
    private static final Path DB = Paths.get("src/main/resources/db");
    private static final String FILE = "072_target_tag_four.sql";

    private static List<String> lines(String dialect) throws IOException {
        Path f = DB.resolve(dialect).resolve(FILE);
        assertTrue(f + " 가 없다 — 작업 디렉터리가 kgi-ggreport-web/ 인지 확인", Files.exists(f));
        return Files.readAllLines(f, StandardCharsets.UTF_8);
    }

    private static List<String> inserts(String dialect) throws IOException {
        List<String> out = new ArrayList<>();
        boolean in = false;
        for (String line : lines(dialect)) {
            if (line.contains("[INSERT 블록 시작")) in = true;
            else if (line.contains("[INSERT 블록 끝")) in = false;
            else if (in && line.startsWith("INSERT INTO COMMON_CODE")) out.add(line);
        }
        return out;
    }

    private static int indexOf(List<String> ls, String startsWith, String contains) {
        for (int i = 0; i < ls.size(); i++) if (ls.get(i).startsWith(startsWith) && ls.get(i).contains(contains)) return i;
        return -1;
    }

    @Test
    public void 두_파일의_INSERT_블록이_같고_2행이다() throws IOException {
        List<String> oracle = inserts("oracle"), mysql = inserts("mysql");
        assertEquals(2, oracle.size());
        assertEquals(oracle, mysql);
        assertTrue(oracle.get(0).contains("'RETAIN_PRIVATE', '재유치 수의계약', 2, 1"));
        assertTrue(oracle.get(1).contains("'NEW_PRIVATE', '신규 수의계약', 4, 1"));
    }

    @Test
    public void 두_파일_모두_REGAIN_중지_기록_INSERT_기록에_있는_행만_UPDATE_순서다() throws IOException {
        for (String d : new String[]{"oracle", "mysql"}) {
            List<String> ls = lines(d);
            int off = indexOf(ls, "UPDATE COMMON_CODE SET ENABLED = 0", "CODE = 'REGAIN'");
            int mig = indexOf(ls, "INSERT INTO MIG072_TARGET_TAG", "");
            int upd = indexOf(ls, "UPDATE INST_BID_TARGET b SET TAG_CD = 'NEW'", "b.TAG_CD = 'REGAIN'");
            assertTrue(d + " REGAIN 사용 중지 문장이 없다", off >= 0);
            assertTrue(d + " MIG072 INSERT 가 없다", mig >= 0);
            assertTrue(d + " REGAIN → NEW UPDATE 가 없다", upd >= 0);
            assertTrue(d + " 순서: REGAIN 중지 → MIG INSERT → UPDATE", off < mig && mig < upd);
            StringBuilder all = new StringBuilder();
            for (String l : ls) all.append(l).append('\n');
            String s = all.toString();
            assertTrue(d + " 기록 칸(APPLIED_BY·BASIS·APPROVAL_REQ_ID·KIND_CD)", s.contains("APPLIED_BY") && s.contains("'DBA-072'")
                    && s.contains("'Q-2026-11-27-23'") && s.contains("APPROVAL_REQ_ID") && s.contains("KIND_CD"));
            assertTrue(d + " UPDATE 가 기록에 있는 행만 건드린다", s.contains("EXISTS (SELECT 1 FROM MIG072_TARGET_TAG m"));
            assertTrue(d + " 사후 확인 SELECT 2개", s.contains("SELECT COUNT(*) AS REMAINING_REGAIN") && s.contains("SELECT COUNT(*) AS MIG072_ROWS"));
        }
    }
}
