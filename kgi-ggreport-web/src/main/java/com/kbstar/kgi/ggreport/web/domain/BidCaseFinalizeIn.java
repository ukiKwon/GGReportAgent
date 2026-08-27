package com.kbstar.kgi.ggreport.web.domain;

/**
 * 입찰 건 최종 확정/반려 입력. Python {@code server/models.BidCaseFinalizeIn}.
 *
 * <p>여기에는 {@code by} 가 없다 — 최종 확정자는 헤더({@code X-User-Id})로 받고
 * {@code FINALIZED_BY}/{@code FINALIZED_AT} 에 찍힌다(골든 {@code 24}).
 */
public class BidCaseFinalizeIn {

    private boolean approved;
    private String comment;

    public boolean isApproved() { return approved; }
    public void setApproved(boolean approved) { this.approved = approved; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
}
