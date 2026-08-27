package com.kbstar.kgi.ggreport.web.domain;

import java.util.ArrayList;
import java.util.List;

/**
 * 입찰 건 + 팀별 작업 요약. Python {@code server/models.BidCaseDetail}.
 *
 * <p>골든 {@code 14} 의 응답 모양이다. 작업이 아직 없으면 {@code tasks} 는
 * {@code null} 이 아니라 {@code []} 다.
 */
public class BidCaseDetail extends BidCase {

    private List<TaskSummary> tasks = new ArrayList<>();

    public BidCaseDetail() {
    }

    /** 조회한 행 + 팀별 작업 요약. 원본 {@code routers/bidcases.py} 의 조립과 같다. */
    public BidCaseDetail(BidCase src, List<TaskSummary> tasks) {
        super(src);
        setTasks(tasks);
    }

    public List<TaskSummary> getTasks() { return tasks; }
    public void setTasks(List<TaskSummary> tasks) {
        this.tasks = (tasks == null) ? new ArrayList<TaskSummary>() : tasks;
    }
}
