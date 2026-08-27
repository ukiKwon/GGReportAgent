package com.kbstar.kgi.ggreport.web.domain;

/**
 * 기관별 대화창 1건. Python {@code server/models.ChatMessage}.
 *
 * <p>{@code role} 은 {@code user} 또는 {@code agent} 다. {@code author} 는 나중에
 * 붙은 컬럼이라 에이전트 답변과 과거 행에는 NULL 이다.
 */
public class ChatMessage {

    private String chatMessageId;
    private String institutionId;
    private String role;
    private String content;
    private String createdAt;
    private String author;

    public String getChatMessageId() { return chatMessageId; }
    public void setChatMessageId(String chatMessageId) { this.chatMessageId = chatMessageId; }

    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String institutionId) { this.institutionId = institutionId; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }

    public String getAuthor() { return author; }
    public void setAuthor(String author) { this.author = author; }
}
