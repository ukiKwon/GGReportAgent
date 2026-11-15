package com.kbstar.kgi.ggreport.web.db;

import org.junit.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 031(기관 새 칸 값 채우기, 생성기 --extra 출력) 쌍 — Oracle 정본과 MySQL 미러가 같은 행·같은 값을 넣고,
 * 값 형식이 030 칸 가정에 맞고, 규칙 블록의 모양(MySQL SET 평가 순서 포함)이 고정돼 있는지 본다.
 * 031 은 생성기로 만든 뒤 이 시험을 돈다(파일이 없으면 실패). 한계: SQL 을 실행하지 않고 정규식으로 읽는다.
 *
 * <p>값 열(id 뒤, 앞 6개는 029 와 같다): 0 이름 · 1 지역 · 2 종류 · 3 계약만료 · 4 마지막입찰 · 5 term · 6 orgCode · 7 g2bCode ·
 * 8 opStatus · 9 openDate · 10 확정(0/1) · 11 출처 링크 · 12 출처 번호.
 */
public class InstitutionColumnsSeedPairTest {

    private static final Path DB = Paths.get("src/main/resources/db");
    private static final String FILE = "031_seed_institution_columns.sql";
    private static final String SEED29 = "029_seed_institutions_all.sql";

    private static final Pattern TOKEN = Pattern.compile(
            "'(?:[^']|'')*'|CAST\\(NULL AS \\w+\\(\\d+\\)\\)|\\bNULL\\b|(?<![\\w'])\\d+(?![\\w'])");
    private static final Pattern DATE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");
    private static final Pattern OPEN = Pattern.compile("\\d{4}(-\\d{2}(-\\d{2})?)?");

    private static String read(String dialect, String file) throws IOException {
        Path f = DB.resolve(dialect).resolve(file);
        assertTrue(f + " 가 없다 — 생성기 --extra 로 만들었는지, 작업 디렉터리가 kgi-ggreport-web/ 인지 확인", Files.exists(f));
        return new String(Files.readAllBytes(f), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    private static List<String> values(String body, boolean mysql, int expect, String where) {
        String text = body.replace("'||CHR(38)||'", "&");
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
        String leftover = rest.toString().replaceAll("\\bAS\\s+[A-Z0-9_]+", "").replaceAll("[,\\s]", "");   // G2B_CODE 처럼 숫자가 든 별칭
        assertEquals(where + " 토큰 밖에 해석 못 한 글자: " + body, "", leftover);
        assertEquals(where + " 값 개수: " + body, expect, out.size());
        return out;
    }

    /** id → 값 13개(이름 … 출처 번호). 파일 순서 유지. */
    private static Map<String, List<String>> rows(String dialect, String file, boolean extra) throws IOException {
        boolean mysql = dialect.equals("mysql");
        Map<String, List<String>> out = new LinkedHashMap<>();
        int width = extra ? 15 : 8;                    // mysql: id 포함 값 수(STAGE 포함)
        for (String raw : read(dialect, file).split("\n")) {
            String line = raw.trim();
            List<String> v;
            if (mysql && line.startsWith("('")) {
                String body = line.replaceAll(",$", "");
                body = body.substring(1, body.length() - 1);
                v = values(body, true, width, "mysql " + line);
                assertEquals("mysql STAGE 는 1", "1", v.get(7));
                List<String> w = new ArrayList<>(v.subList(0, 7));
                if (extra) {
                    w.addAll(v.subList(8, 15));
                }
                v = w;
            } else if (!mysql && line.startsWith("SELECT '")) {
                int end = line.lastIndexOf(" FROM DUAL");
                assertTrue("oracle 행 끝: " + line, end > 0);
                v = values(line.substring("SELECT ".length(), end), false, extra ? 14 : 7, "oracle " + line);
            } else {
                continue;
            }
            assertTrue(dialect + " 기관 id 중복: " + v.get(0), out.put(v.get(0), new ArrayList<>(v.subList(1, v.size()))) == null);
        }
        return out;
    }

    @Test
    public void 두_파일의_행_id_순서_값이_같고_헤더_행수와_맞다() throws IOException {
        Map<String, List<String>> my = rows("mysql", FILE, true);
        Map<String, List<String>> or = rows("oracle", FILE, true);
        assertTrue(or.size() > 0);
        assertEquals(new ArrayList<>(or.keySet()), new ArrayList<>(my.keySet()));
        for (Map.Entry<String, List<String>> e : or.entrySet()) {
            assertEquals("행 값 — " + e.getKey(), e.getValue(), my.get(e.getKey()));
        }
        for (String d : new String[]{"mysql", "oracle"}) {
            assertTrue(d + " 헤더의 행 수", read(d, FILE).contains("· 행 " + or.size() + "개("));
        }
    }

    @Test
    public void id가_029의_부분집합이고_029_값과_같다() throws IOException {
        Map<String, List<String>> base = rows("oracle", SEED29, false);
        for (Map.Entry<String, List<String>> e : rows("oracle", FILE, true).entrySet()) {
            List<String> b = base.get(e.getKey());
            assertTrue("029 에 없는 id: " + e.getKey(), b != null);
            assertEquals("이름·지역·종류·날짜·term 은 029 와 같다 — " + e.getKey(), b, e.getValue().subList(0, 6));
        }
    }

    @Test
    public void 값_형식이_030_칸_가정에_맞는다() throws IOException {
        for (Map.Entry<String, List<String>> e : rows("oracle", FILE, true).entrySet()) {
            String id = e.getKey();
            List<String> v = e.getValue();
            String org = v.get(6), g2b = v.get(7), op = v.get(8), open = v.get(9), conf = v.get(10), url = v.get(11), no = v.get(12);
            if (id.startsWith("org-")) {
                assertEquals(id, id.substring(4), org);
            } else {
                assertTrue("org- 접두가 아니면 ORG_CODE 없음: " + id, org == null);
            }
            if (id.startsWith("g2b-")) {
                assertEquals(id, id.substring(4), g2b);
            }
            if (id.startsWith("lg-")) {
                assertTrue("지자체 ORG_CODE 는 NULL(NEXT 76): " + id, org == null);
            }
            assertTrue(id + " OP_STATUS", "OPERATING".equals(op) || "PLANNED".equals(op));
            assertTrue(id + " 개원 예정은 개원일 필요", !"PLANNED".equals(op) || open != null);
            assertTrue(id + " OPEN_DATE 형식", open == null || OPEN.matcher(open).matches());
            assertTrue(id + " 확정은 0/1", "0".equals(conf) || "1".equals(conf));
            if ("1".equals(conf)) {
                assertTrue(id + " 확정이면 계약만료 있음", v.get(3) != null && DATE.matcher(v.get(3)).matches());
                assertTrue(id + " 확정이면 출처(링크·번호) 있음 — 보안 검토 B2", url != null || no != null);
            }
            if (url != null) {
                assertTrue(id + " 링크 http(s)·500자 이내", url.matches("(?i)https?://[\\x21-\\x7e]+") && url.length() <= 500);
                assertFalse(id + " 링크에 위험 글자", url.matches(".*[\"<>\\\\{}|^`].*"));
            }
            assertTrue(id + " 번호 50자 이내", no == null || no.length() <= 50);
        }
    }

    @Test
    public void 규칙_블록_모양이_고정돼_있다() throws IOException {
        String my = read("mysql", FILE);
        Matcher mu = Pattern.compile("ON DUPLICATE KEY UPDATE(.*?);", Pattern.DOTALL).matcher(my);
        int blocks = 0;
        while (mu.find()) {
            blocks++;
            Matcher a = Pattern.compile("(?m)^\\s{4}([A-Z_0-9]+)\\s*=").matcher(mu.group(1));
            List<String> cols = new ArrayList<>();
            while (a.find()) {
                cols.add(a.group(1));
            }
            assertEquals("MySQL 갱신 칸 수", 7, cols.size());
            // ⚠️ SET 은 왼쪽부터 평가되고 앞서 바꾼 값을 뒤에서 본다 — 확정 여부가 마지막이어야 출처 칸이 옛 값을 본다.
            assertEquals("CONTRACT_END_CONFIRMED 가 마지막 대입", "CONTRACT_END_CONFIRMED", cols.get(cols.size() - 1));
            assertEquals(new HashSet<>(java.util.Arrays.asList("ORG_CODE", "G2B_CODE", "OPEN_DATE", "OP_STATUS",
                    "CONTRACT_END_SRC_URL", "CONTRACT_END_SRC_NO", "CONTRACT_END_CONFIRMED")), new HashSet<>(cols));
            assertFalse(mu.group(1).contains("NAME_KO"));
            assertFalse(mu.group(1).contains("STAGE"));
        }
        assertTrue(blocks >= 1);

        String or = read("oracle", FILE);
        Matcher ou = Pattern.compile("WHEN MATCHED THEN UPDATE SET(.*?)WHEN NOT MATCHED THEN INSERT", Pattern.DOTALL).matcher(or);
        int merges = 0;
        while (ou.find()) {
            merges++;
            Matcher a = Pattern.compile("(?m)^\\s{4}t\\.([A-Z_0-9]+)\\s*=").matcher(ou.group(1));
            int n = 0;
            while (a.find()) {
                n++;
            }
            assertEquals("Oracle 갱신 칸 수", 7, n);
            assertFalse(ou.group(1).contains("NAME_KO"));
        }
        // 생성기 묶음 크기가 MySQL 100행·Oracle 50행이라 문장 수는 다르다(행 일치는 다른 시험이 본다) — Oracle 이 적지 않기만 하면 된다
        assertTrue("MERGE 수(" + merges + ") >= MySQL INSERT 수(" + blocks + ")", merges >= blocks && merges >= 1);
        assertTrue("마지막 줄에 COMMIT", or.trim().endsWith("COMMIT;"));
    }
}
