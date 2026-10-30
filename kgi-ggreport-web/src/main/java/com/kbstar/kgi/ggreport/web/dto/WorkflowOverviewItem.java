package com.kbstar.kgi.ggreport.web.dto;

import java.util.List;

/** 제안서 진행 현황 목록의 한 줄 — 기관 1곳 = 제안서 1건. 키는 전역 Jackson 설정으로 snake_case 가 된다. */
public class WorkflowOverviewItem {
    private String institutionId;
    private String name;
    private String region;
    private String regionCode;
    private String stageLabel;
    private String state;
    private String gate;
    private String updatedAt;
    private int stage;
    private int bidCount;
    private boolean done;
    private List<String> assignees;

    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String v) { institutionId = v; }
    public String getName() { return name; }
    public void setName(String v) { name = v; }
    public String getRegion() { return region; }
    public void setRegion(String v) { region = v; }
    /** 추가 필드(계약 변경 아님) — 시군구 숫자코드 원값. */
    public String getRegionCode() { return regionCode; }
    public void setRegionCode(String v) { regionCode = v; }
    public int getStage() { return stage; }
    public void setStage(int v) { stage = v; }
    public String getStageLabel() { return stageLabel; }
    public void setStageLabel(String v) { stageLabel = v; }
    public String getState() { return state; }
    public void setState(String v) { state = v; }
    public String getGate() { return gate; }
    public void setGate(String v) { gate = v; }
    public boolean isDone() { return done; }
    public void setDone(boolean v) { done = v; }
    public int getBidCount() { return bidCount; }
    public void setBidCount(int v) { bidCount = v; }
    public List<String> getAssignees() { return assignees; }
    public void setAssignees(List<String> v) { assignees = v; }
    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String v) { updatedAt = v; }
}
