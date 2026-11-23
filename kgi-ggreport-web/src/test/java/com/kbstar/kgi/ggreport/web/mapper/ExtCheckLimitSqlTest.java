package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.config.MyBatisConfig;
import org.apache.ibatis.session.Configuration;
import org.junit.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** 외부 확인 이력 조회는 SQL 에서 행 수를 자른다(NEXT 90 하, 11-19). Oracle 은 11g 문법(ROWNUM 래핑). */
public class ExtCheckLimitSqlTest {
    private static Map<String, Object> p() {
        Map<String, Object> m = new HashMap<>();
        m.put("institutionId", "x");
        m.put("sourceKind", "notice");
        m.put("limit", 20);
        return m;
    }

    @Test
    public void 두_방언_모두_SQL에서_행_수를_자르고_Oracle은_11g_문법이다() {
        Configuration my = MapperConfigurations.parse(MyBatisConfig.MYSQL);
        Configuration or = MapperConfigurations.parse(MyBatisConfig.ORACLE);
        for (String id : new String[]{"selectHistory", "selectLatestResolved"}) {
            String m = MapperConfigurations.sql(my, ExtCheckMapper.class, id, p());
            String o = MapperConfigurations.sql(or, ExtCheckMapper.class, id, p());
            assertTrue(id + " mysql: " + m, m.endsWith("LIMIT ?") && !m.contains("ROWNUM"));
            assertTrue(id + " oracle: " + o, o.startsWith("SELECT * FROM (") && o.endsWith(") WHERE ROWNUM <= ?"));
            assertFalse(id + ": 12c 전용 문법 금지", o.contains("FETCH FIRST") || m.contains("FETCH FIRST"));
            assertTrue(id + ": 정렬은 안쪽에서", o.indexOf("ORDER BY") < o.indexOf("ROWNUM"));
        }
    }

    @Test
    public void 대시보드_공고_마감일_묶음_질의는_두_방언_같은_ROW_NUMBER_문장이고_행_수를_자르지_않는다() {
        Configuration my = MapperConfigurations.parse(MyBatisConfig.MYSQL);
        Configuration or = MapperConfigurations.parse(MyBatisConfig.ORACLE);
        Map<String, Object> none = new HashMap<>();
        String m = MapperConfigurations.sql(my, ExtCheckMapper.class, "selectLatestNoticeDeadlines", none);
        String o = MapperConfigurations.sql(or, ExtCheckMapper.class, "selectLatestNoticeDeadlines", none);
        for (String s : new String[]{m, o}) {
            assertTrue(s, s.contains("ROW_NUMBER() OVER (PARTITION BY INSTITUTION_ID ORDER BY CHECKED_AT DESC, IMPORTED_AT DESC, CHECK_KEY)"));
            assertTrue(s, s.contains("SOURCE_KIND = 'notice' AND STATUS_CD = 'found' AND DEADLINE_AT IS NOT NULL"));
            assertFalse(s, s.contains("FETCH FIRST") || s.contains("LIMIT") || s.contains("ROWNUM"));
        }
    }
}
