package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.BidPrep;
import com.kbstar.kgi.ggreport.web.domain.BidPrepLogView;
import com.kbstar.kgi.ggreport.web.domain.BidPrepTask;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * PREP_TASK_DEF · BID_PREP · BID_PREP_TASK · BID_PREP_LOG · BID_PREP_ACT (024).
 * 상태 전이는 전부 조건부 UPDATE 다 — 0행이면 그 사이 다른 처리가 먼저 끝난 것이다(서비스가 409 STATE_CHANGED).
 */
@Mapper
public interface PrepMapper {

    // ── 건 ──────────────────────────────────────────────────────────────

    BidPrep selectPrep(@Param("bidCaseId") String bidCaseId);

    /** 목록용 — 기관명·상태명을 채운다. 최근 확정 순. */
    List<BidPrep> selectList();

    /** 기관 행 잠금(기관당 활성 건 1개를 직렬화). 기관이 없으면 null. */
    String lockInstitution(@Param("institutionId") String institutionId);

    /** 그 기관의 활성(CONFIRMED~WRITING) 건 수. */
    int countActiveByInstitution(@Param("institutionId") String institutionId);

    int insertPrep(@Param("bidCaseId") String bidCaseId, @Param("institutionId") String institutionId,
                   @Param("stateCd") String stateCd, @Param("by") String by, @Param("now") String now);

    int transit(@Param("bidCaseId") String bidCaseId, @Param("fromState") String fromState,
                @Param("toState") String toState, @Param("by") String by, @Param("now") String now);

    /** 개설 신청: 상태 전이와 OPEN_REQ_ID 기록을 한 문장으로. */
    int transitOpenReq(@Param("bidCaseId") String bidCaseId, @Param("fromState") String fromState,
                       @Param("toState") String toState, @Param("reqId") Long reqId,
                       @Param("by") String by, @Param("now") String now);

    /** 기획승인 요청: 상태 전이와 PLAN_REQ_ID 기록을 한 문장으로. */
    int transitPlanReq(@Param("bidCaseId") String bidCaseId, @Param("fromState") String fromState,
                       @Param("toState") String toState, @Param("reqId") Long reqId,
                       @Param("by") String by, @Param("now") String now);

    /** OPEN_PENDING ∧ OPEN_REQ_ID=reqId → IN_PROGRESS(개설 승인). */
    int markOpened(@Param("bidCaseId") String bidCaseId, @Param("reqId") Long reqId,
                   @Param("by") String by, @Param("now") String now);

    /** OPEN_PENDING ∧ OPEN_REQ_ID=reqId → CONFIRMED(개설 반려·회수). */
    int endOpen(@Param("bidCaseId") String bidCaseId, @Param("reqId") Long reqId,
                @Param("by") String by, @Param("now") String now);

    /** APPROVAL_PENDING ∧ PLAN_REQ_ID=reqId → WRITABLE(기획승인). */
    int approvePlan(@Param("bidCaseId") String bidCaseId, @Param("reqId") Long reqId,
                    @Param("by") String by, @Param("now") String now);

    /** APPROVAL_PENDING ∧ PLAN_REQ_ID=reqId → IN_PROGRESS(기획 반려·회수). */
    int endPlan(@Param("bidCaseId") String bidCaseId, @Param("reqId") Long reqId,
                @Param("by") String by, @Param("now") String now);

    /** WRITABLE → WRITING 과 작성 시작자 기록. 재호출은 0행. */
    int markWriting(@Param("bidCaseId") String bidCaseId, @Param("by") String by, @Param("now") String now);

    // ── 과제 ────────────────────────────────────────────────────────────

    List<BidPrepTask> selectTasks(@Param("bidCaseId") String bidCaseId);

    /** 개설 승인이 복사할 ENABLED 과제 정의(DONE_YN=0). */
    List<BidPrepTask> selectEnabledDefs();

    /** 정의 한 행을 건별 진행 행으로 복사(스냅샷). DONE_YN=0. */
    int insertTask(@Param("bidCaseId") String bidCaseId, @Param("t") BidPrepTask t);

    /** DONE_YN 이 expect 일 때만 done 으로 바꾼다(체크·해제·자동 판정). by 가 null 이면 시스템. */
    int updateTaskDone(@Param("bidCaseId") String bidCaseId, @Param("taskCd") String taskCd,
                       @Param("done") int done, @Param("expect") int expect,
                       @Param("by") String by, @Param("now") String now);

    /** T5 판정 — 그 건에 확정(CONFIRMED)된 이사회 자료 수(020 BOARD_MATERIAL, 읽기 전용). */
    int countBoardConfirmed(@Param("bidCaseId") String bidCaseId);

    /** RFP_REGISTERED 조건 — 기관의 공고문 경로(없으면 null/빈 값). */
    String selectRfpPath(@Param("institutionId") String institutionId);

    String selectInstitutionNameByBid(@Param("bidCaseId") String bidCaseId);

    // ── 이력·감사 ───────────────────────────────────────────────────────

    int insertLog(@Param("bidCaseId") String bidCaseId, @Param("eventCd") String eventCd,
                  @Param("fromState") String fromState, @Param("toState") String toState,
                  @Param("taskCd") String taskCd, @Param("reqId") Long reqId, @Param("reason") String reason,
                  @Param("actorEmpNo") String actorEmpNo, @Param("verified") int verified,
                  @Param("now") String now);

    List<BidPrepLogView> selectLog(@Param("bidCaseId") String bidCaseId);

    int insertAct(@Param("bidCaseId") String bidCaseId, @Param("actionCd") String actionCd,
                  @Param("outcome") String outcome, @Param("stateCd") String stateCd,
                  @Param("taskCd") String taskCd, @Param("actorEmpNo") String actorEmpNo,
                  @Param("verified") int verified, @Param("screenId") String screenId,
                  @Param("buttonId") String buttonId, @Param("uiValid") int uiValid, @Param("now") String now);
}
