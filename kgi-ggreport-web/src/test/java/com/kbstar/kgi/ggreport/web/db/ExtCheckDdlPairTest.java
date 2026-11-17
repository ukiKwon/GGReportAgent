package com.kbstar.kgi.ggreport.web.db;

import org.junit.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** 042 외부 확인 DDL 쌍 — 표 3개·열 이름 순서·기본키·UNIQUE 열이 Oracle 정본과 MySQL 미러에서 같다(DdlPair 방식). */
public class ExtCheckDdlPairTest {
    private static final Path DB = Paths.get("src/main/resources/db");
    private static final String FILE = "042_ext_check.sql";

    private static String read(String dialect) throws IOException {
        Path f = DB.resolve(dialect).resolve(FILE);
        assertTrue(f + " 가 없다 — 작업 디렉터리가 kgi-ggreport-web/ 인지 확인", Files.exists(f));
        return new String(Files.readAllBytes(f), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    /** 표 이름 → ["열1,열2,...", "PK:..", "UQ:.."] */
    private static Map<String, List<String>> tables(String sql) {
        Map<String, List<String>> out = new LinkedHashMap<String, List<String>>();
        Matcher m = Pattern.compile("CREATE TABLE (\\w+) \\(\n(.*?)\n\\)", Pattern.DOTALL).matcher(sql);
        while (m.find()) {
            StringBuilder cols = new StringBuilder();
            for (String raw : m.group(2).split("\n")) {
                String line = raw.replaceAll("--.*$", "").trim();
                if (line.isEmpty() || line.startsWith("PRIMARY") || line.startsWith("UNIQUE")
                        || line.startsWith("KEY") || line.startsWith("CONSTRAINT")) {
                    continue;
                }
                cols.append(cols.length() == 0 ? "" : ",").append(line.split("\\s+")[0]);
            }
            String body = m.group(2);
            List<String> v = new ArrayList<String>();
            v.add(cols.toString());
            Matcher pk = Pattern.compile("PRIMARY KEY \\(([A-Z_, ]+)\\)").matcher(body);
            v.add("PK:" + (pk.find() ? pk.group(1).replace(" ", "") : ""));
            Matcher uq = Pattern.compile("UNIQUE (?:KEY \\w+ )?\\(([A-Z_, ]+)\\)").matcher(body);
            v.add("UQ:" + (uq.find() ? uq.group(1).replace(" ", "") : ""));
            out.put(m.group(1), v);
        }
        return out;
    }

    @Test
    public void 표_세_개와_열_기본키_UNIQUE가_두_파일에서_같다() throws IOException {
        Map<String, List<String>> o = tables(read("oracle"));
        Map<String, List<String>> m = tables(read("mysql"));
        assertEquals("[EXT_CHECK, EXT_CHECK_FILE, EXT_CHECK_EXCL]", o.keySet().toString());
        assertEquals("표 목록과 순서가 같다", o.keySet().toString(), m.keySet().toString());
        for (String t : o.keySet()) {
            assertEquals(t, o.get(t), m.get(t));
        }
        assertEquals("PK:CHECK_KEY", o.get("EXT_CHECK").get(1));
        assertEquals("UQ:BATCH_ID,CHECK_ID", o.get("EXT_CHECK").get(2));
        assertEquals("PK:CHECK_KEY,FILE_SEQ", o.get("EXT_CHECK_FILE").get(1));
        assertEquals("PK:BATCH_ID,CHECK_ID,FILE_SEQ,REASON_CD,LOCATOR_CD", o.get("EXT_CHECK_EXCL").get(1));
    }

    @Test
    public void 방언_표시와_금지_항목() throws IOException {
        String oracle = read("oracle");
        String mysql = read("mysql");
        assertTrue(oracle.contains("VARCHAR2") && !oracle.contains("ENGINE"));
        assertTrue(mysql.contains("ENGINE=InnoDB") && !mysql.contains("VARCHAR2"));
        for (String sql : new String[]{oracle, mysql}) {
            assertFalse("외래키 없음", sql.contains("FOREIGN KEY") || sql.contains("REFERENCES"));
            assertTrue("되돌리기 DROP 3줄", sql.contains("DROP TABLE EXT_CHECK_EXCL; DROP TABLE EXT_CHECK_FILE; DROP TABLE EXT_CHECK;"));
            assertTrue("멱등하지 않다 표시", sql.contains("멱등하지 않다"));
            assertFalse("원본 파일명 열 없음", sql.contains("ORIGINAL_NAME") || sql.contains("FILE_NAME"));
        }
        assertTrue(mysql.contains("정본은 db/oracle/042_ext_check.sql"));
    }
}
