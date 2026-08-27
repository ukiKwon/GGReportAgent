package com.kbstar.kgi.ggreport.web.domain;

/**
 * 참여 결정 입력. Python {@code server/models.ParticipationDecisionIn}.
 *
 * <p>{@link ParticipationDecisionEntry} 와 갈리는 지점은 {@code at} 하나다 —
 * 결정 시각은 <b>서버가 찍는다.</b> 클라이언트가 보낸 시각을 믿으면 결재 이력의
 * 순서가 시계 차이로 뒤집힐 수 있다.
 */
public class ParticipationDecisionIn {

    private int tier;
    private String role;
    private String by;
    private String choice;
    private String comment;

    public int getTier() { return tier; }
    public void setTier(int tier) { this.tier = tier; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getBy() { return by; }
    public void setBy(String by) { this.by = by; }

    public String getChoice() { return choice; }
    public void setChoice(String choice) { this.choice = choice; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
}
