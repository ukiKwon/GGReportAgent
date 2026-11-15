package com.kbstar.kgi.ggreport.web.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * {@code INST_EDIT_LOG} — 기관 편집 이력(추가 전용). 변경된 칸 1개 = 1행. 수정·삭제 문장은 일부러 없다.
 * SQL 은 {@code resources/mapper/InstitutionEditLogMapper.xml}.
 */
@Mapper
public interface InstitutionEditLogMapper {

    int insert(@Param("batchKey") String batchKey, @Param("institutionId") String institutionId,
               @Param("fieldCd") String fieldCd, @Param("oldVal") String oldVal, @Param("newVal") String newVal,
               @Param("srcUrl") String srcUrl, @Param("srcNo") String srcNo,
               @Param("actorEmpNo") String actorEmpNo, @Param("verified") int verified,
               @Param("screenId") String screenId, @Param("buttonId") String buttonId,
               @Param("uiValid") int uiValid, @Param("now") String now);
}
