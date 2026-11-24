package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.BankContract;
import com.kbstar.kgi.ggreport.web.domain.BankContractCode;
import com.kbstar.kgi.ggreport.web.domain.BankContractInst;
import com.kbstar.kgi.ggreport.web.domain.BidTarget;
import com.kbstar.kgi.ggreport.web.domain.BidTerm;
import com.kbstar.kgi.ggreport.web.domain.BidTargetReqAct;
import com.kbstar.kgi.ggreport.web.domain.BidTargetReqItem;
import com.kbstar.kgi.ggreport.web.domain.NoticeRoundView;
import com.kbstar.kgi.ggreport.web.domain.WatcherRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.session.RowBounds;
import java.util.List;

/** INST_BID_TARGET(043) + 금고 약정(039) 읽기 전용 요약. 목표 표는 INSERT 만 — 수정·삭제 문장은 일부러 없다. */
@Mapper
public interface BidTargetMapper {
    BankContractInst lockInstitution(@Param("institutionId") String institutionId);
    BankContractInst selectInstitution(@Param("institutionId") String institutionId);
    List<BidTarget> selectActiveByInst(@Param("institutionId") String institutionId);
    BidTarget selectLatestTarget(@Param("institutionId") String institutionId, @Param("targetNo") int targetNo);
    int selectMaxTargetNo(@Param("institutionId") String institutionId);
    int insertRow(BidTarget row);
    List<BidTarget> selectActiveByYear(@Param("year") int year);
    /** 061 — 남의 관심 기록(WATCH_EMP_NO 가 empNo 가 아닌 WATCH 행)은 SQL 에서 걸러 한도(RowBounds)가 목표 이력을 못 밀어내게 한다. */
    List<BidTarget> selectHistory(@Param("institutionId") String institutionId, @Param("empNo") String empNo, RowBounds rb);
    /** 그 해 살아 있는 목표 기관들의 039 최신 유효 줄. */
    List<BankContract> selectContractsForYear(@Param("year") int year);
    List<BankContract> selectContractsOf(@Param("institutionId") String institutionId);
    List<BankContract> selectContractsAll(RowBounds rb);
    List<BankContractCode> selectCodes(@Param("group") String group);
    int countEnabledCode(@Param("group") String group, @Param("code") String code);
    /** 044·061 — 그 사람의 살아 있는 관심 기록(기관명 순). */
    List<BidTarget> selectActiveWatch(@Param("empNo") String empNo);
    /** 044·061 — 그 사람 관심 기관들의 039 최신 유효 줄. */
    List<BankContract> selectContractsForWatch(@Param("empNo") String empNo);
    /** 061 — 모두의 살아 있는 관심 기록(기관·주인 이름 순). 주인 사번은 서비스가 내보내지 않는다. */
    List<WatcherRow> selectWatchers();
    /** 044 — 그 기관의 마지막 공고 회차 + 최신 판정 + 지금 LAST_BID(정상이면 0~1행). 입찰 종료 판정용, 읽기만. */
    List<NoticeRoundView> selectNoticeLast(@Param("institutionId") String institutionId);
    /** 044 — 그 해 살아 있는 목표 기관마다 위와 같은 한 줄. */
    List<NoticeRoundView> selectNoticeLastForYear(@Param("year") int year);

    // ---- 056 목표 기관 변경 결재·자동 이월 ----
    /** 뺀 기록 포함, 그 기관 모든 기록의 최신 행. */
    List<BidTarget> selectLatestByInst(@Param("institutionId") String institutionId);
    /** 목표 연도가 fromYear~toYear 인 살아 있는 목표가 있는 기관들의 모든 기록 최신 행(이월 후보). */
    List<BidTarget> selectLatestForCarry(@Param("fromYear") int fromYear, @Param("toYear") int toYear);
    /** 위와 같은 기관들의 039 최신 유효 줄. */
    List<BankContract> selectContractsForCarry(@Param("fromYear") int fromYear, @Param("toYear") int toYear);
    // INST_BID_TERM — RFP 협약 개시일(추가 전용)
    BidTerm selectLatestTerm(@Param("institutionId") String institutionId, @Param("year") int year);
    /** 그 기관 연도별 최신(지운 것 포함). */
    List<BidTerm> selectTermsOf(@Param("institutionId") String institutionId);
    /** 그 해 최신(목록용, 지운 것 포함). */
    List<BidTerm> selectTermsForYear(@Param("year") int year);
    List<BidTerm> selectTermsForCarry(@Param("fromYear") int fromYear, @Param("toYear") int toYear);
    int insertTerm(BidTerm row);
    String selectInstitutionName(@Param("institutionId") String institutionId);
    /** 그 기관에 결재 중(PENDING) 항목 수. */
    int countPendingByInst(@Param("institutionId") String institutionId);
    List<BidTargetReqItem> selectPendingItems();
    List<BidTargetReqItem> selectPendingItemsByInst(@Param("institutionId") String institutionId);
    int countMoveRows(@Param("institutionId") String institutionId, @Param("targetNo") int targetNo);
    List<BidTargetReqItem> selectReqItems(@Param("reqId") Long reqId);
    int insertReqItem(BidTargetReqItem item);
    int insertReqAct(BidTargetReqAct act);
}
