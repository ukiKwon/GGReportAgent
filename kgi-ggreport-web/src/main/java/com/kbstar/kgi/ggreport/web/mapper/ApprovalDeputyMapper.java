package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.ApprovalDeputy;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** {@code APPROVAL_DEPUTY}. 취소는 삭제가 아니라 표시다. */
@Mapper
public interface ApprovalDeputyMapper {

    int insert(ApprovalDeputy d);

    ApprovalDeputy selectById(@Param("id") Long id);

    /** 취소되지 않았고 {@code today} 이후에도 유효한(끝나지 않은) 것. 결재자 지정 {@code null} 이면 전체. */
    List<ApprovalDeputy> selectOpen(@Param("principal") String principal, @Param("today") String today);

    /** {@code deputy} 가 {@code today} 에 대결 중인 지정들. */
    List<ApprovalDeputy> selectActiveForDeputy(@Param("deputy") String deputy, @Param("today") String today);

    /** 같은 결재자의 취소 안 된 지정 중 기간이 겹치는 것의 수. */
    int countOverlap(@Param("principal") String principal, @Param("start") String start, @Param("end") String end);

    int cancel(@Param("id") Long id, @Param("by") String by, @Param("now") String now);
}
