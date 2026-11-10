package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.BoardMaterial;
import com.kbstar.kgi.ggreport.web.domain.BoardMaterialAct;
import com.kbstar.kgi.ggreport.web.domain.BoardMaterialAssignee;
import com.kbstar.kgi.ggreport.web.domain.BoardMaterialLogView;
import com.kbstar.kgi.ggreport.web.domain.BoardMaterialSnap;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.session.RowBounds;

import java.util.List;

/**
 * BOARD_MATERIAL · _SNAP · _LOG · _ACT (020). 지우는 문장은 없다 — 버전·이력·감사는 추가 전용.
 * 양쪽 방언에서 같은 문장이다(페이징은 RowBounds, LIKE 는 CONCAT 두 번, 잠금은 FOR UPDATE).
 */
@Mapper
public interface BoardMaterialMapper {

    String selectCaseInstitution(@Param("bidCaseId") String bidCaseId);

    /** 입찰 건의 배정 머리 행을 잠근다(security P3). 자격 확인·인계 전에 호출해 같은 건의 배정 변경 승인과 직렬화한다. */
    String lockAssignCase(@Param("bidCaseId") String bidCaseId);

    /** 같은 입찰 건·연도의 자료 번호(오름차순) — 잠그며 읽는다. create 가 lockAssignCase 뒤에 중복 생성을 막는 데 쓴다(없으면 빈 목록). */
    List<Long> selectIdsByCaseYear(@Param("bidCaseId") String bidCaseId, @Param("year") int year);

    int insertMaterial(BoardMaterial m);

    /** 이름 칸(기관명·상태명·결과명)까지 채운다. */
    BoardMaterial selectOne(@Param("id") Long id);

    /** 내가 현재 담당인 입찰 건의 자료만(열람 예외 없음). q·assignee 는 서비스가 LIKE 특수문자를 '!' 로 이스케이프. 빈 값은 null. */
    List<BoardMaterial> selectList(@Param("empNo") String empNo, @Param("viewAll") boolean viewAll,
                                   @Param("q") String q, @Param("status") String status,
                                   @Param("year") Integer year, @Param("meetingFrom") String meetingFrom,
                                   @Param("meetingTo") String meetingTo, @Param("assignee") String assignee,
                                   RowBounds rows);

    List<BoardMaterialAssignee> selectAssignees(@Param("caseIds") List<String> caseIds);

    /** 첫 저장 때 PREP → DRAFT. */
    int updateStartDraft(@Param("id") Long id, @Param("by") String by, @Param("now") String now);

    /** 낙관적 버전 올리기: CUR_SNAP 이 base 이고 아직 편집 가능한 상태(PREP·DRAFT)일 때만 1행. 제출과의 경합도 여기서 갈린다. */
    int updateCurSnap(@Param("id") Long id, @Param("base") int base, @Param("next") int next,
                      @Param("by") String by, @Param("now") String now);

    /** 제출 선점: DRAFT 이고 CUR_SNAP 이 snap 일 때만 SUBMITTED 로. */
    int claimSubmit(@Param("id") Long id, @Param("snap") int snap, @Param("reqId") Long reqId,
                    @Param("by") String by, @Param("now") String now);

    /** 승인: SUBMITTED 이고 그 요청이 선점 중일 때만 CONFIRMED. */
    int confirm(@Param("id") Long id, @Param("reqId") Long reqId, @Param("by") String by, @Param("now") String now);

    /** 반려·회수·취소: SUBMITTED + 그 요청일 때만 DRAFT 로(선점·제출 버전 해제). */
    int backToDraftByReq(@Param("id") Long id, @Param("reqId") Long reqId, @Param("by") String by, @Param("now") String now);

    /** 재작성 요구(확정 상태에서): CONFIRMED 일 때만 DRAFT 로, 결과·개최일·확정 정보 해제. */
    int backToDraftFromConfirmed(@Param("id") Long id, @Param("by") String by, @Param("now") String now);

    /** 결과 변경: CONFIRMED 이고 현재 결과가 from(비어 있으면 null)일 때만. meetingDate 가 null 이면 기존 개최일 유지. */
    int updateResult(@Param("id") Long id, @Param("from") String from, @Param("to") String to,
                     @Param("meetingDate") String meetingDate, @Param("by") String by, @Param("now") String now);

    int insertSnap(BoardMaterialSnap s);

    BoardMaterialSnap selectSnap(@Param("id") Long id, @Param("snapNo") int snapNo);

    List<BoardMaterialSnap> selectSnaps(@Param("id") Long id);

    int insertLog(@Param("id") Long id, @Param("eventCd") String eventCd,
                  @Param("fromStatus") String fromStatus, @Param("toStatus") String toStatus,
                  @Param("fromResult") String fromResult, @Param("toResult") String toResult,
                  @Param("meetingDate") String meetingDate, @Param("fromEmpNo") String fromEmpNo,
                  @Param("toEmpNo") String toEmpNo, @Param("reqId") Long reqId, @Param("reason") String reason,
                  @Param("actor") String actor, @Param("verified") int verified, @Param("now") String now);

    List<BoardMaterialLogView> selectLog(@Param("id") Long id);

    /** 그 입찰 건에서 empNo 가 만들었거나 마지막으로 저장한 자료 번호 — 담당 해제 때 인계 이력 대상. 잠근다(security P3). */
    List<Long> selectInvolvedIds(@Param("bidCaseId") String bidCaseId, @Param("empNo") String empNo);

    /** 그 사번이 이 자료의 제출 결재선(단계 결재자)에 있었는가 — 결재 경로 열람 판정. */
    int countApprovalStep(@Param("id") Long id, @Param("empNo") String empNo);

    int insertAct(BoardMaterialAct a);

    List<BoardMaterialAct> selectActs(@Param("id") Long id, RowBounds rows);
}
