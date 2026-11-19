package com.kbstar.kgi.ggreport.web.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** PREP_NOBID_ACK(048) — INSERT·조회만. 수정·삭제 문장은 일부러 없다(추가 전용). 중복 키는 서비스가 '이미 기록됨'으로 처리한다. */
@Mapper
public interface PrepNobidAckMapper {

    int insertAck(@Param("empNo") String empNo, @Param("institutionId") String institutionId, @Param("roundSeq") int roundSeq,
                  @Param("handledAt") String handledAt, @Param("revNo") int revNo, @Param("bidCaseId") String bidCaseId,
                  @Param("stateCd") String stateCd, @Param("verified") int verified, @Param("screenId") String screenId,
                  @Param("buttonId") String buttonId, @Param("uiValid") int uiValid, @Param("now") String now);

    /** 그 사람·그 공고 기록의 기록 시각. 없으면 null(PK 라 0~1행). */
    String selectAckedAt(@Param("empNo") String empNo, @Param("institutionId") String institutionId,
                         @Param("roundSeq") int roundSeq, @Param("handledAt") String handledAt);
}
