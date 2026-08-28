package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.domain.Institution;
import com.kbstar.kgi.ggreport.web.dto.HandoffResponse;
import com.kbstar.kgi.ggreport.web.dto.HandoffTeam;
import com.kbstar.kgi.ggreport.web.dto.TaskContext;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionMapper;
import com.kbstar.kgi.ggreport.web.mapper.NotificationMapper;
import com.kbstar.kgi.ggreport.web.mapper.TaskMapper;
import com.kbstar.kgi.ggreport.web.support.TaskFiles;
import com.kbstar.kgi.ggreport.web.support.Teams;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * 이관 패키지 — Task 5B.1. Python {@code server/routers/tasks.get_handoff}.
 *
 * <p>디자이너 화면이 "무엇을 받았고 누구에게 물어야 하나"를 그리는 재료다. 산출물
 * <b>본문</b>은 여기서 주지 않는다 — {@code GET /documents?path=} 가 그 일을 한다.
 *
 * <p>⚠️ <b>팀 산출물을 상태로 거르지 않는다.</b> 그래프는 팀 Task 를 {@code 1차완료}
 * 까지만 올리고, 5단계 기획승인은 기관 단위 checkpoint 라 팀 Task 를 {@code 2차완료}
 * 로 만들지 않는다(사람이 결재를 눌러야 탄다). '승인난 것만' 거르면 화면이 텅 비고,
 * 무엇보다 <b>감추면 디자이너가 다 받은 줄 안다.</b>
 */
@Service
public class HandoffService {

    private final TaskMapper tasks;
    private final InstitutionMapper institutions;
    private final NotificationMapper notifications;
    private final JsonFiles jsonFiles;
    private final AppProperties properties;

    public HandoffService(TaskMapper tasks, InstitutionMapper institutions,
                          NotificationMapper notifications, JsonFiles jsonFiles,
                          AppProperties properties) {
        this.tasks = tasks;
        this.institutions = institutions;
        this.notifications = notifications;
        this.jsonFiles = jsonFiles;
        this.properties = properties;
    }

    public HandoffResponse of(String taskId) {
        TaskContext ctx = tasks.selectContext(taskId);
        if (ctx == null) {
            throw ApiException.notFound("task not found");
        }

        List<String> recipients = notifications.selectDistinctRecipients();
        String outputRoot = properties.getOutputRoot();
        String institutionName = ctx.getInstitutionName();

        List<HandoffTeam> teams = new ArrayList<>();
        List<String> waitingOn = new ArrayList<>();
        for (HandoffTeam row : tasks.selectHandoffTeams(ctx.getBidCaseId(), ctx.getTeam())) {
            // ⚠️ 에이전트 전용 단계(RFI분석·취합·검증)는 뺀다 — 그쪽도 TASKS 행을 갖지만
            // 사람 작성물이 없어 항상 빈 카드가 되고, 문의할 상대도 아니다.
            // 그 단계의 산출물은 아래 scoring·coverage·pptxPath 로 따로 실린다.
            if (!Teams.isAuthoringTeam(row.getTeam())) {
                continue;
            }
            row.setContact(Teams.inboxName(row.getTeam(), recipients));
            row.setFiles(TaskFiles.listing(outputRoot, institutionName, row.getTaskId()));
            // 결재까지 끝나야 넘어갈 수 있다(계획 I). 디자이너 작업도 이 목록에 섞여
            // 오므로 최종완료도 끝난 것으로 본다 — 안 그러면 자기 자신을 기다린다.
            row.setWorking(!Teams.APPROVED_STATUS.equals(row.getStatus())
                    && !Teams.FINAL_STATUS.equals(row.getStatus()));
            teams.add(row);
            if (row.isWorking()) {
                waitingOn.add(row.getTeam());
            }
        }

        File outDir = new File(outputRoot, institutionName);
        Institution institution = institutions.selectById(ctx.getInstitutionId());

        HandoffResponse out = new HandoffResponse();
        out.setInstitutionId(ctx.getInstitutionId());
        out.setInstitutionName(institutionName);
        out.setStage(ctx.getStage());
        out.setPptxPath(institution == null ? null : institution.getPptxPath());
        out.setTeams(teams);
        out.setWaitingOn(waitingOn);
        out.setScoring(jsonFiles.readOrNull(new File(outDir, "rfp_scoring.json")));
        out.setCoverage(jsonFiles.readOrNull(new File(outDir, "coverage_map.json")));
        return out;
    }
}
