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
 * 기관장 정보 026 DDL 쌍 — Oracle 정본과 MySQL 미러의 COMMON_CODE INSERT 블록이 글자 그대로 같고 52행이며,
 * 사진 이용 조건(PHOTO_LICENSE) 사용 가능은 KOGL1·INST_PERMIT 둘뿐이다(사용자 결정 2026-11-11). 파일을 직접 읽는다(Spring 불필요).
 */
public class InstHeadDdlPairTest {

    private static final Path DB = Paths.get("src/main/resources/db");
    private static final String START = "[INSERT 블록 시작";
    private static final String END = "[INSERT 블록 끝";
    private static final Pattern LICENSE = Pattern.compile(
            "VALUES \\('PHOTO_LICENSE', '([A-Z0-9_]+)', '[^']*', \\d+, (\\d), ");

    private static List<String> inserts(String dialect) throws IOException {
        return inserts(dialect, "026_inst_head.sql");
    }

    private static List<String> inserts(String dialect, String file) throws IOException {
        Path f = DB.resolve(dialect).resolve(file);
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

    @Test
    public void 두_파일의_INSERT_블록이_같고_52행이다() throws IOException {
        List<String> oracle = inserts("oracle");
        List<String> mysql = inserts("mysql");
        assertEquals(52, oracle.size());
        assertEquals(52, mysql.size());
        assertEquals(new LinkedHashSet<>(oracle), new LinkedHashSet<>(mysql));
        assertEquals("중복 줄이 없다", 52, new HashSet<>(oracle).size());
        assertEquals("글자 그대로(순서까지) 같다", oracle, mysql);
    }

    @Test
    public void 코드_그룹은_8개다() throws IOException {
        Set<String> groups = new TreeSet<>();
        Pattern p = Pattern.compile("VALUES \\('([A-Z_]+)', ");
        for (String line : inserts("oracle")) {
            Matcher m = p.matcher(line);
            assertTrue(line, m.find());
            groups.add(m.group(1));
        }
        assertEquals(new TreeSet<>(Arrays.asList("HEAD_EVENT", "HEAD_FIELD", "HEAD_ITEM_STATE", "HEAD_ORIGIN", "HEAD_PHOTO_STATE",
                "HEAD_SRC", "HEAD_STATUS", "PHOTO_LICENSE")), groups);
    }

    @Test
    public void 사진_이용_조건은_KOGL1과_INST_PERMIT만_사용_가능이다() throws IOException {
        for (String dialect : new String[]{"oracle", "mysql"}) {
            Set<String> enabled = new TreeSet<>();
            int total = 0;
            for (String line : inserts(dialect)) {
                Matcher m = LICENSE.matcher(line);
                if (m.find()) {
                    total++;
                    if ("1".equals(m.group(2))) {
                        enabled.add(m.group(1));
                    }
                }
            }
            assertEquals(dialect + " PHOTO_LICENSE 행 수", 6, total);
            assertEquals(dialect, new TreeSet<>(Arrays.asList("INST_PERMIT", "KOGL1")), enabled);
        }
    }

    @Test
    public void 다섯_표가_두_파일에_모두_있다() throws IOException {
        for (String dialect : new String[]{"oracle", "mysql"}) {
            String sql = new String(Files.readAllBytes(DB.resolve(dialect).resolve("026_inst_head.sql")), StandardCharsets.UTF_8);
            for (String t : new String[]{"INST_HEAD", "INST_HEAD_ITEM", "INST_HEAD_PHOTO", "INST_HEAD_LOG", "INST_HEAD_ACT"}) {
                assertTrue(dialect + " 에 " + t + " 가 없다", sql.contains("CREATE TABLE " + t + " ("));
            }
        }
    }

    @Test
    public void 빈_기관장_정리_027_두_파일의_INSERT_블록이_같고_2행이다() throws IOException {
        List<String> oracle = inserts("oracle", "027_inst_head_voided.sql");
        List<String> mysql = inserts("mysql", "027_inst_head_voided.sql");
        assertEquals(2, oracle.size());
        assertEquals("글자 그대로(순서까지) 같다", oracle, mysql);
        assertTrue(oracle.get(0).contains("('HEAD_STATUS', 'VOIDED',"));
        assertTrue(oracle.get(1).contains("('HEAD_EVENT', 'HEAD_VOID',"));
    }
}
