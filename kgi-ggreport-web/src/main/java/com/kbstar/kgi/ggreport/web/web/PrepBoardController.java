package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.config.AccessLogInterceptor;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.PrepBoardIn;
import com.kbstar.kgi.ggreport.web.service.PrepAudit;
import com.kbstar.kgi.ggreport.web.service.PrepBoardService;
import com.kbstar.kgi.ggreport.web.service.PrepService;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.PrepBoardUiIds;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;

/**
 * 대시보드(NEXT 102). 감사(BID_PREP_ACT): 목록 DASH_LIST(끝난 건 포함이면 DASH_LIST_ENDED, 건 NONE) + 표에 실린 결재 끝난 건(WRITABLE·WRITING)마다
 * DASH_LIST_ROW(건 번호·그 건 상태, 같은 LOGGED_AT — planner 11-23 P3-3), 체크 DASH_CHECK·DASH_CHECK_SAME(TASK_CD CK_{열}) — 누가·어느 화면·어느 버튼.
 * 목록 요약 줄 TASK_CD = 조회 범위(SCOPE_MINE|TEAM|DEPT).
 * 거부·실패 줄 TASK_CD = 요청 범위(형식 맞을 때만, 아니면 NULL), 성공 줄 = 실제 적용 범위.
 * 체크 성공 줄은 서비스가 저장과 같은 트랜잭션에, 목록 성공 줄과 모든 실패 줄은 여기서 따로 커밋한다(성공 줄 실패 = 500, fail-closed).
 * 접근 이력 DETAIL 에는 줄 수·건·상태·행위·열 코드만(아이콘 값·날짜·이름·쿼리값 없음). ⚠️ X-Emp-No·X-Screen-Id·X-Button-Id 는 자기신고다.
 *
 * ⚠️ 이 컨트롤러(와 두 메서드)에 @Transactional 을 붙이지 말 것 — 체크 저장의 base_rev 검사는 "건 행 잠금 뒤 첫 일반 SELECT 가 읽기 시점을 만든다"는 데
 * 기대고 있다(MySQL REPEATABLE READ). 컨트롤러에 트랜잭션이 생기면 prep.stateOf 가 잠금 앞에서 읽기 시점을 만들어 base_rev 가 헛돌고 PK 만 막는다.
 * 또 컨트롤러가 쓰는 실패 감사 줄은 저장 트랜잭션과 따로 커밋돼야 롤백에 휩쓸리지 않는다.
 */
@RestController
public class PrepBoardController {

    private static final Logger LOG = LoggerFactory.getLogger(PrepBoardController.class);
    private static final String NO_CASE = "NONE";

    private final PrepBoardService board;
    private final PrepService prep;
    private final PrepAudit audit;
    private final MenuGuard guard;

    public PrepBoardController(PrepBoardService board, PrepService prep, PrepAudit audit, MenuGuard guard) {
        this.board = board; this.prep = prep; this.audit = audit; this.guard = guard;
    }

    @GetMapping("/prep-board")
    public Map<String, Object> list(@RequestParam(name = "include_ended", required = false) String includeEnded,
                                    @RequestParam(name = "scope", required = false) String scope,
                                    HttpServletRequest req) {
        Actor actor = Actor.of(req);
        BoardUiIds.Ui ui = PrepBoardUiIds.of(req);
        String scopeTag = PrepBoardService.scopeTag(scope);   // 형식이 맞을 때만 SCOPE_*(입력값 원문은 감사·접근 이력에 싣지 않는다)
        boolean all = "true".equals(includeEnded) || "1".equals(includeEnded);
        String act = all ? PrepBoardService.ACT_LIST_ENDED : PrepBoardService.ACT_LIST;   // 끝난 건 보기를 켰는지 감사에 남긴다(security F2)
        SysUser me;
        try {
            me = guard.requireActiveUser(req);
        } catch (ApiException e) {
            if (e.getStatus() == 403) { fail(NO_CASE, act, "DENIED", NO_CASE, scopeTag, actor, ui); }   // 401 은 ACCESS_LOG 에만
            throw e;
        }
        Map<String, Object> out;
        try {
            out = board.list(me, all, scope);
        } catch (ApiException e) {
            fail(NO_CASE, act, PrepAudit.outcomeOf(e.getStatus()), NO_CASE, scopeTag, actor, ui);   // 400 BAD_SCOPE 는 scopeTag=null
            if (e.getStatus() == 403) { throw guard.denied(req, e); }
            throw e;
        } catch (RuntimeException e) {
            fail(NO_CASE, act, "ERROR", NO_CASE, scopeTag, actor, ui);
            throw e;
        }
        List<String[]> seen = PrepBoardService.auditRows(out);
        String applied = PrepBoardService.scopeTag((String) out.get("scope"));   // 기본값을 썼어도 실제 적용 범위를 남긴다
        try {
            audit.recordList(act, PrepBoardService.ACT_LIST_ROW, seen, applied, actor, ui);
        } catch (RuntimeException e) {
            LOG.error("대시보드 목록 감사를 남기지 못했다(응답 500): cause={}", e.getClass().getSimpleName());
            fail(NO_CASE, act, "ERROR", NO_CASE, applied, actor, ui);   // PrepAudit 머리 규칙(NEXT 70) — 성공 줄 기록 실패도 ERROR 한 줄(security 11-23)
            throw e;
        }
        req.setAttribute(AccessLogInterceptor.DETAIL, "prep-board rows=" + ((List<?>) out.get("rows")).size() + " audited=" + seen.size());
        return out;
    }

    @PutMapping("/bidcases/{bidCaseId}/prep/board-checks/{colCd}")
    public Map<String, Object> check(@PathVariable String bidCaseId, @PathVariable String colCd,
                                     @RequestBody(required = false) PrepBoardIn.Check body, HttpServletRequest req) {
        Actor actor = Actor.of(req);
        BoardUiIds.Ui ui = PrepBoardUiIds.of(req);
        String act = PrepBoardService.ACT_CHECK;
        String auditBid = caseKey(bidCaseId);
        String auditCol = colCd != null && colCd.matches("[A-Z0-9_]{1,17}") ? "CK_" + colCd : null;
        SysUser me;
        try {
            me = guard.requireActiveUser(req);
        } catch (ApiException e) {
            if (e.getStatus() == 403) { fail(auditBid, act, "DENIED", null, auditCol, actor, ui); }
            throw e;
        }
        String before;
        try {
            before = NO_CASE.equals(auditBid) ? NO_CASE : prep.stateOf(bidCaseId);
        } catch (RuntimeException e) {
            fail(auditBid, act, "ERROR", NO_CASE, auditCol, actor, ui);
            throw e;
        }
        Map<String, Object> out;
        try {
            out = board.save(me, actor, ui, bidCaseId, colCd, body);
        } catch (ApiException e) {
            if (e.getStatus() != 401) { fail(auditBid, act, PrepAudit.outcomeOf(e.getStatus()), before, auditCol, actor, ui); }
            if (e.getStatus() == 403) { throw guard.denied(req, e); }
            throw e;
        } catch (RuntimeException e) {   // DB 오류·성공 감사 실패 — 저장과 감사가 함께 되돌아간다(500)
            LOG.error("대시보드 체크 실패(응답 500): case={} cause={}", auditBid, e.getClass().getSimpleName());
            fail(auditBid, act, "ERROR", before, auditCol, actor, ui);
            throw e;
        }
        boolean saved = Boolean.TRUE.equals(out.get("saved"));
        req.setAttribute(AccessLogInterceptor.DETAIL, "prep case=" + auditBid + " state=" + before
                + " code=" + (saved ? act : PrepBoardService.ACT_SAME) + " col=" + (auditCol == null ? "-" : auditCol));
        return out;
    }

    /** 실패 시도 — 따로 커밋. 기록 실패가 원래 응답을 덮지 않는다(예외 종류만 로그). */
    private void fail(String bid, String action, String outcome, String before, String col, Actor actor, BoardUiIds.Ui ui) {
        try {
            String st = before != null ? before : NO_CASE.equals(bid) ? NO_CASE : prep.stateOf(bid);
            audit.record(bid, action, outcome, st, col, actor, ui);
        } catch (RuntimeException ex) {
            LOG.warn("대시보드 실패 감사를 남기지 못했다: action={} outcome={} cause={}", action, outcome, ex.getClass().getSimpleName());
        }
    }

    private static String caseKey(String bid) {
        String b = bid == null ? "" : bid.trim();
        return b.matches("[A-Za-z0-9._-]{1,64}") ? b : NO_CASE;
    }
}
