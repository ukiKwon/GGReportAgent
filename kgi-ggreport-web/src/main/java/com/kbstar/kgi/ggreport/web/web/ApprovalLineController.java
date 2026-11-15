package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.dto.ApprovalIn;
import com.kbstar.kgi.ggreport.web.service.ApprovalDeputyService;
import com.kbstar.kgi.ggreport.web.service.ApprovalRequestService;
import com.kbstar.kgi.ggreport.web.service.PrepAudit;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.PrepUiIds;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * 결재라인 — 결재 요청(상신·결재·취소)과 대결 지정. 기존 {@code /approvals}(제안서 작업물 결재)와는 별개다.
 * 호출자 확인은 서비스({@code CallerService})가 한다 — 등록된 활성 사용자여야 한다.
 * decide·cancel 은 컨트롤러 앞단에서도 {@link MenuGuard#requireActiveUser} 로 확인한다(NEXT 70).
 */
@RestController
public class ApprovalLineController {

    private static final Logger LOG = LoggerFactory.getLogger(ApprovalLineController.class);

    private final ApprovalRequestService requests;
    private final ApprovalDeputyService deputies;
    private final PrepAudit prepAudit;
    private final MenuGuard guard;

    public ApprovalLineController(ApprovalRequestService requests, ApprovalDeputyService deputies, PrepAudit prepAudit,
                                  MenuGuard guard) {
        this.requests = requests;
        this.deputies = deputies;
        this.prepAudit = prepAudit;
        this.guard = guard;
    }

    @GetMapping("/approval-requests/types")
    public Map<String, Object> types() {
        return Collections.<String, Object>singletonMap("types", requests.types());
    }

    @GetMapping("/approval-requests")
    public Map<String, Object> list(@RequestParam(name = "box", defaultValue = "mine") String box,
                                    HttpServletRequest req) {
        return Collections.<String, Object>singletonMap("items", requests.list(box, Actor.of(req)));
    }

    /** 내 권한 현황(본인 것만). 관리자 전용 {@code /sysadmin/perms/{emp}} 와 달리 일반 사용자가 부른다. */
    @GetMapping("/approval-requests/my-perms")
    public Map<String, Object> myPerms(HttpServletRequest req) {
        return requests.myPerms(Actor.of(req));
    }

    @PostMapping("/approval-requests/perm")
    public Map<String, Object> submitPerm(@RequestBody ApprovalIn.PermRequest in, HttpServletRequest req) {
        return requests.submitPerm(in, Actor.of(req));
    }

    /**
     * 결재·반려. 앞단에서 등록된 활성 사용자인지 본다(MenuGuard.requireActiveUser — 401/403 은 ACCESS_LOG DENIED).
     * 사전준비 결재(BID_OPEN·PREP_APPROVAL)는 BID_PREP_ACT 에 누가·어느 화면·어느 버튼을 남긴다 — 성공 줄은 서비스가 결재와 같은 트랜잭션에서,
     * 실패 시도(DENIED·HIDDEN·BLOCKED·INVALID·ERROR)는 여기서 따로 커밋한다(시도 한 번에 한 줄). ⚠️ 사번·화면·버튼은 자기신고다.
     */
    @PostMapping("/approval-requests/{id}/decide")
    public Map<String, Object> decide(@PathVariable("id") Long id, @RequestBody ApprovalIn.Decision in,
                                      HttpServletRequest req) {
        BoardUiIds.Ui ui = PrepUiIds.of(req);
        String verb = PrepAudit.decideVerb(in == null ? null : in.getDecision());
        return audited(req, id, verb, ui, () -> requests.decide(id, in, Actor.of(req), ui));
    }

    /** 취소·회수. 사전준비 결재의 회수는 decide 와 같은 방식으로 BID_PREP_ACT 에 남는다. */
    @PostMapping("/approval-requests/{id}/cancel")
    public Map<String, Object> cancel(@PathVariable("id") Long id, HttpServletRequest req) {
        BoardUiIds.Ui ui = PrepUiIds.of(req);
        return audited(req, id, "WITHDRAW", ui, () -> requests.cancel(id, Actor.of(req), ui));
    }

    /**
     * 공통 틀 — 활성 사용자 확인 → 실행 → 실패 감사. 사번 있는 비활성·미등록(403)은 BID_PREP_ACT 에도 DENIED 로 남기고
     * (BoardMaterialController·InstitutionHeadController 와 같음, 기존 동작 유지), 사번 없는 401 은 ACCESS_LOG 에만 남긴다.
     * 서비스가 낸 403 은 ACCESS_LOG DENIED(고정 문구)로도 남긴다. 응답(상태·본문)은 바꾸지 않는다.
     */
    private Map<String, Object> audited(HttpServletRequest req, Long id, String verb, BoardUiIds.Ui ui,
                                        Supplier<Map<String, Object>> call) {
        try {
            guard.requireActiveUser(req);
        } catch (ApiException e) {
            if (e.getStatus() == 403) {
                auditPrepFailure(id, verb, "DENIED", req, ui);
            }
            throw e;
        }
        try {
            return call.get();
        } catch (ApiException e) {
            if (e.getStatus() != 401) {
                auditPrepFailure(id, verb, PrepAudit.outcomeOf(e.getStatus()), req, ui);
            }
            if (e.getStatus() == 403) {
                throw guard.denied(req, e);
            }
            throw e;
        } catch (RuntimeException e) {   // DB 오류 등 — ERROR 로 남기고 그대로 던진다(전역 처리기가 500)
            auditPrepFailure(id, verb, "ERROR", req, ui);
            throw e;
        }
    }

    /**
     * 사전준비 결재의 실패 시도를 따로 커밋해 남긴다. 사전준비가 아닌 유형·없는 요청은 남기지 않는다.
     * 기록이 실패해도 원래 응답을 덮지 않는다 — 서버 로그에 예외 종류만 남긴다(본문·값 없음).
     */
    private void auditPrepFailure(Long id, String verb, String outcome, HttpServletRequest req, BoardUiIds.Ui ui) {
        try {
            ApprovalRequestService.PrepRef ref = requests.prepRefOf(id);
            if (ref == null) {
                return;
            }
            prepAudit.record(ref.getBidCaseId(), PrepAudit.approvalAction(ref.getReqType(), verb),
                    outcome, ref.getStateCd(), null, Actor.of(req), ui);
        } catch (RuntimeException ex) {
            LOG.warn("사전준비 결재 실패 감사를 남기지 못했다: verb={} outcome={} cause={}", verb, outcome, ex.getClass().getSimpleName());
        }
    }

    @GetMapping("/approval-deputies")
    public Map<String, Object> deputyList(@RequestParam(name = "all", defaultValue = "false") boolean all,
                                          HttpServletRequest req) {
        List<Map<String, Object>> items = deputies.list(Actor.of(req), all);
        return Collections.<String, Object>singletonMap("items", items);
    }

    @GetMapping("/approval-deputies/candidates")
    public Map<String, Object> deputyCandidates(HttpServletRequest req) {
        return Collections.<String, Object>singletonMap("users", deputies.candidates(Actor.of(req)));
    }

    @PostMapping("/approval-deputies")
    public Map<String, Object> deputyCreate(@RequestBody ApprovalIn.DeputyForm in, HttpServletRequest req) {
        return deputies.create(in, Actor.of(req));
    }

    @DeleteMapping("/approval-deputies/{id}")
    public Map<String, Object> deputyCancel(@PathVariable("id") Long id, HttpServletRequest req) {
        deputies.cancel(id, Actor.of(req));
        return Collections.<String, Object>singletonMap("cancelled", true);
    }
}
