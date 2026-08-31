package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.BidCase;
import com.kbstar.kgi.ggreport.web.domain.ParticipationDecisionEntry;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * {@code BID_CASES}. 출처는 {@code server/bidcase_repository.py} +
 * {@code routers/workflow.py}(제출완료 표시).
 *
 * <p>Mapper 는 <b>{@link BidCase} 만</b> 돌려준다 — 테이블 한 줄이 곧 이 타입이다.
 * {@code BidCaseDetail}·{@code ParticipationDecisionOut} 은 여기에 작업 목록을
 * 얹어 <b>서비스가</b> 만든다(그쪽 복사 생성자 참조).
 */
@Mapper
public interface BidCaseMapper {

    /**
     * {@code create_bid_case}.
     *
     * <p>⚠️ {@code PARTICIPATION_DECISION} 에 <b>{@code '[]'} 를 명시적으로</b> 넣는다.
     * Oracle 정본에는 DEFAULT 가 있지만 <b>MySQL 미러는 LONGTEXT 에 DEFAULT 를 못 준다</b> —
     * DB 기본값에 기대면 외부망 로컬에서만 NULL 이 된다.
     *
     * <p>{@code SEQ_NO} 는 넘기지 않는다 — Oracle IDENTITY / MySQL AUTO_INCREMENT 가
     * 채운다({@code db/oracle/002_seq_no.sql} · {@code db/mysql/002_seq_no.sql}).
     * 그래서 이 INSERT 문이 양쪽에서 같다.
     */
    int insert(BidCase bidCase);

    /** {@code get_bid_case}. 없으면 null. */
    BidCase selectById(@Param("bidCaseId") String bidCaseId);

    /** 반입 유일키 {@code (SOURCE_SLUG, NOTICE_ID)} 로 찾는다. 없으면 null. */
    String selectIdByNotice(@Param("sourceSlug") String sourceSlug,
                            @Param("noticeId") String noticeId);

    /**
     * {@code upsert_bid_case_from_notice} 의 갱신 쪽.
     *
     * <p>⚠️ <b>날짜를 넣는 컬럼이 신뢰도에 따라 갈린다</b> — 확정이면
     * {@code CONFIRMED_DATE}, 예상이면 {@code EXPECTED_DATE} 이고 <b>반대쪽은 건드리지
     * 않는다.</b> 예상이 확정으로 승격될 때 예전 예상값을 지우면 "언제 예상했었나"가
     * 사라진다. 날짜가 없으면({@code null}) 기존 값을 유지한다({@code COALESCE}).
     */
    int updateFromNotice(@Param("bidCaseId") String bidCaseId,
                         @Param("confidence") String confidence,
                         @Param("date") String date,
                         @Param("title") String title,
                         @Param("noticeUrl") String noticeUrl,
                         @Param("lastSyncedAt") String lastSyncedAt);

    /** {@code upsert_bid_case_from_notice} 의 신규 직후 출처 기입. */
    int updateNoticeMeta(@Param("bidCaseId") String bidCaseId,
                         @Param("sourceSlug") String sourceSlug,
                         @Param("noticeId") String noticeId,
                         @Param("title") String title,
                         @Param("noticeUrl") String noticeUrl);

    /** {@code record_finalization} — 누가 언제 최종 확정/반려했는지(감사 기록). */
    int updateFinalization(@Param("bidCaseId") String bidCaseId,
                           @Param("finalizedBy") String finalizedBy,
                           @Param("finalizedAt") String finalizedAt);

    /** {@code list_bid_cases_for_assignee} — 골든 {@code 25}(내 담당 공고). */
    List<BidCase> selectForAssignee(@Param("team") String team,
                                    @Param("assignee") String assignee);

    /**
     * {@code list_latest_bid_cases} — 기관마다 <b>최신 공고 1건</b>. 지도가 전체 기관의
     * 입찰일을 그리는 데 쓴다. 공고가 없는 기관은 빠진다.
     *
     * <p>⚠️ 원본은 SQLite {@code rowid}(= 삽입 순서)로 "최신"을 정했다. Oracle 의
     * {@code ROWID} 는 물리 주소라 뜻이 다르므로 <b>{@code SEQ_NO} 를 쓴다</b>
     * (db/oracle/002_seq_no.sql). 이 자리를 {@code ROWID} 로 옮기면 예외 없이 조용히
     * 틀린 답이 나오고, <b>단계 2 골든은 기관당 공고가 1건뿐이라 못 잡는다.</b>
     */
    List<BidCase> selectLatestPerInstitution();

    /**
     * {@code submit_participation_decision} 의 저장 — 이력과 상태를 함께 쓴다.
     *
     * <p>{@code participationStatus} 가 {@code null} 이면 <b>상태는 건드리지 않는다</b>
     * (1·2단 결재는 이력만 쌓고 '검토중'을 유지한다).
     */
    int updateParticipationDecision(
            @Param("bidCaseId") String bidCaseId,
            @Param("decision") List<ParticipationDecisionEntry> decision,
            @Param("participationStatus") String participationStatus);

    /** 출처: {@code routers/workflow.py} — 제안서 제출 완료 표시. */
    int updateParticipationStatus(@Param("bidCaseId") String bidCaseId,
                                  @Param("participationStatus") String participationStatus);

    /**
     * {@code activate_pending_bid_cases} — 참여확정됐지만 코퍼스가 없어 밀려 있던 건.
     * 코퍼스가 반입되면 이 목록을 풀어 팀별 작업을 만든다.
     */
    List<String> selectPendingActivation(@Param("institutionId") String institutionId);

    /** {@code activate_pending_bid_cases} 의 상태 전환. */
    int updateResearchStatus(@Param("bidCaseId") String bidCaseId,
                             @Param("researchStatus") String researchStatus);
}
