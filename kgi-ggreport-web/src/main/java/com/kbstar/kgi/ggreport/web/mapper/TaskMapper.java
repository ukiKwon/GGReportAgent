package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.Task;
import com.kbstar.kgi.ggreport.web.domain.TaskSummary;
import com.kbstar.kgi.ggreport.web.dto.AssigneeTeam;
import com.kbstar.kgi.ggreport.web.dto.TaskListRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * {@code TASKS}. 출처는 {@code server/task_repository.py} +
 * {@code bidcase_repository.create_tasks_for_bid_case} + {@code orchestrator_recorder.py}.
 */
@Mapper
public interface TaskMapper {

    /** {@code get_task}. 없으면 null. */
    Task selectById(@Param("taskId") String taskId);

    /**
     * {@code list_task_summaries} — 입찰 건 상세에 딸려 나가는 요약.
     *
     * <p>⚠️ <b>SELECT 목록에 {@code FINAL_APPROVER} 를 넣지 않는다.</b> 원본이 그렇고
     * 골든 {@code 14} 가 "{@code final_approver} 는 언제나 {@code null}"을 계약으로
     * 고정했다. 친절하게 채우면 골든이 깨진다({@link TaskSummary} 주석 참조).
     */
    List<TaskSummary> selectSummaries(@Param("bidCaseId") String bidCaseId);

    /** {@code create_tasks_for_bid_case} 의 멱등 판정 — 이미 만들어진 팀. */
    List<String> selectTeams(@Param("bidCaseId") String bidCaseId);

    /**
     * 결재함 — 그 역할이 결재할 작업들.
     *
     * <p>⚠️ {@code pairs} 가 <b>비어 있으면 부르지 말 것</b> — 빈 {@code IN} 절은
     * SQL 오류다. 호출부({@code ApprovalsService})가 먼저 거른다.
     */
    List<com.kbstar.kgi.ggreport.web.dto.ApprovalItem> selectApprovalQueue(
            @Param("pairs") List<com.kbstar.kgi.ggreport.web.dto.TeamStatus> pairs);

    /**
     * 이관 패키지의 팀 목록 — 같은 공고의 <b>다른 팀</b> 작업들(삽입 순서).
     *
     * <p>상태로 거르지 않는다. 이유는 XML 주석에 있다 — 감추면 디자이너가 다 받은 줄 안다.
     */
    List<com.kbstar.kgi.ggreport.web.dto.HandoffTeam> selectHandoffTeams(
            @Param("bidCaseId") String bidCaseId, @Param("excludeTeam") String excludeTeam);

    /**
     * 한 공고에서 그 팀의 작업 id. 없으면 null.
     *
     * <p>오케스트레이터의 {@code _ensure_task} 가 쓴다 — 노드가 로그를 남길 때마다
     * "그 팀의 작업"을 찾아야 하는데, {@code UNIQUE(BID_CASE_ID, TEAM)} 이라 한 건이다.
     */
    String selectTaskIdByTeam(@Param("bidCaseId") String bidCaseId, @Param("team") String team);

    /**
     * {@code GET /institutions/{id}/status} 의 작업 목록 — 골든 {@code 30}.
     * 그 기관의 <b>모든</b> 공고에 걸친다(원본과 같은 범위).
     *
     * <p>⚠️ 원본에는 {@code ORDER BY} 가 없다. SQLite 가 {@code UNIQUE(BID_CASE_ID,
     * TEAM)} 인덱스로 찾아 <b>팀 이름순</b>으로 돌려주던 것을 골든 {@code 30} 이
     * 그대로 굳혔다(실측: 삽입 순서 영업·전산·예산이 아니라 영업·예산·전산).
     * Oracle 은 그런 순서를 보장하지 않으므로 <b>{@code ORDER BY TEAM} 을 명시한다.</b>
     * 002 의 {@code rowid} 문제와 같은 종류다 — 빼면 화면 순서가 조용히 달라진다.
     */
    List<com.kbstar.kgi.ggreport.web.dto.WorkflowStatusTask> selectStatusTasks(
            @Param("institutionId") String institutionId);

    /**
     * {@code routers/tasks._context} — 작업 → 그 작업이 속한 공고·기관.
     *
     * <p>결재 경로가 기관명·단계를 쪽지에 싣고 파일 경로에도 쓰므로 한 번에 뽑는다.
     * 없으면 null({@code task not found} 404 는 서비스가 낸다).
     */
    com.kbstar.kgi.ggreport.web.dto.TaskContext selectContext(@Param("taskId") String taskId);

    /**
     * {@code GET /tasks?team=…} — <b>기관 횡단</b> 작업 목록(원본 {@code list_tasks}).
     * {@code statuses} 가 비어 있으면 상태로 거르지 않는다.
     *
     * <p>{@code fileCount} 는 채우지 않는다 — 파일 시스템에서 세야 해서 서비스가 채운다.
     */
    List<TaskListRow> selectListForTeam(@Param("team") String team,
                                        @Param("statuses") List<String> statuses);

    /**
     * 담당이 정해진 작업의 (담당자, 팀) 목록 — 계정 전환기의 재료다
     * (원본 {@code routers/accounts.py} 의 인라인 SQL).
     */
    List<AssigneeTeam> selectAssigneeTeams();

    /**
     * {@code create_tasks_for_bid_case} 의 신규 행.
     *
     * <p>{@code DRAFT_CONTENT} 는 넣지 않는다 — 원본은 {@code ''} 를 넣었지만 Oracle 은
     * 그것을 NULL 로 바꾸므로 결과가 같고, 읽을 때 {@link Task} 세터가 {@code ""} 로
     * 되돌린다. {@code SEQ_NO} 도 넘기지 않는다(IDENTITY/AUTO_INCREMENT 가 채운다).
     */
    int insert(@Param("taskId") String taskId,
               @Param("bidCaseId") String bidCaseId,
               @Param("team") String team);

    /**
     * {@code claim_assignee_if_unset} — <b>비어 있을 때만</b> 담당자를 박고, 상태가
     * '대기'면 '작성중'으로 올린다. 먼저 잡은 사람이 담당이다(경합은 DB 가 가른다).
     */
    int claimAssigneeIfUnset(@Param("taskId") String taskId, @Param("userId") String userId);

    /** {@code claim_approver_if_unset} — 1차 결재자(그 팀의 팀장). */
    int claimApproverIfUnset(@Param("taskId") String taskId, @Param("userId") String userId);

    /** {@code claim_final_approver_if_unset} — 디자이너 최종본을 결재한 영업부장. */
    int claimFinalApproverIfUnset(@Param("taskId") String taskId, @Param("userId") String userId);

    /** {@code update_draft_content}. */
    int updateDraftContent(@Param("taskId") String taskId,
                           @Param("draftContent") String draftContent);

    /**
     * {@code submit_task} · {@code approve_task} 가 공유하던 한 문장이다 — 둘 다
     * 상태 한 컬럼만 바꾼다. 어떤 상태로 갈지(제출/승인/반려)는 호출부가 정한다.
     */
    int updateStatus(@Param("taskId") String taskId, @Param("status") String status);

    /** 출처: {@code orchestrator_recorder.py} — 자동 실행이 진행률까지 함께 쓴다. */
    int updateStatusAndProgress(@Param("taskId") String taskId,
                                @Param("status") String status,
                                @Param("progressPct") int progressPct);
}
