package com.kbstar.kgi.ggreport.web.db;

import org.junit.Test;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import static org.junit.Assert.assertTrue;

/** 목표 기관 044 DDL 쌍 — 두 방언에 KIND_CD·TARGET_YEAR NULL 허용·인덱스가 있고, TARGET_YEAR 타입이 043 과 어긋나지 않으며, 시험 스키마 순서가 043 → 044 → 045 이다. */
public class BidTargetKindDdlPairTest {
    private static final Path DB = Paths.get("src/main/resources/db");

    private static String read(Path f) throws IOException {
        assertTrue(f + " 가 없다 — 작업 디렉터리가 kgi-ggreport-web/ 인지 확인", Files.exists(f));
        return new String(Files.readAllBytes(f), StandardCharsets.UTF_8);
    }

    @Test
    public void 두_파일에_구분_칸_연도_NULL_인덱스_기본값이_있다() throws IOException {
        for (String d : new String[]{"oracle", "mysql"}) {
            String sql = read(DB.resolve(d).resolve("044_bid_target_kind.sql"));
            assertTrue(d + " 에 KIND_CD", sql.contains("KIND_CD"));
            assertTrue(d + " 에 TARGET_YEAR", sql.contains("TARGET_YEAR"));
            assertTrue(d + " 에 IDX_IBT_KIND", sql.contains("IDX_IBT_KIND"));
            assertTrue(d + " 에 'GOAL'", sql.contains("'GOAL'"));
        }
    }

    /** 보안 검토 권장 — 043 이 정한 TARGET_YEAR 타입(MySQL SMALLINT, Oracle NUMBER(4))을 044 가 바꾸지 않는다. */
    @Test
    public void TARGET_YEAR_타입이_043_과_맞다() throws IOException {
        String my43 = read(DB.resolve("mysql").resolve("043_bid_target.sql"));
        String my44 = read(DB.resolve("mysql").resolve("044_bid_target_kind.sql"));
        String or43 = read(DB.resolve("oracle").resolve("043_bid_target.sql"));
        String or44 = read(DB.resolve("oracle").resolve("044_bid_target_kind.sql"));
        assertTrue("mysql 043 은 SMALLINT", my43.matches("(?s).*TARGET_YEAR\\s+SMALLINT\\s+NOT NULL.*"));
        assertTrue("mysql 044 는 SMALLINT NULL", my44.contains("MODIFY COLUMN TARGET_YEAR SMALLINT NULL"));
        assertTrue("oracle 043 은 NUMBER(4)", or43.matches("(?s).*TARGET_YEAR\\s+NUMBER\\(4\\)\\s+NOT NULL.*"));
        assertTrue("oracle 044 는 타입을 다시 쓰지 않고 NULL 만 허용", or44.contains("MODIFY (TARGET_YEAR NULL)"));
    }

    @Test
    public void 시험_스키마에서_044가_043_뒤_045_앞이다() throws IOException {
        String props = read(Paths.get("src/test/resources/application.properties"));
        int i43 = props.indexOf("db/oracle/043_bid_target.sql");
        int i44 = props.indexOf("db/oracle/044_bid_target_kind.sql");
        int i45 = props.indexOf("db/oracle/045_plan_collect.sql");
        assertTrue("043 이 있다", i43 >= 0);
        assertTrue("044 가 043 뒤", i44 > i43);
        assertTrue("044 가 045 앞", i45 > i44);
    }
}
