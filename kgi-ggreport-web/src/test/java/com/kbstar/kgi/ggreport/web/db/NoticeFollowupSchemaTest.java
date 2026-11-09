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
import java.util.Map;

import static org.junit.Assert.assertEquals;

/**
 * 공고 예정일 경과 처리 이력(018). 추가 전용·복합 PK 가 동시성 보장이라는 설계를 확인한다. 롤백한다.
 *
 * <p>기관 id 는 테스트 전용 값이다. 외래키가 없으므로 INSTITUTIONS 에 행이 없어도 들어간다(그것이 설계다).
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class NoticeFollowupSchemaTest {

    private static final String INSERT = "INSERT INTO NOTICE_FOLLOWUP"
            + " (INSTITUTION_ID, DUE_DATE, REV_NO, STATUS_CD, HANDLER_EMP_NO, HANDLER_NAME, EMP_VERIFIED, HANDLED_AT)"
            + " VALUES (?, ?, ?, ?, '8203417', '테스트', 0, '2026-11-09T00:00:00+09:00')";

    /** 서버 Mapper 가 쓸 "현재 상태"(회차별 최대 REV_NO) 쿼리 형태 — 두 DB 공통 ANSI. */
    private static final String CURRENT = "SELECT f.INSTITUTION_ID, f.DUE_DATE, f.REV_NO, f.STATUS_CD"
            + " FROM NOTICE_FOLLOWUP f WHERE NOT EXISTS (SELECT 1 FROM NOTICE_FOLLOWUP n"
            + " WHERE n.INSTITUTION_ID = f.INSTITUTION_ID AND n.DUE_DATE = f.DUE_DATE AND n.REV_NO > f.REV_NO)"
            + " AND f.INSTITUTION_ID LIKE 'nf-test-%' ORDER BY f.INSTITUTION_ID, f.DUE_DATE";

    @Autowired
    private JdbcTemplate jdbc;

    @Test(expected = DataIntegrityViolationException.class)
    public void 같은_기관_예정일_REV를_두_번_넣으면_PK가_거부한다() {
        jdbc.update(INSERT, "nf-test-a", "2026-11-01", 1, "DELAYED");
        jdbc.update(INSERT, "nf-test-a", "2026-11-01", 1, "CLOSED");
    }

    @Test
    public void REV_NO는_1_2로_이어_붙는다() {
        jdbc.update(INSERT, "nf-test-a", "2026-11-01", 1, "DELAYED");
        jdbc.update(INSERT, "nf-test-a", "2026-11-01", 2, "CLOSED");
        List<Integer> revs = jdbc.queryForList(
                "SELECT REV_NO FROM NOTICE_FOLLOWUP WHERE INSTITUTION_ID = 'nf-test-a'"
                        + " AND DUE_DATE = '2026-11-01' ORDER BY REV_NO", Integer.class);
        assertEquals(Arrays.asList(1, 2), revs);
    }

    @Test
    public void 현재_상태는_회차별_최대_REV_한_건이다() {
        jdbc.update(INSERT, "nf-test-a", "2026-11-01", 1, "DELAYED");
        jdbc.update(INSERT, "nf-test-a", "2026-11-01", 2, "CLOSED");
        // 같은 기관의 다른 예정일(새 회차)은 따로 센다 — 종료 처리와 무관하게 미처리로 시작한다.
        jdbc.update(INSERT, "nf-test-a", "2026-12-01", 1, "IN_PROGRESS");
        jdbc.update(INSERT, "nf-test-b", "2026-11-01", 1, "DELAYED");

        List<Map<String, Object>> rows = jdbc.queryForList(CURRENT);

        assertEquals(3, rows.size());
        assertEquals("CLOSED", rows.get(0).get("STATUS_CD"));
        assertEquals(2, ((Number) rows.get(0).get("REV_NO")).intValue());
        assertEquals("nf-test-a", rows.get(1).get("INSTITUTION_ID"));
        assertEquals("2026-12-01", rows.get(1).get("DUE_DATE"));
        assertEquals("nf-test-b", rows.get(2).get("INSTITUTION_ID"));
    }

    @Test
    public void 결번_점검_쿼리는_REV가_비면_잡아낸다() {
        jdbc.update(INSERT, "nf-test-a", "2026-11-01", 1, "DELAYED");
        jdbc.update(INSERT, "nf-test-a", "2026-11-01", 3, "CLOSED"); // 2 가 빠졌다
        jdbc.update(INSERT, "nf-test-b", "2026-11-01", 1, "DELAYED"); // 정상

        List<String> gaps = jdbc.queryForList(
                "SELECT INSTITUTION_ID FROM NOTICE_FOLLOWUP WHERE INSTITUTION_ID LIKE 'nf-test-%'"
                        + " GROUP BY INSTITUTION_ID, DUE_DATE HAVING COUNT(*) <> MAX(REV_NO)", String.class);
        assertEquals(Arrays.asList("nf-test-a"), gaps);
    }

    @Test
    public void 한글_이름과_기본값이_들어간다() {
        jdbc.update(INSERT, "nf-test-a", "2026-11-01", 1, "IN_PROGRESS");
        assertEquals("테스트", jdbc.queryForObject(
                "SELECT HANDLER_NAME FROM NOTICE_FOLLOWUP WHERE INSTITUTION_ID = 'nf-test-a'", String.class));
        assertEquals(0, jdbc.queryForObject(
                "SELECT EMP_VERIFIED FROM NOTICE_FOLLOWUP WHERE INSTITUTION_ID = 'nf-test-a'", Integer.class)
                .intValue());
    }
}
