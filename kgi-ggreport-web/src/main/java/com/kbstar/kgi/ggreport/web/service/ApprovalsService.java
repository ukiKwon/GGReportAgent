package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.domain.Institution;
import com.kbstar.kgi.ggreport.web.dto.ApprovalItem;
import com.kbstar.kgi.ggreport.web.dto.ApprovalsResponse;
import com.kbstar.kgi.ggreport.web.dto.TeamStatus;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionMapper;
import com.kbstar.kgi.ggreport.web.mapper.TaskMapper;
import com.kbstar.kgi.ggreport.web.support.TaskFiles;
import com.kbstar.kgi.ggreport.web.support.Teams;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * 결재함 — 그 역할이 결재할 것 전부. Task 5B.2. Python {@code server/routers/approvals.py}.
 *
 * <p><b>결재 라인</b>(사용자 확정):
 * 팀원 → <b>그 팀의 팀장</b>, 디자이너 → <b>영업팀장</b> → <b>영업부장</b>(최종, 흐름 종료).
 * 디자이너는 영업팀 소속이라 1차를 영업팀장이 받고, <b>영업팀장의 승인이 곧 상신</b>이다
 * (별도 버튼을 두면 승인해 놓고 안 올리는 상태가 생긴다).
 *
 * <p>⚠️ <b>영업부장 화면에는 워크플로가 없다.</b> 그래서 결재에 필요한 맥락(기관·단계·
 * 작성물·첨부)을 목록 응답에 <b>통째로 실어</b> 카드 하나로 판단할 수 있게 한다.
 */
@Service
public class ApprovalsService {

    private static final Logger log = LoggerFactory.getLogger(ApprovalsService.class);

    private final TaskMapper tasks;
    private final InstitutionMapper institutions;
    private final OrchestratorService orchestrator;
    private final AppProperties properties;

    public ApprovalsService(TaskMapper tasks, InstitutionMapper institutions,
                            OrchestratorService orchestrator, AppProperties properties) {
        this.tasks = tasks;
        this.institutions = institutions;
        this.orchestrator = orchestrator;
        this.properties = properties;
    }

    /**
     * 그 역할이 결재할 <b>(팀, 상태)</b> 쌍.
     *
     * <p>상태까지 함께 정하는 이유는 {@link TeamStatus} 에 적었다 — 팀만 보면 같은
     * 디자이너 작업이 팀장과 부장 결재함에 동시에 뜬다.
     *
     * <ul>
     *   <li><b>팀장</b>: 자기 팀 하나. 남의 팀을 대신 보면 누가 봤는지 알 수 없어진다.</li>
     *   <li><b>영업팀장</b>: 거기에 <b>디자이너 작업</b>(디자이너는 영업팀 소속).</li>
     *   <li><b>영업부장</b>: 영업팀장이 승인해 올린 디자이너 최종본만. 팀 작업은
     *       겹쳐 갖지 않는다.</li>
     * </ul>
     */
    static List<TeamStatus> queueFor(String role) {
        if (Teams.FINAL_APPROVER.equals(role)) {
            return Collections.singletonList(
                    new TeamStatus(Teams.DESIGNER_TEAM, Teams.APPROVED_STATUS));
        }
        if (!Teams.LEAD_ROLES.contains(role)) {
            return Collections.emptyList();
        }
        List<TeamStatus> pairs = new ArrayList<>();
        String team = Teams.teamOf(role);
        if (Teams.AUTHORING_TEAMS.contains(team)) {
            pairs.add(new TeamStatus(team, Teams.SUBMITTED_STATUS));
        }
        if (role.equals(Teams.leadOf(Teams.DESIGNER_TEAM))) {
            pairs.add(new TeamStatus(Teams.DESIGNER_TEAM, Teams.SUBMITTED_STATUS));
        }
        return pairs;
    }

    public ApprovalsResponse forRole(String role) {
        List<ApprovalItem> items = new ArrayList<>();

        List<TeamStatus> queue = queueFor(role);
        // ⚠️ 빈 쌍으로 부르지 않는다 — 빈 IN 절은 SQL 오류다.
        if (!queue.isEmpty()) {
            for (ApprovalItem row : tasks.selectApprovalQueue(queue)) {
                row.setKind("task");
                // 최종 결재인지는 **서버가 정한다** — 화면이 상태 문자열을 다시
                // 해석하면 규칙이 두 벌이 되고, 한쪽만 고쳤을 때 조용히 갈라진다.
                row.setFinalApproval(Teams.DESIGNER_TEAM.equals(row.getTeam())
                        && Teams.APPROVED_STATUS.equals(row.getStatus()));
                row.setFiles(filesOf(row));
                items.add(row);
            }
        }

        items.addAll(gatesFor(role));
        return new ApprovalsResponse(role, items);
    }

    /**
     * 게이트는 <b>영업부장만</b> 본다(8단계 최종결재).
     *
     * <p>그래프 상태를 기관마다 물어야 해서 대상 역할이 아닐 때는 <b>아예 돌지 않는다</b> —
     * 25개 기관을 매번 조회하면 팀장 결재함이 그만큼 느려진다.
     */
    private List<ApprovalItem> gatesFor(String role) {
        if (!Teams.FINAL_APPROVER.equals(role)) {
            return Collections.emptyList();
        }
        List<Institution> all = new ArrayList<>(institutions.selectAll());
        // 원본은 SQL 에서 name_ko 순으로 뽑는다. selectAll 은 id 순이라 여기서 맞춘다 —
        // 결재함 카드 순서가 기관명 순이어야 사람이 찾는다.
        all.sort(Comparator.comparing(Institution::getNameKo,
                Comparator.nullsLast(Comparator.naturalOrder())));

        List<ApprovalItem> gates = new ArrayList<>();
        for (Institution institution : all) {
            String id = institution.getInstitutionId();
            if (orchestrator.isRunning(id)) {
                continue;                       // 아직 도는 중이면 결재할 것이 아니다
            }
            String gate = orchestrator.pendingGate(id);
            if (gate == null || gate.isEmpty()) {
                continue;
            }
            ApprovalItem item = new ApprovalItem();
            item.setKind("gate");
            item.setGate(gate);
            item.setInstitutionId(id);
            item.setInstitutionName(institution.getNameKo());
            item.setStage(institution.getStage());
            gates.add(item);
        }
        return gates;
    }

    /**
     * 첨부 목록. 경로 가드에 걸리면 <b>그 카드만</b> 빈 목록으로 떨군다.
     *
     * <p>{@code HandoffService} 와 같은 판단이다(2026-08-28 보안 리뷰) — 결재함도
     * 여러 줄을 모아 내려주는 응답이라, 한 줄의 실패가 <b>결재함 전체를 비우면</b>
     * 결재자는 볼 것이 없다고 오해하고 흐름이 멈춘다. 조용히 넘기지 않고 WARN 을 남긴다.
     */
    private List<com.kbstar.kgi.ggreport.web.dto.TaskFileEntry> filesOf(ApprovalItem row) {
        try {
            return TaskFiles.listing(properties.getOutputRoot(),
                    row.getInstitutionName(), row.getTaskId());
        } catch (TaskFiles.FileRejected | IllegalArgumentException rejected) {
            log.warn("결재함 카드의 첨부 목록을 읽지 못했다 — 이 카드만 비운다."
                            + " institution={} taskId={}",
                    row.getInstitutionName(), row.getTaskId(), rejected);
            return Collections.emptyList();
        }
    }
}
