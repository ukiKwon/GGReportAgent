package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.Institution;
import com.kbstar.kgi.ggreport.web.dto.TimelineEvent;
import com.kbstar.kgi.ggreport.web.dto.TimelineResponse;
import com.kbstar.kgi.ggreport.web.dto.WorkflowStatusResponse;
import com.kbstar.kgi.ggreport.web.mapper.MessageMapper;
import com.kbstar.kgi.ggreport.web.mapper.NotificationMapper;
import com.kbstar.kgi.ggreport.web.mapper.TaskMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * 워크플로 탭이 읽는 두 가지 — 상태 폴링과 타임라인. 골든 {@code 29}·{@code 30}.
 * Python {@code routers/workflow.py} 의 {@code get_status}·{@code get_timeline}.
 *
 * <p>둘 다 범위가 <b>그 기관의 모든 공고</b>다(원본과 같다). 최신 1건이 아니다 —
 * 재입찰로 공고가 여러 건인 기관에서 옛 기록이 사라지면 안 된다.
 */
@Service
public class WorkflowStatusService {

    private final InstitutionService institutions;
    private final TaskMapper tasks;
    private final NotificationMapper notifications;
    private final MessageMapper messages;
    private final OrchestratorService orchestrator;

    public WorkflowStatusService(InstitutionService institutions, TaskMapper tasks,
                                 NotificationMapper notifications, MessageMapper messages,
                                 OrchestratorService orchestrator) {
        this.institutions = institutions;
        this.tasks = tasks;
        this.notifications = notifications;
        this.messages = messages;
        this.orchestrator = orchestrator;
    }

    /**
     * 골든 {@code 30}.
     *
     * <p>{@code running}·{@code pendingGate}·{@code failed} 는 <b>실제
     * {@code ORCH_RUN} 조회</b>다(단계 4, 2026-08-27). 종전에는 오케스트레이터가 없어
     * 고정값이었고, 골든 {@code 30} 이 마침 그 상태(실행 없음)를 찍은 덕에 값이 맞았다.
     *
     * <p>⚠️ <b>{@code running} 은 "도는 중"만이다</b> — 게이트에서 기다리는 중은 사람
     * 차례이지 실행 중이 아니다. 둘을 합치면 결재 화면이 "실행 중이니 기다리라"고
     * 표시해 <b>아무도 결재하지 않는다.</b>
     */
    public WorkflowStatusResponse status(String institutionId) {
        Institution institution = institutions.require(institutionId);

        WorkflowStatusResponse out = new WorkflowStatusResponse();
        out.setStage(institution.getStage());
        out.setRunning(orchestrator.isRunning(institutionId));
        out.setPendingGate(orchestrator.pendingGate(institutionId));
        out.setFailed(orchestrator.hasFailed(institutionId));
        out.setTasks(tasks.selectStatusTasks(institutionId));
        out.setNotificationsUnread(notifications.countUnread(institutionId));
        return out;
    }

    /**
     * 골든 {@code 29} — 작업 메시지와 쪽지를 한 줄기로 합쳐 시간순으로 준다.
     *
     * <p>{@code stage} 가 null 인 줄도 그대로 내보낸다 — 화면이 '단계 미상'으로 묶는다.
     * 거르면 참여확정 직후의 쪽지처럼 <b>단계가 정해지기 전에 생긴 기록</b>이 사라진다.
     */
    public TimelineResponse timeline(String institutionId) {
        institutions.require(institutionId);

        List<TimelineEvent> events = new ArrayList<TimelineEvent>();
        for (TimelineEvent e : messages.selectTimeline(institutionId)) {
            e.setKind("message");
            events.add(e);
        }
        for (TimelineEvent e : notifications.selectTimeline(institutionId)) {
            // 쪽지에는 팀도 작성자도 없고, LLM 산출물이 아니라 model 도 없다.
            // role 자리에는 이미 KIND(결재요청·쪽지 …)가 실려 있다.
            e.setKind("notification");
            events.add(e);
        }

        // ⚠️ **안정 정렬이어야 한다.** 원본 Python 의 sorted() 가 안정 정렬이라,
        //    시각이 같으면 "메시지 먼저, 그 다음 쪽지"이고 각 묶음 안에서는 DB 순서
        //    (= 삽입 순서)가 유지됐다. Collections.sort 도 안정 정렬이라 같은 결과다.
        //    각 묶음의 삽입 순서는 SQL 의 ORDER BY … SEQ_NO 가 보장한다(005).
        Collections.sort(events, new Comparator<TimelineEvent>() {
            @Override
            public int compare(TimelineEvent a, TimelineEvent b) {
                // 시각은 ISO 8601 문자열이라 사전순 = 시간순이다(설계 §5-C).
                return a.getAt().compareTo(b.getAt());
            }
        });
        return new TimelineResponse(events);
    }
}
