package com.kbstar.kgi.ggreport.web.dto;

import java.util.ArrayList;
import java.util.List;

/**
 * {@code GET /institutions/{id}/coverage-map} — 배점표 항목 ↔ 팀 작성물 커버리지.
 * 골든 {@code 08}.
 *
 * <p>⚠️ <b>아직 배점표가 없어도 키를 다 채워 보낸다</b>({@code criteria: []},
 * {@code total_score: 0}, {@code teams: []}, {@code pii_total: 0}). 3단계(배점표
 * 추출) 전에는 빈 상태가 정상이고, 화면이 "있을 때/없을 때"로 분기하지 않게
 * 모양을 하나로 유지한다.
 */
public class CoverageMapResponse {

    private List<CoverageCriterion> criteria = new ArrayList<>();
    private int totalScore;
    private List<CoverageTeam> teams = new ArrayList<>();
    private int piiTotal;

    public CoverageMapResponse() {
    }

    public CoverageMapResponse(List<CoverageCriterion> criteria, int totalScore,
                               List<CoverageTeam> teams) {
        this.criteria = criteria;
        this.totalScore = totalScore;
        this.teams = teams;
        int sum = 0;
        for (CoverageTeam t : teams) {
            sum += t.getPiiCount();
        }
        this.piiTotal = sum;
    }

    public List<CoverageCriterion> getCriteria() { return criteria; }
    public void setCriteria(List<CoverageCriterion> criteria) { this.criteria = criteria; }

    public int getTotalScore() { return totalScore; }
    public void setTotalScore(int totalScore) { this.totalScore = totalScore; }

    public List<CoverageTeam> getTeams() { return teams; }
    public void setTeams(List<CoverageTeam> teams) { this.teams = teams; }

    public int getPiiTotal() { return piiTotal; }
    public void setPiiTotal(int piiTotal) { this.piiTotal = piiTotal; }
}
