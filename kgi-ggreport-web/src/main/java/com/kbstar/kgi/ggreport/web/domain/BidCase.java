package com.kbstar.kgi.ggreport.web.domain;

import java.util.ArrayList;
import java.util.List;

/**
 * 입찰 건. Python {@code server/models.BidCase}.
 *
 * <p>기본값 3개({@code 예상}/{@code 검토중}/{@code 대기})는 원본 pydantic 기본값이다.
 * DDL 에도 같은 DEFAULT 가 있지만 <b>양쪽에 둔다</b> — MySQL 미러는 TEXT 계열에
 * DEFAULT 를 못 주므로 {@code PARTICIPATION_DECISION} 은 앱이 반드시 명시해야 한다
 * (db/mysql/001_schema.sql 주석).
 */
public class BidCase {

    private String bidCaseId;
    private String institutionId;
    private String scheduleConfidence = "예상";
    private String expectedDate;
    private String confirmedDate;
    private String lastSyncedAt;
    private String participationStatus = "검토중";
    /**
     * 3단 결재 이력. DB 에는 CLOB 에 JSON 배열로 담기고
     * {@code ParticipationDecisionTypeHandler} 가 변환한다. <b>비어 있어도 {@code null}
     * 이 아니라 {@code []}</b> 여야 한다 — 골든 {@code 10} 이 그렇게 고정했다.
     */
    private List<ParticipationDecisionEntry> participationDecision = new ArrayList<>();
    private String researchStatus = "대기";
    private String finalizedBy;
    private String finalizedAt;

    // ── 반입 출처 (collector/SCHEMA.md §④). (sourceSlug, noticeId) 가 공고 유일키다.
    private String sourceSlug;
    private String noticeId;
    private String title;
    private String noticeUrl;

    public BidCase() {
    }

    /**
     * 같은 행에서 파생 타입을 만들 때 쓴다 — 원본의
     * {@code BidCaseDetail(**bid_case.model_dump(), tasks=…)} 자리에 대응한다.
     *
     * <p>Mapper 는 {@link BidCase} 만 돌려준다(행 = 테이블 한 줄). 목록을 얹어
     * {@link BidCaseDetail}·{@link ParticipationDecisionOut} 을 만드는 것은 서비스의
     * 몫이라, 조립을 위해 resultMap 을 타입마다 늘리지 않는다.
     *
     * <p>⚠️ <b>필드를 추가하면 여기도 고쳐야 한다.</b> 빠뜨리면 상세 응답에서만
     * 그 필드가 비는데, 목록 응답은 멀쩡해서 원인을 찾기 어렵다 —
     * {@code BidCaseCopyTest} 가 리플렉션으로 누락을 잡는다.
     */
    protected BidCase(BidCase src) {
        this.bidCaseId = src.bidCaseId;
        this.institutionId = src.institutionId;
        this.scheduleConfidence = src.scheduleConfidence;
        this.expectedDate = src.expectedDate;
        this.confirmedDate = src.confirmedDate;
        this.lastSyncedAt = src.lastSyncedAt;
        this.participationStatus = src.participationStatus;
        this.participationDecision = src.participationDecision;
        this.researchStatus = src.researchStatus;
        this.finalizedBy = src.finalizedBy;
        this.finalizedAt = src.finalizedAt;
        this.sourceSlug = src.sourceSlug;
        this.noticeId = src.noticeId;
        this.title = src.title;
        this.noticeUrl = src.noticeUrl;
    }

    public String getBidCaseId() { return bidCaseId; }
    public void setBidCaseId(String bidCaseId) { this.bidCaseId = bidCaseId; }

    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String institutionId) { this.institutionId = institutionId; }

    public String getScheduleConfidence() { return scheduleConfidence; }
    public void setScheduleConfidence(String scheduleConfidence) {
        this.scheduleConfidence = scheduleConfidence;
    }

    public String getExpectedDate() { return expectedDate; }
    public void setExpectedDate(String expectedDate) { this.expectedDate = expectedDate; }

    public String getConfirmedDate() { return confirmedDate; }
    public void setConfirmedDate(String confirmedDate) { this.confirmedDate = confirmedDate; }

    public String getLastSyncedAt() { return lastSyncedAt; }
    public void setLastSyncedAt(String lastSyncedAt) { this.lastSyncedAt = lastSyncedAt; }

    public String getParticipationStatus() { return participationStatus; }
    public void setParticipationStatus(String participationStatus) {
        this.participationStatus = participationStatus;
    }

    public List<ParticipationDecisionEntry> getParticipationDecision() {
        return participationDecision;
    }
    public void setParticipationDecision(List<ParticipationDecisionEntry> participationDecision) {
        // TypeHandler 가 빈 목록을 돌려주지만, 옛 행이나 수동 INSERT 로 NULL 이 들어와도
        // JSON 이 `null` 이 되지 않게 여기서 한 번 더 막는다.
        this.participationDecision =
                (participationDecision == null) ? new ArrayList<ParticipationDecisionEntry>()
                                                : participationDecision;
    }

    public String getResearchStatus() { return researchStatus; }
    public void setResearchStatus(String researchStatus) { this.researchStatus = researchStatus; }

    public String getFinalizedBy() { return finalizedBy; }
    public void setFinalizedBy(String finalizedBy) { this.finalizedBy = finalizedBy; }

    public String getFinalizedAt() { return finalizedAt; }
    public void setFinalizedAt(String finalizedAt) { this.finalizedAt = finalizedAt; }

    public String getSourceSlug() { return sourceSlug; }
    public void setSourceSlug(String sourceSlug) { this.sourceSlug = sourceSlug; }

    public String getNoticeId() { return noticeId; }
    public void setNoticeId(String noticeId) { this.noticeId = noticeId; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getNoticeUrl() { return noticeUrl; }
    public void setNoticeUrl(String noticeUrl) { this.noticeUrl = noticeUrl; }
}
