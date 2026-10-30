package com.kbstar.kgi.ggreport.web.dto;

import java.util.List;

/** GET /workflow/overview 응답 — items 는 기관 순, mine 은 호출자가 담당인 institution_id 목록. */
public class WorkflowOverviewResponse {
    private final List<WorkflowOverviewItem> items;
    private final List<String> mine;

    public WorkflowOverviewResponse(List<WorkflowOverviewItem> items, List<String> mine) {
        this.items = items;
        this.mine = mine;
    }

    public List<WorkflowOverviewItem> getItems() { return items; }
    public List<String> getMine() { return mine; }
}
