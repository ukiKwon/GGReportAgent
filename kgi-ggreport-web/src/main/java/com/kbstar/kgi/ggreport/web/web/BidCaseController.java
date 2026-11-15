package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.config.AccessLogInterceptor;
import com.kbstar.kgi.ggreport.web.domain.BidCase;
import com.kbstar.kgi.ggreport.web.domain.BidCaseDetail;
import com.kbstar.kgi.ggreport.web.domain.BidCaseFinalizeIn;
import com.kbstar.kgi.ggreport.web.domain.ParticipationDecisionIn;
import com.kbstar.kgi.ggreport.web.domain.ParticipationDecisionOut;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.service.PrepAudit;
import com.kbstar.kgi.ggreport.web.service.PrepService;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.LegacyFlowSwitch;
import com.kbstar.kgi.ggreport.web.support.PrepUiIds;
import com.kbstar.kgi.ggreport.web.support.Teams;
import com.kbstar.kgi.ggreport.web.dto.BidCaseCreateIn;
import com.kbstar.kgi.ggreport.web.service.BidCaseCommandService;
import com.kbstar.kgi.ggreport.web.service.BidCaseQueryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.function.Supplier;

/**
 * 입찰 건 조회 — 골든 {@code 14}·{@code 25}.
 *
 * <p>⚠️ {@code /bidcases/latest} 는 {@code /bidcases/{bidCaseId}} 보다 <b>구체적인</b>
 * 매핑이라 Spring 이 알아서 먼저 고른다. FastAPI 는 선언 순서를 보므로 원본에는
 * "먼저 선언해야 한다"는 주석이 붙어 있다 — 여기서는 순서가 아니라 <b>구체성</b>이
 * 규칙이니, 나중에 {@code /{bidCaseId}} 를 위로 옮겨도 깨지지 않는다.
 *
 * <p>쓰기는 생성·참여결정·최종확정이 있다(골든 {@code 10}~{@code 13}·{@code 24}).
 *
 * <p>NEXT 64② 1단계: 담당자 목록·상세는 옛 흐름 열림·닫힘 모두 사번 확인 → 역할 판정 → 실행 순서이고, 건 단위 행위를
 * BID_PREP_ACT 에 {@code CASE_LIST·CASE_VIEW}(생성은 닫힘일 때만 {@code CASE_CREATE})로 남긴다(ApprovalLine·Prep 과 같은 틀:
 * 사번 확인된 403 은 ACT DENIED, 401 은 ACCESS_LOG 에만, 서비스 403 은 guard.denied, 일반 예외 ERROR,
 * 실패 감사가 터져도 원래 응답 유지, 성공 읽기는 응답 전 기록). 이 경로들을 부르는 화면은 없다 — 화면·버튼은 PrepUiIds
 * 허용 목록으로 거르고 지금은 UNKNOWN 으로 남는다. 열림 상태 공고 생성의 무가드는 2단계(Prep* 시험에 관리자 사번을 얹은 뒤)에서 닫는다.
 * ⚠️ X-Emp-No·화면·버튼은 자기신고다 — 업무 규칙이지 사칭 방지가 아니다.
 */
@RestController
@RequestMapping("/bidcases")
public class BidCaseController {

    private static final Logger LOG = LoggerFactory.getLogger(BidCaseController.class);
    static final String CASE_CREATE = "CASE_CREATE";
    static final String CASE_LIST = "CASE_LIST";
    static final String CASE_VIEW = "CASE_VIEW";
    /** 건이 없거나 정해지지 않은 줄의 건 칸·상태 칸 값(PrepController 와 같은 표기). */
    private static final String NO_CASE = "NONE";

    private final BidCaseQueryService bidCases;
    private final BidCaseCommandService commands;

    private final MenuGuard guard;
    private final AdminGuard adminGuard;
    private final LegacyFlowSwitch legacy;
    private final PrepAudit audit;
    private final PrepService prep;

    public BidCaseController(BidCaseQueryService bidCases, BidCaseCommandService commands,
                             MenuGuard guard, AdminGuard adminGuard, LegacyFlowSwitch legacy,
                             PrepAudit audit, PrepService prep) {
        this.bidCases = bidCases;
        this.commands = commands;
        this.guard = guard;
        this.adminGuard = adminGuard;
        this.legacy = legacy;
        this.audit = audit;
        this.prep = prep;
    }

    /** 참여결정 단계별 결재 역할(1=영업팀, 2=영업팀장, 3=영업부장). 범위 밖이면 null(서비스가 400). */
    static String decisionRole(int tier) {
        switch (tier) {
            case 1:  return Teams.DESIGNER_HOME_TEAM + Teams.TEAM_SUFFIX;
            case 2:  return Teams.leadOf(Teams.DESIGNER_HOME_TEAM);
            case 3:  return Teams.FINAL_APPROVER;
            default: return null;
        }
    }

    /** 공고 생성 — 골든 {@code 10}. 본문에서 쓰는 것은 {@code institution_id} 뿐이다. */
    @PostMapping
    public BidCase create(@RequestBody BidCaseCreateIn body, HttpServletRequest req) {
        // B5(NEXT 70): 옛 흐름이 닫히면 건은 '제안 확정'이 만든다 — 직접 생성은 관리자 전용(401/403 은 AdminGuard 가 DENIED 로 남김)
        if (legacy.isOpen()) {
            // NEXT 64② 1단계: 옛 흐름이 열려 있는 동안은 그대로 둔다 — Prep* 시험이 사번 없이 건을 만든다.
            // 2단계(그 시험에 관리자 사번을 얹은 뒤)에서 이 분기를 지운다.
            return commands.create(body.getInstitutionId());
        }
        Actor actor = Actor.of(req);
        BoardUiIds.Ui ui = PrepUiIds.of(req);
        front(() -> adminGuard.require(req), NO_CASE, CASE_CREATE, actor, ui);
        BidCase out = audited(req, NO_CASE, CASE_CREATE, actor, ui, () -> commands.create(body.getInstitutionId()));
        String bid = caseKey(out.getBidCaseId());
        audit.record(bid, CASE_CREATE, "OK", NO_CASE, null, actor, ui);   // 생성은 이미 커밋됨 — 기록 실패면 500(건은 남음, PrepController.confirm 과 같음)
        req.setAttribute(AccessLogInterceptor.DETAIL, "bidcase case=" + bid + " code=" + CASE_CREATE);
        return out;
    }

    /**
     * 참여 결정 1단 — 골든 {@code 11}~{@code 13}. 3단이 '참여'면 확정되고 팀별 작업이 생긴다.
     *
     * <p>응답은 상세({@code tasks})에 {@code run_started} 를 더한 모양이다 — 확정 직후
     * 분석이 실제로 돌기 시작했는지를 화면이 그 값으로 판단한다.
     */
    @PostMapping("/{bidCaseId}/participation-decisions")
    public ParticipationDecisionOut decide(@PathVariable String bidCaseId,
                                           @RequestBody ParticipationDecisionIn body,
                                           HttpServletRequest req) {
        // 401/403 은 MenuGuard 가 DENIED 로 남긴다. 단계별 역할: 1=영업팀, 2=영업팀장, 3=영업부장.
        // ⚠️ X-Emp-No 자기신고 위의 업무 규칙(실수·선착순 방지)이지 사칭 방지가 아니다.
        // 저장되는 by·role 은 아직 본문 값이다(골든 11~13 유지) — USERS 값 저장은 019 배정과 함께.
        // B1(NEXT 70, J-1): 옛 흐름이 닫히면 참여 결정 3단은 410 — 신원 확인 뒤 DENIED 로 남긴다.
        if (!legacy.isOpen()) {
            guard.requireActiveUser(req);
            throw guard.denied(req, new ApiException(410,
                    "참여 결정 3단 결재는 더 이상 쓰지 않습니다. 제안 확정·개설 신청 흐름을 이용하세요."));
        }
        String need = decisionRole(body.getTier());
        if (need == null) {
            guard.requireUser(req, "approvals");   // 신원만 보고 범위 밖 tier 는 서비스가 400
        } else {
            guard.requireRole(req, "approvals", need, "이 단계의 참여 결재 권한이 없습니다.");
        }
        return commands.submitDecision(bidCaseId, body);
    }

    /**
     * 담당자 뷰. {@code team}·{@code assignee} 둘 다 필수다 — 없이 열면 남의 공고까지 보이는 전체 조회가 된다.
     * 활성 사용자만. 옛 흐름이 열려 있으면 본인 이름·그 팀의 팀장·영업부장, 닫히면 본인 이름만({@link #mayList}).
     * 이름 일치라 동명이인 한계가 있다. 프런트는 쓰지 않는 경로.
     */
    @GetMapping
    public List<BidCase> forAssignee(@RequestParam("team") String team,
                                     @RequestParam("assignee") String assignee,
                                     HttpServletRequest req) {
        Actor actor = Actor.of(req);
        BoardUiIds.Ui ui = PrepUiIds.of(req);
        SysUser me = front(() -> guard.requireActiveUser(req), NO_CASE, CASE_LIST, actor, ui);
        boolean open = legacy.isOpen();
        List<BidCase> out = audited(req, NO_CASE, CASE_LIST, actor, ui, () -> {
            if (!mayList(me, team, assignee, open)) {
                throw new ApiException(403, open ? "본인이나 그 팀의 팀장·영업부장만 조회할 수 있습니다."
                        : "본인이 담당한 건만 조회할 수 있습니다.");
            }
            return bidCases.forAssignee(team, assignee);
        });
        for (BidCase b : out) {   // 응답 전 — 기록이 실패하면 500, 목록 안 나감
            String bid = caseKey(b.getBidCaseId());
            audit.record(bid, CASE_LIST, "OK", prep.stateOf(bid), null, actor, ui);
        }
        req.setAttribute(AccessLogInterceptor.DETAIL, "bidcase code=" + CASE_LIST + " n=" + out.size());
        return out;
    }

    /** 기관별 최신 공고 — 지도가 쓴다. */
    @GetMapping("/latest")
    public List<BidCase> latest() {
        return bidCases.latest();
    }

    /** 상세 — 활성 사용자 + 워크플로 열람 권한(옛 흐름 열림·닫힘 같음). */
    @GetMapping("/{bidCaseId}")
    public BidCaseDetail detail(@PathVariable String bidCaseId, HttpServletRequest req) {
        Actor actor = Actor.of(req);
        BoardUiIds.Ui ui = PrepUiIds.of(req);
        String key = caseKey(bidCaseId);
        front(() -> guard.require(req, "workflow"), key, CASE_VIEW, actor, ui);
        BidCaseDetail out = audited(req, key, CASE_VIEW, actor, ui, () -> bidCases.detail(bidCaseId));
        audit.record(key, CASE_VIEW, "OK", prep.stateOf(key), null, actor, ui);   // 응답 전(fail-closed)
        req.setAttribute(AccessLogInterceptor.DETAIL, "bidcase case=" + key + " code=" + CASE_VIEW);
        return out;
    }

    /**
     * 최종 확정/반려 — 골든 {@code 24}. 흐름의 끝이다.
     *
     * <p>작업 3건이 모두 {@code 2차완료} 가 아니면 <b>409</b> 다. {@code X-User-Id} 는
     * 감사 기록({@code finalized_by})으로 그대로 박히므로 필수다.
     */
    @PostMapping("/{bidCaseId}/finalize")
    public BidCaseDetail finalizeBidCase(@PathVariable String bidCaseId,
                                         @RequestBody BidCaseFinalizeIn body,
                                         @RequestHeader(name = "X-User-Id", required = false) String userId,
                                         HttpServletRequest req) {
        // 최종 확정은 영업부장만(2026-11-10). 저장 표시명은 기존 X-User-Id(골든 24 유지).
        SysUser approver = guard.requireRole(req, "approvals", Teams.FINAL_APPROVER,
                "최종 확정은 영업부장만 할 수 있습니다.");
        String by = userId == null || userId.trim().isEmpty() ? approver.getName() : userId;
        return commands.finalizeBidCase(bidCaseId, body, by);
    }

    // ── 가드·감사 틀 ─────────────────────────────────────────────

    /** 앞단 신원·권한 확인. 사번이 확인된 403 만 ACT DENIED(401 은 ACCESS_LOG 에만 — 가드가 이미 남김). */
    private <T> T front(Supplier<T> check, String key, String action, Actor actor, BoardUiIds.Ui ui) {
        try {
            return check.get();
        } catch (ApiException e) {
            if (e.getStatus() == 403) {
                auditFailure(key, action, "DENIED", actor, ui);
            }
            throw e;
        }
    }

    /** 실행 + 실패 감사. 서비스·판정 403 은 ACCESS_LOG DENIED(고정 문구)로도 남긴다. 응답(상태·본문)은 바꾸지 않는다. */
    private <T> T audited(HttpServletRequest req, String key, String action, Actor actor, BoardUiIds.Ui ui,
                          Supplier<T> call) {
        try {
            return call.get();
        } catch (ApiException e) {
            if (e.getStatus() != 401) {
                auditFailure(key, action, PrepAudit.outcomeOf(e.getStatus()), actor, ui);
            }
            if (e.getStatus() == 403) {
                throw guard.denied(req, e);
            }
            throw e;
        } catch (RuntimeException e) {   // DB 오류 등 — ERROR 로 남기고 그대로(전역 처리기가 500)
            auditFailure(key, action, "ERROR", actor, ui);
            throw e;
        }
    }

    /** 실패 줄. 기록이 실패해도 원래 응답을 덮지 않는다 — 서버 로그에 예외 종류만(메시지·스택 없음). */
    private void auditFailure(String key, String action, String outcome, Actor actor, BoardUiIds.Ui ui) {
        try {
            String st = NO_CASE.equals(key) ? NO_CASE : prep.stateOf(key);
            audit.record(key, action, outcome, st, null, actor, ui);
        } catch (RuntimeException ex) {
            LOG.warn("입찰 건 실패 감사를 남기지 못했다: action={} outcome={} cause={}", action, outcome, ex.getClass().getSimpleName());
        }
    }

    /** 감사 칸용 건 번호 — 형식([A-Za-z0-9._-]{1,64})이면 그 값, 아니면 NONE(PrepController.caseKey 와 같은 규칙). */
    static String caseKey(String bid) {
        String b = bid == null ? "" : bid.trim();
        return b.matches("[A-Za-z0-9._-]{1,64}") ? b : NO_CASE;
    }

    /**
     * 담당자 목록 열람 판정. 본인 이름(USERS.NAME)이 assignee 와 같으면 언제나 허용.
     * 옛 흐름이 열려 있으면 그 팀의 팀장(team 은 '영업'·'영업팀' 둘 다 받는다)과 영업부장도 허용한다.
     */
    static boolean mayList(SysUser me, String team, String assignee, boolean legacyOpen) {
        String name = me.getName() == null ? "" : me.getName().trim();
        String who = assignee == null ? "" : assignee.trim();
        if (!name.isEmpty() && name.equals(who)) {
            return true;
        }
        if (!legacyOpen) {
            return false;
        }
        String role = me.getRole() == null ? "" : me.getRole().trim();
        String lead = Teams.leadOf(Teams.teamOf(team == null ? "" : team.trim()));
        return Teams.FINAL_APPROVER.equals(role) || lead.equals(role);
    }
}
