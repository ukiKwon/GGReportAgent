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

/** 금고 순위 SINGLE 041 DDL 쌍 — INSERT 블록이 글자 그대로 같고 1행이다. */
public class BankRankSingleDdlPairTest {
    private static final Path DB = Paths.get("src/main/resources/db");
    private static final String FILE = "041_bank_rank_single.sql";

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
    public void 두_파일의_INSERT_블록이_같고_1행이다() throws IOException {
        List<String> oracle = inserts("oracle"), mysql = inserts("mysql");
        assertEquals(1, oracle.size());
        assertEquals(oracle, mysql);
        assertTrue(oracle.get(0).contains("'BANK_RANK', 'SINGLE', '단수 금고', 5, 1"));
    }
}
