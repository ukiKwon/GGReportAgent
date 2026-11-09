package com.kbstar.kgi.ggreport.web.db;

import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit4.SpringRunner;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * 테스트 DB(H2, Oracle 정본 DDL)에 외래키가 하나도 없다 — {@link DdlRulesTest} 의 파일 스캔을
 * 실제 스키마 메타데이터로 한 번 더 확인한다.
 */
@RunWith(SpringRunner.class)
@AppTest
public class NoForeignKeySchemaTest {

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    public void 참조_제약이_0건이다() {
        // H2 1.4 / 2.x 모두 이 두 뷰를 가진다. 제약 종류 문자열은 버전마다 달라 둘 다 허용한다.
        assertEquals("참조 제약(REFERENTIAL_CONSTRAINTS)이 남아 있다", 0,
                count("SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS"));
        assertEquals("FOREIGN KEY 제약이 남아 있다", 0,
                count("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS"
                        + " WHERE CONSTRAINT_TYPE IN ('FOREIGN KEY', 'REFERENTIAL')"));
    }

    @Test
    public void 점검이_헛돌지_않도록_다른_제약은_있다() {
        // 메타 쿼리가 빈 뷰만 보고 0 을 내는 경우를 막는다: PK 는 반드시 있다.
        assertTrue(count("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS"
                + " WHERE CONSTRAINT_TYPE = 'PRIMARY KEY'") > 0);
    }

    private int count(String sql) {
        Integer n = jdbc.queryForObject(sql, Integer.class);
        return n == null ? 0 : n;
    }
}
