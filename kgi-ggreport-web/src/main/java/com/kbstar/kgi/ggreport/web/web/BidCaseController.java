package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.domain.BidCase;
import com.kbstar.kgi.ggreport.web.domain.BidCaseDetail;
import com.kbstar.kgi.ggreport.web.domain.BidCaseFinalizeIn;
import com.kbstar.kgi.ggreport.web.domain.ParticipationDecisionIn;
import com.kbstar.kgi.ggreport.web.domain.ParticipationDecisionOut;
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

    public BidCaseController(BidCaseQueryService bidCases, BidCaseCommandService commands) {
        this.bidCases = bidCases;
        this.commands = commands;
    }

    /** 공고 생성 — 골든 {@code 10}. 본문에서 쓰는 것은 {@code institution_id} 뿐이다. */
    @PostMapping
    public BidCase create(@RequestBody BidCaseCreateIn body) {
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
                                           @RequestBody ParticipationDecisionIn body) {
        return commands.submitDecision(bidCaseId, body);
    }

    /**
     * 담당자 뷰. {@code team}·{@code assignee} 둘 다 필수다 — 없이 열면 남의 공고까지
     * 보이는 전체 조회가 된다.
     */
    @GetMapping
    public List<BidCase> forAssignee(@RequestParam("team") String team,
                                     @RequestParam("assignee") String assignee) {
        return bidCases.forAssignee(team, assignee);
    }

    /** 기관별 최신 공고 — 지도가 쓴다. */
    @GetMapping("/latest")
    public List<BidCase> latest() {
        return bidCases.latest();
    }

    @GetMapping("/{bidCaseId}")
    public BidCaseDetail detail(@PathVariable String bidCaseId) {
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
                                         @RequestHeader("X-User-Id") String userId) {
        return commands.finalizeBidCase(bidCaseId, body, userId);
    }
}
