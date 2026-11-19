package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.config.MyBatisConfig;
import org.junit.Test;

import java.util.Collections;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** 기관 저장 직전 읽기는 FOR UPDATE 한 줄(security 11-15 L3 — 동시 저장 이력 OLD_VAL 정합). */
public class InstitutionForUpdateSqlTest {
    @Test
    public void 저장_직전_읽기는_두_방언_모두_FOR_UPDATE_한_줄이다() {
        for (String d : new String[]{MyBatisConfig.MYSQL, MyBatisConfig.ORACLE}) {
            String s = MapperConfigurations.sql(MapperConfigurations.parse(d), InstitutionMapper.class, "selectByIdForUpdate",
                    Collections.<String, Object>singletonMap("institutionId", "x"));
            assertTrue(d + ": " + s, s.endsWith("WHERE INSTITUTION_ID = ? FOR UPDATE"));
            assertFalse(d + ": 조인·집계 금지(Oracle FOR UPDATE 제약)", s.contains("JOIN") || s.contains("DISTINCT") || s.contains("GROUP BY"));
        }
    }
}
