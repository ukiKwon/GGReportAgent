package com.kbstar.kgi.ggreport.web.db;

import org.junit.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** 049 DDL 쌍 — INSERT 블록 글자 그대로·두 표 칸 순서 같음·FORM_VER 열 양쪽·11g 문법. 파일만 읽는다(PlanCollectDdlPairTest 방식). */
public class PrepFormDdlPairTest {

    private static final Path DB = Paths.get("src/main/resources/db");
    private static final String FILE = "049_prep_form.sql";

    private static String read(String d) throws IOException {
        Path f = DB.resolve(d).resolve(FILE);
        assertTrue(f + " 가 없다 — 작업 디렉터리가 kgi-ggreport-web/ 인지 확인", Files.exists(f));
        return new String(Files.readAllBytes(f), StandardCharsets.UTF_8);
    }

    /** `--` 주석을 걷어낸 문장 부분(헤더 주석에 '자동 번호·검사 제약' 같은 설명이 있어도 문법 검사에 걸리지 않게). */
    private static String code(String d) throws IOException {
        return read(d).replaceAll("--[^\\r\\n]*", "");
    }

    private static List<String> inserts(String d) throws IOException {
        List<String> out = new ArrayList<>();
        boolean in = false;
        for (String line : Files.readAllLines(DB.resolve(d).resolve(FILE), StandardCharsets.UTF_8)) {
            if (line.contains("[INSERT 블록 시작")) in = true;
            else if (line.contains("[INSERT 블록 끝")) in = false;
            else if (in && line.startsWith("INSERT INTO COMMON_CODE")) out.add(line);
        }
        return out;
    }

    private static List<String> columns(String d, String table) throws IOException {
        List<String> out = new ArrayList<>();
        Set<String> skip = new HashSet<>(Arrays.asList("PRIMARY", "KEY", "CONSTRAINT", "UNIQUE", "INDEX", "FOREIGN", "CHECK"));
        Pattern word = Pattern.compile("^([A-Z][A-Z0-9_]*)\\b.*");
        boolean in = false;
        for (String raw : Files.readAllLines(DB.resolve(d).resolve(FILE), StandardCharsets.UTF_8)) {
            String line = raw.trim();
            if (line.startsWith("CREATE TABLE " + table + " (")) { in = true; continue; }
            if (!in) continue;
            if (line.startsWith(")")) break;
            Matcher m = word.matcher(line);
            if (m.matches() && !skip.contains(m.group(1))) out.add(m.group(1));
        }
        return out;
    }

    @Test
    public void INSERT_블록이_글자_그대로_같고_2행이다() throws IOException {
        List<String> o = inserts("oracle"), m = inserts("mysql");
        assertEquals(2, o.size());
        assertEquals(o, m);
    }

    @Test
    public void 코드는_PREP_EVENT_FORM_두_개뿐이다() throws IOException {
        Pattern p = Pattern.compile("VALUES \\('PREP_EVENT', '(FORM_CONFIRM|FORM_UNCONFIRM)', ");
        Set<String> codes = new HashSet<>();
        for (String line : inserts("oracle")) {
            Matcher x = p.matcher(line);
            assertTrue("PREP_EVENT 의 FORM_ 코드만 — 새 그룹은 CommonCodeSchemaTest 를 깬다: " + line, x.find());
            codes.add(x.group(1));
        }
        assertEquals(new HashSet<>(Arrays.asList("FORM_CONFIRM", "FORM_UNCONFIRM")), codes);
    }

    @Test
    public void 두_표의_칸_이름과_순서가_같다() throws IOException {
        for (String t : new String[]{"BID_PREP_FORM", "BID_PREP_FORM_VER"}) {
            List<String> o = columns("oracle", t);
            assertTrue(t + " 칸을 못 읽었다", o.size() >= 10);
            assertEquals(t, o, columns("mysql", t));
        }
    }

    @Test
    public void 감사_이력_표에_FORM_VER_열을_양쪽에서_더한다() throws IOException {
        String o = code("oracle"), m = code("mysql");
        assertTrue(o.contains("ALTER TABLE BID_PREP_LOG ADD (FORM_VER NUMBER(6));"));
        assertTrue(o.contains("ALTER TABLE BID_PREP_ACT ADD (FORM_VER NUMBER(6));"));
        assertTrue(m.contains("ALTER TABLE BID_PREP_LOG ADD COLUMN FORM_VER INT NULL;"));
        assertTrue(m.contains("ALTER TABLE BID_PREP_ACT ADD COLUMN FORM_VER INT NULL;"));
    }

    @Test
    public void Oracle은_11g_문법이다_자동번호_행수제한_검사제약_외래키가_없다() throws IOException {
        String o = code("oracle");
        assertFalse(o.contains("GENERATED"));
        assertFalse(Pattern.compile("\\bIDENTITY\\b", Pattern.CASE_INSENSITIVE).matcher(o).find());
        assertFalse(Pattern.compile("FETCH\\s+FIRST", Pattern.CASE_INSENSITIVE).matcher(o).find());
        assertFalse(Pattern.compile("\\bCHECK\\b", Pattern.CASE_INSENSITIVE).matcher(o).find());
        assertFalse(Pattern.compile("\\bREFERENCES\\b|FOREIGN\\s+KEY", Pattern.CASE_INSENSITIVE).matcher(o).find());
        assertTrue(o.contains("CONTENT_JSON   CLOB"));
    }

    @Test
    public void MySQL은_utf8mb4를_먼저_지정하고_판_표는_본문을_LONGTEXT로_둔다() throws IOException {
        String m = code("mysql");
        assertTrue(m.contains("SET NAMES utf8mb4;"));
        assertTrue(m.contains("CONTENT_JSON   LONGTEXT"));
    }
}
