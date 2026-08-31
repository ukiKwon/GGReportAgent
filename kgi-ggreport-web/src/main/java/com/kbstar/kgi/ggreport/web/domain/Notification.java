package com.kbstar.kgi.ggreport.web.domain;

/**
 * 쪽지·알림. Python {@code server/models.Notification}.
 *
 * <p>{@code institutionId}·{@code taskId} 에 <b>외래키가 없다</b>(DDL 주석 참조) —
 * 알림은 대상이 사라진 뒤에도 남아야 하는 기록이다.
 *
 * <p>{@code stage}·{@code sender} 는 나중에 붙은 컬럼이라 과거 행에는 NULL 이다.
 * {@code sender} 는 <b>사람이 보낸 쪽지에만</b> 채워진다 — 시스템 알림은 NULL 이고,
 * 화면이 그 둘을 이 값으로 구분한다.
 */
public class Notification {

    private String notificationId;
    private String recipient;
    /** 쪽지 / 되물음 / 결재요청 / 이관 */
    private String kind;
    private String institutionId;
    private String taskId;
    private String content;
    private String link;
    private String createdAt;
    /** 읽은 시각. null 이면 안 읽음. */
    private String readAt;
    private Integer stage;
    private String sender;

    public String getNotificationId() { return notificationId; }
    public void setNotificationId(String notificationId) { this.notificationId = notificationId; }

    public String getRecipient() { return recipient; }
    public void setRecipient(String recipient) { this.recipient = recipient; }

    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }

    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String institutionId) { this.institutionId = institutionId; }

    public String getTaskId() { return taskId; }
    public void setTaskId(String taskId) { this.taskId = taskId; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public String getLink() { return link; }
    public void setLink(String link) { this.link = link; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }

    public String getReadAt() { return readAt; }
    public void setReadAt(String readAt) { this.readAt = readAt; }

    public Integer getStage() { return stage; }
    public void setStage(Integer stage) { this.stage = stage; }

    public String getSender() { return sender; }
    public void setSender(String sender) { this.sender = sender; }
}
