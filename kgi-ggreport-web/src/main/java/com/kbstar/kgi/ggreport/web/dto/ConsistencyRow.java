package com.kbstar.kgi.ggreport.web.dto;

/**
 * 정합성 규칙이 훑는 한 줄 — 기관 + <b>그 기관의 최신 공고</b> + 그 공고의 작업 수.
 * JSON 으로 나가지 않는다(규칙의 입력일 뿐이다).
 *
 * <p>⚠️ 공고가 없는 기관도 <b>한 줄로 들어온다</b>(LEFT JOIN) — 그 경우
 * {@code participationStatus} 가 {@code null} 이고, 그것이 바로
 * {@code stage_without_bid_case} 규칙이 보는 조건이다. INNER JOIN 으로 바꾸면
 * 그 규칙이 영영 아무것도 못 찾는다.
 */
public class ConsistencyRow {

    private String institutionId;
    private String nameKo;
    private int stage;
    private String bidCaseId;
    private String participationStatus;
    private String researchStatus;
    private int taskCount;

    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String institutionId) { this.institutionId = institutionId; }

    public String getNameKo() { return nameKo; }
    public void setNameKo(String nameKo) { this.nameKo = nameKo; }

    public int getStage() { return stage; }
    public void setStage(int stage) { this.stage = stage; }

    public String getBidCaseId() { return bidCaseId; }
    public void setBidCaseId(String bidCaseId) { this.bidCaseId = bidCaseId; }

    public String getParticipationStatus() { return participationStatus; }
    public void setParticipationStatus(String participationStatus) {
        this.participationStatus = participationStatus;
    }

    public String getResearchStatus() { return researchStatus; }
    public void setResearchStatus(String researchStatus) { this.researchStatus = researchStatus; }

    public int getTaskCount() { return taskCount; }
    public void setTaskCount(int taskCount) { this.taskCount = taskCount; }
}
