package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.ExtCheck;
import com.kbstar.kgi.ggreport.web.domain.ExtCheckExcl;
import com.kbstar.kgi.ggreport.web.domain.ExtCheckFile;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.session.RowBounds;

import java.util.List;

/** EXT_CHECK·EXT_CHECK_FILE·EXT_CHECK_EXCL(042). INSERT 만 — UPDATE·DELETE 문장은 일부러 없다. */
@Mapper
public interface ExtCheckMapper {
    int insertCheck(ExtCheck row);
    int insertFile(ExtCheckFile row);
    int insertExcl(ExtCheckExcl row);
    int countByBatch(@Param("batchId") String batchId);
    int countExclByBatch(@Param("batchId") String batchId);
    /** found·not_found 만, 최신순. 호출부가 RowBounds(0,1) 로 1건만 받는다. */
    List<ExtCheck> selectLatestResolved(@Param("institutionId") String institutionId, @Param("sourceKind") String sourceKind, RowBounds rb);
    /** error 인 것 중 가장 최근 checked_at. 없으면 null. */
    String selectLastErrorAt(@Param("institutionId") String institutionId, @Param("sourceKind") String sourceKind);
    List<ExtCheck> selectHistory(@Param("institutionId") String institutionId, RowBounds rb);
    List<ExtCheckFile> selectFilesByKeys(@Param("keys") List<String> keys);
    ExtCheckFile selectFile(@Param("checkKey") String checkKey, @Param("fileSeq") int fileSeq);
}
