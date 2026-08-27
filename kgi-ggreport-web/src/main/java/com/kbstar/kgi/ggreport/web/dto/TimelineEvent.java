package com.kbstar.kgi.ggreport.web.dto;

/**
 * 타임라인 한 줄 — 골든 {@code 29}. 작업 메시지와 쪽지를 <b>한 줄기로</b> 합친 모양이다.
 *
 * <p>⚠️ <b>키 11개가 모두 나간다</b>(값이 null 이어도). 화면이 같은 줄 형식으로 그리기
 * 때문에, 종류에 따라 키를 빼면 그 자리에서 {@code undefined} 가 찍힌다.
 *
 * <p>쪽지에는 팀이 없다. 대신 {@code kind}(결재요청·되물음·이관·쪽지)를 {@code role}
 * 자리에 실어 메시지와 같은 칸을 쓴다 — {@code kind} 필드는 {@code "message"} /
 * {@code "notification"} 둘 중 하나로 <b>줄의 종류</b>를 가리킨다.
 *
 * <p>{@code model} 은 그 기록을 남길 때 실제로 쓴 LLM 이다. 화면은 값이 있을 때만
 * {@code · 🧠 <model>} 을 붙이므로 사람 발화·쪽지는 그대로 나온다. 쪽지는 LLM 산출물이
 * 아니라 <b>언제나 null</b> 이다.
 */
public class TimelineEvent {

    private Integer stage;
    /** {@code CREATED_AT} — 정렬 키다(같으면 삽입 순서로 가른다). */
    private String at;
    /** {@code "message"} 또는 {@code "notification"}. */
    private String kind;
    private String team;
    /** 메시지는 {@code role}(user/agent), 쪽지는 {@code KIND}(결재요청 등). */
    private String role;
    private String author;
    private String content;
    private String taskId;
    private String model;

    public Integer getStage() { return stage; }
    public void setStage(Integer stage) { this.stage = stage; }

    public String getAt() { return at; }
    public void setAt(String at) { this.at = at; }

    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }

    public String getTeam() { return team; }
    public void setTeam(String team) { this.team = team; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getAuthor() { return author; }
    public void setAuthor(String author) { this.author = author; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public String getTaskId() { return taskId; }
    public void setTaskId(String taskId) { this.taskId = taskId; }

    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
}
