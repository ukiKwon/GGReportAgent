package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.AccessLogEntry;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** {@code ACCESS_LOG}. <b>추가 전용</b> — 갱신·삭제 문장을 두지 않는다(보존 정리는 별도 배치). */
@Mapper
public interface AccessLogMapper {

    int insert(AccessLogEntry entry);

    /** 최신순. 페이징은 방언별 문장(Oracle {@code OFFSET … FETCH} / MySQL {@code LIMIT}). */
    List<AccessLogEntry> search(@Param("from") String from, @Param("to") String to,
                                @Param("empNo") String empNo, @Param("eventType") String eventType,
                                @Param("offset") int offset, @Param("limit") int limit);

    int count(@Param("from") String from, @Param("to") String to,
              @Param("empNo") String empNo, @Param("eventType") String eventType);
}
