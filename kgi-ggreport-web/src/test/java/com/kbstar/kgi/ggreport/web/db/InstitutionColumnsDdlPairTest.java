package com.kbstar.kgi.ggreport.web.db;

import org.junit.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 030(기관 칸 추가 + INST_EDIT_LOG) 쌍 — Oracle 정본과 MySQL 미러의 INSERT 블록이 글자 그대로 같고, 칸 이름·순서가 같고,
 * 외래키·CHECK·REFERENCES 가 없는지 본다. 파일을 직접 읽는다(Spring 불필요, 작업 디렉터리는 kgi-ggreport-web/).
 */
public class InstitutionColumnsDdlPairTest {

    private static final Path DB = Paths.get("src/main/resources/db");
    private static final String FILE = "030_institution_columns.sql";

    private static String read(String dialect) throws IOException {
        Path f = DB.resolve(dialect).resolve(FILE);
        assertTrue(f + " 가 없다 — 작업 디렉터리가 kgi-ggreport-web/ 인지 확인", Files.exists(f));
        return new String(Files.readAllBytes(f), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    /** 주석 줄(-- 로 시작)을 뺀 본문. */
    private static String code(String text) {
        StringBuilder sb = new StringBuilder();
        for (String line : text.split("\n")) {
            String t = line.trim();
            if (!t.startsWith("--")) {
                sb.append(line.replaceAll("--.*$", "")).append('\n');
            }
        }
        return sb.toString();
    }

    private static String insertBlock(String text) {
        int s = text.indexOf("[INSERT 블록 시작");
        int e = text.indexOf("[INSERT 블록 끝");
        assertTrue("INSERT 블록 표식", s >= 0 && e > s);
        String body = text.substring(text.indexOf('\n', s) + 1, text.lastIndexOf('\n', e) + 1);
        return body;
    }

    private static List<String> names(String block) {
        List<String> out = new ArrayList<>();
        Matcher m = Pattern.compile("(?m)^\\s*([A-Z][A-Z0-9_]*)\\s+(VARCHAR2?|NUMBER|BIGINT|SMALLINT)\\b").matcher(block);
        while (m.find()) {
            out.add(m.group(1));
        }
        return out;
    }

    @Test
    public void INSERT_블록이_글자_그대로_같고_두_행이다() throws IOException {
        String or = insertBlock(read("oracle"));
        String my = insertBlock(read("mysql"));
        assertEquals(or, my);
        assertEquals(2, or.split("\n").length);
        assertTrue(or.contains("'INST_OP_STATUS', 'OPERATING'"));
        assertTrue(or.contains("'INST_OP_STATUS', 'PLANNED'"));
    }

    @Test
    public void INSTITUTIONS_추가_칸_아홉_개가_같다() throws IOException {
        List<String> expect = Arrays.asList("ORG_CODE", "G2B_CODE", "OP_STATUS", "OPEN_DATE", "CONTRACT_END_CONFIRMED",
                "CONTRACT_END_SRC_URL", "CONTRACT_END_SRC_NO", "OP_SRC_URL", "OP_SRC_NO");
        for (String d : new String[]{"oracle", "mysql"}) {
            String c = code(read(d));
            int a = c.indexOf("ALTER TABLE INSTITUTIONS");
            int e = c.indexOf(';', a);
            assertTrue(d + " ALTER", a >= 0 && e > a);
            List<String> got = new ArrayList<>();
            Matcher m = Pattern.compile("(?m)^\\s*(?:ADD COLUMN\\s+|ADD \\(\\s*)?([A-Z][A-Z0-9_]*)\\s+(VARCHAR2?|NUMBER|SMALLINT)\\b")
                    .matcher(c.substring(a, e));
            while (m.find()) {
                got.add(m.group(1));
            }
            assertEquals(d + " 추가 칸", expect, got);
        }
    }

    @Test
    public void INST_EDIT_LOG_칸_열네_개가_이름과_순서까지_같다() throws IOException {
        List<String> expect = Arrays.asList("LOG_ID", "BATCH_KEY", "INSTITUTION_ID", "FIELD_CD", "OLD_VAL", "NEW_VAL", "SRC_URL",
                "SRC_NO", "ACTOR_EMP_NO", "EMP_VERIFIED", "SCREEN_ID", "BUTTON_ID", "UI_VALID", "LOGGED_AT");
        for (String d : new String[]{"oracle", "mysql"}) {
            String c = code(read(d));
            int a = c.indexOf("CREATE TABLE INST_EDIT_LOG");
            int e = c.indexOf(";", a);
            assertTrue(d + " CREATE TABLE", a >= 0 && e > a);
            List<String> got = new ArrayList<>();
            for (String n : names(c.substring(a, e))) {
                if (!n.equals("PRIMARY") && !n.equals("KEY") && !n.equals("CONSTRAINT")) {
                    got.add(n);
                }
            }
            assertEquals(d + " 칸", expect, got);
        }
    }

    @Test
    public void 외래키_CHECK_REFERENCES가_없다() throws IOException {
        for (String d : new String[]{"oracle", "mysql"}) {
            String c = code(read(d)).toUpperCase();
            assertFalse(d, c.contains("FOREIGN KEY"));
            assertFalse(d, c.contains("REFERENCES"));
            assertFalse(d, Pattern.compile("\\bCHECK\\b").matcher(c).find());
            assertFalse(d + " UNIQUE", Pattern.compile("\\bUNIQUE\\b").matcher(c).find());
        }
    }
}
