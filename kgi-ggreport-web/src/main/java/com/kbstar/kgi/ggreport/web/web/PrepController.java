package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.config.AccessLogInterceptor;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.PrepIn;
import com.kbstar.kgi.ggreport.web.service.ApprovalRequestService;
import com.kbstar.kgi.ggreport.web.service.PrepAudit;
import com.kbstar.kgi.ggreport.web.service.PrepService;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.PrepUiIds;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.function.Supplier;

/**
 * 제안서 사전준비(NEXT 70). 호출자 확인은 {@link MenuGuard#requireActiveUser}(401/403 DENIED, 메뉴 무관 — 영업부장은 tasks 메뉴가 꺼져 있다).
 * 역할 검사 403 은 서비스가 던지고 여기서 DENIED 로 접근 이력에 남긴다. 접근 이력(ACCESS_LOG.DETAIL)에는 {@code prep case=… state=… code=…}
 * 만 남기고 사번 목록·사유·이름·값은 넣지 않는다. 건 단위 행위는 {@code BID_PREP_ACT} 에도 결과(OK·DENIED·HIDDEN·BLOCKED·INVALID)와 함께 남긴다.
 * 상세·이력의 비담당은 404(없는 건과 같은 응답)다. ⚠️ X-Emp-No 자기신고 위의 업무 규칙이다 — 사칭 방지가 아니다.
 *
 * <p>개설·기획승인의 회수·승인·반려는 기존 {@code /approval-requests/{id}/cancel·decide} 를 쓴다(후크가 사전준비 상태를 맞춘다).
 */
@RestController
public class PrepController {

    private final PrepService prep;
    private final ApprovalRequestService approvals;
    private final PrepAudit audit;
    private final MenuGuard guard;

    public PrepController(PrepService prep, ApprovalRequestService approvals, PrepAudit audit, MenuGuard guard) {
        this.prep = prep;
        this.approvals = approvals;
        this.audit = audit;
        this.guard = guard;
    }

    /** 목록(1) — 기관명·상태·진척 n/m·담당자 이름만. */
    @GetMapping("/preps")
    public List<Map<String, Object>> list(HttpServletRequest req) {
        SysUser me = guard.requireActiveUser(req);
        return denyLogged(req, () -> prep.list(me));
    }

    /** 제안 확정(2). */
    @PostMapping("/preps")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> confirm(@RequestBody PrepIn.Confirm body, HttpServletRequest req) {
        SysUser me = guard.requireActiveUser(req);
        Actor actor = Actor.of(req);
        Map<String, Object> out = denyLogged(req, () -> prep.confirm(me, actor, body));
        String bid = String.valueOf(out.get("bid_case_id"));
        audit.record(bid, "CONFIRM", "OK", "NONE", null, actor, PrepUiIds.of(req));
        req.setAttribute(AccessLogInterceptor.DETAIL, "prep case=" + bid + " state=CONFIRMED code=CONFIRM");
        return out;
    }

    /** 확정 취소(3). */
    @PostMapping("/bidcases/{bidCaseId}/prep/unconfirm")
    public Map<String, Object> unconfirm(@PathVariable String bidCaseId, @RequestBody PrepIn.Reason body,
                                         HttpServletRequest req) {
        Actor actor = Actor.of(req);
        return run(req, bidCaseId, "UNCONFIRM", null, me -> prep.unconfirm(me, actor, bidCaseId, body));
    }

    /** 중단(미참여) — 개설 뒤, 영업팀장만, 사유 필수, 결재 없음. */
    @PostMapping("/bidcases/{bidCaseId}/prep/cancel")
    public Map<String, Object> abort(@PathVariable String bidCaseId, @RequestBody PrepIn.Reason body,
                                     HttpServletRequest req) {
        Actor actor = Actor.of(req);
        return run(req, bidCaseId, "CANCEL", null, me -> prep.abort(me, actor, bidCaseId, body));
    }

    /** 개설 신청(4, BID_OPEN 상신). 결재자는 서버가 정한다. */
    @PostMapping("/bidcases/{bidCaseId}/prep/open-requests")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> openRequest(@PathVariable String bidCaseId, @RequestBody PrepIn.Open body,
                                           HttpServletRequest req) {
        Actor actor = Actor.of(req);
        return run(req, bidCaseId, "OPEN_REQUEST", null, me -> approvals.submitBidOpen(bidCaseId, body, actor));
    }

    /** 상세(6) — PrepView. 비담당은 404. */
    @GetMapping("/bidcases/{bidCaseId}/prep")
    public Map<String, Object> detail(@PathVariable String bidCaseId, HttpServletRequest req) {
        return run(req, bidCaseId, "VIEW", null, me -> prep.detail(me, bidCaseId));
    }

    /** 과제 체크(7). */
    @PostMapping("/bidcases/{bidCaseId}/prep/tasks/{taskCd}/check")
    public Map<String, Object> check(@PathVariable String bidCaseId, @PathVariable String taskCd,
                                     HttpServletRequest req) {
        Actor actor = Actor.of(req);
        return run(req, bidCaseId, "CHECK", auditTask(taskCd), me -> prep.setTask(me, actor, bidCaseId, taskCd, true));
    }

    /** 과제 체크 해제(7). */
    @PostMapping("/bidcases/{bidCaseId}/prep/tasks/{taskCd}/uncheck")
    public Map<String, Object> uncheck(@PathVariable String bidCaseId, @PathVariable String taskCd,
                                       HttpServletRequest req) {
        Actor actor = Actor.of(req);
        return run(req, bidCaseId, "UNCHECK", auditTask(taskCd), me -> prep.setTask(me, actor, bidCaseId, taskCd, false));
    }

    /** 기획승인 요청(13, PREP_APPROVAL 상신). 결재자는 영업부장 고정. */
    @PostMapping("/bidcases/{bidCaseId}/prep/plan-approval-requests")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> planApprovalRequest(@PathVariable String bidCaseId, HttpServletRequest req) {
        Actor actor = Actor.of(req);
        return run(req, bidCaseId, "PLAN_REQUEST", null, me -> approvals.submitPrepApproval(bidCaseId, actor));
    }

    /** 제안서 작성하기(15) — WRITABLE → WRITING 과 세 팀 작업 생성. */
    @PostMapping("/bidcases/{bidCaseId}/prep/start-writing")
    public Map<String, Object> startWriting(@PathVariable String bidCaseId, HttpServletRequest req) {
        Actor actor = Actor.of(req);
        return run(req, bidCaseId, "START_WRITING", null, me -> prep.startWriting(me, actor, bidCaseId));
    }

    /** 이력(16). */
    @GetMapping("/bidcases/{bidCaseId}/prep/history")
    public List<Map<String, Object>> history(@PathVariable String bidCaseId, HttpServletRequest req) {
        return run(req, bidCaseId, "HISTORY", null, me -> prep.history(me, bidCaseId));
    }

    // ── 내부 ────────────────────────────────────────────────────────────

    /** 감사 칸(BID_PREP_ACT.TASK_CD, 20자)에 넣을 과제 코드 — 형식 밖(길이·문자)이면 null. 경로 변수 원문을 그대로 저장하지 않는다(security F5). */
    private static String auditTask(String taskCd) {
        return taskCd != null && taskCd.matches("[A-Z0-9_]{1,20}") ? taskCd : null;
    }

    /**
     * 건 단위 행위 공통 틀 — 활성 사용자 확인(401/403 DENIED) → 행위 직전 상태 잡기 → 실행 → BID_PREP_ACT 기록(성공·실패 모두).
     * 서비스가 던진 403 은 DENIED 로 접근 이력에도 남긴다. 성공한 읽기도 응답 전에 기록한다(기록이 실패하면 500, 데이터 안 나감).
     */
    private <T> T run(HttpServletRequest req, String bid, String action, String taskCd, Function<SysUser, T> fn) {
        SysUser me = guard.requireActiveUser(req);
        Actor actor = Actor.of(req);
        BoardUiIds.Ui ui = PrepUiIds.of(req);
        String before = prep.stateOf(bid);
        T out;
        try {
            out = fn.apply(me);
        } catch (ApiException e) {
            audit.record(bid, action, PrepAudit.outcomeOf(e.getStatus()), before, taskCd, actor, ui);
            if (e.getStatus() == 403) {
                throw guard.denied(req, e);
            }
            throw e;
        }
        audit.record(bid, action, "OK", before, taskCd, actor, ui);
        req.setAttribute(AccessLogInterceptor.DETAIL, "prep case=" + bid + " state=" + before + " code=" + action);
        return out;
    }

    /** 서비스의 역할 403 을 DENIED 로 접근 이력에 남긴다(BidAssignmentController 와 같은 방식). */
    private <T> T denyLogged(HttpServletRequest req, Supplier<T> action) {
        try {
            return action.get();
        } catch (ApiException e) {
            if (e.getStatus() == 403) {
                throw guard.denied(req, e);
            }
            throw e;
        }
    }
}
