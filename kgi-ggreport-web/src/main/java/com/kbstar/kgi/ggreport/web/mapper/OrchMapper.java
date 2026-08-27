package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.orchestrator.OrchRun;
import com.kbstar.kgi.ggreport.web.orchestrator.OrchStep;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * {@code ORCH_RUN} · {@code ORCH_STEP} — 오케스트레이터 실행 상태(설계 §6-B).
 * LangGraph 의 {@code SqliteSaver} 체크포인트를 대신한다.
 */
@Mapper
public interface OrchMapper {

    int insertRun(OrchRun run);

    OrchRun selectRun(@Param("runId") String runId);

    /**
     * 그 기관의 <b>활성</b> 실행. 없으면 null.
     *
     * <p>{@code ACTIVE_INSTITUTION_ID} 로 찾는다 — UNIQUE 라 최대 1건이다.
     * 상태로 찾으면({@code STATUS IN (…)}) 제약과 조회 조건이 갈라져, 한쪽만 고쳤을 때
     * 조용히 두 건이 보인다.
     */
    OrchRun selectActiveRun(@Param("institutionId") String institutionId);

    /** 그 기관의 마지막 실행(끝난 것 포함). 실패 여부를 볼 때 쓴다. */
    OrchRun selectLatestRun(@Param("institutionId") String institutionId);

    int updateRun(OrchRun run);

    int insertStep(OrchStep step);

    int updateStep(OrchStep step);

    /** 그 실행의 단계 전부(순서대로). 운영자가 "어디서 멈췄나"를 읽는 자리다. */
    List<OrchStep> selectSteps(@Param("runId") String runId);

    /** 게이트에서 멈춰 있는 단계. 재개는 여기서 이어진다. 없으면 null. */
    OrchStep selectPendingStep(@Param("runId") String runId);

    /** 다음 {@code SEQ_NO}. 비어 있으면 1. */
    long nextSeqNo(@Param("runId") String runId);
}
