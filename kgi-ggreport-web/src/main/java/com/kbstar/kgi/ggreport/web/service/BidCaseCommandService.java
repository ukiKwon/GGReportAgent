package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.domain.BidCase;
import com.kbstar.kgi.ggreport.web.domain.BidCaseDetail;
import com.kbstar.kgi.ggreport.web.domain.BidCaseFinalizeIn;
import com.kbstar.kgi.ggreport.web.domain.Institution;
import com.kbstar.kgi.ggreport.web.domain.ParticipationDecisionEntry;
import com.kbstar.kgi.ggreport.web.domain.ParticipationDecisionIn;
import com.kbstar.kgi.ggreport.web.domain.ParticipationDecisionOut;
import com.kbstar.kgi.ggreport.web.domain.TaskSummary;
import com.kbstar.kgi.ggreport.web.mapper.BidCaseMapper;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionMapper;
import com.kbstar.kgi.ggreport.web.mapper.TaskMapper;
import com.kbstar.kgi.ggreport.web.support.Ids;
import com.kbstar.kgi.ggreport.web.support.Teams;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 입찰 건 쓰기 — 생성과 참여 결정. Python {@code bidcase_repository} +
 * {@code routers/bidcases.py}. 골든 {@code 10}~{@code 14}.
 *
 * <p>참여 결정은 <b>3단 결재</b>다: 1·2단은 이력만 쌓고 '검토중'을 유지하며,
 * 3단이 '참여'면 그때 '참여확정'이 되고 <b>팀별 작업 3건이 생긴다.</b> 중간에 누구든
 * '참여'가 아닌 선택을 하면 거기서 끝난다(미참여확정/보류).
 */
@Service
public class BidCaseCommandService {

    /** 원본 {@code bid_cases} INSERT 의 고정값. */
    private static final String DEFAULT_CONFIDENCE = "예상";
    private static final String STATUS_REVIEWING = "검토중";
    private static final String STATUS_CONFIRMED = "참여확정";
    private static final String STATUS_DECLINED = "미참여확정";
    private static final String STATUS_HELD = "보류";
    private static final String CHOICE_JOIN = "참여";
    private static final String CHOICE_DECLINE = "미참여";
    private static final String RESEARCH_DONE = "완료";
    private static final String RESEARCH_WAITING = "대기";

    /** 마지막 단계. 여기서 '참여'면 확정이다. */
    private static final int FINAL_TIER = 3;

    /** 최종 확정이 걸린 작업 수 = 작성 3팀. */
    private static final int TEAM_COUNT = 3;
    /** 최종 확정 뒤의 기관 단계(원본 {@code UPDATE institutions SET stage = 7}). */
    private static final int FINALIZED_STAGE = 7;

    /** {@code agent/pipeline.RFP_ARTIFACTS} — 둘 다 있어야 "분석 산출물이 있다". */
    private static final List<String> RFP_ARTIFACTS =
            Arrays.asList("rfp_scoring.json", "rfp_text.txt");

    private final BidCaseMapper bidCases;
    private final TaskMapper tasks;
    private final InstitutionMapper institutions;
    private final NotificationCommandService notifications;
    private final AppProperties properties;
    private final DeliverableAssembler deliverables;

    public BidCaseCommandService(BidCaseMapper bidCases, TaskMapper tasks,
                                 InstitutionMapper institutions,
                                 NotificationCommandService notifications,
                                 AppProperties properties,
                                 DeliverableAssembler deliverables) {
        this.bidCases = bidCases;
        this.tasks = tasks;
        this.institutions = institutions;
        this.notifications = notifications;
        this.properties = properties;
        this.deliverables = deliverables;
    }

    /**
     * 공고 1건 생성 — 골든 {@code 10}.
     *
     * <p>⚠️ <b>요청 본문에서 쓰는 것은 {@code institution_id} 하나뿐이다.</b> 원본이
     * {@code body: dict} 를 받아 그 키만 꺼내 쓰기 때문에 골든 {@code 10} 이 함께 보낸
     * {@code title}·{@code note} 는 <b>저장되지 않고</b>, 응답의 {@code title} 도 null 이다
     * (그 컬럼은 반입 경로 {@code upsert_bid_case_from_notice} 만 채운다).
     * 친절하게 받아 두면 골든이 즉시 깨진다.
     *
     * <p>⚠️ <b>원본과 다른 점 하나</b>: 없는 기관이면 404 로 막는다. 원본은 SQLite 가
     * 외래키를 강제하지 않아({@code PRAGMA foreign_keys} 미설정) <b>고아 공고</b>가
     * 그냥 만들어졌지만, Oracle·MySQL 은 강제하므로 같은 요청이 500 이 된다.
     * 500 대신 "그런 기관 없다"를 돌려주는 쪽을 골랐다 — 이관의 목표는 "동작 동일"이지
     * "결함 동일"이 아니다(NEXT.md 항목 9의 단계 2 주의사항 ⓐ).
     */
    @Transactional
    public BidCase create(String institutionId) {
        if (institutionId == null || institutionId.isEmpty()) {
            throw ApiException.badRequest("institution_id가 필요합니다");
        }
        Institution institution = institutions.selectById(institutionId);
        if (institution == null) {
            throw ApiException.notFound("institution not found");
        }

        BidCase bidCase = new BidCase();
        bidCase.setBidCaseId(Ids.bidCase());
        bidCase.setInstitutionId(institutionId);
        bidCase.setScheduleConfidence(DEFAULT_CONFIDENCE);
        bidCase.setLastSyncedAt(Times.nowIso());
        bidCase.setParticipationStatus(STATUS_REVIEWING);
        bidCase.setParticipationDecision(new ArrayList<ParticipationDecisionEntry>());
        // 코퍼스 폴더가 지정돼 있으면 조사는 이미 끝난 것으로 본다(원본 그대로).
        bidCase.setResearchStatus(
                isBlank(institution.getGiganlistDir()) ? RESEARCH_WAITING : RESEARCH_DONE);
        bidCases.insert(bidCase);
        return bidCases.selectById(bidCase.getBidCaseId());
    }

    /**
     * 참여 결정 1단 — 골든 {@code 11}~{@code 13}.
     *
     * <p>순서를 어기는 요청은 <b>400</b> 이다(원본 {@code ParticipationDecisionError}).
     * 없는 공고, 이미 결정된 공고, 단계 건너뛰기 셋 다 같은 취급이다.
     */
    @Transactional
    public ParticipationDecisionOut submitDecision(String bidCaseId, ParticipationDecisionIn in) {
        BidCase bidCase = bidCases.selectById(bidCaseId);
        if (bidCase == null) {
            throw ApiException.badRequest("bid case not found: " + bidCaseId);
        }
        if (!STATUS_REVIEWING.equals(bidCase.getParticipationStatus())) {
            throw ApiException.badRequest(
                    "participation already decided: " + bidCase.getParticipationStatus());
        }
        List<ParticipationDecisionEntry> history = bidCase.getParticipationDecision();
        int expectedTier = history.size() + 1;
        if (in.getTier() != expectedTier) {
            throw ApiException.badRequest(
                    "expected tier " + expectedTier + ", got " + in.getTier());
        }

        ParticipationDecisionEntry entry = new ParticipationDecisionEntry();
        entry.setTier(in.getTier());
        entry.setRole(in.getRole());
        entry.setBy(in.getBy());
        entry.setAt(Times.nowIso());
        entry.setChoice(in.getChoice());
        entry.setComment(in.getComment());

        List<ParticipationDecisionEntry> updated =
                new ArrayList<ParticipationDecisionEntry>(history);
        updated.add(entry);

        String newStatus = nextStatus(in.getChoice(), in.getTier());
        bidCases.updateParticipationDecision(bidCaseId, updated, newStatus);

        boolean runStarted = false;
        if (STATUS_CONFIRMED.equals(newStatus)) {
            // ⚠️ 코퍼스가 아직이면(research_status='대기') 작업을 만들지 않는다 —
            //    나중에 코퍼스가 반입될 때 activate_pending_bid_cases 가 만든다.
            //    여기서 미리 만들면 그 경로가 "이미 있다"로 조용히 건너뛴다.
            if (RESEARCH_DONE.equals(bidCase.getResearchStatus())) {
                createTasksForBidCase(bidCaseId);
            }
            runStarted = startAnalysisOrNotify(bidCase.getInstitutionId());
        }

        BidCase after = bidCases.selectById(bidCaseId);
        List<TaskSummary> summaries = tasks.selectSummaries(bidCaseId);
        return new ParticipationDecisionOut(after, summaries, runStarted);
    }

    /**
     * {@code null} 이면 상태를 건드리지 않는다(1·2단 결재).
     * 3단 '참여'만 확정이고, '참여'가 아닌 선택은 <b>단계와 무관하게</b> 거기서 끝난다.
     */
    private String nextStatus(String choice, int tier) {
        if (!CHOICE_JOIN.equals(choice)) {
            return CHOICE_DECLINE.equals(choice) ? STATUS_DECLINED : STATUS_HELD;
        }
        return tier < FINAL_TIER ? null : STATUS_CONFIRMED;
    }

    /**
     * 최종 확정/반려 — 골든 {@code 24}. 흐름의 끝이다.
     *
     * <p><b>작업 3건이 모두 {@code 2차완료} 여야 한다</b>(아니면 409). 판단이 아니라
     * 선후 규칙이라 화면이 아니라 여기서 막는다 — 화면만 막으면 API 로 그대로 뚫린다.
     *
     * <p>확정이면 기관 단계를 <b>7</b> 로 올리고, 반려면 <b>작업 3건을 전부
     * {@code 작성중} 으로 되돌린다</b>(담당자가 다시 손볼 것이 남는다).
     * 어느 쪽이든 누가 언제 했는지를 공고에 남긴다(감사 기록).
     *
     * <p>확정이면 <b>제안서 PPTX 를 취합</b>한다({@link DeliverableAssembler}) —
     * 3팀 초안을 슬라이드로 묶고 그 경로를 {@code INSTITUTIONS.PPTX_PATH} 에 적는다.
     * 실패하면 확정도 함께 롤백된다(원본과 같다): 제안서가 없는데 "확정됨"으로
     * 남으면 아무도 그 사실을 모른 채 제출일을 맞는다.
     */
    @Transactional
    public BidCaseDetail finalizeBidCase(String bidCaseId, BidCaseFinalizeIn body, String userId) {
        BidCase bidCase = bidCases.selectById(bidCaseId);
        if (bidCase == null) {
            throw ApiException.notFound("bid case not found");
        }
        List<TaskSummary> summaries = tasks.selectSummaries(bidCaseId);
        if (summaries.size() != TEAM_COUNT || !allApproved(summaries)) {
            throw new ApiException(409, "not all tasks are 2차완료");
        }

        if (body.isApproved()) {
            institutions.updateStage(bidCase.getInstitutionId(), FINALIZED_STAGE);
            try {
                deliverables.assemble(bidCaseId, bidCase.getInstitutionId());
            } catch (IOException e) {
                // 원본은 여기서 예외가 그대로 올라가 500 이 된다(확정도 함께 롤백).
                // 같은 성질을 유지한다 — 제안서가 안 만들어졌는데 "확정됨"으로 남으면
                // 아무도 그 사실을 모른 채 제출일을 맞는다.
                throw new IllegalStateException(
                        "제안서 취합에 실패했다: " + e.getMessage(), e);
            }
        } else {
            for (TaskSummary summary : summaries) {
                // 원본은 approve_task(approved=False) 를 부른다 — 결과는 '작성중' 복귀다.
                tasks.updateStatus(summary.getTaskId(), "작성중");
            }
        }
        bidCases.updateFinalization(bidCaseId, userId, Times.nowIso());

        return new BidCaseDetail(bidCases.selectById(bidCaseId), tasks.selectSummaries(bidCaseId));
    }

    private boolean allApproved(List<TaskSummary> summaries) {
        for (TaskSummary summary : summaries) {
            if (!Teams.APPROVED_STATUS.equals(summary.getStatus())) {
                return false;
            }
        }
        return true;
    }

    /** {@code create_tasks_for_bid_case} — 팀별 작업. 이미 있는 팀은 건너뛴다(멱등). */
    @Transactional
    public List<String> createTasksForBidCase(String bidCaseId) {
        Set<String> existing = new HashSet<String>(tasks.selectTeams(bidCaseId));
        List<String> created = new ArrayList<String>();
        for (String team : Teams.AUTHORING_TEAMS) {
            if (existing.contains(team)) {
                continue;
            }
            String taskId = Ids.task();
            tasks.insert(taskId, bidCaseId, team);
            created.add(taskId);
        }
        return created;
    }

    /**
     * 참여확정 직후 3·4단계 자동 시작({@code _start_analysis_or_notify}).
     *
     * <p><b>실패해도 결재를 되돌리지 않는다</b> — 대신 왜 못 시작했는지 쪽지로 남긴다.
     * 조용히 실패하면 아무도 분석이 안 도는 줄 모른 채 기다린다. 골든 {@code 27} 이
     * 바로 이 쪽지 1건이다(도봉구는 {@code rfp_path} 가 비어 있다).
     *
     * <p>⚠️ <b>단계 4 전까지의 한시적 차이</b>: 실행 조건을 만족하는 경우 원본은
     * 오케스트레이터를 시작하지만 그건 아직 이관 전이다. 그 자리는 원본의
     * {@code except Exception} 과 같은 모양으로 <b>쪽지 + {@code run_started=false}</b> 를
     * 낸다 — 조용히 true 를 돌려주면 "시작됐다"고 화면에 표시되고 아무 일도 일어나지
     * 않는다. 단계 4(Task 4.1~4.2)에서 이 분기를 실제 실행으로 바꾼다.
     */
    private boolean startAnalysisOrNotify(String institutionId) {
        Institution institution = institutions.selectById(institutionId);
        String reason;
        if (institution == null) {
            reason = "기관을 찾을 수 없습니다";
        } else if (isBlank(institution.getRfpPath())
                && !artifactsExist(institution.getNameKo())) {
            reason = "공고문(rfp_path)이 아직 반입되지 않았습니다";
        } else {
            reason = "실행 오류: 오케스트레이터가 아직 이관되지 않았습니다(단계 4)";
        }

        notifications.create("영업팀", "쪽지",
                "참여확정됐지만 입찰 분석을 시작하지 못했습니다 — " + reason
                        + ". 워크플로 탭에서 [▶ 실행]으로 직접 시작하세요.",
                institutionId);
        return false;
    }

    /** {@code agent.pipeline.artifacts_exist} — 둘 다 있어야 true. */
    private boolean artifactsExist(String institutionName) {
        if (institutionName == null) {
            return false;
        }
        File dir = new File(properties.getOutputRoot(), institutionName);
        for (String name : RFP_ARTIFACTS) {
            if (!new File(dir, name).isFile()) {
                return false;
            }
        }
        return true;
    }

    private static boolean isBlank(String s) {
        // Python 의 `not inst.rfp_path` 와 같다 — null 과 빈 문자열을 함께 본다
        // (Oracle 이 빈 문자열을 NULL 로 바꾸므로 두 값이 실제로 섞인다).
        return s == null || s.isEmpty();
    }
}
