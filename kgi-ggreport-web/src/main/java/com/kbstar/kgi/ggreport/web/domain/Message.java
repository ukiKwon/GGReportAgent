package com.kbstar.kgi.ggreport.web.domain;

/**
 * 작업별 대화/기록 1건. Python {@code server/models.Message}.
 *
 * <p>{@code author}·{@code stage}·{@code model} 셋은 나중에 붙은 컬럼이라 과거 행에는
 * NULL 이다. 특히 {@code model} 은 <b>server/db.py 의 SCHEMA 가 아니라
 * MESSAGE_MIGRATIONS 에만 있던 컬럼</b>이라 SCHEMA 만 보고 옮기면 조용히 빠진다.
 *
 * <p>{@code model} 이 채워져 있으면 그 기록이 <b>실제로 LLM 을 썼다</b>는 뜻이다
 * (게이트 통과 알림 같은 기록은 NULL). 화면의 🧠 표시가 이 값을 읽는다 — 폴백이
 * 돌았을 때 "쓰려던 모델"이 아니라 "실제로 답을 만든 모델"이 남아야 한다.
 */
public class Message {

    private String messageId;
    private String taskId;
    private String role;
    private String content;
    private String createdAt;
    /** 사람이 쓴 글의 실명(결재자·담당자). 에이전트 기록은 null. */
    private String author;
    /** 기록 당시의 9단계 진행 단계. */
    private Integer stage;
    /** 이 기록을 남길 때 실제로 쓴 LLM 모델. LLM 을 안 쓴 기록은 null. */
    private String model;

    public String getMessageId() { return messageId; }
    public void setMessageId(String messageId) { this.messageId = messageId; }

    public String getTaskId() { return taskId; }
    public void setTaskId(String taskId) { this.taskId = taskId; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }

    public String getAuthor() { return author; }
    public void setAuthor(String author) { this.author = author; }

    public Integer getStage() { return stage; }
    public void setStage(Integer stage) { this.stage = stage; }

    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
}
