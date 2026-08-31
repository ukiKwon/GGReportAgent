package com.kbstar.kgi.ggreport.web.orchestrator;

import com.kbstar.kgi.ggreport.web.mapper.InstitutionMapper;
import com.kbstar.kgi.ggreport.web.mapper.MessageMapper;
import com.kbstar.kgi.ggreport.web.mapper.TaskMapper;
import com.kbstar.kgi.ggreport.web.service.NotificationCommandService;
import org.springframework.stereotype.Component;

/**
 * {@link DbRecorder} 를 찍어 낸다. 레코더는 실행 1건마다 기관·입찰건이 고정이라
 * 스프링 빈으로 둘 수 없다 — 대신 이 팩토리가 Mapper 들을 물고 있는다.
 */
@Component
public class DbRecorderFactory {

    private final InstitutionMapper institutions;
    private final TaskMapper tasks;
    private final MessageMapper messages;
    private final NotificationCommandService notifications;

    public DbRecorderFactory(InstitutionMapper institutions, TaskMapper tasks,
                             MessageMapper messages, NotificationCommandService notifications) {
        this.institutions = institutions;
        this.tasks = tasks;
        this.messages = messages;
        this.notifications = notifications;
    }

    public Recorder create(String institutionId, String bidCaseId) {
        return new DbRecorder(institutions, tasks, messages, notifications,
                institutionId, bidCaseId);
    }
}
