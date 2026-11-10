package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.BidAssignCase;
import com.kbstar.kgi.ggreport.web.domain.BidAssignLogView;
import com.kbstar.kgi.ggreport.web.domain.BidAssignMine;
import com.kbstar.kgi.ggreport.web.domain.BidAssigneeView;
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

    List<BidAssignLogView> selectLog(@Param("bidCaseId") String bidCaseId);

    List<BidAssignMine> selectMine(@Param("empNo") String empNo);

    /** 그 사번이 그 건의 현재 담당자이면 1. */
    int countActive(@Param("bidCaseId") String bidCaseId, @Param("empNo") String empNo);
}
