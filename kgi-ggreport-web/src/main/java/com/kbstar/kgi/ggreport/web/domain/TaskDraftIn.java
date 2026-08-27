package com.kbstar.kgi.ggreport.web.domain;

/**
 * 임시저장 입력. Python {@code server/models.TaskDraftIn}.
 *
 * <p>{@code by}({@link TaskActorIn})는 담당자 실명이다.
 */
public class TaskDraftIn extends TaskActorIn {

    private String content;

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
}
