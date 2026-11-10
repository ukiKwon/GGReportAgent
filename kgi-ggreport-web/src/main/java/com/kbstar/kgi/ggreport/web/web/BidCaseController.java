package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.domain.BidCase;
import com.kbstar.kgi.ggreport.web.domain.BidCaseDetail;
import com.kbstar.kgi.ggreport.web.domain.BidCaseFinalizeIn;
import com.kbstar.kgi.ggreport.web.domain.ParticipationDecisionIn;
import com.kbstar.kgi.ggreport.web.domain.ParticipationDecisionOut;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.support.LegacyFlowSwitch;
import com.kbstar.kgi.ggreport.web.support.Teams;
import com.kbstar.kgi.ggreport.web.dto.BidCaseCreateIn;
import com.kbstar.kgi.ggreport.web.service.BidCaseCommandService;
import com.kbstar.kgi.ggreport.web.service.BidCaseQueryService;
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

/**
 * 입찰 건 조회 — 골든 {@code 14}·{@code 25}.
 *
 * <p>⚠️ {@code /bidcases/latest} 는 {@code /bidcases/{bidCaseId}} 보다 <b>구체적인</b>
 * 매핑이라 Spring 이 알아서 먼저 고른다. FastAPI 는 선언 순서를 보므로 원본에는
 * "먼저 선언해야 한다"는 주석이 붙어 있다 — 여기서는 순서가 아니라 <b>구체성</b>이
 * 규칙이니, 나중에 {@code /{bidCaseId}} 를 위로 옮겨도 깨지지 않는다.
 *
 * <p>쓰기는 생성·참여결정·최종확정이 있다(골든 {@code 10}~{@code 13}·{@code 24}).
 */
@RestController
@RequestMapping("/bidcases")
public class BidCaseController {

    private final BidCaseQueryService bidCases;
    private final BidCaseCommandService commands;

    private final MenuGuard guard;
    private final AdminGuard adminGuard;
    private final LegacyFlowSwitch legacy;

    public BidCaseController(BidCaseQueryService bidCases, BidCaseCommandService commands,
                             MenuGuard guard, AdminGuard adminGuard, LegacyFlowSwitch legacy) {
        this.bidCases = bidCases;
        this.commands = commands;
        this.guard = guard;
        this.adminGuard = adminGuard;
        this.legacy = legacy;
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
        if (!legacy.isOpen()) {
            adminGuard.require(req);
        }
        return commands.create(body.getInstitutionId());
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
     * 담당자 뷰. {@code team}·{@code assignee} 둘 다 필수다 — 없이 열면 남의 공고까지
     * 보이는 전체 조회가 된다.
     */
    @GetMapping
    public List<BidCase> forAssignee(@RequestParam("team") String team,
                                     @RequestParam("assignee") String assignee,
                                     HttpServletRequest req) {
        // B5: 옛 흐름이 닫히면 본인 이름 조회만(남의 담당 건 차단). 이름 일치라 동명이인 한계 — 프런트는 쓰지 않는 경로.
        if (!legacy.isOpen()) {
            SysUser me = guard.requireActiveUser(req);
            if (me.getName() == null || !me.getName().equals(assignee.trim())) {
                throw guard.denied(req, new ApiException(403, "본인이 담당한 건만 조회할 수 있습니다."));
            }
        }
        return bidCases.forAssignee(team, assignee);
    }

    /** 기관별 최신 공고 — 지도가 쓴다. */
    @GetMapping("/latest")
    public List<BidCase> latest() {
        return bidCases.latest();
    }

    @GetMapping("/{bidCaseId}")
    public BidCaseDetail detail(@PathVariable String bidCaseId, HttpServletRequest req) {
        // B5: 옛 흐름이 닫히면 활성 사용자 + 워크플로 열람 권한
        if (!legacy.isOpen()) {
            guard.require(req, "workflow");
        }
        return bidCases.detail(bidCaseId);
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
}
