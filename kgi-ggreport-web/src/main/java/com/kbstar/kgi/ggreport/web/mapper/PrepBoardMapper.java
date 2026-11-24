package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.BankContractCode;
import com.kbstar.kgi.ggreport.web.domain.BidPrepTask;
import com.kbstar.kgi.ggreport.web.domain.PrepBoardBank;
import com.kbstar.kgi.ggreport.web.domain.PrepBoardCheck;
import com.kbstar.kgi.ggreport.web.domain.PrepBoardRef;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** 대시보드(NEXT 102). BID_PREP_CHECK(054)는 INSERT·조회만(추가 전용 — UPDATE·DELETE 문장은 일부러 없다). 나머지는 목록 묶음 조회(행마다 질의하지 않게, security 6). */
@Mapper
public interface PrepBoardMapper {
    List<BidPrepTask> selectAllTasks();
    List<PrepBoardRef> selectActiveAssignees();
    List<PrepBoardRef> selectEndedEverAssignees();   // 범위 거르기(scope) — 끝난 건의 배정 이력 전체(사번만)
    List<PrepBoardRef> selectConfirmers();
    List<String> selectDesignFinalCases(@Param("team") String team, @Param("status") String status);
    List<BankContractCode> selectCodes(@Param("group") String group);
    List<PrepBoardCheck> selectCurrent();
    List<PrepBoardBank> selectLatestValidBanks();   // 전 기관 '지금 유효한 SAVE 줄' 묶음 — 행마다 질의하지 않게(P3-8)
    PrepBoardCheck selectCurrentOne(@Param("bidCaseId") String bidCaseId, @Param("colCd") String colCd);
    int insertCheck(PrepBoardCheck c);
}
