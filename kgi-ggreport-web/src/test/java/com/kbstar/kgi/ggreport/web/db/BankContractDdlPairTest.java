package com.kbstar.kgi.ggreport.web.db;

import org.junit.Test;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/** 금고 약정 039 DDL 쌍 — Oracle 정본과 MySQL 미러의 COMMON_CODE INSERT 블록이 글자 그대로 같고 33행이다. NoticeRoundDdlPairTest 와 같은 방식. */
public class BankContractDdlPairTest {
    private static final Path DB = Paths.get("src/main/resources/db");
    private static final String FILE = "039_bank_contract.sql";

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
    public void 두_파일의_INSERT_블록이_같고_33행이다() throws IOException {
        List<String> oracle = inserts("oracle"), mysql = inserts("mysql");
        assertEquals(33, oracle.size());
        assertEquals(33, mysql.size());
        assertEquals(33, new HashSet<>(oracle).size());
        assertEquals("글자 그대로(순서까지) 같다", oracle, mysql);
    }

    @Test
    public void 표가_두_파일에_모두_있고_자리표시가_없다() throws IOException {
        for (String d : new String[]{"oracle", "mysql"}) {
            String sql = new String(Files.readAllBytes(DB.resolve(d).resolve(FILE)), StandardCharsets.UTF_8);
            assertTrue(d, sql.contains("CREATE TABLE INST_BANK_CONTRACT ("));
            assertTrue(d + " 에 OVERLAP_CONFIRMED", sql.contains("OVERLAP_CONFIRMED"));
            assertTrue(d + " 에 CANCEL_REASON_CD", sql.contains("CANCEL_REASON_CD"));
            assertTrue(d + " 에 ACCOUNT_ETC", sql.contains("ACCOUNT_ETC"));
            assertTrue(d + " 에 자리표시가 남음", !sql.contains("글자 그대로 붙인다"));
        }
    }
}
