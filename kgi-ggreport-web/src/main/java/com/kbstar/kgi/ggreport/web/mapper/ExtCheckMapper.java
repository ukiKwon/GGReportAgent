package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.ExtCheck;
import com.kbstar.kgi.ggreport.web.domain.ExtCheckExcl;
import com.kbstar.kgi.ggreport.web.domain.ExtCheckFile;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** EXT_CHECK·EXT_CHECK_FILE·EXT_CHECK_EXCL(042). INSERT 만 — UPDATE·DELETE 문장은 일부러 없다. */
@Mapper
public interface ExtCheckMapper {
    int insertCheck(ExtCheck row);
    int insertFile(ExtCheckFile row);
    int insertExcl(ExtCheckExcl row);
    int countByBatch(@Param("batchId") String batchId);
    int countExclByBatch(@Param("batchId") String batchId);
    /** found·not_found 만, 최신순, SQL 에서 limit 건으로 자른다(상수만 넘길 것 — 사용자 입력 금지). */
    List<ExtCheck> selectLatestResolved(@Param("institutionId") String institutionId, @Param("sourceKind") String sourceKind, @Param("limit") int limit);
    /** error 인 것 중 가장 최근 checked_at. 없으면 null. */
    String selectLastErrorAt(@Param("institutionId") String institutionId, @Param("sourceKind") String sourceKind);
    /** 최신순 limit 건(SQL 에서 자른다). */
    List<ExtCheck> selectHistory(@Param("institutionId") String institutionId, @Param("limit") int limit);
    /**
     * 대시보드 입찰 예정일(NEXT 102 ⑤) — 기관마다 notice·found·DEADLINE_AT 있는 최신 1건(CHECKED_AT DESC, IMPORTED_AT DESC, CHECK_KEY).
     * 묶음 질의 한 번(기관마다 부르지 않는다). 행 수를 자르지 않는 ROW_NUMBER 한 문장이라 방언 분기가 없다.
     */
    List<ExtCheck> selectLatestNoticeDeadlines();
    List<ExtCheckFile> selectFilesByKeys(@Param("keys") List<String> keys);
    ExtCheckFile selectFile(@Param("checkKey") String checkKey, @Param("fileSeq") int fileSeq);
}
