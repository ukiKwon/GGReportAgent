package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.BankContract;
import com.kbstar.kgi.ggreport.web.domain.BankContractCode;
import com.kbstar.kgi.ggreport.web.domain.BankContractInst;
import com.kbstar.kgi.ggreport.web.domain.BidTarget;
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
    List<BidTarget> selectHistory(@Param("institutionId") String institutionId, RowBounds rb);
    /** 그 해 살아 있는 목표 기관들의 039 최신 유효 줄. */
    List<BankContract> selectContractsForYear(@Param("year") int year);
    List<BankContract> selectContractsOf(@Param("institutionId") String institutionId);
    List<BankContract> selectContractsAll(RowBounds rb);
    List<BankContractCode> selectCodes(@Param("group") String group);
    int countEnabledCode(@Param("group") String group, @Param("code") String code);
}
