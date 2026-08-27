package com.kbstar.kgi.ggreport.web.orchestrator;

import com.kbstar.kgi.ggreport.web.domain.Institution;
import com.kbstar.kgi.ggreport.web.domain.Message;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionMapper;
import com.kbstar.kgi.ggreport.web.mapper.MessageMapper;
import com.kbstar.kgi.ggreport.web.mapper.TaskMapper;
import com.kbstar.kgi.ggreport.web.service.NotificationCommandService;
import com.kbstar.kgi.ggreport.web.support.Ids;
import com.kbstar.kgi.ggreport.web.support.Times;

import java.util.List;

/**
 * {@link Recorder} 의 DB 구현 — Python {@code server/orchestrator_recorder.DbRecorder}.
 *
 * <p>실행 1건마다 하나씩 만든다(기관·입찰건이 고정이라). <b>스프링 빈이 아니다</b> —
 * 그래서 {@link DbRecorderFactory} 가 Mapper 들을 물고 있다가 찍어 낸다.
 *
 * <p>기록에 <b>"그때 몇 단계였는지"</b>를 함께 남긴다. 단계별 수행 내용 뷰(타임라인)의
 * 유일한 근거다 — 포트 시그니처를 늘리지 않으려고 {@link #setStage} 를 그대로 믿는다.
 */
public class DbRecorder implements Recorder {

    private final InstitutionMapper institutions;
    private final TaskMapper tasks;
    private final MessageMapper messages;
    private final NotificationCommandService notifications;

    private final String institutionId;
    private final String bidCaseId;
    private Integer stage;

    DbRecorder(InstitutionMapper institutions, TaskMapper tasks, MessageMapper messages,
               NotificationCommandService notifications,
               String institutionId, String bidCaseId) {
        this.institutions = institutions;
        this.tasks = tasks;
        this.messages = messages;
        this.notifications = notifications;
        this.institutionId = institutionId;
        this.bidCaseId = bidCaseId;

        Institution institution = institutions.selectById(institutionId);
        this.stage = institution == null ? null : institution.getStage();
    }

    @Override
    public void setStage(int stage) {
        institutions.updateStage(institutionId, stage);
        this.stage = Integer.valueOf(stage);
    }

    @Override
    public void taskOpen(String team) {
        ensureTask(team);
    }

    @Override
    public void taskUpdate(String team, String status, int progressPct) {
        tasks.updateStatusAndProgress(ensureTask(team), status, progressPct);
    }

    @Override
    public void message(String team, String role, String content, String author, String model) {
        Message message = new Message();
        message.setMessageId(Ids.message());
        message.setTaskId(ensureTask(team));
        message.setRole(role);
        message.setContent(content);
        message.setCreatedAt(Times.nowIso());
        message.setAuthor(author);
        message.setStage(stage);
        message.setModel(model);
        messages.insert(message);
    }

    @Override
    public void notify(String recipient, String kind, String content) {
        notifications.create(recipient, kind, content, institutionId, null, null, stage, null);
    }

    /**
     * 그 팀의 작업 id. 없으면 만든다(멱등).
     *
     * <p>⚠️ 에이전트 단계({@code RFI분석}·{@code 취합}·{@code 검증})도 여기서 작업 행을
     * 갖는다 — 사람 작성물은 없지만 <b>로그를 붙일 자리</b>가 필요하기 때문이다.
     * 그래서 팀 이름을 {@link com.kbstar.kgi.ggreport.web.support.Teams#AUTHORING_TEAMS}
     * 로 제한하지 않는다.
     */
    private String ensureTask(String team) {
        List<String> existing = tasks.selectTeams(bidCaseId);
        if (existing.contains(team)) {
            return tasks.selectTaskIdByTeam(bidCaseId, team);
        }
        String taskId = Ids.task();
        tasks.insert(taskId, bidCaseId, team);
        return taskId;
    }
}
