package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.OverviewPair;
import com.kbstar.kgi.ggreport.web.domain.OverviewRun;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;

/** 워크플로 개요(GET /workflow/overview) 전용 읽기 쿼리. 전부 표준 SQL — 방언 분기 없음. */
@Mapper
public interface WorkflowOverviewMapper {
    /** 기관별 마지막 실행(CREATED_AT 최대). 동률이면 RUN_ID 오름차순으로 내려가므로 호출부는 뒤의 것이 이긴다. */
    List<OverviewRun> selectLatestRuns();

    /** value = 공고 건수. */
    List<OverviewPair> selectBidCounts();

    /** value = 최신 공고(SEQ_NO 최대)의 PARTICIPATION_STATUS. */
    List<OverviewPair> selectLatestBidStatuses();

    /** value = 담당자(중복 제거). 공백·NULL 제외. */
    List<OverviewPair> selectAssignees();
}
