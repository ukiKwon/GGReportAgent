package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.BidPrep;
import com.kbstar.kgi.ggreport.web.domain.BidPrepAttach;
import com.kbstar.kgi.ggreport.web.domain.BidPrepLogView;
import com.kbstar.kgi.ggreport.web.domain.BidPrepTask;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * PREP_TASK_DEF · BID_PREP · BID_PREP_TASK · BID_PREP_LOG · BID_PREP_ACT (024) · BID_PREP_ATTACH (025).
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

    /** 개설 전 확정 취소(CANCELLED ∧ OPENED_AT 없음) → CONFIRMED 되살림. 확정자·확정 시각을 새로 기록하고 낡은 요청 번호를 비운다. 0행이면 그 사이 바뀐 것. */
    int revive(@Param("bidCaseId") String bidCaseId, @Param("by") String by, @Param("now") String now);

    /** 그 기관의 개설 전 확정 취소 건(되살릴 수 있는 건) 번호 — 최근 순. */
    List<String> selectRevivable(@Param("institutionId") String institutionId);

    /** 활성(CONFIRMED~WRITING) 사전준비 행이 있는 건이면 1 — 옛 직접 배정 차단용(BidAssignmentService). */
    int countActivePrepByCase(@Param("bidCaseId") String bidCaseId);

    /** 그 사번이 그 건의 담당자였던 적이 있으면(해제됐어도) 1 — 중단 건 읽기 전용 열람 판정. */
    int countEverAssigned(@Param("bidCaseId") String bidCaseId, @Param("empNo") String empNo);

    /** 중단 시 대기 중이던 담당자 변경 신청을 무효로 만든다 — GROUP_VER 증가와 PENDING 비움. 머리 행이 없으면 0행. */
    int bumpAssignVersion(@Param("bidCaseId") String bidCaseId, @Param("by") String by, @Param("now") String now);

    /** 그 건의 확정(CONFIRMED) 이사회 자료 결과 코드(없으면 null 요소) — 최근 자료 먼저. 부결 꼬리표용. */
    List<String> selectBoardResults(@Param("bidCaseId") String bidCaseId);

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
                  @Param("taskCd") String taskCd, @Param("attachId") Long attachId,
                  @Param("actorEmpNo") String actorEmpNo,
                  @Param("verified") int verified, @Param("screenId") String screenId,
                  @Param("buttonId") String buttonId, @Param("uiValid") int uiValid, @Param("now") String now);

    /** 첨부·T3 확정본 이력(ATTACH_ADD·ATTACH_VOID·T3_SET·T3_CLEAR) — 첨부 번호 칸이 있는 insertLog. 파일명·값은 넣지 않는다. */
    int insertLogAttach(@Param("bidCaseId") String bidCaseId, @Param("eventCd") String eventCd,
                        @Param("fromState") String fromState, @Param("toState") String toState,
                        @Param("taskCd") String taskCd, @Param("attachId") Long attachId,
                        @Param("fromAttachId") Long fromAttachId, @Param("reason") String reason,
                        @Param("actorEmpNo") String actorEmpNo, @Param("verified") int verified,
                        @Param("now") String now);

    // ── 첨부 원본(025) ──────────────────────────────────────────────────

    /**
     * 건 행을 FOR UPDATE 로 읽어 상태를 돌려준다(없으면 null). 첨부 올리기·무효 처리·T3 확정본 지정을 한 건 안에서 직렬화한다.
     * 로컬 캐시를 비우는 읽기라 그 뒤의 건수·합계 조회는 최신이다.
     */
    String selectStateForUpdate(@Param("bidCaseId") String bidCaseId);

    /** 첨부 한 행 — 건 번호가 다르면 null(다른 건 첨부를 번호로 찍어도 안 보인다). */
    BidPrepAttach selectAttach(@Param("bidCaseId") String bidCaseId, @Param("attachId") Long attachId);

    /** 그 건의 첨부(무효 포함) — 번호순. */
    List<BidPrepAttach> selectAttachList(@Param("bidCaseId") String bidCaseId);

    /** 그 건에 저장된 첨부 수(무효 포함 — 파일은 물리 삭제하지 않으므로 저장 한도는 전체를 센다). */
    int countAttach(@Param("bidCaseId") String bidCaseId);

    /** 그 건에 저장된 첨부 크기 합(무효 포함). */
    long sumAttachBytes(@Param("bidCaseId") String bidCaseId);

    /** 그 건의 그 과제에서 무효가 아닌 첨부 수 — T4(RFP_ATTACH) 판정. */
    int countValidAttachByTask(@Param("bidCaseId") String bidCaseId, @Param("taskCd") String taskCd);

    /** 그 첨부가 이 건의 어떤 과제에서 확정본으로 지정돼 있으면 1 이상. */
    int countRefUse(@Param("bidCaseId") String bidCaseId, @Param("attachId") Long attachId);

    /** 첨부 행 추가 — 생성된 번호가 {@code a.attachId} 로 채워진다. */
    int insertAttach(BidPrepAttach a);

    /** 무효 처리(VALID_YN 1→0). 이미 무효면 0행. */
    int voidAttach(@Param("bidCaseId") String bidCaseId, @Param("attachId") Long attachId,
                   @Param("by") String by, @Param("now") String now);

    /** T3 확정본 지정(참조·해시·지정자·시각). 과제 행이 없으면 0행. */
    int setTaskRef(@Param("bidCaseId") String bidCaseId, @Param("taskCd") String taskCd,
                   @Param("attachId") Long attachId, @Param("sha256") String sha256,
                   @Param("by") String by, @Param("now") String now);

    /** T3 확정본 해제 — 참조가 있을 때만 비운다(없으면 0행). */
    int clearTaskRef(@Param("bidCaseId") String bidCaseId, @Param("taskCd") String taskCd);
}
