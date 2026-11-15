package com.kbstar.kgi.ggreport.web.web;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.kbstar.kgi.ggreport.web.domain.BidCase;
import com.kbstar.kgi.ggreport.web.domain.BidCaseDetail;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.service.BidCaseCommandService;
import com.kbstar.kgi.ggreport.web.service.BidCaseQueryService;
import com.kbstar.kgi.ggreport.web.service.PrepAudit;
import com.kbstar.kgi.ggreport.web.service.PrepService;
import com.kbstar.kgi.ggreport.web.support.LegacyFlowSwitch;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockHttpServletRequest;

import javax.servlet.http.HttpServletRequest;
import java.util.Collections;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * NEXT 64② 1단계 — 공고 상세·담당자 목록의 감사 기록(PrepAudit)이 예외를 던져도 <b>실패 응답</b>(401·403·404)이 그대로 나가고
 * 서버 로그에 예외 종류만 한 줄 남는지, 성공 줄 기록 실패는 데이터를 내보내지 않는지(fail-closed), 목록 열람 판정표.
 * PrepAuditIsolationTest 와 같은 방식 — 스프링 컨텍스트 없이 컨트롤러를 Mockito 협력 객체와 직접 부른다.
 */
public class BidCaseAuditIsolationTest {

    private static final String EMP = "3918264";
    private static final String BID = "BC-2026-0001";
    private static final String SECRET = "jdbc-secret-detail-xyz";   // 감사 예외 메시지 — 로그에 새면 안 된다

    private BidCaseQueryService query;
    private BidCaseCommandService commands;
    private PrepAudit audit;
    private PrepService prep;
    private MenuGuard guard;
    private AdminGuard adminGuard;
    private BidCaseController ctl;

    private final IllegalStateException auditFailure = new IllegalStateException(SECRET);
    private ListAppender<ILoggingEvent> logs;
    private Logger logger;
    private Level level;

    @Before
    public void 준비() {
        query = mock(BidCaseQueryService.class);
        commands = mock(BidCaseCommandService.class);
        audit = mock(PrepAudit.class);
        prep = mock(PrepService.class);
        guard = mock(MenuGuard.class);
        adminGuard = mock(AdminGuard.class);
        ctl = new BidCaseController(query, commands, guard, adminGuard, new LegacyFlowSwitch(true), audit, prep);

        SysUser me = user("김영업", "영업팀");
        me.setEmpNo(EMP);
        me.setStatus("ACTIVE");
        when(guard.requireActiveUser(any(HttpServletRequest.class))).thenReturn(me);
        when(guard.denied(any(HttpServletRequest.class), any(ApiException.class)))
                .thenAnswer(inv -> inv.getArgument(1));   // 실제 구현은 ACCESS_LOG 기록 뒤 같은 예외를 돌려준다
        when(prep.stateOf(any())).thenReturn("NONE");

        doThrow(auditFailure).when(audit).record(any(), any(), any(), any(), any(), any(), any());

        logs = new ListAppender<>();
        logs.start();
        logger = (Logger) LoggerFactory.getLogger(BidCaseController.class);
        level = logger.getLevel();
        logger.setLevel(Level.DEBUG);   // PC마다 다른 logging.level 이 먼저 적용돼도 WARN 이 잡히게 고정
        logger.addAppender(logs);
    }

    @After
    public void 정리() {
        logger.detachAppender(logs);
        logger.setLevel(level);
        logs.stop();
    }

    // ── 도우미 ─────────────────────────────────────────────

    private static SysUser user(String name, String role) {
        SysUser u = new SysUser();
        u.setName(name);
        u.setRole(role);
        return u;
    }

    private static MockHttpServletRequest req() {
        MockHttpServletRequest r = new MockHttpServletRequest();
        r.addHeader(Actor.HEADER, EMP);
        return r;
    }

    private static ApiException api(int status) {
        return new ApiException(status, "고정 문구");
    }

    private interface Call {
        Object run() throws Exception;
    }

    private static void assertThrowsSame(RuntimeException expected, Call call) throws Exception {
        try {
            call.run();
            fail("예외가 나와야 한다: " + expected.getClass().getSimpleName());
        } catch (RuntimeException e) {
            assertSame("원래 예외가 감사 예외에 덮이면 안 된다", expected, e);
        }
    }

    private void assertOneWarn(String action, String outcome) {
        assertEquals("감사 실패 로그는 한 줄", 1, logs.list.size());
        ILoggingEvent ev = logs.list.get(0);
        assertEquals(Level.WARN, ev.getLevel());
        String msg = ev.getFormattedMessage();
        assertTrue(msg, msg.startsWith("입찰 건 실패 감사를 남기지 못했다"));
        assertTrue(msg, msg.contains("action=" + action + " "));
        assertTrue(msg, msg.contains("outcome=" + outcome));
        assertTrue(msg, msg.contains("cause=IllegalStateException"));
        assertFalse("예외 메시지가 로그에 새면 안 된다", msg.contains(SECRET));
        assertNull("스택트레이스를 싣지 않는다", ev.getThrowableProxy());
    }

    // ── 상세 ───────────────────────────────────────────────

    @Test
    public void 상세가_404여도_감사가_터지면_원래_404가_나가고_WARN_한_줄() throws Exception {
        ApiException hidden = api(404);
        when(query.detail(BID)).thenThrow(hidden);

        assertThrowsSame(hidden, () -> ctl.detail(BID, req()));

        verify(audit).record(eq(BID), eq("CASE_VIEW"), eq("HIDDEN"), eq("NONE"), isNull(), any(), any());
        assertOneWarn("CASE_VIEW", "HIDDEN");
    }

    @Test
    public void 상세_권한_403은_감사가_터져도_403이_그대로고_조회는_하지_않는다() throws Exception {
        ApiException denied = api(403);
        when(guard.require(any(HttpServletRequest.class), eq("workflow"))).thenThrow(denied);

        assertThrowsSame(denied, () -> ctl.detail(BID, req()));

        verify(query, never()).detail(any());
        verify(audit).record(eq(BID), eq("CASE_VIEW"), eq("DENIED"), any(), isNull(), any(), any());
        assertOneWarn("CASE_VIEW", "DENIED");
    }

    @Test
    public void 상세_앞단_401은_감사도_로그도_없이_401이_그대로다() throws Exception {
        ApiException unauth = api(401);
        when(guard.require(any(HttpServletRequest.class), eq("workflow"))).thenThrow(unauth);

        assertThrowsSame(unauth, () -> ctl.detail(BID, new MockHttpServletRequest()));

        verify(query, never()).detail(any());
        verify(audit, never()).record(any(), any(), any(), any(), any(), any(), any());
        assertEquals("401 은 ACCESS_LOG 에만 — 감사 실패 로그도 없다", 0, logs.list.size());
    }

    @Test
    public void 상세_성공인데_OK_기록이_터지면_감사_예외가_올라가고_데이터는_나가지_않는다_fail_closed() throws Exception {
        when(query.detail(BID)).thenReturn(new BidCaseDetail());

        try {
            ctl.detail(BID, req());
            fail("성공 줄 기록 실패는 500 이어야 한다");
        } catch (IllegalStateException e) {
            assertSame(auditFailure, e);
        }
        assertEquals("성공 줄 실패는 실패-감사 격리 경로(WARN)를 타지 않는다", 0, logs.list.size());
    }

    @Test
    public void 상세_형식_밖_건_번호는_NONE으로_감사하고_상태조회를_하지_않는다() throws Exception {
        ApiException hidden = api(404);
        when(query.detail("a b<")).thenThrow(hidden);

        assertThrowsSame(hidden, () -> ctl.detail("a b<", req()));

        verify(audit).record(eq("NONE"), eq("CASE_VIEW"), eq("HIDDEN"), eq("NONE"), isNull(), any(), any());
        verify(prep, never()).stateOf(any());
        assertOneWarn("CASE_VIEW", "HIDDEN");
    }

    // ── 목록 ───────────────────────────────────────────────

    @Test
    public void 목록이_남의_이름이면_403이_그대로고_denied_기록과_DENIED_감사_시도가_있고_조회는_하지_않는다() throws Exception {
        // 김영업(영업팀)이 영업팀 담당 dave 를 조회 — 열림 상태여도 팀원은 본인만.
        try {
            ctl.forAssignee("영업팀", "dave", req());
            fail("403 이어야 한다");
        } catch (ApiException e) {   // 판정 403 은 컨트롤러 안에서 만들어져 인스턴스를 미리 알 수 없다 — 상태·호출로 본다
            assertEquals(403, e.getStatus());
            verify(guard).denied(any(HttpServletRequest.class), eq(e));
        }
        verify(query, never()).forAssignee(any(), any());
        verify(audit).record(eq("NONE"), eq("CASE_LIST"), eq("DENIED"), eq("NONE"), isNull(), any(), any());
        assertOneWarn("CASE_LIST", "DENIED");
    }

    @Test
    public void 목록_성공인데_건별_OK_기록이_터지면_목록이_나가지_않는다_fail_closed() throws Exception {
        BidCase b = new BidCase();
        when(query.forAssignee("영업", "김영업")).thenReturn(Collections.singletonList(b));

        try {
            ctl.forAssignee("영업", "김영업", req());
            fail("성공 줄 기록 실패는 500 이어야 한다");
        } catch (IllegalStateException e) {
            assertSame(auditFailure, e);
        }
    }

    @Test
    public void 목록_앞단_401은_감사도_로그도_없다() throws Exception {
        ApiException unauth = api(401);
        when(guard.requireActiveUser(any(HttpServletRequest.class))).thenThrow(unauth);

        assertThrowsSame(unauth, () -> ctl.forAssignee("영업", "dave", new MockHttpServletRequest()));

        verify(audit, never()).record(any(), any(), any(), any(), any(), any(), any());
        assertEquals(0, logs.list.size());
    }

    // ── 열람 판정표 ────────────────────────────────────────

    @Test
    public void mayList_표() {
        SysUser sales = user("김영업", "영업팀");
        SysUser lead = user("이영업", "영업팀장");
        SysUser head = user("박영업", "영업부장");
        SysUser budgetLead = user("최예산", "예산팀장");

        assertTrue("본인 이름", BidCaseController.mayList(sales, "영업", "김영업", true));
        assertTrue("본인 이름은 닫힘에서도", BidCaseController.mayList(sales, "영업", "김영업", false));
        assertFalse("팀원은 남의 이름 불가", BidCaseController.mayList(sales, "영업", "dave", true));
        assertTrue("영업팀장 + '영업팀'", BidCaseController.mayList(lead, "영업팀", "dave", true));
        assertTrue("영업팀장 + '영업'", BidCaseController.mayList(lead, "영업", "dave", true));
        assertTrue("영업부장은 어느 팀이든", BidCaseController.mayList(head, "예산", "dave", true));
        assertFalse("예산팀장은 영업 팀 불가", BidCaseController.mayList(budgetLead, "영업", "dave", true));
        assertTrue("예산팀장은 예산 팀 가능", BidCaseController.mayList(budgetLead, "예산", "dave", true));
        assertFalse("닫힘이면 팀장도 남의 이름 불가", BidCaseController.mayList(lead, "영업", "dave", false));
        assertFalse("닫힘이면 부장도 남의 이름 불가", BidCaseController.mayList(head, "영업", "dave", false));
    }

    @Test
    public void caseKey_표() {
        assertEquals("BC-1", BidCaseController.caseKey(" BC-1 "));
        assertEquals("NONE", BidCaseController.caseKey("a b"));
        assertEquals("NONE", BidCaseController.caseKey(null));
        assertEquals("NONE", BidCaseController.caseKey(""));
    }
}
