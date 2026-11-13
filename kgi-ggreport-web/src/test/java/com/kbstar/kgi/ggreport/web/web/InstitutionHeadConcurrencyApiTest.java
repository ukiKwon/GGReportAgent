package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.support.Times;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.test.context.junit4.SpringRunner;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.Assert.assertEquals;

/**
 * 기관장 정보 동시 등록(qa 테스트 공백) — 같은 기관에 A4 를 동시에 두 번 보내도 CURRENT 는 정확히 1건이다(Q18 불변식).
 * 기관 행 잠금이 직렬화한다: 먼저 잡은 쪽이 201(CURRENT), 나중 쪽은 202(후보 머리).
 *
 * <p>⚠️ 일부러 {@code @Transactional} 을 붙이지 않는다(커밋해야 동시성이 드러난다). 이 테스트가 만든 기관장 행(기관 gwangjin)·접근 이력은 앞뒤로 지운다.
 */
@RunWith(SpringRunner.class)
@AppTest
public class InstitutionHeadConcurrencyApiTest extends HeadApiTestBase {

    private static final String INST4 = "gwangjin";
    private long accessLogBase;

    @Before
    public void 앞정리() {
        cleanRows();
        accessLogBase = jdbc.queryForObject("SELECT COALESCE(MAX(LOG_ID), 0) FROM ACCESS_LOG", Long.class);
    }

    @After
    public void 뒤정리() {
        cleanRows();
        jdbc.update("DELETE FROM ACCESS_LOG WHERE LOG_ID > ?", accessLogBase);
    }

    private void cleanRows() {
        jdbc.update("DELETE FROM INST_HEAD_ITEM WHERE INSTITUTION_ID=?", INST4);
        jdbc.update("DELETE FROM INST_HEAD_PHOTO WHERE INSTITUTION_ID=?", INST4);
        jdbc.update("DELETE FROM INST_HEAD_LOG WHERE INSTITUTION_ID=?", INST4);
        jdbc.update("DELETE FROM INST_HEAD_ACT WHERE INSTITUTION_ID=?", INST4);
        jdbc.update("DELETE FROM INST_HEAD WHERE INSTITUTION_ID=?", INST4);
    }

    private Callable<Integer> add(final String emp, final String name, final CountDownLatch go) {
        return new Callable<Integer>() {
            @Override
            public Integer call() throws Exception {
                go.await();
                return postJson(headsPath(INST4), emp, headJson(name, "군수")).getResponse().getStatus();
            }
        };
    }

    @Test
    public void 같은_기관에_동시_등록해도_CURRENT는_하나다() throws Exception {
        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Integer> a = pool.submit(add(T1, "홍길동", go));
            Future<Integer> b = pool.submit(add(T2, "김철수", go));
            go.countDown();
            List<Integer> statuses = new ArrayList<>();
            statuses.add(a.get(30, TimeUnit.SECONDS));
            statuses.add(b.get(30, TimeUnit.SECONDS));
            Collections.sort(statuses);
            assertEquals("한쪽은 CURRENT(201), 다른 쪽은 후보(202)", java.util.Arrays.asList(201, 202), statuses);
        } finally {
            pool.shutdownNow();
        }
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD WHERE INSTITUTION_ID=? AND STATUS_CD='CURRENT'", INST4));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD WHERE INSTITUTION_ID=? AND STATUS_CD='CANDIDATE'", INST4));
        assertEquals(2, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='HEAD_ADD' AND INSTITUTION_ID=?", INST4));
        assertEquals("ACT 도 둘 다 커밋됐다", 2, count("SELECT COUNT(*) FROM INST_HEAD_ACT WHERE ACTION_CD='HEAD_ADD' AND OUTCOME='OK' AND INSTITUTION_ID=?", INST4));
    }

    @Test
    public void 빈_머리만_있는_기관에_동시_등록해도_CURRENT는_하나고_빈_머리는_한_번만_정리된다() throws Exception {
        String now = Times.nowIso();
        jdbc.update("INSERT INTO INST_HEAD (INSTITUTION_ID, STATUS_CD, ORIGIN_CD, CREATED_BY, CREATED_AT, CREATED_VERIFIED, DECIDED_BY, DECIDED_AT)"
                + " VALUES (?, 'CURRENT', 'MANUAL', ?, ?, 0, ?, ?)", INST4, L1, now, L1, now);
        long empty = jdbc.queryForObject("SELECT HEAD_ID FROM INST_HEAD WHERE INSTITUTION_ID=? AND STATUS_CD='CURRENT'", Long.class, INST4);
        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Integer> a = pool.submit(add(T1, "홍길동", go));
            Future<Integer> b = pool.submit(add(T2, "김철수", go));
            go.countDown();
            List<Integer> statuses = new ArrayList<>();
            statuses.add(a.get(30, TimeUnit.SECONDS));
            statuses.add(b.get(30, TimeUnit.SECONDS));
            Collections.sort(statuses);
            assertEquals("먼저 잡은 쪽 201(빈 머리 정리), 나중 쪽 202(후보)", java.util.Arrays.asList(201, 202), statuses);
        } finally {
            pool.shutdownNow();
        }
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD WHERE INSTITUTION_ID=? AND STATUS_CD='CURRENT'", INST4));
        assertEquals("VOIDED", headStatus(empty));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD WHERE INSTITUTION_ID=? AND STATUS_CD='CANDIDATE'", INST4));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='HEAD_VOID' AND FROM_HEAD_ID=?", empty));
    }
}
