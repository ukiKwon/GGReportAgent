package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.ApprovalRequest;
import com.kbstar.kgi.ggreport.web.domain.ApprovalStep;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** {@code APPROVAL_REQUEST} · {@code APPROVAL_STEP}. 지우는 문장은 없다. */
@Mapper
public interface ApprovalRequestMapper {

    int insert(ApprovalRequest r);

    int insertStep(ApprovalStep s);

    ApprovalRequest selectById(@Param("id") Long id);

    List<ApprovalStep> selectSteps(@Param("reqId") Long reqId);

    /** 상신자 기준(최신순). */
    List<ApprovalRequest> selectByRequester(@Param("emp") String emp);

    /** 진행 중인 것 전부(받은 결재 후보 — 자격 판정은 서비스가 한다). */
    List<ApprovalRequest> selectPending();

    /** 전체(최신순). 서비스가 상한을 건다. */
    List<ApprovalRequest> selectAll();

    int updateRequest(@Param("id") Long id, @Param("status") String status, @Param("currentStep") int currentStep,
                      @Param("note") String note, @Param("decidedAt") String decidedAt);

    int updateStep(@Param("stepId") Long stepId, @Param("status") String status, @Param("actedBy") String actedBy,
                   @Param("deputy") int deputy, @Param("comment") String comment, @Param("at") String at);
}
