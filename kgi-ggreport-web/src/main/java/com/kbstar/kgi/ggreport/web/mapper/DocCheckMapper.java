package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.DocCheckHitRow;
import com.kbstar.kgi.ggreport.web.domain.DocCheckLogRow;
import com.kbstar.kgi.ggreport.web.domain.DocCheckRow;
import com.kbstar.kgi.ggreport.web.domain.InstNameRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 작업함 파일 점검(057, NEXT 106) — DOC_CHECK · DOC_CHECK_HIT · DOC_CHECK_LOG. 파일 속 글은 어디에도 싣지 않는다.
 * DOC_CHECK_LOG 는 추가 전용(INSERT·SELECT 만). SEQ_NO 는 {@link #lockTask} 아래에서 max+1.
 */
@Mapper
public interface DocCheckMapper {

    List<InstNameRow> selectInstitutionRows();

    /** TASKS 행 FOR UPDATE — 상태를 돌려준다. 없으면 null. 트랜잭션 첫 쓰기 전에 부른다. */
    String lockTask(@Param("taskId") String taskId);

    int deleteCheck(@Param("taskId") String taskId, @Param("nameKey") String nameKey);

    int deleteHits(@Param("taskId") String taskId, @Param("nameKey") String nameKey);

    int insertCheck(DocCheckRow row);

    int insertHit(DocCheckHitRow row);

    List<DocCheckRow> selectChecks(@Param("taskId") String taskId);

    /** nameKey 가 null 이면 그 작업 전체. */
    List<DocCheckHitRow> selectHits(@Param("taskId") String taskId, @Param("nameKey") String nameKey);

    int selectMaxSeq(@Param("taskId") String taskId);

    int insertLog(DocCheckLogRow row);

    /** ACK·UNACK 줄(SEQ_NO 순) + 표시한 사람 이름. */
    List<DocCheckLogRow> selectAckLog(@Param("taskId") String taskId);
}
