package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BidPrep;
import com.kbstar.kgi.ggreport.web.domain.PrepBoardCheck;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.PrepBoardIn;
import com.kbstar.kgi.ggreport.web.mapper.BankContractMapper;
import com.kbstar.kgi.ggreport.web.mapper.ExtCheckMapper;
import com.kbstar.kgi.ggreport.web.mapper.PrepBoardMapper;
import com.kbstar.kgi.ggreport.web.mapper.PrepMapper;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.PrepBoardUiIds;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 대시보드 서비스 단위 시험(NEXT 102) — 협력 객체는 Mockito. U1 PK 방어선, U2 빈 이름, U3 KST 날짜, U4 잠금 순서, U5 행 순서, U6 열 27칸.
 * 저장 서비스의 호출 순서·예외만 본다 — 실제 SQL 은 PrepBoardApiTest 가 H2 위에서 본다.
 */
public class PrepBoardServiceTest {

    private static final String BID = "BID-1";

    private PrepMapper preps;
    private PrepBoardMapper mapper;
    private BidAssignmentService assignments;
    private PrepAudit audit;
    private PrepBoardService svc;
    private SysUser me;
    private BoardUiIds.Ui ui;

    @Before
    public void setUp() {
        preps = mock(PrepMapper.class);
        mapper = mock(PrepBoardMapper.class);
        assignments = mock(BidAssignmentService.class);
        audit = mock(PrepAudit.class);
        svc = new PrepBoardService(preps, mapper, mock(PrepService.class), assignments, mock(BankContractMapper.class),
                mock(NoticeRoundService.class), audit, mock(ExtCheckMapper.class));
        me = new SysUser();
        me.setEmpNo("3361829");
        me.setName("윤서준");
        me.setRole("영업팀");
        MockHttpServletRequest r = new MockHttpServletRequest();
        r.addHeader(BoardUiIds.H_SCREEN, "prep_dashboard");
        r.addHeader(BoardUiIds.H_BUTTON, "dash_check");
        ui = PrepBoardUiIds.of(r);
        when(preps.selectStateForUpdate(BID)).thenReturn("IN_PROGRESS");
        when(assignments.isActiveAssignee(BID, "3361829")).thenReturn(true);
    }

    private static PrepBoardIn.Check body(String mark, int base) {
        PrepBoardIn.Check c = new PrepBoardIn.Check();
        c.setMarkCd(mark);
        c.setBaseRev(base);
        return c;
    }

    @Test
    public void U1_INSERT가_PK_중복이면_409_STALE_CHECK이고_성공_감사를_남기지_않는다() {
        when(mapper.selectCurrentOne(BID, "FIN_COMMITTEE")).thenReturn(null);
        when(mapper.insertCheck(any(PrepBoardCheck.class))).thenThrow(new DuplicateKeyException("dup"));
        try {
            svc.save(me, Actor.claimed("3361829"), ui, BID, "FIN_COMMITTEE", body("DONE", 0));
            fail("409 가 나와야 한다");
        } catch (ApiException e) {
            assertEquals(409, e.getStatus());
        }
        verify(audit, never()).record(anyString(), anyString(), anyString(), anyString(), anyString(), any(Actor.class), any(BoardUiIds.Ui.class));
    }

    @Test
    public void U2_이름이_비어_있거나_null이면_사번을_이름_칸에_넣는다() {
        for (String name : new String[]{"", "   ", null}) {
            me.setName(name);
            assertEquals("3361829", PrepBoardService.actorName(me));
        }
        StringBuilder longName = new StringBuilder();
        for (int i = 0; i < 60; i++) { longName.append('가'); }
        me.setName(longName.toString());
        assertEquals(50, PrepBoardService.actorName(me).length());

        me.setName("");
        when(mapper.selectCurrentOne(BID, "ATM")).thenReturn(null);
        svc.save(me, Actor.claimed("3361829"), ui, BID, "ATM", body("DONE", 0));
        ArgumentCaptor<PrepBoardCheck> cap = ArgumentCaptor.forClass(PrepBoardCheck.class);
        verify(mapper).insertCheck(cap.capture());
        assertEquals("3361829", cap.getValue().getActorName());
    }

    @Test
    public void U3_UTC_시각은_한국_날짜로_바꾸고_읽을_수_없으면_null이다() {
        assertEquals("2026-11-23", PrepBoardService.kstDate("2026-11-22T16:30:00.000000+00:00"));
        assertEquals("2026-11-22", PrepBoardService.kstDate("2026-11-22T14:59:59+00:00"));
        assertNull(PrepBoardService.kstDate("x"));
        assertNull(PrepBoardService.kstDate(null));
        assertNull(PrepBoardService.kstDate("  "));
    }

    @Test
    public void U4_건_행_잠금이_담당_검사보다_먼저_불린다() {
        when(mapper.selectCurrentOne(BID, "ATM")).thenReturn(null);
        svc.save(me, Actor.claimed("3361829"), ui, BID, "ATM", body("DONE", 0));
        InOrder o = inOrder(preps, assignments, mapper);
        o.verify(preps).selectStateForUpdate(BID);
        o.verify(assignments).isActiveAssignee(BID, "3361829");
        o.verify(mapper).selectCurrentOne(BID, "ATM");
    }

    private static BidPrep prep(String name, String due, String confirmedAt) {
        BidPrep p = new BidPrep();
        p.setInstitutionName(name);
        p.setContractEnd(due);
        p.setConfirmedAt(confirmedAt);
        return p;
    }

    @Test
    public void U5_행_순서는_입찰_예정일_오름차순_없으면_맨_뒤_다음_확정_시각_다음_기관_이름이다() {
        BidPrep noDueB = prep("나기관", null, "2026-11-01T00:00:00+00:00");
        BidPrep noDueEmptyA = prep("가기관", "  ", "2026-11-01T00:00:00+00:00");
        BidPrep late = prep("다기관", "2027-03-01", "2026-10-01T00:00:00+00:00");
        BidPrep early = prep("라기관", "2026-12-31", "2026-11-20T00:00:00+00:00");
        BidPrep earlySameDayEarlierConfirm = prep("마기관", "2026-12-31", "2026-11-10T00:00:00+00:00");
        List<BidPrep> rows = new ArrayList<BidPrep>();
        Collections.addAll(rows, noDueB, late, noDueEmptyA, early, earlySameDayEarlierConfirm);
        Collections.sort(rows, PrepBoardService.ROW_ORDER);
        List<String> names = new ArrayList<String>();
        for (BidPrep p : rows) { names.add(p.getInstitutionName()); }
        assertEquals(java.util.Arrays.asList("마기관", "라기관", "다기관", "가기관", "나기관"), names);
    }

    @Test
    public void U6_열은_엑셀_그대로_27칸이고_묶음_머리는_칸이_아니다() {
        assertEquals(27, PrepBoardColumns.ALL.size());
        assertNull(PrepBoardColumns.byCode("BOARD"));          // T5 칸 없음
        assertNull(PrepBoardColumns.byCode("SUBMIT_APPR"));    // 묶음 머리 — 칸 아님
        assertEquals(3, PrepBoardColumns.GROUPS.size());
        assertTrue(PrepBoardColumns.GROUPS.containsKey("BOARD") && PrepBoardColumns.GROUPS.containsKey("SUBMIT_APPR"));
        Map<String, String> g = PrepBoardColumns.GROUPS;
        assertEquals("이사회", g.get("BOARD"));
    }

    @Test
    public void U7_대시보드_체크_허용_상태는_취소_중단_밖_6개이고_취소면_409다() {
        for (String st : new String[]{"CONFIRMED", "OPEN_PENDING", "IN_PROGRESS", "APPROVAL_PENDING", "WRITABLE", "WRITING"}) {
            assertTrue(st, PrepBoardService.CHECK_STATES.contains(st));
        }
        assertFalse(PrepBoardService.CHECK_STATES.contains("CANCELLED"));
        assertEquals(6, PrepBoardService.CHECK_STATES.size());
        when(preps.selectStateForUpdate(BID)).thenReturn("CANCELLED");
        try {
            svc.save(me, Actor.claimed("3361829"), ui, BID, "ATM", body("DONE", 0));
            fail("409 가 나와야 한다");
        } catch (ApiException e) {
            assertEquals(409, e.getStatus());
        }
    }

    @Test
    public void U8_목록_감사_대상은_응답_행_중_WRITABLE_WRITING_건뿐이다() {
        Map<String, Object> out = new java.util.LinkedHashMap<String, Object>();
        List<Map<String, Object>> rows = new ArrayList<Map<String, Object>>();
        for (String[] r : new String[][]{{"A", "WRITABLE"}, {"B", "IN_PROGRESS"}, {"C", "WRITING"}, {"D", "CANCELLED"}, {"E", "CONFIRMED"}}) {
            Map<String, Object> m = new java.util.LinkedHashMap<String, Object>();
            m.put("bid_case_id", r[0]);
            m.put("state_cd", r[1]);
            rows.add(m);
        }
        out.put("rows", rows);
        List<String[]> got = PrepBoardService.auditRows(out);
        assertEquals(2, got.size());
        assertEquals("A", got.get(0)[0]);
        assertEquals("WRITABLE", got.get(0)[1]);
        assertEquals("C", got.get(1)[0]);
        assertEquals(0, PrepBoardService.auditRows(null).size());
    }

    @Test
    public void U9_공고_마감일이_있는_기관은_그_날짜로_먼저_정렬되고_없으면_약정_만료일이다() {
        BidPrep a = prep("가기관", "2027-06-30", "2026-11-01T00:00:00+00:00");
        a.setInstitutionId("A");
        BidPrep b = prep("나기관", "2027-01-31", "2026-11-01T00:00:00+00:00");
        b.setInstitutionId("B");
        Map<String, String> due = new java.util.HashMap<String, String>();
        due.put("A", "2025-12-10");
        assertEquals("2025-12-10", PrepBoardService.dueOf(a, due));
        assertEquals("2027-01-31", PrepBoardService.dueOf(b, due));
        List<BidPrep> rows = new ArrayList<BidPrep>();
        Collections.addAll(rows, b, a);
        Collections.sort(rows, PrepBoardService.rowOrder(due));
        assertEquals("가기관", rows.get(0).getInstitutionName());
    }
}
