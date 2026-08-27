package com.kbstar.kgi.ggreport.web.domain;

/**
 * 작업 결재 입력. Python {@code server/models.TaskApprovalIn}.
 *
 * <p>{@code by}({@link TaskActorIn})는 <b>결재자 실명</b>이다 — 헤더에 한글을
 * 못 싣기 때문이다.
 */
public class TaskApprovalIn extends TaskActorIn {

    private boolean approved;
    private String comment;

    public boolean isApproved() { return approved; }
    public void setApproved(boolean approved) { this.approved = approved; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
}
