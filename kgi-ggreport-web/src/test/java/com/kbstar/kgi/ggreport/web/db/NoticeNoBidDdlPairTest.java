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

/** 040 NO_BID 코드 추가 — Oracle 정본과 MySQL 미러의 COMMON_CODE INSERT 블록이 글자 그대로 같고 2행이다(NoticeRoundDdlPairTest 와 같은 방식). */
public class NoticeNoBidDdlPairTest {

    private static final Path DB = Paths.get("src/main/resources/db");
    private static final String FILE = "040_notice_no_bid.sql";

    private static List<String> inserts(String dialect) throws IOException {
        Path f = DB.resolve(dialect).resolve(FILE);
        assertTrue(f + " 가 없다 — 작업 디렉터리가 kgi-ggreport-web/ 인지 확인", Files.exists(f));
        List<String> out = new ArrayList<>();
        boolean in = false;
        for (String line : Files.readAllLines(f, StandardCharsets.UTF_8)) {
            if (line.contains("[INSERT 블록 시작")) {
                in = true;
            } else if (line.contains("[INSERT 블록 끝")) {
                in = false;
            } else if (in && line.startsWith("INSERT INTO COMMON_CODE")) {
                out.add(line);
            }
        }
        return out;
    }

    @Test
    public void 두_파일의_INSERT_블록이_같고_2행이다() throws IOException {
        List<String> oracle = inserts("oracle");
        List<String> mysql = inserts("mysql");
        assertEquals(2, oracle.size());
        assertEquals("글자 그대로(순서까지) 같다", oracle, mysql);
        assertTrue(oracle.get(0).contains("'NOTICE_STATUS', 'NO_BID'"));
        assertTrue(oracle.get(1).contains("'NOTICE_ROUND_CLOSE', 'NO_BID'"));
    }
}
