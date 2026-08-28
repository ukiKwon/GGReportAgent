package com.kbstar.kgi.ggreport.web.dto;

/**
 * {@code POST /notifications} 본문 — <b>사람이 보내는 쪽지</b>.
 * Python {@code routers/notifications.NoteIn}.
 *
 * <p>⚠️ <b>{@code kind} 를 받지 않는다.</b> 사람이 만들 수 있는 것은 {@code 쪽지}
 * 하나로 고정이고, {@code 결재요청}·{@code 되물음}·{@code 이관} 은 <b>그래프(시스템)만</b>
 * 만들 수 있어야 흐름을 신뢰할 수 있다. 본문으로 받으면 사람이 결재요청을 위조할 수 있다.
 *
 * <p>⚠️ {@code sender} 를 <b>헤더가 아니라 본문으로</b> 받는 것은 의도다 —
 * {@code X-User-Id} 는 ASCII 만 실을 수 있어 한글 이름이 들어가지 않는다.
 */
public class NoteIn {

    private String recipient;
    private String content;

    /** 보낸 사람. 없을 수 있다. */
    private String sender;

    /** 어느 기관 건인지. 없을 수 있다. */
    private String institutionId;

    /** 어느 작업 건인지. 없을 수 있다. */
    private String taskId;

    public String getRecipient() { return recipient; }
    public void setRecipient(String recipient) { this.recipient = recipient; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public String getSender() { return sender; }
    public void setSender(String sender) { this.sender = sender; }

    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String institutionId) { this.institutionId = institutionId; }

    public String getTaskId() { return taskId; }
    public void setTaskId(String taskId) { this.taskId = taskId; }
}
