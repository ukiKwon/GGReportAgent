package com.kbstar.kgi.ggreport.web.db;

import org.junit.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * DDL 파일 규칙 — 회사 DB 는 외래키(FK)를 두지 않는다(2026-11-09).
 *
 * <p>{@code db/oracle/*.sql}·{@code db/mysql/*.sql} 에서 {@code --} 주석을 걷어낸 뒤
 * {@code FOREIGN KEY}·{@code REFERENCES} 가 한 번도 나오면 안 된다. FK 재도입을 막는 회귀 방어선이다.
 * 예외는 {@code 015_drop_foreign_keys.sql} 하나뿐이다(FK 이름을 문자열로 다루기 때문).
 *
 * <p>파일을 직접 읽는다(Spring 컨텍스트 불필요). Maven 은 작업 디렉터리가 {@code kgi-ggreport-web/} 이다.
 */
public class DdlRulesTest {

    private static final Path DB_ROOT = Paths.get("src/main/resources/db");
    private static final String EXEMPT = "015_drop_foreign_keys.sql";
    private static final Pattern FK = Pattern.compile("FOREIGN\\s+KEY|\\bREFERENCES\\b", Pattern.CASE_INSENSITIVE);

    @Test
    public void oracle_DDL에_외래키가_없다() throws IOException {
        assertNoForeignKey("oracle");
    }

    @Test
    public void mysql_DDL에_외래키가_없다() throws IOException {
        assertNoForeignKey("mysql");
    }

    @Test
    public void 점검_쿼리가_두_DB에_쌍으로_있다() {
        assertTrue(Files.exists(DB_ROOT.resolve("oracle/ops/integrity_check.sql")));
        assertTrue(Files.exists(DB_ROOT.resolve("mysql/ops/integrity_check.sql")));
    }

    @Test
    public void 주석_제거가_동작한다() {
        // 방어선 자체의 확인: 주석 속 FOREIGN KEY 는 통과하고, 실제 문장은 걸린다.
        assertFalse(FK.matcher(stripComments("-- FOREIGN KEY 없음\nCREATE TABLE T (A INT); -- REFERENCES")).find());
        assertTrue(FK.matcher(stripComments("ALTER TABLE T ADD CONSTRAINT F FOREIGN KEY (A) REFERENCES P (A);")).find());
    }

    private void assertNoForeignKey(String dialect) throws IOException {
        Path dir = DB_ROOT.resolve(dialect);
        List<String> bad = new ArrayList<>();
        int scanned = 0;
        try (DirectoryStream<Path> files = Files.newDirectoryStream(dir, "*.sql")) {
            for (Path f : files) {
                if (EXEMPT.equals(f.getFileName().toString())) {
                    continue;
                }
                scanned++;
                String sql = stripComments(new String(Files.readAllBytes(f), StandardCharsets.UTF_8));
                if (FK.matcher(sql).find()) {
                    bad.add(f.getFileName().toString());
                }
            }
        }
        assertTrue(dialect + " 에서 스캔한 파일이 없다 — 작업 디렉터리가 kgi-ggreport-web/ 인지 확인", scanned > 0);
        assertTrue(dialect + " DDL 에 FOREIGN KEY/REFERENCES 가 있다: " + bad, bad.isEmpty());
    }

    /** {@code --} 부터 줄 끝까지를 지운다(문자열 리터럴 속 {@code --} 는 이 DDL 들에 없다). */
    private static String stripComments(String sql) {
        return sql.replaceAll("--[^\\r\\n]*", "");
    }
}
