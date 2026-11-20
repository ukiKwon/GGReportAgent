package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.BankContract;
import com.kbstar.kgi.ggreport.web.domain.BankContractCode;
import com.kbstar.kgi.ggreport.web.domain.BidPrep;
import com.kbstar.kgi.ggreport.web.domain.BidTarget;
import com.kbstar.kgi.ggreport.web.domain.BidTerm;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.session.RowBounds;
import java.util.List;

/** 협약 성과(NEXT 104) 읽기 전용. 쓰기 문장 없음. */
@Mapper
public interface TargetResultMapper {
    /** 그 해 목표였던 (기관, 번호)마다 최신 REV 한 줄 — 살아 있는 것과 뺀 것 모두. */
    List<BidTarget> selectGoalRows(@Param("year") int year, RowBounds rb);
    /** 위 기관들의 039 최신 유효 줄(SAVE). */
    List<BankContract> selectLinesForYear(@Param("year") int year, RowBounds rb);
    /** 확정 시각(UTC ISO 문자열)이 [fromAt, toAt) 인 제안(기관별 최신순). 한국 시각 그 해 범위는 호출 쪽이 만든다(P3-3). */
    List<BidPrep> selectPrepsForYear(@Param("year") int year, @Param("fromAt") String fromAt, @Param("toAt") String toAt);
    List<BankContractCode> selectCodes(@Param("group") String group);
    /** 그 해 목표 기관들의 INST_BID_TERM 최신 행(모든 목표 연도, CANCEL 포함). 귀속 연도 판별용. */
    List<BidTerm> selectTermsForYear(@Param("year") int year);
}
