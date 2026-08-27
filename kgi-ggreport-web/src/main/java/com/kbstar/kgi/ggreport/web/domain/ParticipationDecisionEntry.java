package com.kbstar.kgi.ggreport.web.domain;

/**
 * 참여 결정 이력 1건. Python {@code server/models.ParticipationDecisionEntry}.
 *
 * <p>3단 결재(영업담당 → 영업팀장 → 영업부장)가 차례로 쌓인다. 저장은
 * {@code BID_CASES.PARTICIPATION_DECISION}(CLOB)에 <b>JSON 배열 문자열</b>로 하고,
 * 변환은 {@code ParticipationDecisionTypeHandler} 가 한다.
 *
 * <p>필드명이 전부 한 단어라 snake_case 변환의 영향을 받지 않는다 — 골든
 * {@code 11}~{@code 14} 의 키({@code tier/role/by/at/choice/comment})가 그대로다.
 */
public class ParticipationDecisionEntry {

    private int tier;
    private String role;
    /** 결정한 사람. 한글 실명이 들어온다(헤더에는 못 싣는 값이라 본문으로 받는다). */
    private String by;
    /** 결정 시각(ISO 8601 UTC 문자열). */
    private String at;
    private String choice;
    private String comment;

    public int getTier() { return tier; }
    public void setTier(int tier) { this.tier = tier; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getBy() { return by; }
    public void setBy(String by) { this.by = by; }

    public String getAt() { return at; }
    public void setAt(String at) { this.at = at; }

    public String getChoice() { return choice; }
    public void setChoice(String choice) { this.choice = choice; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
}
