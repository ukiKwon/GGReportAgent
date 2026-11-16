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

/**
 * 공고 상태 기록(037) — 회차 표·판정 이력 표의 복합 PK 가 동시 저장의 마지막 방어선이라는 설계와 공통 코드 13행을 확인한다. 롤백한다.
 * 기관 id 는 테스트 전용 값이다. 외래키가 없으므로 INSTITUTIONS 에 행이 없어도 들어간다(그것이 설계다).
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class NoticeRoundSchemaTest {

    private static final String INSERT_ROUND = "INSERT INTO NOTICE_ROUND"
            + " (INSTITUTION_ID, ROUND_SEQ, SOURCE_CD, OPENED_AT, OPENED_BY)"
            + " VALUES (?, ?, 'INST_DATA', '2026-11-16T00:00:00+09:00', '3918264')";

    private static final String INSERT_LOG = "INSERT INTO NOTICE_ROUND_LOG"
            + " (INSTITUTION_ID, ROUND_SEQ, REV_NO, STATUS_CD, HANDLER_EMP_NO, HANDLER_NAME, SCREEN_ID, BUTTON_ID, HANDLED_AT)"
            + " VALUES (?, ?, ?, 'DELAYED', '3918264', '테스트', 'bid_notice', 'save', '2026-11-16T00:00:00+09:00')";

    @Autowired
    private JdbcTemplate jdbc;

    @Test(expected = DataIntegrityViolationException.class)
    public void 같은_기관_회차를_두_번_넣으면_PK가_거부한다() {
        jdbc.update(INSERT_ROUND, "nr-test-a", 1);
        jdbc.update(INSERT_ROUND, "nr-test-a", 1);
    }

    @Test
    public void 다른_기관이나_다른_회차는_들어간다() {
        jdbc.update(INSERT_ROUND, "nr-test-a", 1);
        jdbc.update(INSERT_ROUND, "nr-test-a", 2);
        jdbc.update(INSERT_ROUND, "nr-test-b", 1);
        assertEquals(3, (int) jdbc.queryForObject(
                "SELECT COUNT(*) FROM NOTICE_ROUND WHERE INSTITUTION_ID LIKE 'nr-test-%'", Integer.class));
    }

    @Test(expected = DataIntegrityViolationException.class)
    public void 같은_기관_회차_REV를_두_번_넣으면_PK가_거부한다() {
        jdbc.update(INSERT_LOG, "nr-test-a", 1, 1);
        jdbc.update(INSERT_LOG, "nr-test-a", 1, 1);
    }

    @Test
    public void REV_NO는_회차_안에서_1_2로_이어_붙고_회차마다_따로_센다() {
        jdbc.update(INSERT_LOG, "nr-test-a", 1, 1);
        jdbc.update(INSERT_LOG, "nr-test-a", 1, 2);
        jdbc.update(INSERT_LOG, "nr-test-a", 2, 1);
        List<Integer> revs = jdbc.queryForList(
                "SELECT REV_NO FROM NOTICE_ROUND_LOG WHERE INSTITUTION_ID = 'nr-test-a' AND ROUND_SEQ = 1 ORDER BY REV_NO",
                Integer.class);
        assertEquals(Arrays.asList(1, 2), revs);
    }

    @Test
    public void 기본값과_한글_이름이_들어간다() {
        jdbc.update(INSERT_LOG, "nr-test-a", 1, 1);
        assertEquals("테스트", jdbc.queryForObject(
                "SELECT HANDLER_NAME FROM NOTICE_ROUND_LOG WHERE INSTITUTION_ID = 'nr-test-a'", String.class));
        assertEquals(0, (int) jdbc.queryForObject(
                "SELECT EMP_VERIFIED FROM NOTICE_ROUND_LOG WHERE INSTITUTION_ID = 'nr-test-a'", Integer.class));
        assertEquals(0, (int) jdbc.queryForObject(
                "SELECT ACTIVE_PREP FROM NOTICE_ROUND_LOG WHERE INSTITUTION_ID = 'nr-test-a'", Integer.class));
        assertEquals(0, (int) jdbc.queryForObject(
                "SELECT UI_VALID FROM NOTICE_ROUND_LOG WHERE INSTITUTION_ID = 'nr-test-a'", Integer.class));
    }

    @Test
    public void 열린_회차_점검_쿼리는_둘_이상을_잡아낸다() {
        jdbc.update(INSERT_ROUND, "nr-test-a", 1);
        jdbc.update(INSERT_ROUND, "nr-test-a", 2);   // 둘 다 CLOSED_AT NULL — 정합성 깨짐
        jdbc.update(INSERT_ROUND, "nr-test-b", 1);   // 정상
        List<String> bad = jdbc.queryForList(
                "SELECT INSTITUTION_ID FROM NOTICE_ROUND WHERE CLOSED_AT IS NULL AND INSTITUTION_ID LIKE 'nr-test-%'"
                        + " GROUP BY INSTITUTION_ID HAVING COUNT(*) > 1", String.class);
        assertEquals(Arrays.asList("nr-test-a"), bad);
    }

    @Test
    public void 결번_점검_쿼리는_REV가_비면_잡아낸다() {
        jdbc.update(INSERT_LOG, "nr-test-a", 1, 1);
        jdbc.update(INSERT_LOG, "nr-test-a", 1, 3);   // 2 가 빠졌다
        jdbc.update(INSERT_LOG, "nr-test-b", 1, 1);   // 정상
        List<String> gaps = jdbc.queryForList(
                "SELECT INSTITUTION_ID FROM NOTICE_ROUND_LOG WHERE INSTITUTION_ID LIKE 'nr-test-%'"
                        + " GROUP BY INSTITUTION_ID, ROUND_SEQ HAVING COUNT(*) <> MAX(REV_NO)", String.class);
        assertEquals(Arrays.asList("nr-test-a"), gaps);
    }

    @Test
    public void 공통_코드_네_그룹이_14행이다() {
        assertEquals(14, (int) jdbc.queryForObject("SELECT COUNT(*) FROM COMMON_CODE WHERE CODE_GROUP IN"
                + " ('NOTICE_ROUND_SRC','NOTICE_ROUND_CLOSE','NOTICE_DUE_BASIS','NOTICE_AUTO_KIND')", Integer.class));
        assertEquals(3, (int) jdbc.queryForObject(
                "SELECT COUNT(*) FROM COMMON_CODE WHERE CODE_GROUP = 'NOTICE_ROUND_SRC'", Integer.class));
        assertEquals(3, (int) jdbc.queryForObject(
                "SELECT COUNT(*) FROM COMMON_CODE WHERE CODE_GROUP = 'NOTICE_ROUND_CLOSE'", Integer.class));
        assertEquals(3, (int) jdbc.queryForObject(
                "SELECT COUNT(*) FROM COMMON_CODE WHERE CODE_GROUP = 'NOTICE_DUE_BASIS'", Integer.class));
        assertEquals(5, (int) jdbc.queryForObject(
                "SELECT COUNT(*) FROM COMMON_CODE WHERE CODE_GROUP = 'NOTICE_AUTO_KIND'", Integer.class));
    }
}
