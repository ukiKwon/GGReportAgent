package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.BidAssignCase;
import com.kbstar.kgi.ggreport.web.domain.BidAssignLogView;
import com.kbstar.kgi.ggreport.web.domain.BidAssignMine;
import com.kbstar.kgi.ggreport.web.domain.BidAssigneeView;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** BID_ASSIGN_CASE · BID_ASSIGNMENT · BID_ASSIGN_LOG (019). 행을 지우지 않는다 — 해제는 ACTIVE_YN=0(S2-b). */
@Mapper
public interface BidAssignmentMapper {

    /** 입찰 건이 있는가(BID_CASES). 외래키가 없어 서비스가 확인한다. */
    int countBidCase(@Param("bidCaseId") String bidCaseId);

    BidAssignCase selectCase(@Param("bidCaseId") String bidCaseId);

    int insertCase(@Param("bidCaseId") String bidCaseId, @Param("by") String by, @Param("now") String now);

    int insertAssignment(@Param("bidCaseId") String bidCaseId, @Param("empNo") String empNo,
                         @Param("by") String by, @Param("now") String now);

    int insertLog(@Param("bidCaseId") String bidCaseId, @Param("actionCd") String actionCd,
                  @Param("targetEmpNo") String targetEmpNo, @Param("reqId") Long reqId,
                  @Param("reason") String reason, @Param("actorEmpNo") String actorEmpNo,
                  @Param("verified") int verified, @Param("now") String now);

    List<BidAssigneeView> selectActiveAssignees(@Param("bidCaseId") String bidCaseId);

    /** 담당자 후보 — ACTIVE 이고 ROLE 이 memberRole 또는 leadRole 인 사용자, 이름순. */
    List<SysUser> selectCandidates(@Param("memberRole") String memberRole, @Param("leadRole") String leadRole);

    /** 입찰 건의 기관 이름(NAME_KO). 입찰 건이나 기관 행이 없으면 null. */
    String selectInstitutionName(@Param("bidCaseId") String bidCaseId);

    List<BidAssignLogView> selectLog(@Param("bidCaseId") String bidCaseId);

    List<BidAssignMine> selectMine(@Param("empNo") String empNo);

    /** 그 사번이 그 건의 현재 담당자이면 1. */
    int countActive(@Param("bidCaseId") String bidCaseId, @Param("empNo") String empNo);

    /**
     * 변경 신청 선점(낙관적). GROUP_VER 가 같고 PENDING_REQ_ID 가 비었거나 낡은 값({@code staleReqId})일 때만 1행.
     * 0행이면 다른 신청이 먼저 잡았거나 구성이 바뀐 것이다.
     */
    int claimPending(@Param("bidCaseId") String bidCaseId, @Param("groupVer") int groupVer,
                     @Param("reqId") Long reqId, @Param("staleReqId") Long staleReqId);

    /** 취소·정리용 — PENDING_REQ_ID 가 그 요청일 때만 비운다(GROUP_VER·UPDATED_* 는 안 건드림). 다른 요청이 잡았으면 0행. */
    int releasePending(@Param("bidCaseId") String bidCaseId, @Param("reqId") Long reqId);

    /** 승인 반영의 첫 문장 — GROUP_VER 확인 + 증가 + PENDING 비움을 한 문장으로(0행이면 구성이 바뀐 것). */
    int bumpVersion(@Param("bidCaseId") String bidCaseId, @Param("groupVer") int groupVer,
                    @Param("reqId") Long reqId, @Param("by") String by, @Param("now") String now);

    /** 현재 담당자 해제(ACTIVE_YN 1→0, 행은 지우지 않는다). 1행이 아니면 현재 담당자가 아니었던 것. */
    int updateRelease(@Param("bidCaseId") String bidCaseId, @Param("empNo") String empNo,
                      @Param("by") String by, @Param("now") String now);

    /** 작성본 인계 이력(HANDOVER) — 해제된 사람→받은 사람 쌍마다 1행. 자료 번호는 남기지 않는다(존재 은닉). */
    int insertHandoverLog(@Param("bidCaseId") String bidCaseId, @Param("toEmpNo") String toEmpNo,
                          @Param("fromEmpNo") String fromEmpNo, @Param("reqId") Long reqId,
                          @Param("actorEmpNo") String actorEmpNo, @Param("verified") int verified,
                          @Param("now") String now);

    /** 해제됐던 행 복구(ACTIVE_YN 0→1). 0행이면 행이 없는 것 — 호출자가 insertAssignment 한다. */
    int updateReactivate(@Param("bidCaseId") String bidCaseId, @Param("empNo") String empNo,
                         @Param("by") String by, @Param("now") String now);
}
