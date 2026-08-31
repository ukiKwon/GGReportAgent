package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;

/**
 * 이관 패키지 — 이 작업이 속한 공고의 산출물 일체. Python {@code get_handoff}.
 *
 * <p><b>산출물 본문은 여기서 주지 않는다</b> — {@code GET /documents?path=} 가 이미
 * 그 일을 한다. 여기 실리는 것은 "무엇이 있고 누구에게 물어야 하나"다.
 */
public class HandoffResponse {

    private String institutionId;
    private String institutionName;
    private Integer stage;

    /** 취합된 제안서 경로. 아직 없으면 {@code null} — 없는 것은 오류가 아니다. */
    private String pptxPath;

    private List<HandoffTeam> teams = new ArrayList<>();

    /**
     * 아직 자기 일을 끝내지 않은 팀 이름.
     *
     * <p>디자이너 제출을 막는 근거이자, 화면이 <b>"왜 제출할 수 없는지"</b>를 설명하는
     * 문구의 재료다. 비어 있으면 제출할 수 있다는 뜻이다.
     */
    private List<String> waitingOn = new ArrayList<>();

    /** {@code rfp_scoring.json} 원문. 없으면 {@code null}. */
    private JsonNode scoring;

    /** {@code coverage_map.json} 원문. 없으면 {@code null}. */
    private JsonNode coverage;

    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String institutionId) { this.institutionId = institutionId; }

    public String getInstitutionName() { return institutionName; }
    public void setInstitutionName(String institutionName) { this.institutionName = institutionName; }

    public Integer getStage() { return stage; }
    public void setStage(Integer stage) { this.stage = stage; }

    public String getPptxPath() { return pptxPath; }
    public void setPptxPath(String pptxPath) { this.pptxPath = pptxPath; }

    public List<HandoffTeam> getTeams() { return teams; }
    public void setTeams(List<HandoffTeam> teams) { this.teams = teams; }

    public List<String> getWaitingOn() { return waitingOn; }
    public void setWaitingOn(List<String> waitingOn) { this.waitingOn = waitingOn; }

    public JsonNode getScoring() { return scoring; }
    public void setScoring(JsonNode scoring) { this.scoring = scoring; }

    public JsonNode getCoverage() { return coverage; }
    public void setCoverage(JsonNode coverage) { this.coverage = coverage; }
}
