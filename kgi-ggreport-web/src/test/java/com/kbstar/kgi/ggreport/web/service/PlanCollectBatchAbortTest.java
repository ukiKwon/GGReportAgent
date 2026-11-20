package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.mapper.PlanCollectMapper;
import com.kbstar.kgi.ggreport.web.web.Actor;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mybatis.spring.MyBatisSystemException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionException;

import java.sql.SQLTransientConnectionException;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 일괄 요청의 서비스 계층 시험(스프링 컨텍스트 없음 — @MockBean 은 AppTest 의 단일 컨텍스트 규칙을 깨므로 쓰지 않는다).
 * ① DB 연결·트랜잭션 장애는 루프를 멈추고 던진다(500). ② 멈출 때도 커밋된 새 요청의 쪽지를 시도한다. ③ 쪽지 실패는 요청을 되돌리지 않는다.
 * ④ 쪽지 문구('외 N곳'·'새로 N곳'). ⑤ 한 기관의 일반 오류·동시 요청은 그 기관만 error. ⑥ 커밋 뒤 이중 집계 없음.
 * 모의 트랜잭션 관리자는 롤백을 실제로 하지 않는다 — 롤백 자체의 확인은 PlanCollectTxTest(실제 DB) 몫이다.
 */
public class PlanCollectBatchAbortTest {

    private final PlanCollectMapper mapper = mock(PlanCollectMapper.class);
    private final PlanAudit audit = mock(PlanAudit.class);
    private final NotificationCommandService notes = mock(NotificationCommandService.class);
    private final PlanAgentClient agent = mock(PlanAgentClient.class);
    private final PlatformTransactionManager txm = mock(PlatformTransactionManager.class);
    private final PlanCollectService svc = new PlanCollectService(mapper, audit, notes, agent, txm);

    /** 기관 id 하나가 '정상 새 요청'이 되도록 매퍼를 맞춘다(없는 열린 요청·첫 번호·기관 이름). */
    private void fresh(String id, String name) {
        when(mapper.selectIdsIgnoreCase(id)).thenReturn(Collections.singletonList(id));
        when(mapper.lockInstitution(id)).thenReturn(id);
        when(mapper.nextSeq(id)).thenReturn(1);
        when(mapper.selectInstitutionName(id)).thenReturn(name);
    }

    @Test
    public void 연결_장애면_첫_기관에서_멈추고_던진다() {
        when(mapper.selectIdsIgnoreCase("aaa")).thenThrow(new DataAccessResourceFailureException("down"));
        try {
            svc.requestBatch(Arrays.asList("aaa", "bbb"), Actor.anonymous());
            fail("연결 장애는 삼키지 않는다");
        } catch (DataAccessResourceFailureException e) {
            assertEquals("down", e.getMessage());
        }
        verify(mapper, never()).selectIdsIgnoreCase("bbb");
        verify(notes, never()).create(any(), any(), any(), any());
    }

    @Test
    public void 트랜잭션_시작_실패도_멈추고_던진다() {
        when(mapper.selectIdsIgnoreCase("aaa")).thenReturn(Collections.singletonList("aaa"));
        when(txm.getTransaction(any())).thenThrow(new CannotCreateTransactionException("no tx"));
        try {
            svc.requestBatch(Arrays.asList("aaa", "bbb"), Actor.anonymous());
            fail("트랜잭션 장애는 삼키지 않는다");
        } catch (TransactionException e) {
            // 기대
        }
        verify(mapper, times(1)).selectIdsIgnoreCase(any());
        verify(mapper, never()).selectIdsIgnoreCase("bbb");
    }

    @Test
    public void MyBatisSystemException의_원인이_연결_장애면_멈추고_그_전에_커밋된_새_요청의_쪽지는_시도한다() {
        fresh("aaa", "가");
        when(mapper.selectIdsIgnoreCase("bbb")).thenThrow(new MyBatisSystemException(new SQLTransientConnectionException("conn")));
        try {
            svc.requestBatch(Arrays.asList("aaa", "bbb", "ccc"), Actor.anonymous());
            fail("원인 체인이 연결 장애면 멈춘다");
        } catch (MyBatisSystemException e) {
            // 기대 — 500
        }
        verify(mapper, never()).selectIdsIgnoreCase("ccc");
        verify(mapper, times(1)).insertReq(any());
        verify(notes, times(2)).create(any(), eq("수집요청"), any(), isNull());   // 전산팀·전산팀장 한 통씩 — 먼저 커밋된 aaa 분
    }

    @Test
    public void 장애_중단_때_쪽지가_실패해도_원래_장애를_그대로_던진다() {
        fresh("aaa", "가");
        when(mapper.selectIdsIgnoreCase("bbb")).thenThrow(new DataAccessResourceFailureException("down"));
        when(notes.create(any(), any(), any(), any())).thenThrow(new IllegalStateException("note down"));
        try {
            svc.requestBatch(Arrays.asList("aaa", "bbb"), Actor.anonymous());
            fail();
        } catch (DataAccessResourceFailureException e) {
            assertEquals("down", e.getMessage());   // 쪽지 실패가 원래 장애를 덮지 않는다
        }
    }

    @Test
    public void 원인이_연결_장애가_아닌_MyBatisSystemException은_그_기관만_error이고_계속한다() {
        fresh("aaa", "가");
        fresh("ccc", "다");
        when(mapper.selectIdsIgnoreCase("bbb")).thenThrow(new MyBatisSystemException(new IllegalArgumentException("bad sql")));
        Map<String, Object> out = svc.requestBatch(Arrays.asList("aaa", "bbb", "ccc"), Actor.anonymous());
        assertEquals(2, out.get("requested_count"));
        assertEquals(1, out.get("error_count"));
        assertEquals("SERVER_ERROR", result(out, "bbb", "code"));
    }

    @Test
    public void 쪽지_생성이_실패해도_요청은_남고_note_sent는_false() {
        fresh("aaa", "가");
        when(notes.create(any(), any(), any(), any())).thenThrow(new IllegalStateException("note down"));
        Map<String, Object> out = svc.requestBatch(Collections.singletonList("aaa"), Actor.anonymous());
        assertEquals(1, out.get("requested_count"));
        assertEquals(0, out.get("error_count"));
        assertEquals(Boolean.FALSE, out.get("note_sent"));
        verify(mapper, times(1)).insertReq(any());   // 요청은 쪽지보다 먼저 커밋됐다
        verify(audit, times(1)).record(eq("aaa"), isNull(), eq("COLLECT_REQUEST"), eq("OK"), isNull(), isNull(), any(), any());
    }

    @Test
    public void 새_요청_4곳이면_쪽지는_수신처당_한_통_이름_3곳_뒤에_외_1곳과_새로_4곳() {
        String[] ids = {"i1", "i2", "i3", "i4"};
        String[] names = {"가", "나", "다", "라"};
        for (int i = 0; i < 4; i++) fresh(ids[i], names[i]);
        Map<String, Object> out = svc.requestBatch(Arrays.asList(ids), Actor.anonymous());
        assertEquals(4, out.get("requested_count"));
        assertEquals(Boolean.TRUE, out.get("note_sent"));
        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> to = ArgumentCaptor.forClass(String.class);
        verify(notes, times(2)).create(to.capture(), eq("수집요청"), text.capture(), isNull());
        assertEquals("기관당이 아니라 수신처 두 곳에 한 통씩", Arrays.asList("전산팀", "전산팀장"), to.getAllValues());
        String t = text.getAllValues().get(0);
        assertTrue(t, t.contains("가(i1), 나(i2), 다(i3) 외 1곳"));
        assertTrue(t, t.contains("새로 4곳"));
        assertFalse("넷째 이름은 쪽지에 싣지 않는다", t.contains("라(i4)"));
        assertEquals(t, text.getAllValues().get(1));
    }

    @Test
    public void 한_기관에서_일반_오류가_나도_앞뒤_기관은_처리되고_그_기관만_SERVER_ERROR() {
        fresh("aaa", "가");
        fresh("ccc", "다");
        when(mapper.selectIdsIgnoreCase("bbb")).thenThrow(new IllegalStateException("boom"));
        Map<String, Object> out = svc.requestBatch(Arrays.asList("aaa", "bbb", "ccc"), Actor.anonymous());
        assertEquals(2, out.get("requested_count"));
        assertEquals(1, out.get("error_count"));
        assertEquals("SERVER_ERROR", result(out, "bbb", "code"));
        assertEquals("requested", result(out, "aaa", "result_cd"));
        assertEquals("requested", result(out, "ccc", "result_cd"));
        verify(audit, times(1)).record(eq("bbb"), isNull(), eq("COLLECT_REQUEST"), eq("ERROR"), isNull(), isNull(), any(), any());
    }

    @Test
    public void 동시_요청_충돌은_그_기관만_error_CONCURRENT_BLOCKED이고_나머지는_처리된다() {
        fresh("aaa", "가");
        fresh("bbb", "나");
        when(mapper.insertReq(any())).thenReturn(1).thenThrow(new DuplicateKeyException("dup"));   // 첫 호출 aaa 성공, 둘째 bbb 충돌
        Map<String, Object> out = svc.requestBatch(Arrays.asList("aaa", "bbb"), Actor.anonymous());
        assertEquals(1, out.get("requested_count"));
        assertEquals(1, out.get("error_count"));
        assertEquals("CONCURRENT", result(out, "bbb", "code"));
        verify(audit, times(1)).record(eq("bbb"), isNull(), eq("COLLECT_REQUEST"), eq("BLOCKED"), isNull(), isNull(), any(), any());
    }

    @Test
    public void 라벨_조회가_실패하면_그_기관은_error_한_번만_셈하고_requested로_세지_않는다() {
        fresh("aaa", "가");
        when(mapper.selectInstitutionName("aaa")).thenThrow(new IllegalStateException("name down"));
        Map<String, Object> out = svc.requestBatch(Collections.singletonList("aaa"), Actor.anonymous());
        assertEquals(0, out.get("requested_count"));
        assertEquals(1, out.get("error_count"));
        assertEquals(1, ((List<?>) out.get("results")).size());
        assertEquals("SERVER_ERROR", result(out, "aaa", "code"));
    }

    @Test
    public void isOutage는_원인_체인에_연결_장애가_있을_때만_true() {
        assertTrue(PlanCollectService.isOutage(new DataAccessResourceFailureException("x")));
        assertTrue(PlanCollectService.isOutage(new CannotCreateTransactionException("x")));
        assertTrue(PlanCollectService.isOutage(new MyBatisSystemException(new SQLTransientConnectionException("x"))));
        assertFalse(PlanCollectService.isOutage(new MyBatisSystemException(new IllegalArgumentException("x"))));
        assertFalse(PlanCollectService.isOutage(new IllegalStateException("x")));
        assertFalse(PlanCollectService.isOutage(new DuplicateKeyException("x")));
    }

    @SuppressWarnings("unchecked")
    private static String result(Map<String, Object> out, String inst, String key) {
        for (Map<String, Object> r : (List<Map<String, Object>>) out.get("results")) {
            if (inst.equals(r.get("institution_id"))) return String.valueOf(r.get(key));
        }
        return null;
    }
}
