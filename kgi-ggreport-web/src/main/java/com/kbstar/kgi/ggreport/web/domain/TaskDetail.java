package com.kbstar.kgi.ggreport.web.domain;

import java.util.ArrayList;
import java.util.List;

/**
 * 작업 + 대화 기록. Python {@code server/models.TaskDetail}.
 *
 * <p>기록이 없으면 {@code messages} 는 {@code null} 이 아니라 {@code []} 다.
 */
public class TaskDetail extends Task {

    private List<Message> messages = new ArrayList<>();

    public TaskDetail() {
    }

    public TaskDetail(Task src, List<Message> messages) {
        super(src);
        setMessages(messages);
    }

    public List<Message> getMessages() { return messages; }
    public void setMessages(List<Message> messages) {
        this.messages = (messages == null) ? new ArrayList<Message>() : messages;
    }
}
