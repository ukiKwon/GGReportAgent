package com.kbstar.kgi.ggreport.web.dto;

/**
 * 계정 전환기의 한 줄({@code GET /accounts}). 골든 {@code 03}.
 *
 * <p>두 종류가 한 목록에 섞인다 — <b>사람</b>({@code name} 이 있고 {@code team} 은
 * 그 사람의 쪽지 수신자 이름)과 <b>역할</b>({@code name} 이 {@code null}, 영업팀·
 * 디자이너 같은 것). 시스템 알림은 사람이 아니라 역할 앞으로 오기 때문에 역할도
 * 계정이 되어야 그 쪽지함을 볼 수 있다.
 */
public class Account {

    private String name;
    private String team;

    public Account() {
    }

    public Account(String name, String team) {
        this.name = name;
        this.team = team;
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getTeam() { return team; }
    public void setTeam(String team) { this.team = team; }
}
