package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.PermChange;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** {@code PERM_CHANGE_LOG}. 추가 전용. */
@Mapper
public interface PermChangeLogMapper {

    int insert(PermChange change);

    /** {@code targetEmpNo} 가 null 이면 전체. 최신순 상위 {@code limit} 건(상한은 서비스가 건다). */
    List<PermChange> recent(@Param("targetEmpNo") String targetEmpNo, @Param("limit") int limit);
}
