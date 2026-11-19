package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BidAssigneeView;
import com.kbstar.kgi.ggreport.web.domain.BidPrep;
import com.kbstar.kgi.ggreport.web.domain.DesignComment;
import com.kbstar.kgi.ggreport.web.domain.DesignReadyCase;
import com.kbstar.kgi.ggreport.web.domain.DesignRecipient;
import com.kbstar.kgi.ggreport.web.domain.DesignRound;
import com.kbstar.kgi.ggreport.web.domain.Notification;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.domain.Task;
import com.kbstar.kgi.ggreport.web.domain.TaskSummary;
import com.kbstar.kgi.ggreport.web.dto.TaskContext;
import com.kbstar.kgi.ggreport.web.mapper.BidAssignmentMapper;
import com.kbstar.kgi.ggreport.web.mapper.DesignReviewMapper;
import com.kbstar.kgi.ggreport.web.mapper.PrepMapper;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.mapper.TaskMapper;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.Ids;
import com.kbstar.kgi.ggreport.web.support.MenuPerms;
import com.kbstar.kgi.ggreport.web.support.Pii;
import com.kbstar.kgi.ggreport.web.support.Teams;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 디자인 검토 흐름(051, NEXT 100 ⑥). 기존 디자이너 작업(TASKS, TEAM='디자이너') 결재 흐름을 그대로 쓰고 그 위에 '회차'를 얹는다.
 * <pre>
 *   대기·작성중 --[디자인 작업 완료]--> 1차완료(회차 n 열림, 받는 사람 박제·사람별 쪽지)
 *   1차완료 --[다시 수정]--> 작성중(회차 닫힘 REVISE)            1차완료 --영업팀장 승인--> 2차완료(회차 닫힘 FORWARD, 부장께 올림)
 *   1차완료 --영업팀장 반려--> 작성중(LEAD_RETURN)               2차완료 --영업부장 승인--> 최종완료 / 돌려보내기(사유 필수)--> 작성중
 * </pre>
 * 상태 정본은 TASKS.STATUS 이고 모든 전이는 조건부 갱신(updateStatusIf)이다.
 *
 * <p><b>동시성(security M1)</b>: 완료·다시 수정·의견·확인함은 모두 트랜잭션의 첫 문장으로 TASKS 행을 FOR UPDATE 로 잡고
 * 그 잠금 아래에서 열림 여부와 의견 30건 상한을 판정한다. 결재(approve)도 같은 잠금을 먼저 잡고 회차를 닫는다 — 그래서 닫힌 회차에 의견이 남지 않는다.
 * <p><b>담당 판정(M5)</b>: 디자이너 담당은 이름 문자열이다(designer.js 호환). 사번이 같거나, 이름이 같고 ACTIVE 디자이너 중 그 이름이 정확히 1명일 때만 본인으로 본다.
 * <p><b>쪽지(M3·M4)</b>: sender 는 예약값 '시스템' 고정({@link NotificationCommandService#SYSTEM_SENDER}). 디자이너 앞 쪽지는 사번으로 보낸다 —
 * 이름으로 보내면 동명이인이 읽는다. 쪽지 본문에 의견 내용은 싣지 않는다.
 * <p><b>감사</b>: 새 표 없이 BID_PREP_ACT(024)를 {@link PrepAudit#record} 호출로만 쓴다(PrepAudit·PrepMapper·024 는 고치지 않는다). 예약 접두어: ACTION_CD 의
 * {@code DSN_}(디자인 검토)·{@code TASK_}(팀 작업 결재 보강, S6-c)는 이 흐름 전용이다. TASK_CD 는 {@code DSN_R{회차}}(회차 없으면 DSN_R0) 또는
 * {@link #TEAM_SALES}·{@link #TEAM_IT}·{@link #TEAM_BUDGET}(팀 작업)으로 고정한다 — BID_PREP_ACT 에는 TASK_ID 칸이 없어 (건, 팀)으로 작업을 되찾기 때문이다.
 * STATE_CD 는 행위 직전 phase_cd. 사전준비 이력을 집계할 때는 이 접두어로 걸러야 한다(안 거르면 의견·확인한 사람이 보인다). 본문·사유·이름·파일명은 넣지 않는다.
 * ⚠️ 사번·화면·버튼은 모두 클라이언트 자기신고다(EMP_VERIFIED 는 사실만 적는다).
 */
@Service
public class DesignReviewService {

    private static final Logger LOG = LoggerFactory.getLogger(DesignReviewService.class);

    /** 한 사람이 한 회차에 남길 수 있는 의견 수(security 11-19: 적정). */
    public static final int MAX_COMMENTS = 30;
    static final int MAX_BODY = 1000;
    static final int MAX_REASON = 500;
    private static final int NO_MAX = 999999;   // NUMBER(6)

    public static final String CLOSE_REVISE = "REVISE";
    public static final String CLOSE_FORWARD = "FORWARD";
    public static final String CLOSE_LEAD_RETURN = "LEAD_RETURN";

    // BID_PREP_ACT.ACTION_CD (30자 이내). DSN_ · TASK_ 접두어 예약.
    public static final String A_OPEN = "DSN_OPEN";
    public static final String A_VIEW = "DSN_VIEW";
    public static final String A_COMPLETE = "DSN_COMPLETE";
    public static final String A_COMMENT = "DSN_COMMENT";
    public static final String A_ACK = "DSN_ACK";
    public static final String A_REVISE = "DSN_REVISE";
    public static final String A_FORWARD = "DSN_FORWARD";
    public static final String A_LEAD_RETURN = "DSN_LEAD_RETURN";
    public static final String A_FINAL = "DSN_FINAL";
    public static final String A_RETURN = "DSN_RETURN";

    // BID_PREP_ACT.TASK_CD — 팀 작업 표기 고정(S6-c 가 쓴다).
    public static final String TEAM_SALES = "TEAM_SALES";
    public static final String TEAM_IT = "TEAM_IT";
    public static final String TEAM_BUDGET = "TEAM_BUDGET";

    private static final String LEAD_SALES_ROLE = Teams.leadOf(Teams.DESIGNER_TEAM);   // 영업팀장

    private final TaskMapper tasks;
    private final DesignReviewMapper mapper;
    private final SysUserMapper users;
    private final BidAssignmentMapper assignments;
    private final PrepMapper prepMapper;
    private final NotificationCommandService notifications;
    private final PrepAudit audit;

    public DesignReviewService(TaskMapper tasks, DesignReviewMapper mapper, SysUserMapper users,
                               BidAssignmentMapper assignments, PrepMapper prepMapper,
                               NotificationCommandService notifications, PrepAudit audit) {
        this.tasks = tasks;
        this.mapper = mapper;
        this.users = users;
        this.assignments = assignments;
        this.prepMapper = prepMapper;
        this.notifications = notifications;
        this.audit = audit;
    }

    // ── 이름표·코드 ──────────────────────────────────────────────────────────

    /** TASKS.STATUS → phase_cd(응답 키). 화면 이름표는 디자인이 정한다. */
    public static String phaseOf(String status) {
        if (Teams.SUBMITTED_STATUS.equals(status)) {
            return "IN_REVIEW";
        }
        if (Teams.APPROVED_STATUS.equals(status)) {
            return "HEAD_REVIEW";
        }
        if (Teams.FINAL_STATUS.equals(status)) {
            return "FINALIZED";
        }
        return "DESIGNING";
    }

    /** BID_PREP_ACT.TASK_CD — 디자인 회차(회차 없으면 0). */
    public static String roundTaskCd(int roundNo) {
        return "DSN_R" + Math.max(roundNo, 0);
    }

    /** BID_PREP_ACT.TASK_CD — 팀 작업. 모르는 팀이면 null. */
    public static String teamTaskCd(String team) {
        if ("영업".equals(team)) {
            return TEAM_SALES;
        }
        if ("전산".equals(team)) {
            return TEAM_IT;
        }
        if ("예산".equals(team)) {
            return TEAM_BUDGET;
        }
        return null;
    }

    public static ApiException stateChanged() {
        return coded(409, "STATE_CHANGED", "작업 상태가 그 사이 바뀌었습니다. 새로 고친 뒤 다시 시도해 주세요.");
    }

    // ── 판정 도우미(컨트롤러·TaskController 가 쓴다) ───────────────────────────

    public boolean isDesignerTask(String taskId) {
        Task t = tasks.selectById(taskId);
        return t != null && Teams.DESIGNER_TEAM.equals(t.getTeam());
    }

    /** 예전 제출 경로({@code POST /tasks/{id}/submit})가 돌려주던 작업 행 — 디자인 흐름으로 위임한 뒤 같은 모양으로 응답하기 위해. */
    public Task taskOf(String taskId) {
        return tasks.selectById(taskId);
    }

    /** 결재 직전 TASKS 행 잠금(트랜잭션 첫 문장) — 없으면 null. {@code TaskCommandService.approve} 가 쓴다. */
    public String lockTask(String taskId) {
        return mapper.lockTask(taskId);
    }

    /**
     * 디자이너 작업의 쓰기(임시저장·파일 올리기·지우기)를 하는 사람 확인(security M2). 디자이너 역할 + 담당 본인(미배정이면 선점)만.
     * 통과하면 ASSIGNEE 에 쓰거나 비교할 문자열을 돌려준다 — 클라이언트가 보낸 by 는 쓰지 않는다. 실패는 403(고정 문구).
     */
    public String requireDesignerOwnerOf(SysUser me, String taskId) {
        Task t = tasks.selectById(taskId);
        if (t == null) {
            throw ApiException.notFound("task not found");
        }
        return requireDesignerOwner(me, t.getAssignee());
    }

    String requireDesignerOwner(SysUser me, String assignee) {
        if (!isDesigner(me)) {
            throw deniedOwner();
        }
        if (blank(assignee)) {
            return claimKey(me);
        }
        String a = assignee.trim();
        if (a.equals(me.getEmpNo())) {
            return assignee;
        }
        if (a.equals(trimOrNull(me.getName())) && activeDesignersNamed(a) == 1) {
            return assignee;   // 이름이 유일할 때만 본인(M5)
        }
        throw deniedOwner();
    }

    private boolean ownsDesignerTask(SysUser me, String assignee) {
        try {
            requireDesignerOwner(me, assignee);
            return true;
        } catch (ApiException e) {
            return false;
        }
    }

    /** 미배정 작업을 선점할 때 ASSIGNEE 에 쓸 값 — 이름이 유일하면 이름(designer.js 호환), 아니면 사번. */
    private String claimKey(SysUser me) {
        String name = trimOrNull(me.getName());
        return name != null && activeDesignersNamed(name) == 1 ? name : me.getEmpNo();
    }

    private int activeDesignersNamed(String name) {
        int n = 0;
        for (SysUser u : users.selectAll()) {
            if ("ACTIVE".equals(u.getStatus()) && isDesigner(u) && name.equals(trimOrNull(u.getName()))) {
                n++;
            }
        }
        return n;
    }

    /** 결재 액션 코드 — 디자이너 작업이 아니거나 없으면 null. 실패 감사용(컨트롤러). */
    public String approveAction(String taskId, boolean approved) {
        Task t = tasks.selectById(taskId);
        if (t == null || !Teams.DESIGNER_TEAM.equals(t.getTeam())) {
            return null;
        }
        if (Teams.APPROVED_STATUS.equals(t.getStatus())) {
            return approved ? A_FINAL : A_RETURN;
        }
        return approved ? A_FORWARD : A_LEAD_RETURN;
    }

    /**
     * 실패 시도를 BID_PREP_ACT 에 남긴다(컨트롤러가 서비스 트랜잭션 밖에서 부른다 — 서비스 실패와 무관하게 따로 커밋). 기록이 실패해도 원래 응답을 덮지 않는다.
     * 건 번호는 작업에서 읽고 없으면 bidCaseHint(형식을 이미 거른 값), 그것도 없으면 NONE. 본문·사유는 남기지 않는다.
     */
    public void auditFailure(Actor actor, BoardUiIds.Ui ui, String action, String outcome, String taskId, String bidCaseHint) {
        try {
            String bid = null;
            String state = "NONE";
            int round = 0;
            if (taskId != null) {
                Task t = tasks.selectById(taskId);
                if (t != null) {
                    bid = t.getBidCaseId();
                    state = phaseOf(t.getStatus());
                    round = mapper.selectMaxRound(taskId);
                }
            }
            if (bid == null) {
                bid = bidCaseHint != null ? bidCaseHint : "NONE";
            }
            audit.record(bid, action, outcome, state, roundTaskCd(round), actor, ui);
        } catch (RuntimeException e) {
            LOG.warn("디자인 검토 실패 감사를 남기지 못했다: action={} outcome={} cause={}", action, outcome, e.getClass().getSimpleName());
        }
    }

    // ── 준비된 건 · 작업 자리 열기 ────────────────────────────────────────────

    /** [디자인 작업 시작] 후보 — 세 팀이 모두 2차완료이고 디자이너 작업이 아직 없는 건. 디자이너·영업팀장·영업부장. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> ready(SysUser me) {
        String role = roleOf(me);
        if (!isDesigner(me) && !LEAD_SALES_ROLE.equals(role) && !Teams.FINAL_APPROVER.equals(role)) {
            throw deniedRole();
        }
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        for (DesignReadyCase c : mapper.selectReady(Teams.AUTHORING_TEAMS, Teams.AUTHORING_TEAMS.size(),
                Teams.APPROVED_STATUS, Teams.DESIGNER_TEAM)) {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("bid_case_id", c.getBidCaseId());
            m.put("institution_id", c.getInstitutionId());
            m.put("institution_name", c.getInstitutionName());
            out.add(m);
        }
        return out;
    }

    /**
     * 디자인 작업 자리 열기 — 세 팀이 모두 2차완료일 때 디자이너 작업(TASKS 행)을 만든다. 이미 있으면 created=false(동시 생성은 UK 중복을 잡는다).
     * 세 번째 팀 승인 때 자동으로 만들지 않는다(골든 23 뒤 작업이 4건이 되어 30_workflow_status 골든이 깨진다).
     */
    @Transactional
    public Map<String, Object> open(SysUser me, Actor actor, BoardUiIds.Ui ui, String bidCaseId) {
        if (!isDesigner(me)) {
            throw deniedRole();
        }
        if (assignments.countBidCase(bidCaseId) == 0) {
            throw ApiException.notFound("not found");
        }
        BidPrep prep = prepMapper.selectPrep(bidCaseId);
        if (prep != null && PrepService.CANCELLED.equals(prep.getStateCd())) {
            throw coded(409, "PREP_CANCELLED", "확정이 취소되거나 중단된 건이라 디자인 작업을 시작할 수 없습니다.");
        }
        String existing = tasks.selectTaskIdByTeam(bidCaseId, Teams.DESIGNER_TEAM);
        if (existing != null) {
            return opened(existing, false);
        }
        List<String> pending = pendingTeams(bidCaseId);
        if (!pending.isEmpty()) {
            throw teamsNotDone(pending);
        }
        String id = Ids.task();
        try {
            tasks.insert(id, bidCaseId, Teams.DESIGNER_TEAM);
        } catch (DuplicateKeyException e) {   // 동시에 다른 디자이너가 먼저 열었다(UK_TASKS_CASE_TEAM)
            String other = tasks.selectTaskIdByTeam(bidCaseId, Teams.DESIGNER_TEAM);
            if (other == null) {
                throw e;
            }
            return opened(other, false);
        }
        audit.record(bidCaseId, A_OPEN, "OK", "NONE", roundTaskCd(0), actor, ui);
        return opened(id, true);
    }

    private static Map<String, Object> opened(String taskId, boolean created) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("task_id", taskId);
        m.put("created", created);
        return m;
    }

    // ── 디자인 작업 완료 · 다시 수정 ──────────────────────────────────────────

    /**
     * [디자인 작업 완료] — 대기·작성중 → 1차완료, 회차 n 을 열고 받는 사람을 박제해 사람마다 쪽지 한 줄(사번 수신, sender '시스템')을 보낸다.
     * 영업팀장 역할 쪽지함에는 결재 신호('결재요청') 1건이 간다(결재함과 같은 뜻). 호출한 사람은 디자이너 본인(M2·M5).
     */
    @Transactional
    public Map<String, Object> complete(SysUser me, Actor actor, BoardUiIds.Ui ui, String taskId) {
        String status = lock(taskId);
        Task task = requireDesignerTask(taskId);
        String claim = requireDesignerOwner(me, task.getAssignee());
        if (!Teams.isWorking(status)) {
            throw stateChanged();
        }
        String bid = task.getBidCaseId();
        List<String> pending = pendingTeams(bid);
        if (!pending.isEmpty()) {
            throw teamsNotDone(pending);
        }
        TaskContext ctx = tasks.selectContext(taskId);
        if (ctx == null) {
            throw ApiException.notFound("task not found");
        }
        Recipients rec = recipients(bid, me);
        if (rec.byEmp.isEmpty()) {
            throw coded(409, "NO_REVIEWERS", "의견을 받을 담당자·팀장이 없어 완료할 수 없습니다. 담당자 배정을 확인해 주세요.");
        }
        if (tasks.updateStatusIf(taskId, status, Teams.SUBMITTED_STATUS) == 0) {
            throw stateChanged();
        }
        tasks.claimAssigneeIfUnset(taskId, claim);   // 이미 담당이 있으면 0행
        int n = mapper.selectMaxRound(taskId) + 1;
        if (n > NO_MAX) {
            throw coded(409, "TOO_MANY_ROUNDS", "회차가 너무 많습니다.");
        }
        mapper.insertRound(taskId, n, bid, me.getEmpNo(), verified(actor), Times.nowIso(), rec.byEmp.size());
        String text = ctx.getInstitutionName() + " 디자인 작업 완료(" + n + "차본) — 확인하고 의견을 남겨 주세요.";
        for (Map.Entry<String, String> e : rec.byEmp.entrySet()) {
            Notification note = notifications.create(e.getKey(), "쪽지", text, ctx.getInstitutionId(), taskId, null,
                    ctx.getStage(), NotificationCommandService.SYSTEM_SENDER);
            mapper.insertRecipient(taskId, n, e.getKey(), e.getValue(), note.getNotificationId());
        }
        notifications.create(LEAD_SALES_ROLE, "결재요청",
                ctx.getInstitutionName() + " " + Teams.DESIGNER_TEAM + " 작업물 제출 — 결재를 부탁드립니다.",
                ctx.getInstitutionId(), taskId, null, ctx.getStage(), NotificationCommandService.SYSTEM_SENDER);
        audit.record(bid, A_COMPLETE, "OK", phaseOf(status), roundTaskCd(n), actor, ui);
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("task_id", taskId);
        m.put("status", Teams.SUBMITTED_STATUS);
        m.put("round_no", n);
        m.put("recipients_count", rec.byEmp.size());
        m.put("unresolved_teams", new ArrayList<String>(rec.unresolved));
        return m;
    }

    /** [다시 수정] — 1차완료 → 작성중, 열린 회차를 닫는다(REVISE). 부장께 올라간(2차완료 이상) 뒤에는 409 ALREADY_FORWARDED. */
    @Transactional
    public Map<String, Object> revise(SysUser me, Actor actor, BoardUiIds.Ui ui, String taskId) {
        String status = lock(taskId);
        Task task = requireDesignerTask(taskId);
        requireDesignerOwner(me, task.getAssignee());
        if (!Teams.SUBMITTED_STATUS.equals(status)) {
            if (Teams.APPROVED_STATUS.equals(status) || Teams.FINAL_STATUS.equals(status)) {
                throw coded(409, "ALREADY_FORWARDED", "이미 영업부장께 올라간 작업이라 다시 수정할 수 없습니다.");
            }
            throw stateChanged();
        }
        if (tasks.updateStatusIf(taskId, status, "작성중") == 0) {
            throw stateChanged();
        }
        int n = mapper.selectMaxRound(taskId);
        Integer closed = null;
        if (n > 0 && mapper.closeRound(taskId, n, CLOSE_REVISE, me.getEmpNo(), Times.nowIso()) > 0) {
            closed = n;
        }
        audit.record(task.getBidCaseId(), A_REVISE, "OK", phaseOf(status), roundTaskCd(n), actor, ui);
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("status", "작성중");
        m.put("closed_round", closed);
        return m;
    }

    // ── 의견 · 확인함 ────────────────────────────────────────────────────────

    /**
     * 의견 남기기 — 그 회차 받는 사람(ACTIVE)만. 검사 순서: 입력(400·422) → 작업(404) → 회차 존재(409 ROUND_MISMATCH) → 받는 사람(403)
     * → 열림(409 ROUND_CLOSED) → 상한(409 TOO_MANY_COMMENTS). 열림·상한은 TASKS 행 잠금 아래에서 판정한다(M1).
     * 디자이너(그 회차를 연 사람)에게 사번으로 쪽지 1건 — 본문은 싣지 않는다(M3·M4).
     */
    @Transactional
    public Map<String, Object> comment(SysUser me, Actor actor, BoardUiIds.Ui ui, String taskId, Integer roundNo, String body) {
        int round = checkedRound(roundNo);
        String text = checkedText(body, MAX_BODY, "의견", "BAD_VALUE");
        String status = lock(taskId);
        Task task = requireDesignerTask(taskId);
        DesignRound r = mapper.selectRound(taskId, round);
        if (r == null) {
            throw coded(409, "ROUND_MISMATCH", "해당 회차가 없습니다. 새로 고친 뒤 다시 시도해 주세요.");
        }
        if (mapper.countRecipient(taskId, round, me.getEmpNo()) == 0) {
            throw deniedRole();
        }
        if (!r.isOpen() || !Teams.SUBMITTED_STATUS.equals(status)) {
            throw roundClosed();
        }
        int count = mapper.countComments(taskId, round, me.getEmpNo());
        if (count >= MAX_COMMENTS) {
            throw coded(409, "TOO_MANY_COMMENTS", "이 회차에 남길 수 있는 의견은 " + MAX_COMMENTS + "건까지입니다.");
        }
        int seq = count + 1;
        try {
            mapper.insertComment(taskId, round, me.getEmpNo(), seq, text, verified(actor), Times.nowIso());
        } catch (DuplicateKeyException e) {
            throw coded(409, "RETRY", "잠시 뒤 다시 시도해 주세요.");
        }
        TaskContext ctx = tasks.selectContext(taskId);
        if (ctx != null) {
            notifications.create(r.getOpenedBy(), "쪽지",
                    ctx.getInstitutionName() + " 디자인 작업(" + round + "차본)에 의견이 달렸습니다 — 검토 화면에서 확인해 주세요.",
                    ctx.getInstitutionId(), taskId, null, ctx.getStage(), NotificationCommandService.SYSTEM_SENDER);
        }
        audit.record(task.getBidCaseId(), A_COMMENT, "OK", phaseOf(status), roundTaskCd(round), actor, ui);
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("round_no", round);
        m.put("seq_no", seq);
        return m;
    }

    /** 확인함 — 그 회차 받는 사람이 '확인했다'를 남긴다. 이미 했으면 saved=false(감사 줄도 남기지 않는다). */
    @Transactional
    public Map<String, Object> ack(SysUser me, Actor actor, BoardUiIds.Ui ui, String taskId, Integer roundNo) {
        int round = checkedRound(roundNo);
        String status = lock(taskId);
        Task task = requireDesignerTask(taskId);
        DesignRound r = mapper.selectRound(taskId, round);
        if (r == null) {
            throw coded(409, "ROUND_MISMATCH", "해당 회차가 없습니다. 새로 고친 뒤 다시 시도해 주세요.");
        }
        if (mapper.countRecipient(taskId, round, me.getEmpNo()) == 0) {
            throw deniedRole();
        }
        if (!r.isOpen() || !Teams.SUBMITTED_STATUS.equals(status)) {
            throw roundClosed();
        }
        boolean saved = mapper.countAck(taskId, round, me.getEmpNo()) == 0;
        if (saved) {
            mapper.insertAck(taskId, round, me.getEmpNo(), verified(actor), Times.nowIso());
            audit.record(task.getBidCaseId(), A_ACK, "OK", phaseOf(status), roundTaskCd(round), actor, ui);
        }
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("saved", saved);
        return m;
    }

    // ── 검토 화면 ────────────────────────────────────────────────────────────

    /**
     * 검토 화면 재료. 열람: 담당 디자이너(미배정이면 디자이너 역할)·어느 회차든 받는 사람·영업팀장·영업부장. 그 밖은 403.
     * 성공 열람은 응답 전에 DSN_VIEW 로 남긴다(실패하면 500, 데이터 안 나감). 응답에 사번을 싣지 않는다(is_me 만 — security L6).
     */
    @Transactional
    public Map<String, Object> view(SysUser me, Actor actor, BoardUiIds.Ui ui, String taskId) {
        Task task = requireDesignerTask(taskId);
        String role = roleOf(me);
        boolean designerOwner = isDesigner(me) && ownsDesignerTask(me, task.getAssignee());
        boolean lead = LEAD_SALES_ROLE.equals(role);
        boolean head = Teams.FINAL_APPROVER.equals(role);
        if (!designerOwner && !lead && !head && mapper.countRecipientAny(taskId, me.getEmpNo()) == 0) {
            throw deniedRole();
        }
        String status = task.getStatus();
        List<DesignRound> rounds = mapper.selectRounds(taskId);
        List<DesignRecipient> recips = mapper.selectRecipients(taskId);
        List<DesignComment> comments = mapper.selectComments(taskId);
        int current = rounds.isEmpty() ? 0 : rounds.get(rounds.size() - 1).getRoundNo();
        boolean roundOpen = current > 0 && rounds.get(rounds.size() - 1).isOpen()
                && Teams.SUBMITTED_STATUS.equals(status);
        boolean myCurrent = false;
        boolean acked = false;
        int myComments = 0;
        for (DesignRecipient p : recips) {
            if (p.getRoundNo() == current && me.getEmpNo().equals(p.getEmpNo())) {
                myCurrent = true;
                acked = p.getAckedAt() != null;
                myComments = p.getCommentCount();
            }
        }
        boolean selfAssigned = !blank(task.getAssignee())
                && (task.getAssignee().trim().equals(me.getEmpNo()) || task.getAssignee().trim().equals(trimOrNull(me.getName())));

        Map<String, Object> viewer = new LinkedHashMap<String, Object>();
        viewer.put("can_complete", designerOwner && Teams.isWorking(status) && pendingTeams(task.getBidCaseId()).isEmpty());
        viewer.put("can_revise", designerOwner && Teams.SUBMITTED_STATUS.equals(status));
        viewer.put("can_comment", roundOpen && myCurrent && myComments < MAX_COMMENTS);
        viewer.put("can_ack", roundOpen && myCurrent && !acked);
        viewer.put("can_forward", lead && Teams.SUBMITTED_STATUS.equals(status) && !selfAssigned);
        viewer.put("can_finalize", head && Teams.APPROVED_STATUS.equals(status) && !selfAssigned);
        viewer.put("can_return", head && Teams.APPROVED_STATUS.equals(status) && !selfAssigned);

        List<Map<String, Object>> roundOut = new ArrayList<Map<String, Object>>();
        for (DesignRound r : rounds) {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("round_no", r.getRoundNo());
            m.put("opened_at", r.getOpenedAt());
            m.put("opened_by_name", r.getOpenedByName());
            m.put("closed_at", r.getClosedAt());
            m.put("close_cd", r.getCloseCd());
            List<Map<String, Object>> rs = new ArrayList<Map<String, Object>>();
            for (DesignRecipient p : recips) {
                if (p.getRoundNo() != r.getRoundNo()) {
                    continue;
                }
                Map<String, Object> pm = new LinkedHashMap<String, Object>();
                pm.put("name", p.getName());
                pm.put("reason_cd", p.getReasonCd());
                pm.put("response_cd", p.getCommentCount() > 0 ? "COMMENTED" : p.getAckedAt() != null ? "ACKED" : "NONE");
                pm.put("acked_at", p.getAckedAt());
                pm.put("is_me", me.getEmpNo().equals(p.getEmpNo()));
                rs.add(pm);
            }
            m.put("recipients", rs);
            List<Map<String, Object>> cs = new ArrayList<Map<String, Object>>();
            for (DesignComment c : comments) {
                if (c.getRoundNo() != r.getRoundNo()) {
                    continue;
                }
                Map<String, Object> cm = new LinkedHashMap<String, Object>();
                cm.put("name", c.getName());
                cm.put("seq_no", c.getSeqNo());
                cm.put("body", c.getBody());
                cm.put("created_at", c.getCreatedAt());
                cm.put("is_me", me.getEmpNo().equals(c.getEmpNo()));
                cs.add(cm);
            }
            m.put("comments", cs);
            roundOut.add(m);
        }
        TaskContext ctx = tasks.selectContext(taskId);
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("task_id", taskId);
        out.put("bid_case_id", task.getBidCaseId());
        out.put("institution_name", ctx == null ? null : ctx.getInstitutionName());
        out.put("status", status);
        out.put("phase_cd", phaseOf(status));
        out.put("current_round", current);
        out.put("round_open", roundOpen);
        out.put("viewer", viewer);
        out.put("rounds", roundOut);
        audit.record(task.getBidCaseId(), A_VIEW, "OK", phaseOf(status), roundTaskCd(current), actor, ui);
        return out;
    }

    // ── 결재 훅(TaskCommandService.approve 트랜잭션 안) ─────────────────────────

    /**
     * 디자이너 작업 결재가 성공한 직후 호출 — 같은 트랜잭션이다(approve 가 TASKS 행을 먼저 잠갔다, security M1).
     * 1차 단계: 열린 회차를 닫고(승인=FORWARD, 반려=LEAD_RETURN) 감사. 최종 단계: 승인=DSN_FINAL(회차는 이미 닫혀 있다), 돌려보내기=DSN_RETURN.
     * 반려·돌려보내기는 디자이너에게 사유 쪽지(사번 수신, sender '시스템'). 회차 행이 없는 옛 작업은 회차 닫기만 건너뛴다.
     *
     * @param before 결재 전 작업 행(상태는 결재 직전 값)
     * @param reason 반려·돌려보내기 사유(없을 수 있다 — 최종 단계 돌려보내기는 호출 전에 필수로 검사한다)
     */
    public void onApprove(Task before, TaskContext ctx, boolean finalStage, boolean approved, String reason,
                          SysUser approver, Actor actor, BoardUiIds.Ui ui) {
        String taskId = before.getTaskId();
        int n = mapper.selectMaxRound(taskId);
        String action;
        if (!finalStage) {
            action = approved ? A_FORWARD : A_LEAD_RETURN;
            if (n > 0) {
                mapper.closeRound(taskId, n, approved ? CLOSE_FORWARD : CLOSE_LEAD_RETURN, approver.getEmpNo(), Times.nowIso());
            }
        } else {
            action = approved ? A_FINAL : A_RETURN;
        }
        if (!approved) {
            String to = designerEmpOf(taskId, n, before.getAssignee());
            if (to != null) {
                String why = blank(reason) ? "(사유 없음)" : reason;
                String who = finalStage ? "영업부장이 돌려보냈습니다" : "영업팀장이 반려했습니다";
                notifications.create(to, "쪽지",
                        ctx.getInstitutionName() + " 디자인 작업을 " + who + " — " + why,
                        ctx.getInstitutionId(), taskId, null, ctx.getStage(), NotificationCommandService.SYSTEM_SENDER);
            }
        }
        audit.record(before.getBidCaseId(), action, "OK", phaseOf(before.getStatus()), roundTaskCd(n), actor, ui);
    }

    /** 디자이너 최종 단계 돌려보내기 사유 — 필수(400 REASON_REQUIRED), 500자, 제어·서식 문자 400, 개인정보 의심 422. */
    public String requireReturnReason(String raw) {
        return checkedText(raw, MAX_REASON, "사유", "REASON_REQUIRED");
    }

    /** 영업팀장 1차 반려 사유(security N3) — 비어 있으면 허용(null), 있으면 {@link #requireReturnReason} 과 같은 검사(500자·제어문자 400·개인정보 의심 422). */
    public String optionalReturnReason(String raw) {
        return blank(raw) ? null : checkedText(raw, MAX_REASON, "사유", "REASON_REQUIRED");
    }

    /** 디자이너 앞 쪽지의 사번 — 그 회차를 연 사람, 회차가 없는 옛 작업은 담당 문자열이 ACTIVE 디자이너 한 명으로 정해질 때만. 못 정하면 null(쪽지 생략, 이름으로 보내지 않는다). */
    private String designerEmpOf(String taskId, int round, String assignee) {
        if (round > 0) {
            DesignRound r = mapper.selectRound(taskId, round);
            if (r != null && r.getOpenedBy() != null) {
                return r.getOpenedBy();
            }
        }
        String a = trimOrNull(assignee);
        if (a == null) {
            return null;
        }
        if (MenuPerms.isEmpNo(a)) {
            SysUser u = users.selectByEmpNo(a);
            return u != null && "ACTIVE".equals(u.getStatus()) && isDesigner(u) ? u.getEmpNo() : null;
        }
        String found = null;
        int count = 0;
        for (SysUser u : users.selectAll()) {
            if ("ACTIVE".equals(u.getStatus()) && isDesigner(u) && a.equals(trimOrNull(u.getName()))) {
                found = u.getEmpNo();
                count++;
            }
        }
        return count == 1 ? found : null;
    }

    // ── 받는 사람 계산 ───────────────────────────────────────────────────────

    private static final class Recipients {
        final Map<String, String> byEmp = new LinkedHashMap<String, String>();   // 사번 → 사유(먼저 들어온 사유가 남는다)
        final Set<String> unresolved = new LinkedHashSet<String>();              // 사람으로 못 바꾼 팀(팀 이름만)
    }

    /**
     * 받는 사람 = ① 그 건의 활성 영업 담당자(BID_ASSIGN) ② 그 건 TASKS 의 영업·전산·예산 담당(사번이면 그 사용자, 이름이면 그 팀 ACTIVE 중 이름이 정확히 1명일 때만)
     * ③ 활성 영업·전산·예산 팀장 전원. 제외: 비ACTIVE, 호출한 디자이너 본인, 영업부장.
     */
    private Recipients recipients(String bidCaseId, SysUser me) {
        List<SysUser> all = users.selectAll();
        Map<String, SysUser> byEmp = new HashMap<String, SysUser>();
        for (SysUser u : all) {
            byEmp.put(u.getEmpNo(), u);
        }
        Recipients r = new Recipients();
        for (BidAssigneeView v : assignments.selectActiveAssignees(bidCaseId)) {
            addRecipient(r, byEmp.get(v.getEmpNo()), "ASSIGNEE_SALES", me);
        }
        for (TaskSummary s : tasks.selectSummaries(bidCaseId)) {
            String reason = assigneeReason(s.getTeam());
            String a = trimOrNull(s.getAssignee());
            if (reason == null || a == null) {
                continue;
            }
            SysUser u = null;
            if (MenuPerms.isEmpNo(a)) {
                u = byEmp.get(a);
                if (u != null && !"ACTIVE".equals(u.getStatus())) {
                    u = null;
                }
            } else {
                int count = 0;
                for (SysUser c : all) {
                    if ("ACTIVE".equals(c.getStatus()) && s.getTeam().equals(Teams.teamOf(c.getRole()))
                            && a.equals(trimOrNull(c.getName()))) {
                        u = c;
                        count++;
                    }
                }
                if (count != 1) {
                    u = null;
                }
            }
            if (u == null) {
                r.unresolved.add(s.getTeam());
            } else {
                addRecipient(r, u, reason, me);
            }
        }
        for (SysUser u : all) {
            if (Teams.LEAD_ROLES.contains(roleOf(u))) {
                addRecipient(r, u, "LEAD", me);
            }
        }
        return r;
    }

    private static void addRecipient(Recipients r, SysUser u, String reason, SysUser me) {
        if (u == null || !"ACTIVE".equals(u.getStatus()) || u.getEmpNo().equals(me.getEmpNo())
                || Teams.FINAL_APPROVER.equals(roleOf(u)) || r.byEmp.containsKey(u.getEmpNo())) {
            return;
        }
        r.byEmp.put(u.getEmpNo(), reason);
    }

    private static String assigneeReason(String team) {
        if ("영업".equals(team)) {
            return "ASSIGNEE_SALES";
        }
        if ("전산".equals(team)) {
            return "ASSIGNEE_IT";
        }
        if ("예산".equals(team)) {
            return "ASSIGNEE_BUDGET";
        }
        return null;
    }

    /** 아직 2차완료가 아닌 팀(없는 팀도 포함) — 팀 이름만. */
    private List<String> pendingTeams(String bidCaseId) {
        Map<String, String> st = new HashMap<String, String>();
        for (TaskSummary s : tasks.selectSummaries(bidCaseId)) {
            st.put(s.getTeam(), s.getStatus());
        }
        List<String> pending = new ArrayList<String>();
        for (String team : Teams.AUTHORING_TEAMS) {
            if (!Teams.APPROVED_STATUS.equals(st.get(team))) {
                pending.add(team);
            }
        }
        return pending;
    }

    // ── 공통 ────────────────────────────────────────────────────────────────

    /** 트랜잭션 첫 문장 — TASKS 행 FOR UPDATE. 작업이 없으면 404. */
    private String lock(String taskId) {
        String status = mapper.lockTask(taskId);
        if (status == null) {
            throw ApiException.notFound("task not found");
        }
        return status;
    }

    private Task requireDesignerTask(String taskId) {
        Task t = tasks.selectById(taskId);
        if (t == null || !Teams.DESIGNER_TEAM.equals(t.getTeam())) {
            throw ApiException.notFound("task not found");
        }
        return t;
    }

    private static int verified(Actor actor) {
        return actor != null && actor.isVerified() ? 1 : 0;
    }

    private static boolean isDesigner(SysUser u) {
        return Teams.DESIGNER_TEAM.equals(roleOf(u));
    }

    private static String roleOf(SysUser u) {
        return u.getRole() == null ? "" : u.getRole().trim();
    }

    private static boolean blank(String s) {
        return s == null || s.trim().isEmpty();
    }

    private static String trimOrNull(String s) {
        return blank(s) ? null : s.trim();
    }

    private static int checkedRound(Integer v) {
        if (v == null || v.intValue() < 1 || v.intValue() > NO_MAX) {
            throw coded(400, "BAD_VALUE", "회차 번호(round_no)가 올바르지 않습니다.");
        }
        return v.intValue();
    }

    /** 의견·사유 공통 검사. 비었으면 emptyCode(400), 길이 초과·제어/서식 문자 400, 개인정보 의심 422(종류만, 값은 싣지 않는다). */
    private static String checkedText(String raw, int max, String label, String emptyCode) {
        String t = raw == null ? "" : raw.trim();
        if (t.isEmpty()) {
            throw coded(400, emptyCode, label + "을(를) 입력해 주세요.");
        }
        if (t.length() > max) {
            throw coded(400, "BAD_VALUE", label + "은(는) " + max + "자 이하로 입력해 주세요.");
        }
        for (int i = 0; i < t.length(); i++) {
            char c = t.charAt(i);
            int type = Character.getType(c);
            if ((type == Character.CONTROL && c != '\n' && c != '\r' && c != '\t') || type == Character.FORMAT) {
                throw coded(400, "BAD_VALUE", label + "에 쓸 수 없는 문자가 있습니다.");
            }
        }
        List<Pii.Finding> found = Pii.scanLoose(t);
        if (!found.isEmpty()) {
            Map<String, Integer> kinds = new LinkedHashMap<String, Integer>();
            for (Pii.Finding f : found) {
                Integer old = kinds.get(f.getKind());
                kinds.put(f.getKind(), old == null ? 1 : old + 1);
            }
            List<Map<String, Object>> ks = new ArrayList<Map<String, Object>>();
            for (Map.Entry<String, Integer> e : kinds.entrySet()) {
                Map<String, Object> k = new LinkedHashMap<String, Object>();
                k.put("kind", e.getKey());
                k.put("count", e.getValue());
                ks.add(k);
            }
            Map<String, Object> d = new LinkedHashMap<String, Object>();
            d.put("code", "PII_DETECTED");
            d.put("message", "개인정보로 보이는 값이 있어 저장하지 않았습니다. 해당 부분을 지우고 다시 입력해 주세요.");
            d.put("kinds", ks);
            throw ApiException.withDetail(422, d);
        }
        return t;
    }

    private static ApiException teamsNotDone(List<String> pending) {
        return coded(409, "TEAMS_NOT_DONE", "아직 승인되지 않은 팀이 있습니다: " + String.join(", ", pending)
                + " — 각 팀장 결재가 끝난 뒤에 진행할 수 있습니다.");
    }

    private static ApiException roundClosed() {
        return coded(409, "ROUND_CLOSED", "이미 닫힌 회차입니다. 새로 고친 뒤 다시 확인해 주세요.");
    }

    private static ApiException deniedRole() {
        return new ApiException(403, "이 기능을 쓸 권한이 없습니다.");
    }

    private static ApiException deniedOwner() {
        return new ApiException(403, "이 작업을 처리할 수 있는 담당자가 아닙니다.");
    }

    static ApiException coded(int status, String code, String message) {
        Map<String, Object> d = new LinkedHashMap<String, Object>();
        d.put("code", code);
        d.put("message", message);
        return ApiException.withDetail(status, d);
    }
}
