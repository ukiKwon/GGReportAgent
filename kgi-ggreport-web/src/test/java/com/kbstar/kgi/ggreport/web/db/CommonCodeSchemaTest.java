package com.kbstar.kgi.ggreport.web.db;

import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.assertEquals;

/** 공통 코드 표(016)와 시드(017). 롤백한다. */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class CommonCodeSchemaTest {

    private static final String INSERT = "INSERT INTO COMMON_CODE"
            + " (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES (?, ?, ?, 9, 1, ?)";

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    public void 공고_상태_3종이_시드돼_있다() {
        List<String> codes = jdbc.queryForList(
                "SELECT CODE FROM COMMON_CODE WHERE CODE_GROUP = 'NOTICE_STATUS' ORDER BY SORT_NO", String.class);
        assertEquals(Arrays.asList("IN_PROGRESS", "CLOSED", "DELAYED"), codes);
    }

    @Test
    public void 표시명이_안_깨진다() {
        assertEquals("공고 종료", jdbc.queryForObject(
                "SELECT CODE_NAME FROM COMMON_CODE WHERE CODE_GROUP = 'NOTICE_STATUS' AND CODE = 'CLOSED'",
                String.class));
        assertEquals("지연·재공고 대기", jdbc.queryForObject(
                "SELECT CODE_NAME FROM COMMON_CODE WHERE CODE_GROUP = 'NOTICE_STATUS' AND CODE = 'DELAYED'",
                String.class));
    }

    @Test
    public void 협약_구분은_시드하지_않았다() {
        // 기획 미확정 — 값을 지어내 넣지 않는다.
        assertEquals(0, count("SELECT COUNT(*) FROM COMMON_CODE WHERE CODE_GROUP = 'CONTRACT_KIND'"));
        // 019 ASSIGN_ACTION·020 BOARD_STATUS·BOARD_RESULT·024·025 PREP_* 는 다른 기능의 코드표라 제외(남는 것 = NOTICE_STATUS 3행).
        assertEquals(3, count("SELECT COUNT(*) FROM COMMON_CODE WHERE CODE_GROUP NOT IN ('ASSIGN_ACTION', 'BOARD_STATUS', 'BOARD_RESULT', 'PREP_STATE', 'PREP_KIND', 'PREP_JUDGE', 'PREP_EVENT', 'PREP_PII')"));
    }

    @Test(expected = DataIntegrityViolationException.class)
    public void 같은_그룹_코드를_또_넣으면_거부된다() {
        jdbc.update(INSERT, "NOTICE_STATUS", "CLOSED", "중복", "2026-11-09T00:00:00+09:00");
    }

    @Test
    public void 다른_그룹이면_같은_코드를_넣을_수_있다() {
        jdbc.update(INSERT, "TEST_GROUP", "CLOSED", "다른 그룹", "2026-11-09T00:00:00+09:00");
        assertEquals(2, count("SELECT COUNT(*) FROM COMMON_CODE WHERE CODE = 'CLOSED'"));
    }

    private int count(String sql) {
        Integer n = jdbc.queryForObject(sql, Integer.class);
        return n == null ? 0 : n;
    }
}
