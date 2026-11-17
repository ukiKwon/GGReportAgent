package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.domain.Notification;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionPlanMapper;
import com.kbstar.kgi.ggreport.web.mapper.PlanCollectMapper;
import com.kbstar.kgi.ggreport.web.web.Actor;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 사업계획 수집 요청(045) — 커밋해야 보이는 두 가지(qa §4).
 * ⓑ 같은 기관 동시 요청 → 요청 1건 + 요청자 2명 + 개발부서 쪽지 2통(받는 곳 2 × 1회).
 * P2-1 쪽지 저장이 실패해도 수집 반입은 성공(판·반영됨·COLLECT_APPLY 커밋, 쪽지만 없음).
 * ⚠️ 일부러 @Transactional 을 붙이지 않는다(InstitutionPlanTxTest 와 같은 이유). 기관 dobong 의 행·쪽지·접근 이력을 앞뒤로 지운다.
 * 쪽지 실패는 스프링 빈을 바꾸지 않고(AppTest 단일 컨텍스트 규칙) 던지는 NotificationCommandService 로 서비스를 손으로 조립해 만든다.
 */
@RunWith(SpringRunner.class)
@AppTest
public class PlanCollectTxTest {

    private static final String ADMIN = "8203417";
    private static final String SALES = "3918264";
    private static final String SALES2 = "7742059";
    private static final String INST = "dobong";
    private static final String TAG = "%(" + INST + ")%";
    private static final String HDR = "기관ID,문서명,원천종류,대상기간시작,대상기간끝,출처URL,확인일,수집자,분야번호,분야명,사업번호,상위사업번호,"
            + "사업명,내용,예산상태,예산금액,예산단위,연차예산,원문쪽,확인상태,진행상태,이행률";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlanCollectMapper collectMapper;
    @Autowired private InstitutionPlanMapper planMapper;
    @Autowired private PlanAudit audit;
    @Autowired private PlanAgentClient agent;
    @Autowired private PlatformTransactionManager txm;
    private long accessLogBase;

    @Before
    public void 앞정리() {
        clean();
        accessLogBase = jdbc.queryForObject("SELECT COALESCE(MAX(LOG_ID), 0) FROM ACCESS_LOG", Long.class);
    }

    @After
    public void 뒤정리() {
        clean();
        jdbc.update("DELETE FROM ACCESS_LOG WHERE LOG_ID > ?", accessLogBase);
    }

    private void clean() {
        jdbc.update("DELETE FROM NOTIFICATIONS WHERE KIND IN ('수집요청','수집결과') AND CONTENT LIKE ?", TAG);
        jdbc.update("DELETE FROM PLAN_COLLECT_REQUESTER WHERE INSTITUTION_ID=?", INST);
        jdbc.update("DELETE FROM PLAN_COLLECT_REQ WHERE INSTITUTION_ID=?", INST);
        jdbc.update("DELETE FROM INST_PLAN_ITEM WHERE INSTITUTION_ID=?", INST);
        jdbc.update("DELETE FROM INST_PLAN_DOC WHERE INSTITUTION_ID=?", INST);
        jdbc.update("DELETE FROM INST_PLAN_IMPORT WHERE INSTITUTION_ID=?", INST);
        jdbc.update("DELETE FROM INST_PLAN_ACT WHERE INSTITUTION_ID=?", INST);
    }

    private int count(String sql, Object... a) { return jdbc.queryForObject(sql, Integer.class, a); }

    private int ask(String emp) throws Exception {
        return mockMvc.perform(post("/institutions/" + INST + "/plan-collect").header("X-Emp-No", emp)).andReturn().getResponse().getStatus();
    }

    private Callable<Integer> askAfter(final String emp, final CountDownLatch go) {
        return () -> {
            go.await();
            return ask(emp);
        };
    }

    @Test
    public void 같은_기관_동시_요청은_요청_1건_요청자_2명_쪽지_2통() throws Exception {
        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Integer> st = new ArrayList<>();
        try {
            Future<Integer> a = pool.submit(askAfter(SALES, go));
            Future<Integer> b = pool.submit(askAfter(SALES2, go));
            go.countDown();
            st.add(a.get(30, TimeUnit.SECONDS));
            st.add(b.get(30, TimeUnit.SECONDS));
        } finally {
            pool.shutdownNow();
        }
        Collections.sort(st);
        assertEquals("먼저 잡은 쪽 201(새 요청), 나중 쪽 200(덧붙음)", Arrays.asList(200, 201), st);
        assertEquals(1, count("SELECT COUNT(*) FROM PLAN_COLLECT_REQ WHERE INSTITUTION_ID=?", INST));
        assertEquals(2, count("SELECT COUNT(*) FROM PLAN_COLLECT_REQUESTER WHERE INSTITUTION_ID=? AND CANCELED_AT IS NULL", INST));
        assertEquals(2, count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE KIND='수집요청' AND RECIPIENT IN ('전산팀','전산팀장') AND CONTENT LIKE ?", TAG));
    }

    @Test
    public void 쪽지_저장이_실패해도_수집_반입은_성공하고_반영됨과_감사는_커밋된다() throws Exception {
        assertEquals(201, ask(SALES));
        NotificationCommandService broken = new NotificationCommandService(null) {
            @Override
            public Notification create(String recipient, String kind, String content, String institutionId, String taskId,
                                       String link, Integer stage, String sender) {
                throw new DataIntegrityViolationException("note blocked (test)");
            }
        };
        PlanCollectService collect = new PlanCollectService(collectMapper, audit, broken, agent, txm);
        InstitutionPlanService plans = new InstitutionPlanService(planMapper, audit, collect, txm, "classpath*:plan-seed/");
        LocalDate d = LocalDate.now(ZoneId.of("Asia/Seoul")).minusDays(1);
        String row = String.join(",", INST, "도봉 시험 계획(가상)", "4개년계획", "2023", "2030", "https://example.kr/plan.pdf", d.toString(),
                "plan-collector/1.0", "1", "시험 분야", "1", "", "시험 사업", "", "원문에 없음", "", "", "", "", "", "", "");
        String name = INST + "_" + d.format(DateTimeFormatter.ofPattern("yyyyMMdd")) + "_plan.csv";
        Map<String, Object> out = plans.importUpload(INST, new MockMultipartFile("file", name, "text/csv",
                (HDR + "\n" + row + "\n").getBytes(StandardCharsets.UTF_8)), null, Actor.claimed(ADMIN));
        assertNotNull("반입 성공(컨트롤러라면 201) — 커밋까지 끝났다", out.get("import_id"));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_IMPORT WHERE INSTITUTION_ID=?", INST));
        assertEquals(1, count("SELECT COUNT(*) FROM PLAN_COLLECT_REQ WHERE INSTITUTION_ID=? AND STATUS_CD='APPLIED' AND OPEN_INST_ID IS NULL", INST));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE INSTITUTION_ID=? AND ACTION_CD='COLLECT_APPLY' AND OUTCOME='OK'", INST));
        assertEquals("쪽지만 없다", 0, count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE KIND='수집결과' AND CONTENT LIKE ?", TAG));
    }
}
