package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.config.AccessLogInterceptor;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.llm.OllamaGuard;
import com.kbstar.kgi.ggreport.web.llm.OllamaLlmClient;
import com.kbstar.kgi.ggreport.web.service.BoardAccess;
import com.kbstar.kgi.ggreport.web.service.BoardMaterialAudit;
import com.kbstar.kgi.ggreport.web.service.PrepAudit;
import com.kbstar.kgi.ggreport.web.service.PrepService;
import com.kbstar.kgi.ggreport.web.service.ScriptDraftBasisReader;
import com.kbstar.kgi.ggreport.web.service.ScriptDraftService;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.ScriptDraftUiIds;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 발표 대본 '보고 전 사전 설명'·'기대효과' 2칸 AI 초안(NEXT 129 ⑤, 이 PC 시범). 본문 없음·저장 없음.
 * 순서: 404(못 보는 건) → 403(담당 영업·영업부장 아님) → 409(상태) → 503(꺼짐) — 서비스 prepare 가 판정한다.
 * BID_PREP_ACT 에 SCRIPT_AI_DRAFT(T6)로 성공·실패를 남기고, 확정 이사회 자료의 숫자를 LLM 에 보내기 <b>전에</b> BOARD_MATERIAL_ACT 에
 * SCRIPT_AI_SEND 한 줄(fail-closed — 실패하면 LLM 을 부르지 않는다), 끝난 뒤 SCRIPT_AI_DRAFT 결과 줄을 쓴다.
 * 동시 1건·사번별 쿨다운은 감사보다 앞에서 확인한다. 프롬프트·응답 본문은 감사·접근 이력·로그에 싣지 않는다.
 * ⚠️ X-Emp-No·X-Screen-Id·X-Button-Id 는 자기신고 — 업무 규칙이지 사칭 방지가 아니다.
 */
@RestController
public class PrepScriptDraftController {

    private static final Logger LOG = LoggerFactory.getLogger(PrepScriptDraftController.class);
    static final String ACTION = "SCRIPT_AI_DRAFT";
    static final String ACTION_SEND = "SCRIPT_AI_SEND";      // BOARD_MATERIAL_ACT — LLM 에 보내기 직전(security 하-3)
    static final String TASK = "T6";
    private static final String NO_CASE = "NONE";

    private final PrepService prep;
    private final PrepAudit audit;
    private final BoardMaterialAudit boardAudit;
    private final MenuGuard guard;
    private final ScriptDraftService drafts;
    private final ObjectProvider<OllamaLlmClient> ollama;
    private final BoardAccess boardAccess;

    public PrepScriptDraftController(PrepService prep, PrepAudit audit, BoardMaterialAudit boardAudit, MenuGuard guard,
                                     ScriptDraftService drafts, ObjectProvider<OllamaLlmClient> ollama, BoardAccess boardAccess) {
        this.prep = prep;
        this.audit = audit;
        this.boardAudit = boardAudit;
        this.guard = guard;
        this.drafts = drafts;
        this.ollama = ollama;
        this.boardAccess = boardAccess;
    }

    /** 단추를 보일지 — enabled·state 만. probe=1 은 영업 계열만(그 밖은 조용히 무시, 키 없음). GET status 는 접근 이력에서 빠진다. */
    @GetMapping("/llm/script-draft/status")
    public Map<String, Object> status(@RequestParam(name = "probe", defaultValue = "false") boolean probe, HttpServletRequest req) {
        SysUser me = guard.requireActiveUser(req);
        OllamaLlmClient c = ollama.getIfAvailable();
        OllamaGuard.State st = c == null ? OllamaGuard.State.OFF : c.state();
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("enabled", st == OllamaGuard.State.READY);
        out.put("state", st.name());
        out.put("mode", "LOCAL_TRIAL");
        boolean sales = boardAccess.isSalesWriter(me.getEmpNo()) || boardAccess.isViewAll(me.getEmpNo());   // security 하-5
        if (probe && sales && st == OllamaGuard.State.READY) {
            OllamaLlmClient.Probe p = c.probe();       // null = 다른 확인이 진행 중 — 키를 빼서 화면이 '확인 중'으로 두게 한다
            if (p != null) {
                out.put("reachable", p.isReachable());
                out.put("model_ready", p.isModelReady());
            }
        }
        return out;
    }

    @PostMapping("/bidcases/{bidCaseId}/prep/board-script-draft")
    public Map<String, Object> draft(@PathVariable String bidCaseId,
                                     @RequestParam(name = "amount_mode", required = false) String amountMode,
                                     HttpServletRequest req) {
        Actor actor = Actor.of(req);
        BoardUiIds.Ui ui = ScriptDraftUiIds.of(req);   // BID_PREP_ACT 용 — 이사회 자료 줄은 boardUi(req, 행위)
        String auditBid = caseKey(bidCaseId);
        SysUser me;
        try {
            me = guard.requireActiveUser(req);
        } catch (ApiException e) {
            if (e.getStatus() == 403) {               // 사번이 확인된 비활성·미등록만 ACT, 401 은 ACCESS_LOG 에만
                auditFailure(auditBid, "DENIED", null, actor, ui);
            }
            throw e;
        }
        String before;
        try {
            before = prep.stateOf(bidCaseId);
        } catch (RuntimeException e) {
            auditFailure(auditBid, "ERROR", NO_CASE, actor, ui);
            throw e;
        }
        ScriptDraftService.Plan plan;
        try {
            plan = drafts.prepare(me, bidCaseId, amountMode);       // 404 → 403 → 400(amount_mode) → 409 → 503
        } catch (ApiException e) {
            if (e.getStatus() != 401) {
                auditFailure(auditBid, e.getStatus() == 503 ? "BLOCKED" : PrepAudit.outcomeOf(e.getStatus()), before, actor, ui);
            }
            if (e.getStatus() == 403) {
                throw guard.denied(req, e);
            }
            throw e;
        } catch (RuntimeException e) {
            auditFailure(auditBid, "ERROR", before, actor, ui);
            throw e;
        }
        ScriptDraftService.Result r;
        BoardMaterialAudit.Ctx sent = null;
        String hold = plan.isEmpty() ? "NO_BASIS" : drafts.reserve(me.getEmpNo());
        if (hold != null) {
            r = drafts.skipped(plan, hold);                 // LLM 안 부름 · 이사회 자료 감사 없음
        } else {
            try {
                boolean changed = false;
                if (plan.sendsConfirmedBoard()) {           // 보내기 전에 먼저 쓴다 — 실패하면 LLM 을 부르지 않는다(fail-closed)
                    try {
                        sent = boardAudit.before(String.valueOf(plan.getBasis().getBoardId()));
                        if (sent == null) {                 // 읽은 뒤 확정이 풀렸다 — 보낼 근거가 바뀜. LLM 안 부름(Ctx 에 판 번호 접근자가 없어 null 검사만)
                            changed = true;
                            LOG.warn("AI 초안: 읽은 뒤 이사회 자료 확정 상태가 바뀌어 LLM 을 부르지 않았다: case={}", auditBid);
                        } else {
                            boardAudit.record(sent, ACTION_SEND, "OK", actor, boardUi(req, BoardUiIds.ACT_SCRIPT_AI_SEND));
                        }
                    } catch (RuntimeException e) {
                        auditFailure(auditBid, "ERROR", before, actor, ui);
                        LOG.error("이사회 자료 감사(AI 보내기 전)를 남기지 못했다 — LLM 호출 안 함: cause={}", e.getClass().getSimpleName());
                        throw e;
                    }
                }
                // BASIS_CHANGED 는 outcome() 이 ERROR — 아래 BID_PREP_ACT 결과 줄이 ERROR 한 줄로 남는다
                r = changed ? drafts.skipped(plan, "BASIS_CHANGED") : drafts.call(plan);
            } finally {
                drafts.release();
            }
        }
        String outcome = r.outcome();
        try {
            audit.record(auditBid, ACTION, outcome, before, TASK, actor, ui);
        } catch (RuntimeException e) {
            LOG.error("AI 초안 감사를 남기지 못했다(응답 500): case={} cause={}", auditBid, e.getClass().getSimpleName());
            throw e;
        }
        if (sent != null) {                                 // 결과 줄(뒤) — before() 가 null(그 사이 확정 해제)이면 record 는 아무것도 안 한다
            try {
                boardAudit.record(sent, ACTION, "OK".equals(outcome) ? "OK" : "ERROR", actor, boardUi(req, BoardUiIds.ACT_SCRIPT_AI_DRAFT));
            } catch (RuntimeException e) {
                LOG.error("이사회 자료 감사(AI 초안 결과)를 남기지 못했다(응답 500): cause={}", e.getClass().getSimpleName());
                throw e;
            }
        }
        ScriptDraftBasisReader.Basis b = plan.getBasis();
        req.setAttribute(AccessLogInterceptor.DETAIL, "prep case=" + auditBid + " state=" + before + " code=" + ACTION
                + " result=" + r.getState() + "/" + (r.getReason() == null ? "-" : r.getReason())
                + " board=" + (b.getBoardId() == null ? "-" : b.getBoardId())
                + " snap=" + (b.getBoardSnap() == null ? "-" : b.getBoardSnap())
                + " form_ver=" + (b.getFormVer() == null ? "-" : b.getFormVer())
                + " basis_draft=" + (r.draftBasis() ? "Y" : "N")
                + " llm=" + (r.isLlmCalled() ? "Y" : "N")
                + " ms=" + r.getMs());
        return r.toMap();
    }

    /** BOARD_MATERIAL_ACT 줄용 — prep_detail·script_ai_draft 가 그 행위(SCRIPT_AI_SEND|SCRIPT_AI_DRAFT)일 때만 유효(BoardUiIds 가 짝을 확인). */
    private static BoardUiIds.Ui boardUi(HttpServletRequest req, String action) {
        return BoardUiIds.of(req, action);
    }

    private void auditFailure(String bid, String outcome, String before, Actor actor, BoardUiIds.Ui ui) {
        try {
            String st = before != null ? before : NO_CASE.equals(bid) ? NO_CASE : prep.stateOf(bid);
            audit.record(bid, ACTION, outcome, st, TASK, actor, ui);
        } catch (RuntimeException ex) {
            LOG.warn("AI 초안 실패 감사를 남기지 못했다: outcome={} cause={}", outcome, ex.getClass().getSimpleName());
        }
    }

    private static String caseKey(String bid) {
        String b = bid == null ? "" : bid.trim();
        return b.matches("[A-Za-z0-9._-]{1,64}") ? b : NO_CASE;
    }
}
