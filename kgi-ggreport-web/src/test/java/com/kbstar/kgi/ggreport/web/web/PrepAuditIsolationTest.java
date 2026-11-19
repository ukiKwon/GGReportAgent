package com.kbstar.kgi.ggreport.web.web;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.ApprovalIn;
import com.kbstar.kgi.ggreport.web.dto.PrepIn;
import com.kbstar.kgi.ggreport.web.service.ApprovalDeputyService;
import com.kbstar.kgi.ggreport.web.service.ApprovalRequestService;
import com.kbstar.kgi.ggreport.web.service.PrepAttachService;
import com.kbstar.kgi.ggreport.web.service.PrepAudit;
import com.kbstar.kgi.ggreport.web.service.PrepNobidService;
import com.kbstar.kgi.ggreport.web.service.PrepService;
import com.kbstar.kgi.ggreport.web.support.ApprovalTypes;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockHttpServletRequest;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.Constructor;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

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
 * NEXT 70 하 — 사전준비 감사 기록(PrepAudit)이 예외를 던져도 <b>실패 응답</b>(401·403·404·409·원래 예외)이 그대로 나가고
 * 서버 로그에 예외 종류만 한 줄 남는지(PrepController.auditFailure · ApprovalLineController.auditPrepFailure).
 *
 * <p>스프링 컨텍스트를 띄우지 않는다 — {@code @MockBean} 은 AppTest 의 단일 컨텍스트 규칙을 깨므로 쓰지 않고,
 * 컨트롤러를 Mockito 협력 객체와 직접 부른다. 응답 상태는 던져진 {@link ApiException} 으로 본다
 * (전역 처리기는 ApiException → HTTP 상태·본문 변환만 한다).
 *
 * <p>범위의 한계 — 성공 줄(OK) 기록은 격리 대상이 아니다. 성공 줄은 응답 전에(결재는 같은 트랜잭션에서) 쓰며
 * 실패하면 예외가 올라가 500 이 된다(PrepAudit 클래스 주석의 의도). 그 사실도 아래 시험으로 고정한다.
 * 로그 수준은 실패 줄 WARN, 성공 줄 ERROR(NEXT 70, planner 11-16)다.
 */
public class PrepAuditIsolationTest {

    private static final String EMP = "3918264";
    private static final String BID = "BC-2026-0001";
    private static final String SECRET = "jdbc-secret-detail-xyz";   // 감사 예외 메시지 — 로그에 새면 안 된다

    private PrepService prep;
    private PrepAttachService attach;
    private ApprovalRequestService approvals;
    private ApprovalDeputyService deputies;
    private PrepAudit audit;
    private MenuGuard guard;
    private PrepController prepCtl;
    private ApprovalLineController lineCtl;

    private final IllegalStateException auditFailure = new IllegalStateException(SECRET);
    private ListAppender<ILoggingEvent> logs;
    private Logger prepLogger;
    private Logger lineLogger;
    private Level prepLevel;
    private Level lineLevel;

    @Before
    public void 준비() {
        prep = mock(PrepService.class);
        attach = mock(PrepAttachService.class);
        approvals = mock(ApprovalRequestService.class);
        deputies = mock(ApprovalDeputyService.class);
        audit = mock(PrepAudit.class);
        guard = mock(MenuGuard.class);
        prepCtl = new PrepController(prep, attach, approvals, audit, guard, mock(PrepNobidService.class));
        lineCtl = new ApprovalLineController(approvals, deputies, audit, guard);

        SysUser me = new SysUser();
        me.setEmpNo(EMP);
        me.setStatus("ACTIVE");
        when(guard.requireActiveUser(any(HttpServletRequest.class))).thenReturn(me);
        when(guard.denied(any(HttpServletRequest.class), any(ApiException.class)))
                .thenAnswer(inv -> inv.getArgument(1));   // 실제 구현은 ACCESS_LOG 기록 뒤 같은 예외를 돌려준다
        when(prep.stateOf(any())).thenReturn("OPEN_PENDING");

        // 감사 기록은 어느 오버로드로 불려도 터진다(PrepController 실패=8인자, 성공=7인자, ApprovalLineController=7인자).
        doThrow(auditFailure).when(audit).record(any(), any(), any(), any(), any(), any(), any(), any());
        doThrow(auditFailure).when(audit).record(any(), any(), any(), any(), any(), any(), any());

        logs = new ListAppender<>();
        logs.start();
        prepLogger = (Logger) LoggerFactory.getLogger(PrepController.class);
        lineLogger = (Logger) LoggerFactory.getLogger(ApprovalLineController.class);
        // PC마다 다른 config 의 logging.level 이 같은 JVM(AppTest 컨텍스트)에서 먼저 적용돼도 WARN 이 잡히게 고정한다.
        prepLevel = prepLogger.getLevel();
        lineLevel = lineLogger.getLevel();
        prepLogger.setLevel(Level.DEBUG);
        lineLogger.setLevel(Level.DEBUG);
        prepLogger.addAppender(logs);
        lineLogger.addAppender(logs);
    }

    @After
    public void 정리() {
        prepLogger.detachAppender(logs);
        lineLogger.detachAppender(logs);
        prepLogger.setLevel(prepLevel);
        lineLogger.setLevel(lineLevel);
        logs.stop();
    }

    // ── 도우미 ─────────────────────────────────────────────

    private static MockHttpServletRequest req() {
        MockHttpServletRequest r = new MockHttpServletRequest();
        r.addHeader(Actor.HEADER, EMP);
        return r;
    }

    private interface Call {
        Object run() throws Exception;
    }

    /** 호출이 {@code expected} 와 같은 인스턴스를 던지는지(감사 예외로 바뀌지 않았는지) 확인한다. */
    private static void assertThrowsSame(RuntimeException expected, Call call) throws Exception {
        try {
            call.run();
            fail("예외가 나와야 한다: " + expected.getClass().getSimpleName());
        } catch (RuntimeException e) {
            assertSame("원래 예외가 감사 예외에 덮이면 안 된다", expected, e);
        }
    }

    private static ApiException api(int status) {
        return new ApiException(status, "고정 문구");
    }

    /**
     * WARN 한 줄: 예외 종류만 있고 예외 메시지(SECRET)·스택은 없다.
     * {@code keyAction} 은 로그 키까지 적는다 — PrepController 는 {@code action=}, ApprovalLineController 는 {@code verb=}.
     */
    private void assertOneWarn(String expectedPrefix, String keyAction, String outcome) {
        assertOneWarn(expectedPrefix, keyAction, outcome, "IllegalStateException");
    }

    private void assertOneWarn(String expectedPrefix, String keyAction, String outcome, String cause) {
        assertEquals("감사 실패 로그는 한 줄", 1, logs.list.size());
        ILoggingEvent ev = logs.list.get(0);
        assertEquals(Level.WARN, ev.getLevel());
        String msg = ev.getFormattedMessage();
        assertTrue(msg, msg.startsWith(expectedPrefix));
        assertTrue(msg, msg.contains(keyAction + " "));
        assertTrue(msg, msg.contains("outcome=" + outcome));
        assertTrue(msg, msg.contains("cause=" + cause));
        assertFalse("예외 메시지가 로그에 새면 안 된다", msg.contains(SECRET));
        assertNull("스택트레이스를 싣지 않는다", ev.getThrowableProxy());
    }

    /** 성공 줄 감사 실패 ERROR 한 줄: action·건 번호·예외 종류만, 사번·예외 메시지·스택 없음(NEXT 70). */
    private void assertOneError(String action) {
        assertEquals("성공 감사 실패 로그는 한 줄", 1, logs.list.size());
        ILoggingEvent ev = logs.list.get(0);
        assertEquals(Level.ERROR, ev.getLevel());
        String msg = ev.getFormattedMessage();
        assertTrue(msg, msg.startsWith("사전준비 성공 감사를 남기지 못했다"));
        assertTrue(msg, msg.contains("action=" + action + " "));
        assertTrue(msg, msg.contains("case=" + BID));
        assertTrue(msg, msg.contains("cause=IllegalStateException"));
        assertFalse("예외 메시지가 로그에 새면 안 된다", msg.contains(SECRET));
        assertNull("스택트레이스를 싣지 않는다", ev.getThrowableProxy());
    }

    private static ApprovalRequestService.PrepRef prepRef(String reqType, String bid, String state) throws Exception {
        Constructor<ApprovalRequestService.PrepRef> c = ApprovalRequestService.PrepRef.class
                .getDeclaredConstructor(String.class, String.class, String.class);
        c.setAccessible(true);
        return c.newInstance(reqType, bid, state);
    }

    private static PrepIn.Confirm confirmBody() {
        PrepIn.Confirm b = new PrepIn.Confirm();
        b.setBidCaseId(BID);
        return b;
    }

    private static ApprovalIn.Decision decision(String d) {
        ApprovalIn.Decision in = new ApprovalIn.Decision();
        in.setDecision(d);
        return in;
    }

    // ── PrepController — 실패 응답이 그대로 ───────────────────

    @Test
    public void 확정이_409로_거절돼도_감사가_터지면_원래_409가_나가고_WARN_한_줄() throws Exception {
        ApiException original = api(409);
        when(prep.confirm(any(), any(), any())).thenThrow(original);

        try {
            prepCtl.confirm(confirmBody(), req());
            fail();
        } catch (ApiException e) {
            assertSame(original, e);
            assertEquals(409, e.getStatus());
        }

        verify(audit).record(eq(BID), eq("CONFIRM"), eq("BLOCKED"), eq("OPEN_PENDING"), isNull(), isNull(), any(), any());
        assertOneWarn("사전준비 실패 감사를 남기지 못했다", "action=CONFIRM", "BLOCKED");
    }

    @Test
    public void 확정에서_서비스가_403이면_감사가_터져도_403이_그대로이고_접근이력_DENIED_기록은_유지된다() throws Exception {
        ApiException original = api(403);
        when(prep.confirm(any(), any(), any())).thenThrow(original);

        assertThrowsSame(original, () -> prepCtl.confirm(confirmBody(), req()));

        verify(guard).denied(any(HttpServletRequest.class), eq(original));
        assertOneWarn("사전준비 실패 감사를 남기지 못했다", "action=CONFIRM", "DENIED");
    }

    @Test
    public void 비활성_사용자_403은_BID_PREP_ACT에_남기려_시도하고_감사가_터져도_403이_그대로다() throws Exception {
        ApiException inactive = api(403);
        when(guard.requireActiveUser(any(HttpServletRequest.class))).thenThrow(inactive);

        assertThrowsSame(inactive, () -> prepCtl.confirm(confirmBody(), req()));

        verify(audit).record(eq(BID), eq("CONFIRM"), eq("DENIED"), any(), isNull(), isNull(), any(), any());
        verify(prep, never()).confirm(any(), any(), any());
        assertOneWarn("사전준비 실패 감사를 남기지 못했다", "action=CONFIRM", "DENIED");
    }

    @Test
    public void 건_단위_행위에서_비활성_403도_같다() throws Exception {
        ApiException inactive = api(403);
        when(guard.requireActiveUser(any(HttpServletRequest.class))).thenThrow(inactive);

        assertThrowsSame(inactive, () -> prepCtl.detail(BID, req()));

        verify(audit).record(eq(BID), eq("VIEW"), eq("DENIED"), any(), isNull(), isNull(), any(), any());
        assertOneWarn("사전준비 실패 감사를 남기지 못했다", "action=VIEW", "DENIED");
    }

    @Test
    public void 사번_없는_401은_감사를_시도하지_않고_401이_그대로다() throws Exception {
        ApiException unauth = api(401);
        when(guard.requireActiveUser(any(HttpServletRequest.class))).thenThrow(unauth);

        assertThrowsSame(unauth, () -> prepCtl.detail(BID, new MockHttpServletRequest()));

        verify(audit, never()).record(any(), any(), any(), any(), any(), any(), any(), any());
        assertEquals("401 은 ACCESS_LOG 에만 — 감사 실패 로그도 없다", 0, logs.list.size());
    }

    @Test
    public void 상세가_비담당_404여도_감사가_터지면_원래_404가_나간다() throws Exception {
        ApiException hidden = api(404);
        when(prep.detail(any(), eq(BID))).thenThrow(hidden);

        assertThrowsSame(hidden, () -> prepCtl.detail(BID, req()));

        verify(audit).record(eq(BID), eq("VIEW"), eq("HIDDEN"), eq("OPEN_PENDING"), isNull(), isNull(), any(), any());
        assertOneWarn("사전준비 실패 감사를 남기지 못했다", "action=VIEW", "HIDDEN");
    }

    @Test
    public void 확정취소가_서비스_403이면_감사가_터져도_403이_그대로다() throws Exception {
        ApiException denied = api(403);
        when(prep.unconfirm(any(), any(), eq(BID), any())).thenThrow(denied);

        assertThrowsSame(denied, () -> prepCtl.unconfirm(BID, new PrepIn.Reason(), req()));

        verify(guard).denied(any(HttpServletRequest.class), eq(denied));
        assertOneWarn("사전준비 실패 감사를 남기지 못했다", "action=UNCONFIRM", "DENIED");
    }

    @Test
    public void 서비스_DB오류는_감사가_터져도_원래_예외가_그대로_올라간다() throws Exception {
        IllegalArgumentException dbError = new IllegalArgumentException("db down");
        when(prep.setTask(any(), any(), eq(BID), eq("T1"), eq(true))).thenThrow(dbError);

        assertThrowsSame(dbError, () -> prepCtl.check(BID, "T1", req()));

        verify(audit).record(eq(BID), eq("CHECK"), eq("ERROR"), eq("OPEN_PENDING"), eq("T1"), isNull(), any(), any());
        assertOneWarn("사전준비 실패 감사를 남기지 못했다", "action=CHECK", "ERROR");
    }

    @Test
    public void 상태_조회가_DB오류여도_감사가_터지면_원래_예외가_나간다() throws Exception {
        IllegalArgumentException dbError = new IllegalArgumentException("db down");
        when(prep.stateOf(any())).thenThrow(dbError);

        assertThrowsSame(dbError, () -> prepCtl.detail(BID, req()));

        assertOneWarn("사전준비 실패 감사를 남기지 못했다", "action=VIEW", "ERROR");
    }

    @Test
    public void 감사가_터지지_않으면_로그도_없다_대조군() throws Exception {
        PrepAudit ok = mock(PrepAudit.class);
        PrepController ctl = new PrepController(prep, attach, approvals, ok, guard, mock(PrepNobidService.class));
        ApiException original = api(409);
        when(prep.confirm(any(), any(), any())).thenThrow(original);

        assertThrowsSame(original, () -> ctl.confirm(confirmBody(), req()));

        assertEquals(0, logs.list.size());
    }

    // ── PrepController — 성공 줄은 격리 대상이 아니다(의도) ─────────

    @Test
    public void 확정_성공_줄의_감사가_터지면_성공_응답은_나가지_않고_감사_예외가_올라간다_의도된_동작() throws Exception {
        Map<String, Object> out = new HashMap<>();
        out.put("bid_case_id", BID);
        when(prep.confirm(any(), any(), any())).thenReturn(out);

        try {
            prepCtl.confirm(confirmBody(), req());
            fail("성공 줄 기록 실패는 500 이어야 한다(PrepAudit 클래스 주석: 응답 전에 기록, 실패하면 데이터 안 나감)");
        } catch (IllegalStateException e) {
            assertSame(auditFailure, e);
        }
        // 성공 줄 실패는 실패-감사 격리 경로(WARN)를 타지 않고 ERROR 한 줄만 남긴다(NEXT 70, planner 11-16)
        assertOneError("CONFIRM");
    }

    @Test
    public void 건_단위_성공_줄의_감사가_터지면_결과를_돌려주지_않는다_의도된_동작() throws Exception {
        when(prep.detail(any(), eq(BID))).thenReturn(Collections.<String, Object>singletonMap("bid_case_id", BID));

        try {
            prepCtl.detail(BID, req());
            fail();
        } catch (IllegalStateException e) {
            assertSame(auditFailure, e);
        }
        assertOneError("VIEW");
    }

    // ── qa 11-15 추가: 비어 있던 실패 경로 ──────────────────────

    @Test
    public void 확정_409에서_실패감사용_상태조회까지_터져도_원래_409가_나간다() throws Exception {
        ApiException original = api(409);
        when(prep.confirm(any(), any(), any())).thenThrow(original);
        when(prep.stateOf(any())).thenThrow(new IllegalArgumentException("db down"));

        assertThrowsSame(original, () -> prepCtl.confirm(confirmBody(), req()));

        verify(audit, never()).record(any(), any(), any(), any(), any(), any(), any(), any());
        assertOneWarn("사전준비 실패 감사를 남기지 못했다", "action=CONFIRM", "BLOCKED", "IllegalArgumentException");
    }

    @Test
    public void 확정_서비스_DB오류는_ERROR로_감사하려다_터져도_원래_예외가_나간다() throws Exception {
        IllegalArgumentException dbError = new IllegalArgumentException("db down");
        when(prep.confirm(any(), any(), any())).thenThrow(dbError);

        assertThrowsSame(dbError, () -> prepCtl.confirm(confirmBody(), req()));

        verify(audit).record(eq(BID), eq("CONFIRM"), eq("ERROR"), eq("OPEN_PENDING"), isNull(), isNull(), any(), any());
        assertOneWarn("사전준비 실패 감사를 남기지 못했다", "action=CONFIRM", "ERROR");
    }

    @Test
    public void 서비스가_낸_401은_감사하지_않고_401이_그대로다() throws Exception {
        ApiException unauth = api(401);
        when(prep.detail(any(), eq(BID))).thenThrow(unauth);

        assertThrowsSame(unauth, () -> prepCtl.detail(BID, req()));

        verify(audit, never()).record(any(), any(), any(), any(), any(), any(), any(), any());
        assertEquals(0, logs.list.size());
    }

    // ── ApprovalLineController — 결재 승인·반려·회수 ───────────────

    private void givenPrepApproval() throws Exception {
        when(approvals.prepRefOf(any())).thenReturn(prepRef(ApprovalTypes.BID_OPEN, BID, "OPEN_PENDING"));
    }

    @Test
    public void 승인이_409로_막혀도_감사가_터지면_원래_409가_나가고_WARN_한_줄() throws Exception {
        givenPrepApproval();
        ApiException blocked = api(409);
        when(approvals.decide(eq(101L), any(), any(), any())).thenThrow(blocked);

        assertThrowsSame(blocked, () -> lineCtl.decide(101L, decision("APPROVE"), req()));

        verify(audit).record(eq(BID), eq("OPEN_APPROVE"), eq("BLOCKED"), eq("OPEN_PENDING"), isNull(), any(), any());
        assertOneWarn("사전준비 결재 실패 감사를 남기지 못했다", "verb=APPROVE", "BLOCKED");
    }

    @Test
    public void 반려가_404여도_감사가_터지면_원래_404가_나간다() throws Exception {
        givenPrepApproval();
        ApiException hidden = api(404);
        when(approvals.decide(eq(101L), any(), any(), any())).thenThrow(hidden);

        assertThrowsSame(hidden, () -> lineCtl.decide(101L, decision("REJECT"), req()));

        verify(audit).record(eq(BID), eq("OPEN_REJECT"), eq("HIDDEN"), eq("OPEN_PENDING"), isNull(), any(), any());
        assertOneWarn("사전준비 결재 실패 감사를 남기지 못했다", "verb=REJECT", "HIDDEN");
    }

    @Test
    public void 결재_서비스_403은_감사가_터져도_403이_그대로이고_접근이력_DENIED_기록이_유지된다() throws Exception {
        givenPrepApproval();
        ApiException denied = api(403);
        when(approvals.decide(eq(101L), any(), any(), any())).thenThrow(denied);

        assertThrowsSame(denied, () -> lineCtl.decide(101L, decision("APPROVE"), req()));

        verify(guard).denied(any(HttpServletRequest.class), eq(denied));
        assertOneWarn("사전준비 결재 실패 감사를 남기지 못했다", "verb=APPROVE", "DENIED");
    }

    @Test
    public void 회수가_409여도_감사가_터지면_원래_409가_나간다() throws Exception {
        givenPrepApproval();
        ApiException blocked = api(409);
        when(approvals.cancel(eq(101L), any(), any())).thenThrow(blocked);

        assertThrowsSame(blocked, () -> lineCtl.cancel(101L, req()));

        verify(audit).record(eq(BID), eq("OPEN_WITHDRAW"), eq("BLOCKED"), eq("OPEN_PENDING"), isNull(), any(), any());
        assertOneWarn("사전준비 결재 실패 감사를 남기지 못했다", "verb=WITHDRAW", "BLOCKED");
    }

    @Test
    public void 결재_서비스_DB오류는_감사가_터져도_원래_예외가_그대로다() throws Exception {
        givenPrepApproval();
        IllegalArgumentException dbError = new IllegalArgumentException("db down");
        when(approvals.cancel(eq(101L), any(), any())).thenThrow(dbError);

        assertThrowsSame(dbError, () -> lineCtl.cancel(101L, req()));

        assertOneWarn("사전준비 결재 실패 감사를 남기지 못했다", "verb=WITHDRAW", "ERROR");
    }

    @Test
    public void 실패_감사용_조회_prepRefOf가_터져도_원래_응답이_나간다() throws Exception {
        ApiException blocked = api(409);
        when(approvals.decide(eq(101L), any(), any(), any())).thenThrow(blocked);
        when(approvals.prepRefOf(any())).thenThrow(auditFailure);

        assertThrowsSame(blocked, () -> lineCtl.decide(101L, decision("APPROVE"), req()));

        verify(audit, never()).record(any(), any(), any(), any(), any(), any(), any());
        assertOneWarn("사전준비 결재 실패 감사를 남기지 못했다", "verb=APPROVE", "BLOCKED");
    }

    @Test
    public void 결재_비활성_사용자_403은_BID_PREP_ACT에_남기려_시도하고_감사가_터져도_403이_그대로다() throws Exception {
        givenPrepApproval();
        ApiException inactive = api(403);
        when(guard.requireActiveUser(any(HttpServletRequest.class))).thenThrow(inactive);

        assertThrowsSame(inactive, () -> lineCtl.decide(101L, decision("APPROVE"), req()));

        verify(audit).record(eq(BID), eq("OPEN_APPROVE"), eq("DENIED"), eq("OPEN_PENDING"), isNull(), any(), any());
        verify(approvals, never()).decide(any(), any(), any(), any());
        assertOneWarn("사전준비 결재 실패 감사를 남기지 못했다", "verb=APPROVE", "DENIED");
    }

    @Test
    public void 결재_회수_비활성_사용자_403도_같다() throws Exception {
        givenPrepApproval();
        ApiException inactive = api(403);
        when(guard.requireActiveUser(any(HttpServletRequest.class))).thenThrow(inactive);

        assertThrowsSame(inactive, () -> lineCtl.cancel(101L, req()));

        verify(audit).record(eq(BID), eq("OPEN_WITHDRAW"), eq("DENIED"), eq("OPEN_PENDING"), isNull(), any(), any());
        assertOneWarn("사전준비 결재 실패 감사를 남기지 못했다", "verb=WITHDRAW", "DENIED");
    }

    @Test
    public void 결재_성공_응답은_컨트롤러가_감사를_부르지_않고_본문이_그대로다() throws Exception {
        Map<String, Object> approved = new HashMap<>();
        approved.put("req_id", 101L);
        approved.put("status", "APPROVED");
        Map<String, Object> withdrawn = Collections.<String, Object>singletonMap("status", "CANCELLED");
        when(approvals.decide(eq(101L), any(), any(), any())).thenReturn(approved);
        when(approvals.cancel(eq(101L), any(), any())).thenReturn(withdrawn);

        assertSame(approved, lineCtl.decide(101L, decision("APPROVE"), req()));
        assertSame(withdrawn, lineCtl.cancel(101L, req()));

        // 성공 줄은 ApprovalRequestService 가 결재와 같은 트랜잭션에서 쓴다 — 컨트롤러 계층에서는 부르지 않는다.
        verify(audit, never()).record(any(), any(), any(), any(), any(), any(), any());
        assertEquals(0, logs.list.size());
    }

    @Test
    public void 사전준비가_아닌_결재_실패는_감사를_부르지_않아_감사가_터질_일도_없다() throws Exception {
        when(approvals.prepRefOf(any())).thenReturn(null);
        ApiException blocked = api(409);
        when(approvals.decide(eq(101L), any(), any(), any())).thenThrow(blocked);

        assertThrowsSame(blocked, () -> lineCtl.decide(101L, decision("APPROVE"), req()));

        verify(audit, never()).record(any(), any(), any(), any(), any(), any(), any());
        assertEquals(0, logs.list.size());
    }

    // ── qa 11-15 P3 추가: 형식 밖 건 번호 · 첨부 행위 · 결재 401 · PREP_APPROVAL 행위 코드 ──

    @Test
    public void 확정_본문_건번호가_형식_밖이면_NONE으로_감사하고_상태조회_없이_원래_409가_나간다() throws Exception {
        ApiException original = api(409);
        when(prep.confirm(any(), any(), any())).thenThrow(original);
        PrepIn.Confirm body = new PrepIn.Confirm();
        body.setBidCaseId("a b<");   // [A-Za-z0-9._-]{1,64} 밖 → caseKey = NONE

        assertThrowsSame(original, () -> prepCtl.confirm(body, req()));

        verify(audit).record(eq("NONE"), eq("CONFIRM"), eq("BLOCKED"), eq("NONE"), isNull(), isNull(), any(), any());
        verify(prep, never()).stateOf(any());   // bid 가 NONE 이면 auditFailure 가 상태를 읽지 않는다
        assertOneWarn("사전준비 실패 감사를 남기지 못했다", "action=CONFIRM", "BLOCKED");
    }

    @Test
    public void 첨부_내려받기가_비담당_404여도_감사가_터지면_원래_404가_나가고_첨부번호가_감사에_실린다() throws Exception {
        ApiException hidden = api(404);
        when(attach.download(any(), eq(BID), eq("42"))).thenThrow(hidden);

        assertThrowsSame(hidden, () -> prepCtl.downloadAttachment(BID, "42", req()));

        verify(audit).record(eq(BID), eq("ATTACH_DOWNLOAD"), eq("HIDDEN"), eq("OPEN_PENDING"), isNull(), eq(42L), any(), any());
        assertOneWarn("사전준비 실패 감사를 남기지 못했다", "action=ATTACH_DOWNLOAD", "HIDDEN");
    }

    @Test
    public void 결재_앞단_401은_감사도_로그도_없이_401이_그대로다() throws Exception {
        givenPrepApproval();
        ApiException unauth = api(401);
        when(guard.requireActiveUser(any(HttpServletRequest.class))).thenThrow(unauth);

        assertThrowsSame(unauth, () -> lineCtl.decide(101L, decision("APPROVE"), new MockHttpServletRequest()));
        assertThrowsSame(unauth, () -> lineCtl.cancel(101L, new MockHttpServletRequest()));

        verify(approvals, never()).prepRefOf(any());
        verify(approvals, never()).decide(any(), any(), any(), any());
        verify(audit, never()).record(any(), any(), any(), any(), any(), any(), any());
        assertEquals("401 은 ACCESS_LOG 에만 — 감사 실패 로그도 없다", 0, logs.list.size());
    }

    @Test
    public void 결재_서비스가_낸_401도_감사하지_않고_401이_그대로다() throws Exception {
        givenPrepApproval();
        ApiException unauth = api(401);
        when(approvals.decide(eq(101L), any(), any(), any())).thenThrow(unauth);
        when(approvals.cancel(eq(101L), any(), any())).thenThrow(unauth);

        assertThrowsSame(unauth, () -> lineCtl.decide(101L, decision("APPROVE"), req()));
        assertThrowsSame(unauth, () -> lineCtl.cancel(101L, req()));

        verify(approvals, never()).prepRefOf(any());
        verify(audit, never()).record(any(), any(), any(), any(), any(), any(), any());
        assertEquals(0, logs.list.size());
    }

    @Test
    public void 기획승인_PREP_APPROVAL_결재_실패는_PLAN_계열_행위코드로_감사하려다_터져도_원래_예외가_나간다() throws Exception {
        when(approvals.prepRefOf(any())).thenReturn(prepRef(ApprovalTypes.PREP_APPROVAL, BID, "APPROVAL_PENDING"));
        ApiException blocked = api(409);
        when(approvals.decide(eq(101L), any(), any(), any())).thenThrow(blocked);
        when(approvals.cancel(eq(101L), any(), any())).thenThrow(blocked);

        assertThrowsSame(blocked, () -> lineCtl.decide(101L, decision("REJECT"), req()));
        assertThrowsSame(blocked, () -> lineCtl.cancel(101L, req()));

        verify(audit).record(eq(BID), eq("PLAN_REJECT"), eq("BLOCKED"), eq("APPROVAL_PENDING"), isNull(), any(), any());
        verify(audit).record(eq(BID), eq("PLAN_WITHDRAW"), eq("BLOCKED"), eq("APPROVAL_PENDING"), isNull(), any(), any());
        assertEquals("두 시도 각각 WARN 한 줄", 2, logs.list.size());
    }

    @Test
    public void 결재_decision이_이상값이면_DECIDE_계열_행위코드로_감사하고_원래_예외가_나간다() throws Exception {
        when(approvals.prepRefOf(any())).thenReturn(prepRef(ApprovalTypes.PREP_APPROVAL, BID, "APPROVAL_PENDING"));
        ApiException invalid = api(400);
        when(approvals.decide(eq(101L), any(), any(), any())).thenThrow(invalid);

        assertThrowsSame(invalid, () -> lineCtl.decide(101L, decision("XYZ"), req()));

        verify(audit).record(eq(BID), eq("PLAN_DECIDE"), eq("INVALID"), eq("APPROVAL_PENDING"), isNull(), any(), any());
        assertOneWarn("사전준비 결재 실패 감사를 남기지 못했다", "verb=DECIDE", "INVALID");
    }
}
