package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.dto.ConsistencyRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 정합성 점검이 훑는 한 줄 — 기관 + <b>그 기관의 최신 공고</b> + 작업 수.
 * 원본 {@code server/consistency.check_all} 의 인라인 SQL.
 *
 * <p>테이블 하나에 대응하지 않아 기존 7개 Mapper 중 어디에도 넣지 않았다.
 * 규칙 판정은 SQL 이 아니라 {@code ConsistencyService} 가 한다 — 규칙이
 * "참/거짓이 분명한 선후 관계"뿐이라 SQL 로 밀어 넣으면 사유 문구를 못 만든다.
 */
@Mapper
public interface ConsistencyMapper {

    /**
     * @param institutionId null 이면 전체 기관
     */
    List<ConsistencyRow> selectRows(@Param("institutionId") String institutionId);
}
