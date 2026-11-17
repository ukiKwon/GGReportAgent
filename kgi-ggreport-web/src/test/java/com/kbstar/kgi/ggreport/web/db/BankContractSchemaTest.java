package com.kbstar.kgi.ggreport.web.db;

import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.transaction.annotation.Transactional;
import static org.junit.Assert.assertEquals;

@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class BankContractSchemaTest {
    private static final String INS = "INSERT INTO INST_BANK_CONTRACT (INSTITUTION_ID, CONTRACT_NO, REV_NO, ACTION_CD, ORIGIN_CD, RANK_CD, BANK_CD,"
            + " TERM_TO, SRC_KIND, CHECKED_DATE, EDITOR_EMP_NO, EDITOR_NAME, SCREEN_ID, BUTTON_ID, SAVED_AT)"
            + " VALUES ('jongno', 1, 1, 'SAVE', 'MANUAL', 'FIRST', 'B04', '2026', 'DOC_NO', '2026-11-16', '3918264', '김영업', 'u', 'b', '2026-11-16T00:00:00+09:00')";
    @Autowired private JdbcTemplate jdbc;

    private int count(String sql) { Integer n = jdbc.queryForObject(sql, Integer.class); return n == null ? 0 : n; }

    @Test(expected = DataIntegrityViolationException.class)
    public void 같은_기관_줄_REV는_두_번_못_넣는다() { jdbc.update(INS); jdbc.update(INS); }

    @Test
    public void 기본값은_0이다() {
        jdbc.update(INS);
        assertEquals(0, count("SELECT EMP_VERIFIED + UI_VALID + OVERLAP_CONFIRMED FROM INST_BANK_CONTRACT WHERE INSTITUTION_ID='jongno'"));
    }

    @Test
    public void 코드표_행_수와_사용_가능_여부() {
        assertEquals(16, count("SELECT COUNT(*) FROM COMMON_CODE WHERE CODE_GROUP='BANK'"));
        assertEquals(14, count("SELECT COUNT(*) FROM COMMON_CODE WHERE CODE_GROUP='BANK' AND ENABLED=1"));
        assertEquals(2, count("SELECT COUNT(*) FROM COMMON_CODE WHERE CODE_GROUP='BANK' AND ENABLED=0 AND CODE IN ('X01','X02')"));
        assertEquals(5, count("SELECT COUNT(*) FROM COMMON_CODE WHERE CODE_GROUP='BANK_RANK'"));
        assertEquals("단수 금고", jdbc.queryForObject("SELECT CODE_NAME FROM COMMON_CODE WHERE CODE_GROUP='BANK_RANK' AND CODE='SINGLE'", String.class));
        assertEquals(5, count("SELECT SORT_NO FROM COMMON_CODE WHERE CODE_GROUP='BANK_RANK' AND CODE='SINGLE'"));
        assertEquals(4, count("SELECT COUNT(*) FROM COMMON_CODE WHERE CODE_GROUP='BANK_CONTRACT_SRC'"));
        assertEquals(4, count("SELECT COUNT(*) FROM COMMON_CODE WHERE CODE_GROUP='BANK_CANCEL_REASON'"));
        assertEquals(5, count("SELECT COUNT(*) FROM COMMON_CODE WHERE CODE_GROUP='BANK_ACCOUNT'"));
        assertEquals("BNK부산은행", jdbc.queryForObject("SELECT CODE_NAME FROM COMMON_CODE WHERE CODE_GROUP='BANK' AND CODE='B07'", String.class));
        assertEquals("수협은행", jdbc.queryForObject("SELECT CODE_NAME FROM COMMON_CODE WHERE CODE_GROUP='BANK' AND CODE='B13'", String.class));
        assertEquals("일반회계", jdbc.queryForObject("SELECT CODE_NAME FROM COMMON_CODE WHERE CODE_GROUP='BANK_ACCOUNT' AND CODE='GENERAL'", String.class));
    }
}
