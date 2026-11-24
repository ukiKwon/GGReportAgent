package com.kbstar.kgi.ggreport.web.db;

import org.junit.Test;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import static org.junit.Assert.assertTrue;

/** 관심 기관 주인 061 DDL 쌍 — 두 방언에 WATCH_EMP_NO·인덱스·기존 행 채우기·끝 검사(NULL_WATCH_OWNER)가 있고, 시험 스키마에서 060 뒤에 온다. */
public class BidTargetWatchOwnerDdlPairTest {
    private static final Path DB = Paths.get("src/main/resources/db");
    private static final String FILE = "061_bid_target_watch_owner.sql";

    private static String read(Path f) throws IOException {
        assertTrue(f + " 가 없다 — 작업 디렉터리가 kgi-ggreport-web/ 인지 확인", Files.exists(f));
        return new String(Files.readAllBytes(f), StandardCharsets.UTF_8);
    }

    @Test
    public void 두_파일에_주인_칸_인덱스_채우기_끝_검사가_있다() throws IOException {
        for (String d : new String[]{"oracle", "mysql"}) {
            String sql = read(DB.resolve(d).resolve(FILE));
            assertTrue(d + " 에 WATCH_EMP_NO", sql.contains("WATCH_EMP_NO"));
            assertTrue(d + " 에 IDX_IBT_WATCH", sql.contains("IDX_IBT_WATCH"));
            assertTrue(d + " 에 기존 행 채우기", sql.contains("KIND_CD = 'WATCH'") && sql.contains("REQUESTER_EMP_NO"));
            assertTrue(d + " 끝 검사 NULL_WATCH_OWNER", sql.contains("SELECT COUNT(*) AS NULL_WATCH_OWNER FROM INST_BID_TARGET WHERE KIND_CD = 'WATCH' AND WATCH_EMP_NO IS NULL"));
        }
    }

    @Test
    public void 시험_스키마에서_061이_060_뒤다() throws IOException {
        String props = read(Paths.get("src/test/resources/application.properties"));
        int i60 = props.indexOf("db/oracle/060_inst_news.sql");
        int i61 = props.indexOf("db/oracle/" + FILE);
        assertTrue("060 이 있다", i60 >= 0);
        assertTrue("061 이 060 뒤", i61 > i60);
    }
}
