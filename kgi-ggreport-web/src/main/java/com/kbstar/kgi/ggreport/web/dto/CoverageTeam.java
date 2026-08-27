package com.kbstar.kgi.ggreport.web.dto;

/**
 * 팀별 개인정보 검출 건수. 골든 {@code 08}.
 *
 * <p>PII 는 <b>항목이 아니라 팀 단위 사실</b>이라 여기 한 번만 실린다
 * ({@link CoverageCriterion} 주석 참조).
 */
public class CoverageTeam {

    private String team;
    private int piiCount;

    public CoverageTeam() {
    }

    public CoverageTeam(String team, int piiCount) {
        this.team = team;
        this.piiCount = piiCount;
    }

    public String getTeam() { return team; }
    public void setTeam(String team) { this.team = team; }

    public int getPiiCount() { return piiCount; }
    public void setPiiCount(int piiCount) { this.piiCount = piiCount; }
}
