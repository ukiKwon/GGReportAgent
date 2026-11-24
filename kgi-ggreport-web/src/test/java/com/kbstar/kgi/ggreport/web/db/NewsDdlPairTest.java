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

/** 060 DDL 쌍 — INSERT 블록 글자 그대로·두 표 칸 이름·순서 같음·MySQL utf8mb4·본문 칸 없음. 파일만 읽는다(PlanCollectDdlPairTest 방식). */
public class NewsDdlPairTest {

    private static final Path DB = Paths.get("src/main/resources/db");
    private static final String FILE = "060_inst_news.sql";

    private static String read(String d) throws IOException {
        Path f = DB.resolve(d).resolve(FILE);
        assertTrue(f + " 가 없다 — 작업 디렉터리가 kgi-ggreport-web/ 인지 확인", Files.exists(f));
        return new String(Files.readAllBytes(f), StandardCharsets.UTF_8);
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
    public void INSERT_블록이_글자_그대로_같고_1행이다() throws IOException {
        List<String> o = inserts("oracle"), m = inserts("mysql");
        assertEquals(1, o.size());
        assertEquals(o, m);
        assertTrue(o.get(0).contains("VALUES ('PLAN_ACTION', 'NEWS_IMPORT', "));
    }

    @Test
    public void 두_표의_칸_이름과_순서가_같다() throws IOException {
        for (String t : new String[]{"INST_NEWS_IMPORT", "INST_NEWS_ITEM"}) {
            List<String> o = columns("oracle", t);
            assertTrue(t + " 칸을 못 읽었다", o.size() >= 10);
            assertEquals(t, o, columns("mysql", t));
            assertEquals(t + " 칸 이름이 겹친다", o.size(), new HashSet<>(o).size());
        }
    }

    @Test
    public void 본문_칸이_없고_요약만_있다() throws IOException {
        for (String d : new String[]{"oracle", "mysql"}) {
            List<String> cols = columns(d, "INST_NEWS_ITEM");
            assertTrue(cols.contains("SUMMARY"));
            for (String banned : new String[]{"BODY", "CONTENT", "TEXT", "ARTICLE"}) {
                assertFalse(d + " 에 " + banned + " 칸이 있다(본문 저장 금지)", cols.contains(banned));
            }
        }
    }

    @Test
    public void MySQL은_utf8mb4를_먼저_지정하고_머리글에_IMPORT_ID_의미와_NEWS_코드를_적는다() throws IOException {
        assertTrue(read("mysql").contains("SET NAMES utf8mb4;"));
        String o = read("oracle");
        assertTrue(o.contains("OUTCOME 이 'NEWS'"));
        assertTrue(o.contains("CLOSE_REASON='NEWS'"));
    }
}
