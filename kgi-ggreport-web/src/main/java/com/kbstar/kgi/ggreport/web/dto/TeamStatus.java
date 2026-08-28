package com.kbstar.kgi.ggreport.web.dto;

/**
 * 결재함 질의의 (팀, 상태) 한 쌍.
 *
 * <p><b>팀만으로 거르지 않는 이유</b>: 같은 디자이너 작업이 <b>단계마다 다른 사람</b>
 * 에게 간다. {@code 1차완료} 는 영업팀장 몫이고 {@code 2차완료} 는 영업부장 몫이다.
 * 팀만 보면 둘의 결재함에 <b>같은 카드가 동시에 뜬다.</b>
 */
public final class TeamStatus {

    private final String team;
    private final String status;

    public TeamStatus(String team, String status) {
        this.team = team;
        this.status = status;
    }

    public String getTeam() { return team; }

    public String getStatus() { return status; }
}
