package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * {@code POST /institutions/{id}/checkpoint} 요청 본문 — 게이트 결재.
 *
 * <p>{@code by} 는 {@code X-User-Id} 를 <b>이긴다</b> — 그 헤더에는 ASCII 만 실을 수 있어
 * 한글 이름인 결재자는 본문으로 온다(작업 결재의 {@code TaskActorIn} 과 같은 관행).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class CheckpointIn {

    private boolean approved;
    private String comment;
    private String by;

    public boolean isApproved() { return approved; }
    public void setApproved(boolean approved) { this.approved = approved; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }

    public String getBy() { return by; }
    public void setBy(String by) { this.by = by; }
}
