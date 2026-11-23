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

/** 목표 태그 REGAIN 059 DDL 쌍 — INSERT 블록이 글자 그대로 같고 1행이며, NEW 순서 갱신 문장이 양쪽에 있다. */
public class TargetTagRegainDdlPairTest {
    private static final Path DB = Paths.get("src/main/resources/db");
    private static final String FILE = "059_target_tag_regain.sql";

    private static Path file(String dialect) {
        Path f = DB.resolve(dialect).resolve(FILE);
        assertTrue(f + " 가 없다 — 작업 디렉터리가 kgi-ggreport-web/ 인지 확인", Files.exists(f));
        return f;
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
    public void 두_파일의_INSERT_블록이_같고_1행이다() throws IOException {
        List<String> oracle = inserts("oracle"), mysql = inserts("mysql");
        assertEquals(1, oracle.size());
        assertEquals(oracle, mysql);
        assertTrue(oracle.get(0).contains("'TARGET_TAG', 'REGAIN', '되찾기 도전', 2, 1"));
    }

    @Test
    public void 두_파일_모두_NEW_순서를_3으로_올린다() throws IOException {
        for (String d : new String[]{"oracle", "mysql"}) {
            boolean found = false;
            for (String line : Files.readAllLines(file(d), StandardCharsets.UTF_8)) {
                if (line.startsWith("UPDATE COMMON_CODE") && line.contains("SET SORT_NO = 3") && line.contains("CODE = 'NEW'")) found = true;
            }
            assertTrue(d + " 에 NEW SORT_NO=3 UPDATE 가 없다", found);
        }
    }
}
