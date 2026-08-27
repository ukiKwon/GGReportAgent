package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BidCase;
import com.kbstar.kgi.ggreport.web.domain.BidCaseDetail;
import com.kbstar.kgi.ggreport.web.mapper.BidCaseMapper;
import com.kbstar.kgi.ggreport.web.mapper.TaskMapper;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 입찰 건 조회. Python {@code routers/bidcases.py} 의 GET 쪽.
 */
@Service
public class BidCaseQueryService {

    private final BidCaseMapper bidCaseMapper;
    private final TaskMapper taskMapper;

    public BidCaseQueryService(BidCaseMapper bidCaseMapper, TaskMapper taskMapper) {
        this.bidCaseMapper = bidCaseMapper;
        this.taskMapper = taskMapper;
    }

    /** 담당자 뷰(골든 {@code 25}). */
    public List<BidCase> forAssignee(String team, String assignee) {
        return bidCaseMapper.selectForAssignee(team, assignee);
    }

    /** 기관별 최신 공고 — 지도가 전체 기관의 입찰일을 그리는 데 쓴다. */
    public List<BidCase> latest() {
        return bidCaseMapper.selectLatestPerInstitution();
    }

    /**
     * 상세 + 팀별 작업 요약(골든 {@code 14}).
     *
     * <p>⚠️ 사유 문구 {@code "bid case not found"} 는 원본 그대로 영어다.
     */
    public BidCaseDetail detail(String bidCaseId) {
        BidCase bidCase = bidCaseMapper.selectById(bidCaseId);
        if (bidCase == null) {
            throw ApiException.notFound("bid case not found");
        }
        return new BidCaseDetail(bidCase, taskMapper.selectSummaries(bidCaseId));
    }
}
