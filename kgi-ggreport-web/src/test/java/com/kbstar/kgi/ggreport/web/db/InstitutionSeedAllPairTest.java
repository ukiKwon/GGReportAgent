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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 기관 전체 시드 029 쌍 — Oracle 정본과 MySQL 미러가 같은 415행·같은 값을 넣고, "빈 칸만 채움" 규칙이
 * 의미상 같으며, 서울 25구 id 가 003 정본 그대로인지 본다. 파일을 직접 읽는다(Spring 불필요).
 *
 * <p>생성기(tools/db/gen-seed-institutions.mjs)의 시험은 메모리 출력만 보고 --check 는 파일을 안 읽는다 —
 * 커밋된 두 파일이 서로 갈리는 것은 이 시험만 잡는다(NEXT 72, 2026-11-15 backend-dev 설계).
 *
 * <p>한계: SQL 을 실행하지 않고 정규식으로 읽는다. 행 값은 토큰 단위로 정확히 비교하지만, 규칙 블록(ON DUPLICATE /
 * MERGE)은 "생성기가 내는 모양" 그대로일 때만 통과한다(모양이 바뀌면 시험을 같이 고친다 — 의도된 경직).
 * 029 는 불변이라 행 수 415 를 고정한다 — 기관을 더 반입하면 새 번호로 만든다.
 */
public class InstitutionSeedAllPairTest {

    private static final Path DB = Paths.get("src/main/resources/db");
    private static final String FILE = "029_seed_institutions_all.sql";
    private static final int ROWS = 415;
    private static final String COLS = "(INSTITUTION_ID, NAME_KO, REGION_CODE, TYPE, CONTRACT_END, LAST_BID, TERM, STAGE)";
    private static final Set<String> FILL_COLS = new TreeSet<>(Arrays.asList(
            "REGION_CODE", "TYPE", "CONTRACT_END", "LAST_BID", "TERM"));

    /** 값 토큰: 문자열 리터럴 | CAST(NULL AS 타입(n)) | NULL | 정수. AS 별칭 같은 나머지는 토큰이 아니다. */
    private static final Pattern TOKEN = Pattern.compile(
            "'(?:[^']|'')*'|CAST\\(NULL AS \\w+\\(\\d+\\)\\)|\\bNULL\\b|(?<![\\w'])\\d+(?![\\w'])");
    private static final Pattern SEOUL_003 = Pattern.compile(
            "SELECT\\s+'([a-z]+)'(?:\\s+AS\\s+INSTITUTION_ID)?\\s*,\\s*'([^']+)'");
    private static final Pattern DATE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");
    private static final Pattern ID = Pattern.compile("[a-z]+|(lg|org|g2b|nm)-[A-Za-z0-9_-]+");

    private static String read(String dialect, String file) throws IOException {
        Path f = DB.resolve(dialect).resolve(file);
        assertTrue(f + " 가 없다 — 작업 디렉터리가 kgi-ggreport-web/ 인지 확인", Files.exists(f));
        return new String(Files.readAllBytes(f), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    /** 값 토큰 목록 → 문자열(NULL 은 null). 토큰 밖에 알 수 없는 글자가 남으면 실패한다. */
    private static List<String> values(String body, boolean mysql, int expect, String where) {
        String text = body.replace("'||CHR(38)||'", "&");   // Oracle 의 & 이스케이프 복원
        List<String> out = new ArrayList<>();
        Matcher m = TOKEN.matcher(text);
        StringBuilder rest = new StringBuilder();
        int last = 0;
        while (m.find()) {
            rest.append(text, last, m.start());
            last = m.end();
            String t = m.group();
            if (t.startsWith("'")) {
                String s = t.substring(1, t.length() - 1).replace("''", "'");
                out.add(mysql ? s.replace("\\\\", "\\") : s);
            } else if (t.startsWith("CAST") || t.equals("NULL")) {
                out.add(null);
            } else {
                out.add(t);
            }
        }
        rest.append(text.substring(last));
        // 토큰 밖에는 쉼표·공백과 Oracle 첫 줄의 "AS 별칭"만 허용
        String leftover = rest.toString().replaceAll("\\bAS\\s+[A-Z_]+", "").replaceAll("[,\\s]", "");
        assertEquals(where + " 토큰 밖에 해석 못 한 글자: " + body, "", leftover);
        assertEquals(where + " 값 개수: " + body, expect, out.size());
        return out;
    }

    /** id → [이름, 지역, 종류, 계약만료, 마지막입찰, term]. 파일 순서를 유지한다. */
    private static Map<String, List<String>> rows(String dialect) throws IOException {
        boolean mysql = dialect.equals("mysql");
        Map<String, List<String>> out = new LinkedHashMap<>();
        for (String raw : read(dialect, FILE).split("\n")) {
            String line = raw.trim();
            List<String> v;
            if (mysql && line.startsWith("('")) {
                String body = line.replaceAll(",$", "");
                body = body.substring(1, body.length() - 1);
                v = values(body, true, 8, "mysql " + line);
                assertEquals("mysql STAGE 는 1", "1", v.get(7));
                v = v.subList(0, 7);
            } else if (!mysql && line.startsWith("SELECT '")) {
                int end = line.lastIndexOf(" FROM DUAL");
                assertTrue("oracle 행 끝: " + line, end > 0);
                v = values(line.substring("SELECT ".length(), end), false, 7, "oracle " + line);
            } else {
                continue;
            }
            assertTrue(dialect + " 기관 id 중복: " + v.get(0), out.put(v.get(0), new ArrayList<>(v.subList(1, 7))) == null);
        }
        return out;
    }

    @Test
    public void 두_파일이_415행이고_헤더_행수와_맞다() throws IOException {
        for (String d : new String[]{"mysql", "oracle"}) {
            assertEquals(d + " 행 수", ROWS, rows(d).size());
            assertTrue(d + " 헤더의 행 수", read(d, FILE).contains("-- 행 " + ROWS + "개("));
        }
    }

    @Test
    public void 기관_id_집합과_순서가_같다() throws IOException {
        List<String> my = new ArrayList<>(rows("mysql").keySet());
        List<String> or = new ArrayList<>(rows("oracle").keySet());
        assertEquals(new HashSet<>(or), new HashSet<>(my));
        assertEquals("생성기는 id 순으로 쓴다 — 순서까지 같다", or, my);
        for (String id : or) {
            assertTrue("id 형식(서울 영문 소문자 또는 lg-/org-/g2b-/nm-): " + id, ID.matcher(id).matches());
            assertTrue("id 64자 이내: " + id, id.length() <= 64);
        }
    }

    @Test
    public void 행마다_이름_지역_종류_날짜_term_값이_같다() throws IOException {
        Map<String, List<String>> my = rows("mysql");
        Map<String, List<String>> or = rows("oracle");
        for (Map.Entry<String, List<String>> e : or.entrySet()) {
            assertEquals("행 값(이름·지역·종류·계약만료·마지막입찰·term) — " + e.getKey(), e.getValue(), my.get(e.getKey()));
        }
    }

    @Test
    public void 값_형식이_스키마_가정에_맞는다() throws IOException {
        for (Map.Entry<String, List<String>> e : rows("oracle").entrySet()) {
            String id = e.getKey();
            List<String> v = e.getValue();
            assertTrue("이름 비어 있지 않음/100자 이내: " + id, v.get(0) != null && !v.get(0).isEmpty() && v.get(0).length() <= 100);
            assertTrue("지역 2자리 숫자 또는 NULL: " + id, v.get(1) == null || v.get(1).matches("\\d{2}"));
            assertTrue("종류 비어 있지 않음: " + id, v.get(2) != null && !v.get(2).isEmpty());
            for (int i : new int[]{3, 4}) {
                assertTrue("날짜 YYYY-MM-DD 또는 NULL: " + id, v.get(i) == null || DATE.matcher(v.get(i)).matches());
            }
            assertTrue("term 1~30 또는 NULL: " + id,
                    v.get(5) == null || (v.get(5).matches("\\d{1,2}") && Integer.parseInt(v.get(5)) >= 1 && Integer.parseInt(v.get(5)) <= 30));
        }
    }

    @Test
    public void 서울_25구_id와_이름이_003_정본_그대로다() throws IOException {
        Matcher m = SEOUL_003.matcher(read("oracle", "003_seed_institutions.sql"));
        Map<String, String> seoul = new LinkedHashMap<>();   // id → 이름
        while (m.find()) {
            seoul.put(m.group(1), m.group(2));
        }
        assertEquals("003 에서 서울 id 25개", 25, seoul.size());
        for (String d : new String[]{"mysql", "oracle"}) {
            Map<String, List<String>> r = rows(d);
            for (Map.Entry<String, String> s : seoul.entrySet()) {
                List<String> v = r.get(s.getKey());
                assertTrue(d + " 에 서울 id 없음: " + s.getKey(), v != null);
                assertEquals(d + " 서울 이름 " + s.getKey(), s.getValue(), v.get(0));
                assertEquals(d + " 서울 지역 " + s.getKey(), "11", v.get(1));
                assertEquals(d + " 서울 종류 " + s.getKey(), "지자체", v.get(2));
            }
            int seoulRegion = 0;
            for (Map.Entry<String, List<String>> e : r.entrySet()) {
                if (e.getKey().matches("[a-z]+")) {
                    assertTrue(d + " 접두 없는 id 는 서울 25구뿐: " + e.getKey(), seoul.containsKey(e.getKey()));
                    seoulRegion++;
                }
            }
            assertEquals(d + " 접두 없는 id 수", 25, seoulRegion);
        }
    }

    @Test
    public void 빈_칸만_채우는_규칙이_두_파일에서_같다() throws IOException {
        String my = read("mysql", FILE);
        String or = read("oracle", FILE);

        // MySQL: INSERT 문마다 ON DUPLICATE KEY UPDATE 가 REGION_CODE·TYPE·CONTRACT_END·LAST_BID·TERM 다섯 개를
        // COALESCE(기존값(문자열은 ''도 빈 칸 취급), 새값) 순서로만 갱신한다. NAME_KO·STAGE·id 는 갱신 목록에 없다.
        Matcher mi = Pattern.compile("(?m)^INSERT INTO INSTITUTIONS\n    " + Pattern.quote(COLS)).matcher(my);
        int myStatements = 0;
        while (mi.find()) {
            myStatements++;
        }
        Matcher mu = Pattern.compile("ON DUPLICATE KEY UPDATE(.*?);", Pattern.DOTALL).matcher(my);
        int myBlocks = 0;
        Pattern myAssign = Pattern.compile(
                "(\\w+)\\s*=\\s*COALESCE\\((?:NULLIF\\(INSTITUTIONS\\.(\\w+), ''\\)|INSTITUTIONS\\.(\\w+)),\\s*VALUES\\((\\w+)\\)\\)");
        while (mu.find()) {
            myBlocks++;
            Set<String> cols = new TreeSet<>();
            Matcher a = myAssign.matcher(mu.group(1));
            while (a.find()) {
                String existing = a.group(2) != null ? a.group(2) : a.group(3);
                assertEquals("자기 칸의 기존값과 새값을 잇는다", a.group(1), existing);
                assertEquals(a.group(1), a.group(4));
                boolean text = !a.group(1).equals("TERM");
                assertEquals(a.group(1) + " 문자열 칸만 NULLIF(…,'')", text, a.group(2) != null);
                cols.add(a.group(1));
            }
            assertEquals("MySQL 갱신 칸", FILL_COLS, cols);
            assertFalse(mu.group(1).contains("NAME_KO"));
            assertFalse(mu.group(1).contains("STAGE"));
            assertEquals("assignment 5개 외 다른 갱신이 없다", 5, mu.group(1).split(",\\s*\n").length);
        }
        assertEquals("MySQL INSERT 문 수 = 규칙 블록 수", myStatements, myBlocks);
        assertTrue(myStatements >= 1);

        // Oracle: MERGE 문마다 MATCHED 는 같은 다섯 칸을 COALESCE(t.기존, s.새값) 로만, NOT MATCHED 는 STAGE=1 로 INSERT.
        // Oracle 은 ''를 NULL 로 다루므로 NULLIF 없이도 MySQL 의 NULLIF(…,'') 와 같다.
        Matcher om = Pattern.compile("(?m)^MERGE INTO INSTITUTIONS t\n").matcher(or);
        int merges = 0;
        while (om.find()) {
            merges++;
        }
        Matcher ou = Pattern.compile("WHEN MATCHED THEN UPDATE SET(.*?)WHEN NOT MATCHED THEN INSERT\n    "
                + Pattern.quote(COLS) + "\nVALUES\n    \\(s\\.INSTITUTION_ID, s\\.NAME_KO, s\\.REGION_CODE, s\\.TYPE, "
                + "s\\.CONTRACT_END, s\\.LAST_BID, s\\.TERM, 1\\);", Pattern.DOTALL).matcher(or);
        int orBlocks = 0;
        Pattern orAssign = Pattern.compile("t\\.(\\w+)\\s*=\\s*COALESCE\\(t\\.(\\w+),\\s*s\\.(\\w+)\\)");
        while (ou.find()) {
            orBlocks++;
            Set<String> cols = new TreeSet<>();
            Matcher a = orAssign.matcher(ou.group(1));
            while (a.find()) {
                assertEquals(a.group(1), a.group(2));
                assertEquals(a.group(1), a.group(3));
                cols.add(a.group(1));
            }
            assertEquals("Oracle 갱신 칸", FILL_COLS, cols);
            assertFalse(ou.group(1).contains("NAME_KO"));
            assertFalse(ou.group(1).contains("STAGE"));
            assertTrue("MERGE ON 은 INSTITUTION_ID 하나", or.contains("ON (t.INSTITUTION_ID = s.INSTITUTION_ID)"));
        }
        assertEquals("Oracle MERGE 수 = 규칙 블록 수", merges, orBlocks);
        assertTrue(merges >= 1);
        assertTrue("마지막 줄에 COMMIT", or.trim().endsWith("COMMIT;"));
    }
}
