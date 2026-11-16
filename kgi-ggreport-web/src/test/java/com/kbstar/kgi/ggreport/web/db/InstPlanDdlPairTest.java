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
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * 기관 사업계획 034 DDL 쌍 — Oracle 정본과 MySQL 미러의 COMMON_CODE INSERT 블록이 글자 그대로 같고 26행이다.
 * 파일을 직접 읽는다(Spring 불필요). InstHeadDdlPairTest 와 같은 방식.
 */
public class InstPlanDdlPairTest {

    private static final Path DB = Paths.get("src/main/resources/db");
    private static final String FILE = "034_inst_plan.sql";
    private static final String START = "[INSERT 블록 시작";
    private static final String END = "[INSERT 블록 끝";

    private static List<String> inserts(String dialect) throws IOException {
        Path f = DB.resolve(dialect).resolve(FILE);
        assertTrue(f + " 가 없다 — 작업 디렉터리가 kgi-ggreport-web/ 인지 확인", Files.exists(f));
        List<String> out = new ArrayList<>();
        boolean in = false;
        for (String line : Files.readAllLines(f, StandardCharsets.UTF_8)) {
            if (line.contains(START)) {
                in = true;
            } else if (line.contains(END)) {
                in = false;
            } else if (in && line.startsWith("INSERT INTO COMMON_CODE")) {
                out.add(line);
            }
        }
        return out;
    }

    private static String read(String dialect) throws IOException {
        return new String(Files.readAllBytes(DB.resolve(dialect).resolve(FILE)), StandardCharsets.UTF_8);
    }

    @Test
    public void 두_파일의_INSERT_블록이_같고_26행이다() throws IOException {
        List<String> oracle = inserts("oracle");
        List<String> mysql = inserts("mysql");
        assertEquals(26, oracle.size());
        assertEquals(26, mysql.size());
        assertEquals(new LinkedHashSet<>(oracle), new LinkedHashSet<>(mysql));
        assertEquals("중복 줄이 없다", 26, new HashSet<>(oracle).size());
        assertEquals("글자 그대로(순서까지) 같다", oracle, mysql);
    }

    @Test
    public void 코드_그룹은_7개다() throws IOException {
        Set<String> groups = new TreeSet<>();
        Pattern p = Pattern.compile("VALUES \\('([A-Z_]+)', ");
        for (String line : inserts("oracle")) {
            Matcher m = p.matcher(line);
            assertTrue(line, m.find());
            groups.add(m.group(1));
        }
        assertEquals(new TreeSet<>(Arrays.asList("PLAN_SRC_KIND", "PLAN_CHECK", "PLAN_BUDGET_STATE", "PLAN_BUDGET_UNIT",
                "PLAN_PROGRESS", "PLAN_ORIGIN", "PLAN_ACTION")), groups);
    }

    @Test
    public void 예산_상태는_4종이고_0_상태가_없다() throws IOException {
        Set<String> codes = new TreeSet<>();
        Pattern p = Pattern.compile("VALUES \\('PLAN_BUDGET_STATE', '([A-Z0-9_]+)', ");
        for (String line : inserts("oracle")) {
            Matcher m = p.matcher(line);
            if (m.find()) {
                codes.add(m.group(1));
            }
        }
        assertEquals(new TreeSet<>(Arrays.asList("AMOUNT", "UNVERIFIED", "NOT_IN_SOURCE", "NOT_APPLICABLE")), codes);
    }

    @Test
    public void 네_표가_두_파일에_모두_있다() throws IOException {
        for (String dialect : new String[]{"oracle", "mysql"}) {
            String sql = read(dialect);
            for (String t : new String[]{"INST_PLAN_IMPORT", "INST_PLAN_DOC", "INST_PLAN_ITEM", "INST_PLAN_ACT"}) {
                assertTrue(dialect + " 에 " + t + " 가 없다", sql.contains("CREATE TABLE " + t + " ("));
            }
            assertTrue(dialect + " 문서 표에 수집 프로그램 칸이 없다", sql.contains("COLLECTOR_AGENT"));
            assertTrue(dialect + " 에 옛 사번 칸 COLLECTED_BY 가 남아 있다", !sql.contains("COLLECTED_BY"));
        }
    }

    /** CREATE TABLE t ( ... ) 안의 칸 이름을 순서대로. 제약·키 줄과 주석 줄은 뺀다. */
    private static List<String> columns(String dialect, String table) throws IOException {
        List<String> out = new ArrayList<>();
        Set<String> notColumn = new HashSet<>(Arrays.asList("PRIMARY", "KEY", "CONSTRAINT", "UNIQUE", "INDEX", "FOREIGN", "CHECK"));
        Pattern word = Pattern.compile("^([A-Z][A-Z0-9_]*)\\b.*");
        boolean in = false;
        for (String raw : Files.readAllLines(DB.resolve(dialect).resolve(FILE), StandardCharsets.UTF_8)) {
            String line = raw.trim();
            if (line.startsWith("CREATE TABLE " + table + " (")) {
                in = true;
                continue;
            }
            if (!in) {
                continue;
            }
            if (line.startsWith(")")) {
                break;
            }
            Matcher m = word.matcher(line);
            if (m.matches() && !notColumn.contains(m.group(1))) {
                out.add(m.group(1));
            }
        }
        return out;
    }

    @Test
    public void 네_표의_칸_이름과_순서가_두_파일에서_같다() throws IOException {
        for (String t : new String[]{"INST_PLAN_IMPORT", "INST_PLAN_DOC", "INST_PLAN_ITEM", "INST_PLAN_ACT"}) {
            List<String> oracle = columns("oracle", t);
            List<String> mysql = columns("mysql", t);
            assertTrue(t + " 칸을 못 읽었다", oracle.size() >= 10);
            assertEquals(t + " 칸 이름이 다르다", oracle, mysql);
            assertEquals(t + " 칸 이름이 겹친다", oracle.size(), new HashSet<>(oracle).size());
        }
    }

    @Test
    public void MySQL_파일은_utf8mb4를_먼저_지정한다() throws IOException {
        assertTrue(read("mysql").contains("SET NAMES utf8mb4;"));
    }
}
