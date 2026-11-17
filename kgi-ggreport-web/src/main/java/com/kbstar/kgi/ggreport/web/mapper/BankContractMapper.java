package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.BankContract;
import com.kbstar.kgi.ggreport.web.domain.BankContractCode;
import com.kbstar.kgi.ggreport.web.domain.BankContractInst;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.session.RowBounds;

import java.util.List;

/** INST_BANK_CONTRACT(039). INSERT 만 — UPDATE·DELETE 문장은 일부러 없다. */
@Mapper
public interface BankContractMapper {
    BankContractInst lockInstitution(@Param("institutionId") String institutionId);   // FOR UPDATE
    BankContractInst selectInstitution(@Param("institutionId") String institutionId);
    List<BankContract> selectLatestValid(@Param("institutionId") String institutionId);
    BankContract selectLatestLine(@Param("institutionId") String institutionId, @Param("contractNo") int contractNo);
    String selectFirstEditor(@Param("institutionId") String institutionId, @Param("contractNo") int contractNo);   // 줄을 처음 만든 사람(REV_NO=1)
    int selectMaxContractNo(@Param("institutionId") String institutionId);
    int countRows(@Param("institutionId") String institutionId);
    List<BankContract> selectHistory(@Param("institutionId") String institutionId, RowBounds rb);
    int insertRow(BankContract row);
    List<BankContractCode> selectCodes(@Param("group") String group);
    int countEnabledCode(@Param("group") String group, @Param("code") String code);
}
