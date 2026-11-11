package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.domain.ApprovalRequest;
import com.kbstar.kgi.ggreport.web.domain.BidAssigneeView;
import com.kbstar.kgi.ggreport.web.domain.BidCase;
import com.kbstar.kgi.ggreport.web.domain.BidPrep;
import com.kbstar.kgi.ggreport.web.domain.BidPrepAttach;
import com.kbstar.kgi.ggreport.web.domain.BidPrepLogView;
import com.kbstar.kgi.ggreport.web.domain.BidPrepTask;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.PrepIn;
import com.kbstar.kgi.ggreport.web.mapper.ApprovalRequestMapper;
import com.kbstar.kgi.ggreport.web.mapper.BidAssignmentMapper;
import com.kbstar.kgi.ggreport.web.mapper.BidCaseMapper;
import com.kbstar.kgi.ggreport.web.mapper.PrepMapper;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 제안서 사전준비(NEXT 70, 024) — 제안 확정 → 개설 신청·승인 → 과제 체크 → 기획승인 → 작성하기.
 *
 * <p>상태 7개: CONFIRMED(확정됨) · OPEN_PENDING(개설 대기) · IN_PROGRESS(진행) · APPROVAL_PENDING(기획승인 중) ·
 * WRITABLE(작성 가능) · WRITING(작성 중) · CANCELLED(확정 취소·중단). '기획승인 가능'은 저장하지 않고 필수 과제 완료로 파생한다.
 * 상태 전이는 전부 조건부 UPDATE 이고 0행이면 409 {@code STATE_CHANGED} 다. 신원은 컨트롤러가 {@code MenuGuard.requireActiveUser} 로 정한다.
 *
 * <p>개설 대기 동안 지명자는 결재 payload 에만 있다 — BID_ASSIGNMENT 는 개설 승인 때 처음 쓴다(지명자는 승인 전 권한 없음, security A4).
 * 담당자 판정은 {@link BidAssignmentService#isActiveAssignee} 하나다. 상세·이력은 담당자·영업부장(과 CONFIRMED 의 영업팀 전원, OPEN_PENDING 의 신청자,
 * 개설 전 CANCELLED 의 확정자·영업팀장, 개설 뒤 중단 건의 영업팀장·옛 담당자 — 읽기 전용)에게만 보이고 나머지는 존재하지 않는 건과 같은 404 다. 쓰기(체크 등)의 비담당은 403 이다.
 *
 * <p>⚠️ 사번은 X-Emp-No 자기신고일 수 있다 — 이 역할 검사는 업무 규칙(실수 방지)이지 사칭 방지가 아니다. 이력의 {@code emp_verified} 는 사실만 적는다.
 * 오류 문구에 사번·이름·값을 싣지 않는다.
 */
@Service
public class PrepService {

    public static final String CONFIRMED = "CONFIRMED";
    public static final String OPEN_PENDING = "OPEN_PENDING";
    public static final String IN_PROGRESS = "IN_PROGRESS";
    public static final String APPROVAL_PENDING = "APPROVAL_PENDING";
    public static final String WRITABLE = "WRITABLE";
    public static final String WRITING = "WRITING";
    public static final String CANCELLED = "CANCELLED";

    /** 과제 행이 있고 담당자가 체크할 수 있는 상태. */
    static final Set<String> TASK_STATES = Collections.unmodifiableSet(new HashSet<String>(
            Arrays.asList(IN_PROGRESS, APPROVAL_PENDING, WRITABLE, WRITING)));

    private static final String ABORT_RELEASE_REASON = "중단으로 담당 해제";
    private static final String CODE_PATTERN = "[A-Z0-9_]{1,20}";   // 과제 코드 형식 — BID_PREP_ACT.TASK_CD(20) 길이와 맞춘다

    private static final String JUDGE_MANUAL = "MANUAL";
    private static final String KIND_REQUIRED = "REQUIRED";
    private static final String KIND_CONDITIONAL = "CONDITIONAL";

    private static final Map<String, String> STATE_NAMES = stateNames();

    private static Map<String, String> stateNames() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put(CONFIRMED, "확정됨");
        m.put(OPEN_PENDING, "개설 대기");
        m.put(IN_PROGRESS, "사전준비 중");
        m.put(APPROVAL_PENDING, "기획승인 중");
        m.put(WRITABLE, "작성 가능");
        m.put(WRITING, "작성 중");
        m.put(CANCELLED, "확정 취소");
        return Collections.unmodifiableMap(m);
    }

    private static final ObjectMapper JSON = new ObjectMapper();

    private final PrepMapper mapper;
    private final BidAssignmentService assignments;
    private final BidAssignmentMapper assignMapper;
    private final SysUserMapper users;
    private final ApprovalRequestMapper requests;
    private final BidCaseMapper bidCases;
    private final BidCaseCommandService commands;

    public PrepService(PrepMapper mapper, BidAssignmentService assignments, BidAssignmentMapper assignMapper,
                       SysUserMapper users, ApprovalRequestMapper requests, BidCaseMapper bidCases,
                       BidCaseCommandService commands) {
        this.mapper = mapper;
        this.assignments = assignments;
        this.assignMapper = assignMapper;
        this.users = users;
        this.requests = requests;
        this.bidCases = bidCases;
        this.commands = commands;
    }

    // ── 목록·상세·이력 ────────────────────────────────────────────────────

    /** 목록(1) — 영업팀·영업팀장·영업부장. 기관명·상태·진척 n/m·담당자 이름만(과제별 내용·체크한 사람·사유는 주지 않는다). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(SysUser me) {
        if (!isSales(me) && !isHead(me)) {
            throw new ApiException(403, "이 기능을 쓸 권한이 없습니다.");
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (BidPrep p : mapper.selectList()) {
            Eval ev = evaluate(p, mapper.selectTasks(p.getBidCaseId()));
            List<String> names = new ArrayList<>();
            for (BidAssigneeView v : assignMapper.selectActiveAssignees(p.getBidCaseId())) {
                names.add(v.getName());
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("bid_case_id", p.getBidCaseId());
            m.put("institution_id", p.getInstitutionId());
            m.put("institution_name", p.getInstitutionName());
            m.put("state_cd", p.getStateCd());
            m.put("state_name", stateName(p));
            m.put("progress", progress(ev));
            m.put("assignee_names", names);
            m.put("can_view", canSee(me, p));   // false 면 상세가 404 — 화면이 행을 눌러도 열리지 않는 표시를 한다
            String due = p.getContractEnd();
            m.put("bid_expected_date", due == null || due.trim().isEmpty() ? null : due.trim());   // 기관의 입찰예상일(정렬용)
            out.add(m);
        }
        return out;
    }

    /** 상세(6) — 담당자·영업부장(과 CONFIRMED·CANCELLED 의 확정자·영업팀장). 그 밖은 404(건이 없는 것과 같은 응답). 읽을 때 사실 판정을 다시 맞춘다. */
    @Transactional
    public Map<String, Object> detail(SysUser me, String bidCaseId) {
        BidPrep p = visible(me, bidCaseId);
        List<BidPrepTask> tasks = mapper.selectTasks(bidCaseId);
        if (TASK_STATES.contains(p.getStateCd())) {
            tasks = syncFacts(p, tasks);
        }
        return view(me, p, tasks);
    }

    /** 이력(16) — 상세와 같은 열람 규칙. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> history(SysUser me, String bidCaseId) {
        visible(me, bidCaseId);
        List<Map<String, Object>> out = new ArrayList<>();
        for (BidPrepLogView l : mapper.selectLog(bidCaseId)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("event_cd", l.getEventCd());
            m.put("event_name", l.getEventName());
            m.put("from_state", l.getFromState());
            m.put("to_state", l.getToState());
            m.put("task_cd", l.getTaskCd());
            m.put("req_id", l.getReqId());
            boolean pastOpen = "OPEN_REJECT".equals(l.getEventCd()) || "OPEN_WITHDRAW".equals(l.getEventCd());
            // 반려·회수 사유는 신청자·영업팀장·영업부장에게만(사용자 결정 2026-11-11) — 가리는 것은 응답뿐, BID_PREP_LOG 원본은 그대로
            m.put("reason", pastOpen && !canSeePastOpen(me, l.getReqId()) ? null : l.getReason());
            m.put("actor_emp_no", l.getActorEmpNo());
            m.put("actor_name", l.getActorName());
            m.put("emp_verified", l.getEmpVerified() == 1);   // false = 자기신고(위조 가능)
            m.put("logged_at", l.getLoggedAt());
            out.add(m);
        }
        return out;
    }

    // ── 제안 확정·취소·중단 ───────────────────────────────────────────────

    /** 제안 확정(2) — 영업팀·영업팀장. 기관당 활성 건 1개(기관 행 FOR UPDATE 잠금 + 존재 확인). 건이 없으면 새로 만든다. */
    @Transactional
    public Map<String, Object> confirm(SysUser me, Actor actor, PrepIn.Confirm in) {
        requireSales(me);
        String inst = in == null || in.getInstitutionId() == null ? "" : in.getInstitutionId().trim();
        if (inst.isEmpty() || inst.length() > 64) {
            throw new ApiException(400, "기관을 선택하세요.");
        }
        if (mapper.lockInstitution(inst) == null) {
            throw ApiException.notFound("institution not found");
        }
        if (mapper.countActiveByInstitution(inst) > 0) {
            throw alreadyActive();
        }
        // ⚠️ 순서 주의: 기관 행 잠금(위) 뒤에 활성 건 수를 센다 — 이 위쪽에 다른 SELECT 를 끼우지 않는다(MySQL RR 첫 일관 읽기, qa P3-8).
        String bid = in.getBidCaseId() == null ? "" : in.getBidCaseId().trim();
        String now = Times.nowIso();
        boolean revived = false;
        if (!bid.isEmpty()) {
            BidCase bc = bid.length() > 64 ? null : bidCases.selectById(bid);
            if (bc == null || !inst.equals(bc.getInstitutionId())) {
                throw ApiException.notFound("bid case not found");
            }
            BidPrep old = mapper.selectPrep(bid);
            if (old != null) {
                if (!CANCELLED.equals(old.getStateCd())) {
                    throw coded(409, "PREP_ALREADY_ACTIVE", "이 입찰 건은 이미 제안 확정이 되어 있습니다.");
                }
                if (old.getOpenedAt() != null) {   // 개설 뒤 중단된 건 — 새 건으로만 다시 확정한다(사용자 결정 2026-11-11)
                    throw coded(409, "PREP_ABORTED", "중단된 건은 다시 확정할 수 없습니다. 기관만 지정해 새 건으로 확정하세요.");
                }
                requireNoAssignHead(bid);
                reviveCase(bid, me, actor, now);
                revived = true;
            } else {
                requireNoAssignHead(bid);
            }
        } else {
            String back = findRevivable(inst);   // 개설 전 확정 취소 건이 있으면 같은 건을 되살린다
            if (back != null) {
                bid = back;
                reviveCase(bid, me, actor, now);
                revived = true;
            } else {
                bid = commands.create(inst).getBidCaseId();
            }
        }
        if (!revived) {
            try {
                mapper.insertPrep(bid, inst, CONFIRMED, me.getEmpNo(), now);
            } catch (DuplicateKeyException e) {
                throw alreadyActive();
            }
            log(bid, "CONFIRM", null, CONFIRMED, null, null, null, me, actor);
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("bid_case_id", bid);
        m.put("state_cd", CONFIRMED);
        m.put("revived", revived);
        return m;
    }

    /** F8 — 옛 직접 배정의 머리 행이 있는 건은 확정할 수 없다(개설 승인이 영구 409 가 된다). */
    private void requireNoAssignHead(String bid) {
        if (assignMapper.selectCase(bid) != null) {
            throw coded(409, "ASSIGNED_ALREADY", "이미 담당자 배정 이력이 있는 입찰 건이라 제안 확정으로 진행할 수 없습니다.");
        }
    }

    /** 그 기관의 개설 전 확정 취소 건 중 배정 이력이 없는 가장 최근 건. 없으면 null. */
    private String findRevivable(String inst) {
        for (String c : mapper.selectRevivable(inst)) {
            if (assignMapper.selectCase(c) == null) {
                return c;
            }
        }
        return null;
    }

    /** CANCELLED(개설 전) → CONFIRMED. 같은 BID_CASE 를 되살리고 이력(CONFIRM, CANCELLED→CONFIRMED)을 남긴다. */
    private void reviveCase(String bid, SysUser me, Actor actor, String now) {
        if (mapper.revive(bid, me.getEmpNo(), now) != 1) {
            throw alreadyActive();
        }
        log(bid, "CONFIRM", CANCELLED, CONFIRMED, null, null, null, me, actor);
    }

    /** 확정 취소(3) — 확정한 사람 또는 영업팀장, CONFIRMED 에서만. 개설 대기면 409 OPEN_PENDING(먼저 회수). 사유 1~200자. */
    @Transactional
    public Map<String, Object> unconfirm(SysUser me, Actor actor, String bidCaseId, PrepIn.Reason in) {
        requireSales(me);
        BidPrep p = require(bidCaseId);
        if (OPEN_PENDING.equals(p.getStateCd())) {
            throw coded(409, "OPEN_PENDING", "개설 신청이 진행 중입니다. 먼저 신청을 회수하세요.");
        }
        if (!CONFIRMED.equals(p.getStateCd())) {
            throw stateChanged();
        }
        if (!me.getEmpNo().equals(p.getConfirmedBy()) && !isLead(me)) {
            throw new ApiException(403, "확정한 사람 또는 영업팀장만 확정을 취소할 수 있습니다.");
        }
        String reason = BoardMaterialService.checkedText(in == null ? null : in.getReason(), 200, "사유", true);
        requireTransit(mapper.transit(bidCaseId, CONFIRMED, CANCELLED, me.getEmpNo(), Times.nowIso()));
        log(bidCaseId, "UNCONFIRM", CONFIRMED, CANCELLED, null, null, reason, me, actor);
        return stateOut(bidCaseId, CANCELLED);
    }

    /**
     * 중단(미참여) — 개설 뒤(IN_PROGRESS·WRITABLE·WRITING) 영업팀장만, 사유 필수, 결재 없음(사용자 결정 2026-11-10). 기획승인 중이면 409 PLAN_PENDING.
     * 활성 담당 배정은 전부 해제한다(ACTIVE_YN=0, RELEASED_BY/AT, 배정 이력 RELEASE 행 — 쓰기 권한 회수, 사용자 결정 2026-11-11). 행은 지우지 않는다.
     * 대기 중이던 담당자 변경 신청은 GROUP_VER 증가로 무효가 된다(승인하면 409 GROUP_VER_CHANGED). 과제 행·작업(TASKS)은 그대로 둔다(기록 보존).
     * TODO: 작성 중(WRITING)에 만든 세 팀 작업·이사회 제출 대기 신청의 정리는 후속.
     */
    @Transactional
    public Map<String, Object> abort(SysUser me, Actor actor, String bidCaseId, PrepIn.Reason in) {
        if (!isLead(me)) {
            throw new ApiException(403, "중단은 영업팀장만 할 수 있습니다.");
        }
        BidPrep p = require(bidCaseId);
        if (APPROVAL_PENDING.equals(p.getStateCd())) {
            throw coded(409, "PLAN_PENDING", "기획승인 요청이 진행 중입니다. 먼저 회수하거나 반려된 뒤 중단하세요.");
        }
        if (!IN_PROGRESS.equals(p.getStateCd()) && !WRITABLE.equals(p.getStateCd()) && !WRITING.equals(p.getStateCd())) {
            throw stateChanged();
        }
        String reason = BoardMaterialService.checkedText(in == null ? null : in.getReason(), 200, "사유", true);
        String now = Times.nowIso();
        requireTransit(mapper.transit(bidCaseId, p.getStateCd(), CANCELLED, me.getEmpNo(), now));
        log(bidCaseId, "CANCEL", p.getStateCd(), CANCELLED, null, null, reason, me, actor);
        int verified = BoardMaterialService.verified(actor);
        // N1(security 11-11): 해제는 조건부 UPDATE 한 문장이다(읽은 뒤 사람별로 풀지 않는다 — 동시 담당자 추가를 놓치지 않게). 이력은 그 문장이
        // 방금 해제한 행(RELEASED_BY·RELEASED_AT 이 이번 것)을 같은 트랜잭션에서 다시 읽어 남긴다. 위 상태 전이가 BID_PREP 행을 잠가 두었으므로
        // 동시 담당자 변경 승인(applyChange)은 이 뒤 PREP_CANCELLED 409 로 끝난다.
        if (assignMapper.updateReleaseAll(bidCaseId, me.getEmpNo(), now) > 0) {
            for (BidAssigneeView v : assignMapper.selectReleasedAt(bidCaseId, me.getEmpNo(), now)) {
                assignMapper.insertLog(bidCaseId, BidAssignmentService.ACTION_RELEASE, v.getEmpNo(), null,
                        ABORT_RELEASE_REASON, me.getEmpNo(), verified, now);
            }
        }
        mapper.bumpAssignVersion(bidCaseId, me.getEmpNo(), now);
        return stateOut(bidCaseId, CANCELLED);
    }

    // ── 개설 신청·승인(BID_OPEN) ─────────────────────────────────────────

    /** 검증을 통과한 개설 신청 계획 — 결재자까지 서버가 정한다. */
    public static final class OpenPlan {
        private final String bidCaseId;
        private final String institutionName;
        private final List<String> nominees;
        private final String comment;
        private final SysUser approver;

        OpenPlan(String bidCaseId, String institutionName, List<String> nominees, String comment, SysUser approver) {
            this.bidCaseId = bidCaseId;
            this.institutionName = institutionName;
            this.nominees = nominees;
            this.comment = comment;
            this.approver = approver;
        }

        public String getBidCaseId() { return bidCaseId; }
        public String getInstitutionName() { return institutionName; }
        public List<String> getNominees() { return nominees; }
        public String getComment() { return comment; }
        public SysUser getApprover() { return approver; }
    }

    /**
     * 개설 신청 검증 + 결재자 계산(쓰기 없음). 순서: 자격(403, 영업팀·영업팀장) → 건(404) → 상태(409 OPEN_PENDING·STATE_CHANGED) →
     * 지명(400: 1~10명·활성·영업팀/영업팀장만·영업부장 불가·중복) → 의견(400/422) → 결재자(400 APPROVER_NOT_RESOLVED).
     * 신청자나 지명자 중 영업팀장이 있으면 영업부장이 결재한다(019 규칙 재사용).
     */
    @Transactional(readOnly = true)
    public OpenPlan planOpen(String bidCaseId, List<String> empNos, String comment, SysUser me) {
        requireSales(me);   // 역할 검사가 건 조회(404)보다 먼저 — 없는 건과 있는 건을 403 으로 구분하지 못하게(security F4)
        BidPrep p = require(bidCaseId);
        if (OPEN_PENDING.equals(p.getStateCd())) {
            throw coded(409, "OPEN_PENDING", "이미 개설 신청이 진행 중입니다.");
        }
        if (!CONFIRMED.equals(p.getStateCd())) {
            throw stateChanged();
        }
        List<String> targets = assignments.validateTargets(empNos);
        String note = BoardMaterialService.checkedText(comment, 200, "의견", false);
        boolean leadInvolved = isLead(me);
        for (String e : targets) {
            SysUser u = users.selectByEmpNo(e);
            if (u != null && isLead(u)) {
                leadInvolved = true;
            }
        }
        SysUser approver = assignments.resolveApprover(me, leadInvolved);
        return new OpenPlan(bidCaseId, mapper.selectInstitutionNameByBid(bidCaseId), targets, note, approver);
    }

    /** 결재 요청 행을 만든 뒤 호출 — CONFIRMED → OPEN_PENDING 조건부 전이와 요청 번호 기록. 0행이면 409(호출 트랜잭션이 롤백). */
    @Transactional
    public void claimOpen(OpenPlan plan, Long reqId, SysUser me, Actor actor) {
        if (mapper.transitOpenReq(plan.getBidCaseId(), CONFIRMED, OPEN_PENDING, reqId, me.getEmpNo(), Times.nowIso()) != 1) {
            throw coded(409, "OPEN_PENDING", "이미 개설 신청이 진행 중이거나 상태가 바뀌었습니다.");
        }
        log(plan.getBidCaseId(), "OPEN_SUBMIT", CONFIRMED, OPEN_PENDING, null, reqId, null, me, actor);
    }

    /** 개설 신청이 반려·회수로 끝났을 때 — OPEN_PENDING(그 요청)이면 CONFIRMED 로 되돌린다. 이미 다른 상태면 아무것도 하지 않는다. */
    @Transactional
    public void afterOpenEnded(Long reqId, String bidCaseId, String event, String reason, SysUser by, int verified) {
        if (bidCaseId == null || bidCaseId.isEmpty()) {
            return;
        }
        String now = Times.nowIso();
        if (mapper.endOpen(bidCaseId, reqId, by.getEmpNo(), now) == 1) {
            mapper.insertLog(bidCaseId, event, OPEN_PENDING, CONFIRMED, null, reqId, clip(reason), by.getEmpNo(), verified, now);
        }
    }

    /**
     * 개설 승인 후처리(같은 트랜잭션 — 예외를 던지면 승인까지 되돌아간다). 승인자는 영업팀장·영업부장이고 지명자가 아니어야 하며,
     * 팀장이 관련된 건(신청자·지명자 중 영업팀장)은 영업부장만 승인한다. 지명자는 이때 처음 담당자로 배정된다(assignInitial).
     */
    @Transactional
    public String applyOpen(ApprovalRequest r, SysUser decider, Actor actor) {
        JsonNode p = readJson(r.getPayload());
        String bid = p.path("bid_case_id").asText("");
        List<String> nominees = textList(p.path("nominee_emp_nos"));
        String d = decider.getEmpNo();
        if ((!isLead(decider) && !isHead(decider)) || nominees.contains(d)) {
            throw new ApiException(403, "이 개설 신청을 승인할 수 없습니다.");   // 승인자=지명자 방어(security A)
        }
        BidPrep prep = bid.isEmpty() ? null : mapper.selectPrep(bid);
        if (prep == null || !OPEN_PENDING.equals(prep.getStateCd())
                || prep.getOpenReqId() == null || prep.getOpenReqId().longValue() != r.getReqId().longValue()) {
            throw stateChanged();
        }
        List<String> targets;
        try {
            targets = assignments.validateTargets(nominees);   // 상신 뒤 비활성·역할 변경 재검사
        } catch (ApiException e) {
            throw coded(409, "NOMINEE_CHANGED", "지명한 담당자의 상태가 신청 이후 바뀌어 승인할 수 없습니다. 반려하거나 회수하고 다시 신청하세요.");
        }
        SysUser requester = users.selectByEmpNo(r.getRequesterEmpNo());
        boolean leadInvolved = requester == null || isLead(requester);   // 알 수 없으면 보수적으로 부장만
        for (String e : targets) {
            SysUser u = users.selectByEmpNo(e);
            if (u != null && isLead(u)) {
                leadInvolved = true;
            }
        }
        if (leadInvolved && !isHead(decider)) {
            throw coded(409, "APPROVER_ROLE_MISMATCH",
                    "영업팀장이 관련된 개설 신청은 영업부장만 승인할 수 있습니다. 반려하거나 회수하고 다시 신청하세요.");
        }
        String now = Times.nowIso();
        requireTransit(mapper.markOpened(bid, r.getReqId(), d, now));
        int verified = BoardMaterialService.verified(actor);
        assignments.assignInitial(bid, targets, d, verified, r.getReqId());
        for (BidPrepTask def : mapper.selectEnabledDefs()) {
            mapper.insertTask(bid, def);
        }
        mapper.insertLog(bid, "OPEN_APPROVE", OPEN_PENDING, IN_PROGRESS, null, r.getReqId(), null, d, verified, now);
        return "개설 승인: 담당자 " + targets.size() + "명 배정";
    }

    // ── 과제 체크 ────────────────────────────────────────────────────────

    /** 과제 체크·해제(7) — 그 건의 활성 담당자만(영업부장은 읽기 전용 403). 직접 체크(MANUAL) 과제만. */
    @Transactional
    public Map<String, Object> setTask(SysUser me, Actor actor, String bidCaseId, String taskCd, boolean check) {
        if (!assignments.isActiveAssignee(bidCaseId, me.getEmpNo())) {   // 담당 검사가 건·과제 조회(404)보다 먼저(security F4)
            throw new ApiException(403, "이 입찰 건의 담당자만 변경할 수 있습니다.");
        }
        if (taskCd == null || !taskCd.matches(CODE_PATTERN)) {   // 형식 밖 코드는 없는 과제와 같은 404(security F5)
            throw ApiException.notFound("prep task not found");
        }
        BidPrep p = require(bidCaseId);
        if (!TASK_STATES.contains(p.getStateCd())) {
            throw stateChanged();
        }
        List<BidPrepTask> tasks = syncFacts(p, mapper.selectTasks(bidCaseId));
        BidPrepTask t = find(tasks, taskCd);
        if (t == null) {
            throw ApiException.notFound("prep task not found");
        }
        if (!JUDGE_MANUAL.equals(t.getJudgeCd())) {
            throw coded(409, "NOT_MANUAL", "자동으로 판정되는 과제라 직접 체크할 수 없습니다.");
        }
        String state = evaluate(p, tasks).state.get(t.getTaskCd());
        if (check) {
            if (t.getDoneYn() == 1) {
                throw stateChanged();
            }
            if (!"TODO".equals(state) || t.getPrecondKey() != null) {   // 체크 전제 판정기는 아직 서버에 없다 — 모르는 전제는 막는다(fail-closed)
                throw coded(409, "TASK_NOT_AVAILABLE", "지금은 체크할 수 없는 과제입니다(잠김·준비중·해당 없음·전제 미충족).");
            }
        } else if (t.getDoneYn() != 1) {
            throw stateChanged();
        }
        String now = Times.nowIso();
        if (mapper.updateTaskDone(bidCaseId, t.getTaskCd(), check ? 1 : 0, check ? 0 : 1, me.getEmpNo(), now) != 1) {
            throw stateChanged();
        }
        log(bidCaseId, check ? "TASK_CHECK" : "TASK_UNCHECK", p.getStateCd(), p.getStateCd(), t.getTaskCd(), null, null, me, actor);
        return view(me, mapper.selectPrep(bidCaseId), mapper.selectTasks(bidCaseId));
    }

    // ── T3 확정본 지정(025) ──────────────────────────────────────────────

    /**
     * T3 확정본 지정(8) — 그 건의 활성 담당자, 과제 행이 있는 상태. 같은 건·T3·무효 아님인 첨부만(아니면 409 ATTACH_NOT_ELIGIBLE).
     * 첨부는 저장 전에 검사를 통과한 것뿐이라 별도 검사 표시는 없다(UNCHECKED 도 지정할 수 있다). 지정 시점 SHA256 을 과제 행에 저장하고
     * 이력 T3_SET(이후·이전 첨부 번호)을 남긴다. 같은 첨부를 다시 지정하면 아무것도 바꾸지 않는다. 완료 여부는 사실 판정이 곧바로 맞춘다.
     */
    @Transactional
    public Map<String, Object> setConfirmedFile(SysUser me, Actor actor, String bidCaseId, PrepIn.Attach in) {
        if (!assignments.isActiveAssignee(bidCaseId, me.getEmpNo())) {
            throw new ApiException(403, "이 입찰 건의 담당자만 확정본을 지정할 수 있습니다.");
        }
        require(bidCaseId);
        Long attachId = in == null ? null : in.getAttachId();
        if (attachId == null || attachId.longValue() < 1) {
            throw coded(400, "BAD_VALUE", "attach_id가 필요합니다.");
        }
        String state = lockedTaskState(bidCaseId);
        BidPrepAttach a = mapper.selectAttach(bidCaseId, attachId);
        if (a == null || a.getValidYn() != 1 || !"T3".equals(a.getTaskCd())) {
            throw coded(409, "ATTACH_NOT_ELIGIBLE", "확정본으로 지정할 수 없는 첨부입니다(이 건의 T3 첨부이면서 무효가 아니어야 합니다).");
        }
        BidPrepTask t = find(mapper.selectTasks(bidCaseId), "T3");
        if (t == null) {
            throw ApiException.notFound("prep task not found");
        }
        Long prev = t.getRefAttachId();
        if (prev == null || !prev.equals(attachId)) {
            String now = Times.nowIso();
            requireTransit(mapper.setTaskRef(bidCaseId, "T3", attachId, a.getSha256(), me.getEmpNo(), now));
            mapper.insertLogAttach(bidCaseId, "T3_SET", state, state, "T3", attachId, prev, null, me.getEmpNo(),
                    BoardMaterialService.verified(actor), now);
        }
        return afterT3Change(me, bidCaseId);
    }

    /** T3 확정본 해제(8) — 지정이 있을 때만(없으면 409 STATE_CHANGED). 이력 T3_CLEAR(이전 첨부 번호). T3 는 곧바로 미완료로 맞춘다. */
    @Transactional
    public Map<String, Object> clearConfirmedFile(SysUser me, Actor actor, String bidCaseId) {
        if (!assignments.isActiveAssignee(bidCaseId, me.getEmpNo())) {
            throw new ApiException(403, "이 입찰 건의 담당자만 확정본 지정을 해제할 수 있습니다.");
        }
        require(bidCaseId);
        String state = lockedTaskState(bidCaseId);
        BidPrepTask t = find(mapper.selectTasks(bidCaseId), "T3");
        if (t == null) {
            throw ApiException.notFound("prep task not found");
        }
        Long prev = t.getRefAttachId();
        if (prev == null) {
            throw stateChanged();
        }
        requireTransit(mapper.clearTaskRef(bidCaseId, "T3"));
        mapper.insertLogAttach(bidCaseId, "T3_CLEAR", state, state, "T3", null, prev, null, me.getEmpNo(),
                BoardMaterialService.verified(actor), Times.nowIso());
        return afterT3Change(me, bidCaseId);
    }

    /** 건 행을 FOR UPDATE 로 잠그고 과제 행이 있는 상태인지 확인한다(아니면 409). 현재 상태를 돌려준다. */
    private String lockedTaskState(String bidCaseId) {
        String state = mapper.selectStateForUpdate(bidCaseId);
        if (state == null) {
            throw ApiException.notFound("prep not found");
        }
        if (!TASK_STATES.contains(state)) {
            throw stateChanged();
        }
        return state;
    }

    private Map<String, Object> afterT3Change(SysUser me, String bidCaseId) {
        BidPrep cur = mapper.selectPrep(bidCaseId);
        List<BidPrepTask> tasks = syncFacts(cur, mapper.selectTasks(bidCaseId));
        return view(me, cur, tasks);
    }

    // ── 기획승인(PREP_APPROVAL) ──────────────────────────────────────────

    /** 검증을 통과한 기획승인 상신 계획 — 결재자는 영업부장 고정. */
    public static final class PlanPlan {
        private final String bidCaseId;
        private final String institutionName;
        private final SysUser approver;

        PlanPlan(String bidCaseId, String institutionName, SysUser approver) {
            this.bidCaseId = bidCaseId;
            this.institutionName = institutionName;
            this.approver = approver;
        }

        public String getBidCaseId() { return bidCaseId; }
        public String getInstitutionName() { return institutionName; }
        public SysUser getApprover() { return approver; }
    }

    /** 기획승인 상신 검증(13) — 활성 담당자, IN_PROGRESS, 필수 과제 완료(서버 재판정, 아니면 409 NOT_READY + 미완료 과제 코드). */
    @Transactional
    public PlanPlan planPlanApproval(String bidCaseId, SysUser me) {
        if (!assignments.isActiveAssignee(bidCaseId, me.getEmpNo())) {
            throw new ApiException(403, "이 입찰 건의 담당자만 기획승인을 요청할 수 있습니다.");
        }
        BidPrep p = require(bidCaseId);
        if (!IN_PROGRESS.equals(p.getStateCd())) {
            throw stateChanged();
        }
        Eval ev = evaluate(p, syncFacts(p, mapper.selectTasks(bidCaseId)));
        if (!ev.ready) {
            throw notReady(ev);
        }
        SysUser approver = assignments.resolveApprover(me, true);
        return new PlanPlan(bidCaseId, mapper.selectInstitutionNameByBid(bidCaseId), approver);
    }

    /** 결재 요청 행을 만든 뒤 호출 — IN_PROGRESS → APPROVAL_PENDING 조건부 전이와 요청 번호 기록. */
    @Transactional
    public void claimPlan(PlanPlan plan, Long reqId, SysUser me, Actor actor) {
        if (mapper.transitPlanReq(plan.getBidCaseId(), IN_PROGRESS, APPROVAL_PENDING, reqId, me.getEmpNo(), Times.nowIso()) != 1) {
            throw stateChanged();
        }
        log(plan.getBidCaseId(), "PLAN_SUBMIT", IN_PROGRESS, APPROVAL_PENDING, null, reqId, null, me, actor);
    }

    /** 기획승인이 반려·회수로 끝났을 때 — APPROVAL_PENDING(그 요청)이면 IN_PROGRESS 로 되돌린다. */
    @Transactional
    public void afterPlanEnded(Long reqId, String bidCaseId, String event, String reason, SysUser by, int verified) {
        if (bidCaseId == null || bidCaseId.isEmpty()) {
            return;
        }
        String now = Times.nowIso();
        if (mapper.endPlan(bidCaseId, reqId, by.getEmpNo(), now) == 1) {
            mapper.insertLog(bidCaseId, event, APPROVAL_PENDING, IN_PROGRESS, null, reqId, clip(reason), by.getEmpNo(), verified, now);
        }
    }

    /**
     * 기획승인 승인 후처리(같은 트랜잭션). 영업부장만. 필수 과제를 다시 판정해 미완료면 409 NOT_READY(승인째 되돌아간다).
     * 승인 = 승인 기록 + WRITABLE 전이뿐이다. 오케스트레이터 5번 게이트(초안을 검토하고 쓰기 단계로 넘어오는 승인)는 다른 승인이라
     * 여기서 resume 하지 않는다(사용자 결정 2026-11-11, qa P2-1) — 그 게이트는 기존 /checkpoint 로 따로 승인한다.
     */
    @Transactional
    public String applyPlanApproval(ApprovalRequest r, SysUser decider, Actor actor) {
        if (!isHead(decider)) {
            throw new ApiException(403, "이 기획승인을 처리할 수 없습니다.");
        }
        String bid = readJson(r.getPayload()).path("bid_case_id").asText("");
        BidPrep p = bid.isEmpty() ? null : mapper.selectPrep(bid);
        if (p == null || !APPROVAL_PENDING.equals(p.getStateCd())
                || p.getPlanReqId() == null || p.getPlanReqId().longValue() != r.getReqId().longValue()) {
            throw stateChanged();
        }
        Eval ev = evaluate(p, syncFacts(p, mapper.selectTasks(bid)));
        if (!ev.ready) {
            throw notReady(ev);
        }
        String now = Times.nowIso();
        requireTransit(mapper.approvePlan(bid, r.getReqId(), decider.getEmpNo(), now));
        mapper.insertLog(bid, "PLAN_APPROVE", APPROVAL_PENDING, WRITABLE, null, r.getReqId(), null,
                decider.getEmpNo(), BoardMaterialService.verified(actor), now);
        return "기획승인 반영 — 작성 가능";
    }

    // ── 제안서 작성하기 ──────────────────────────────────────────────────

    /**
     * 제안서 작성하기(15) — 활성 담당자, WRITABLE → WRITING 조건부 전이와 같은 트랜잭션에서 세 팀 작업 생성.
     * 전이 UPDATE 가 행 잠금이라 동시 호출은 한쪽만 통과한다(재호출 409). createTasksForBidCase 는 이미 있는 팀을 건너뛴다(멱등).
     */
    @Transactional
    public Map<String, Object> startWriting(SysUser me, Actor actor, String bidCaseId) {
        if (!assignments.isActiveAssignee(bidCaseId, me.getEmpNo())) {
            throw new ApiException(403, "이 입찰 건의 담당자만 제안서 작성을 시작할 수 있습니다.");
        }
        BidPrep p = require(bidCaseId);
        if (!WRITABLE.equals(p.getStateCd())) {
            throw stateChanged();
        }
        Eval ev = evaluate(p, syncFacts(p, mapper.selectTasks(bidCaseId)));   // 작성 가능 뒤 필수 과제가 풀렸으면 다시 막는다(qa P2-2)
        if (!ev.ready) {
            throw notReady(ev);
        }
        requireTransit(mapper.markWriting(bidCaseId, me.getEmpNo(), Times.nowIso()));
        List<String> created = commands.createTasksForBidCase(bidCaseId);
        log(bidCaseId, "WRITE_START", WRITABLE, WRITING, null, null, null, me, actor);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("bid_case_id", bidCaseId);
        m.put("state_cd", WRITING);
        m.put("created_tasks", created.size());
        return m;
    }

    // ── 도우미(컨트롤러 감사용) ──────────────────────────────────────────

    /** 감사용 — 행위 직전 건 상태. 건이 없으면 NONE. */
    @Transactional(readOnly = true)
    public String stateOf(String bidCaseId) {
        BidPrep p = bidCaseId == null || bidCaseId.isEmpty() || bidCaseId.length() > 64 ? null : mapper.selectPrep(bidCaseId);
        return p == null ? "NONE" : p.getStateCd();
    }

    // ── 내부: 열람·판정 ──────────────────────────────────────────────────

    private BidPrep require(String bidCaseId) {
        BidPrep p = bidCaseId == null || bidCaseId.isEmpty() || bidCaseId.length() > 64 ? null : mapper.selectPrep(bidCaseId);
        if (p == null) {
            throw ApiException.notFound("prep not found");
        }
        return p;
    }

    /** 열람 가능한 건만 돌려준다 — 없는 건과 열람 불가는 같은 404(존재 은닉). */
    private BidPrep visible(SysUser me, String bidCaseId) {
        BidPrep p = bidCaseId == null || bidCaseId.isEmpty() || bidCaseId.length() > 64 ? null : mapper.selectPrep(bidCaseId);
        if (p == null || !canSee(me, p)) {
            throw ApiException.notFound("prep not found");
        }
        return p;
    }

    private boolean canSee(SysUser me, BidPrep p) {
        if (isHead(me) || isLead(me)) {   // 영업부장·영업팀장은 모든 상태의 상세·이력을 읽기 전용으로 본다(사용자 결정 2026-11-11, 개설 대기 승인 판단용)
            return true;
        }
        if (assignments.isActiveAssignee(p.getBidCaseId(), me.getEmpNo())) {
            return true;
        }
        if (!isSales(me)) {
            return false;
        }
        if (CONFIRMED.equals(p.getStateCd())) {   // 확정됨 — 영업팀 전원이 읽는다(사용자 결정 2026-11-11)
            return true;
        }
        if (OPEN_PENDING.equals(p.getStateCd())) {   // 개설 대기 — 신청자는 읽기 전용으로 본다(신청 회수 버튼용)
            return isOpenRequester(me, p);
        }
        boolean cancelled = CANCELLED.equals(p.getStateCd());
        boolean beforeOpen = cancelled && p.getOpenedAt() == null;   // 개설 전 확정 취소
        if (beforeOpen) {
            return me.getEmpNo().equals(p.getConfirmedBy());
        }
        if (cancelled) {   // 개설 뒤 중단 건 — 읽기 전용: 영업팀장(부장은 위에서 통과)과 옛 담당자(사용자 결정 2026-11-11)
            return mapper.countEverAssigned(p.getBidCaseId(), me.getEmpNo()) > 0;
        }
        return false;
    }

    /** 끝난(반려·회수) 개설 신청의 상세를 볼 수 있는가 — 영업팀장·영업부장, 또는 그 신청을 올린 사람. */
    private boolean canSeePastOpen(SysUser me, Long reqId) {
        if (isHead(me) || isLead(me)) {
            return true;
        }
        if (reqId == null) {
            return false;
        }
        ApprovalRequest r = requests.selectById(reqId);
        return r != null && me.getEmpNo().equals(r.getRequesterEmpNo());
    }

    /** 개설 대기 건의 대기 중 신청(BID_OPEN)을 올린 사람인가. */
    private boolean isOpenRequester(SysUser me, BidPrep p) {
        if (!OPEN_PENDING.equals(p.getStateCd()) || p.getOpenReqId() == null) {
            return false;
        }
        ApprovalRequest r = requests.selectById(p.getOpenReqId());
        return r != null && "PENDING".equals(r.getStatus()) && me.getEmpNo().equals(r.getRequesterEmpNo());
    }

    /** 결재함 BID_OPEN 카드용 — payload 의 지명자(nominee_emp_nos)를 사번·이름·직위로 풀어 준다. 모르는 사번은 건너뛴다. */
    public List<Map<String, Object>> nomineesOf(String payloadJson) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (String e : textList(readJson(payloadJson).path("nominee_emp_nos"))) {
            SysUser u = users.selectByEmpNo(e);
            if (u != null) {
                Map<String, Object> n = new LinkedHashMap<>();
                n.put("emp_no", u.getEmpNo());
                n.put("name", u.getName());
                n.put("position", u.getPositionTitle());
                out.add(n);
            }
        }
        return out;
    }

    /** 사실 판정(T3·T4·T5)을 다시 맞춘다 — 달라졌으면 조건부 UPDATE + AUTO_DONE/AUTO_UNDONE 이력(행위자 NULL=시스템). */
    private List<BidPrepTask> syncFacts(BidPrep p, List<BidPrepTask> tasks) {
        String now = Times.nowIso();
        boolean changed = false;
        for (BidPrepTask t : tasks) {
            if (!"FACT".equals(t.getJudgeCd()) || t.getReadyYn() == 0) {
                continue;
            }
            boolean fact = judgeFact(p, t);
            if (fact != (t.getDoneYn() == 1)
                    && mapper.updateTaskDone(p.getBidCaseId(), t.getTaskCd(), fact ? 1 : 0, t.getDoneYn(), null, now) == 1) {
                mapper.insertLog(p.getBidCaseId(), fact ? "AUTO_DONE" : "AUTO_UNDONE", p.getStateCd(), p.getStateCd(),
                        t.getTaskCd(), null, null, null, 0, now);
                changed = true;
            }
        }
        return changed ? mapper.selectTasks(p.getBidCaseId()) : tasks;
    }

    /**
     * FACT 판정기. 모르는 키는 false(미완료). T3 는 확정본 지정(REF_ATTACH_ID)이 있고 그 첨부가 이 건의 T3 첨부이며 무효가 아니고
     * 지정 때 저장한 해시와 같을 때만 완료다(025). T4 는 무효가 아닌 T4 첨부가 하나라도 있으면 완료다(과제가 준비중인 동안은 판정하지 않는다).
     */
    private boolean judgeFact(BidPrep p, BidPrepTask t) {
        String key = t.getFactKey();
        if ("T3_FILE".equals(key)) {
            if (t.getRefAttachId() == null) {
                return false;
            }
            BidPrepAttach a = mapper.selectAttach(p.getBidCaseId(), t.getRefAttachId());
            return a != null && a.getValidYn() == 1 && "T3".equals(a.getTaskCd())
                    && (t.getRefSha256() == null || t.getRefSha256().equals(a.getSha256()));
        }
        if ("RFP_ATTACH".equals(key)) {
            return mapper.countValidAttachByTask(p.getBidCaseId(), "T4") > 0;
        }
        if ("BOARD_CONFIRMED".equals(key)) {
            return mapper.countBoardConfirmed(p.getBidCaseId()) > 0;
        }
        return false;
    }

    private boolean condApplies(BidPrep p, BidPrepTask t) {
        if ("RFP_REGISTERED".equals(t.getCondKey())) {
            String path = mapper.selectRfpPath(p.getInstitutionId());
            return path != null && !path.trim().isEmpty();
        }
        return false;
    }

    /** 과제 상태 계산 결과 — 저장된 DONE_YN 으로 계산한다(쓰기 없음). */
    private static final class Eval {
        final Map<String, String> state = new LinkedHashMap<>();   // 과제 코드 → LOCKED|TODO|DONE|NOT_APPLICABLE|PREPARING
        final Map<String, String> lockedBy = new HashMap<>();
        final List<String> missing = new ArrayList<>();            // 기획승인에 필요한데 끝나지 않은 과제
        int done;
        int total;
        boolean ready;
    }

    private Eval evaluate(BidPrep p, List<BidPrepTask> tasks) {
        Eval ev = new Eval();
        Map<String, Boolean> eff = new HashMap<>();
        for (BidPrepTask t : tasks) {   // SORT_NO 순 — 선행 과제는 앞에 온다
            String cd = t.getTaskCd();
            String st;
            if (t.getReadyYn() == 0) {
                st = "PREPARING";
                eff.put(cd, Boolean.FALSE);
            } else if (KIND_CONDITIONAL.equals(t.getKindCd()) && !condApplies(p, t)) {
                st = "NOT_APPLICABLE";
                eff.put(cd, Boolean.TRUE);
            } else {
                String pre = t.getPrereqCd();
                boolean preOk = pre == null || !eff.containsKey(pre) || eff.get(pre).booleanValue();
                if (!preOk) {
                    st = "LOCKED";
                    ev.lockedBy.put(cd, pre);
                    eff.put(cd, Boolean.FALSE);
                } else if (t.getDoneYn() == 1) {
                    st = "DONE";
                    eff.put(cd, Boolean.TRUE);
                } else {
                    st = "TODO";
                    eff.put(cd, Boolean.FALSE);
                }
            }
            ev.state.put(cd, st);
            if ("PREPARING".equals(st) || "NOT_APPLICABLE".equals(st)) {
                continue;
            }
            ev.total++;
            if ("DONE".equals(st)) {
                ev.done++;
            } else if (KIND_REQUIRED.equals(t.getKindCd()) || KIND_CONDITIONAL.equals(t.getKindCd())) {
                ev.missing.add(cd);
            }
        }
        ev.ready = !tasks.isEmpty() && ev.missing.isEmpty();
        return ev;
    }

    private static Map<String, Object> progress(Eval ev) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("done", ev.done);
        m.put("total", ev.total);
        return m;
    }

    private Map<String, Object> view(SysUser me, BidPrep p, List<BidPrepTask> tasks) {
        Eval ev = evaluate(p, tasks);
        String bid = p.getBidCaseId();
        boolean assignee = assignments.isActiveAssignee(bid, me.getEmpNo());
        boolean head = isHead(me);
        boolean taskState = TASK_STATES.contains(p.getStateCd());
        List<BidPrepLogView> logs = mapper.selectLog(bid);
        int confirmVerified = 0;
        for (BidPrepLogView l : logs) {
            if ("CONFIRM".equals(l.getEventCd())) {
                confirmVerified = l.getEmpVerified();
                break;
            }
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("bid_case_id", bid);
        m.put("institution_id", p.getInstitutionId());
        m.put("institution_name", mapper.selectInstitutionNameByBid(bid));
        m.put("state_cd", p.getStateCd());
        m.put("state_name", stateName(p));
        m.put("confirmed_by", person(p.getConfirmedBy()));
        m.put("confirmed_at", p.getConfirmedAt());
        m.put("emp_verified", confirmVerified);
        m.put("progress", progress(ev));
        m.put("plan_approval_ready", ev.ready);
        String boardResult = null;   // T5 는 의결 결과와 상관없이 확정(CONFIRMED)이면 완료 — 부결이면 꼬리표만 붙인다(사용자 결정 2026-11-11)
        for (String rc : mapper.selectBoardResults(bid)) {
            if (rc != null && !rc.trim().isEmpty()) {
                boardResult = rc.trim();
                break;
            }
        }
        m.put("board_result", boardResult);   // SCHEDULED|PASSED|REJECTED|null
        m.put("board_result_name", boardResultName(boardResult));
        m.put("rewriting", false);   // TODO: T5 확정 뒤 재작성 꼬리표(020 상태 파생)는 후속
        List<Map<String, Object>> as = new ArrayList<>();
        for (BidAssigneeView v : assignMapper.selectActiveAssignees(bid)) {
            Map<String, Object> a = new LinkedHashMap<>();
            a.put("emp_no", v.getEmpNo());
            a.put("name", v.getName());
            as.add(a);
        }
        m.put("assignees", as);
        List<Map<String, Object>> tv = new ArrayList<>();
        for (BidPrepTask t : tasks) {
            String st = ev.state.get(t.getTaskCd());
            boolean manual = JUDGE_MANUAL.equals(t.getJudgeCd());
            boolean canCheck = assignee && taskState && manual && "TODO".equals(st) && t.getPrecondKey() == null;
            boolean canUncheck = assignee && taskState && manual && "DONE".equals(st);
            Map<String, Object> x = new LinkedHashMap<>();
            x.put("task_cd", t.getTaskCd());
            x.put("name", t.getTaskName());
            x.put("kind_cd", t.getKindCd());
            x.put("judge_cd", t.getJudgeCd());
            x.put("state", st);
            x.put("locked_by", ev.lockedBy.get(t.getTaskCd()));
            x.put("done_by", t.getDoneYn() == 1 && t.getDoneBy() != null ? person(t.getDoneBy()) : null);   // null + DONE = 시스템 판정
            x.put("done_at", t.getDoneYn() == 1 ? t.getDoneAt() : null);
            x.put("confirmed_attach_id", t.getRefAttachId());
            x.put("stale_basis", false);   // TODO: T3 확정본이 바뀐 뒤 T5 기준 경고는 첨부(71) 이후
            x.put("can_check", canCheck);
            x.put("can_uncheck", canUncheck);
            x.put("disabled_reason", canCheck || canUncheck ? null : disabledReason(st, manual, assignee, taskState, t));
            x.put("done_rule", doneRule(t.getTaskCd()));
            tv.add(x);
        }
        m.put("tasks", tv);
        // 반려·회수로 끝난 지난 개설 신청의 지명자·의견은 신청자·영업팀장·영업부장에게만 — 그 밖에는 past_open_requests 요약만(사용자 결정 2026-11-11)
        ApprovalRequest lastOpen = p.getOpenReqId() == null ? null : requests.selectById(p.getOpenReqId());
        boolean lastEnded = lastOpen != null && ("REJECTED".equals(lastOpen.getStatus()) || "CANCELLED".equals(lastOpen.getStatus()));
        m.put("open_request", lastEnded && !canSeePastOpen(me, lastOpen.getReqId()) ? null : requestOf(p.getOpenReqId(), true));
        int pastCount = 0;
        String pastLast = null;
        for (BidPrepLogView l : logs) {
            if ("OPEN_REJECT".equals(l.getEventCd())) {
                pastCount++;
                pastLast = "REJECTED";
            } else if ("OPEN_WITHDRAW".equals(l.getEventCd())) {
                pastCount++;
                pastLast = "WITHDRAWN";
            }
        }
        Map<String, Object> past = null;
        if (pastCount > 0) {
            past = new LinkedHashMap<>();
            past.put("count", pastCount);
            past.put("last_status", pastLast);
        }
        m.put("past_open_requests", past);   // null = 지난 신청 없음
        m.put("plan_request", requestOf(p.getPlanReqId(), false));
        boolean openRequester = isOpenRequester(me, p);
        Map<String, Object> viewer = new LinkedHashMap<>();
        viewer.put("is_assignee", assignee);
        viewer.put("is_head", head);
        viewer.put("can_confirm", false);   // 이미 확정된 건이다
        viewer.put("can_unconfirm", CONFIRMED.equals(p.getStateCd()) && isSales(me)
                && (me.getEmpNo().equals(p.getConfirmedBy()) || isLead(me)));
        viewer.put("can_request_open", CONFIRMED.equals(p.getStateCd()) && isSales(me));
        viewer.put("can_withdraw_open", openRequester);
        viewer.put("can_request_plan_approval", assignee && IN_PROGRESS.equals(p.getStateCd()) && ev.ready);
        viewer.put("can_start_writing", assignee && WRITABLE.equals(p.getStateCd()) && ev.ready);
        viewer.put("can_cancel", isLead(me) && (IN_PROGRESS.equals(p.getStateCd()) || WRITABLE.equals(p.getStateCd())
                || WRITING.equals(p.getStateCd())));
        viewer.put("can_upload", assignee && taskState);   // 첨부 올리기(71) — 활성 담당자, 과제 행이 있는 상태
        m.put("viewer", viewer);
        return m;
    }

    private static String disabledReason(String st, boolean manual, boolean assignee, boolean taskState, BidPrepTask t) {
        if ("PREPARING".equals(st)) {
            return "준비 중인 과제입니다.";
        }
        if ("NOT_APPLICABLE".equals(st)) {
            return "해당 없는 과제입니다.";
        }
        if ("LOCKED".equals(st)) {
            return "선행 과제가 끝나야 합니다.";
        }
        if (!manual) {
            return "자동으로 판정되는 과제입니다.";
        }
        if (!assignee) {
            return "담당자만 체크할 수 있습니다.";
        }
        if (!taskState) {
            return "지금 상태에서는 변경할 수 없습니다.";
        }
        if (t.getPrecondKey() != null) {
            return "이 과제는 아직 직접 체크할 수 없습니다. 선행 확인이 끝난 뒤 다시 시도하세요.";
        }
        return null;
    }

    /** 과제별 완료 조건 문구(화면 안내용). 모르는 과제 코드는 null. */
    private static String doneRule(String taskCd) {
        if ("T1".equals(taskCd) || "T2".equals(taskCd)) {
            return "다 마쳤으면 [완료로 표시]를 누르세요.";
        }
        if ("T3".equals(taskCd)) {
            return "수익성 분석표를 올리고 확정본으로 지정하면 완료됩니다.";
        }
        if ("T4".equals(taskCd)) {
            return "RFP 붙임서류를 모두 올리면 완료됩니다.";
        }
        if ("T5".equals(taskCd)) {
            return "이사회 자료가 확정되면 완료됩니다(부결이어도 완료).";
        }
        if ("T6".equals(taskCd)) {
            return "대본을 마치면 [완료로 표시]를 누르세요.";
        }
        return null;
    }

    /** 결재 요청 요약 — 번호·상태·신청자·신청 시각. 개설 신청(open)이면 지명자(이름·직위)와 의견도 싣는다. */
    private Map<String, Object> requestOf(Long reqId, boolean open) {
        if (reqId == null) {
            return null;
        }
        ApprovalRequest r = requests.selectById(reqId);
        if (r == null) {
            return null;
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("req_id", r.getReqId());
        m.put("status", r.getStatus());
        m.put("requester", person(r.getRequesterEmpNo()));
        m.put("requested_at", r.getCreatedAt());
        if (open) {
            m.put("nominees", nomineesOf(r.getPayload()));
            JsonNode c = readJson(r.getPayload()).path("comment");
            m.put("comment", c.isMissingNode() || c.isNull() || c.asText().isEmpty() ? null : c.asText());
        }
        return m;
    }

    private Map<String, Object> person(String emp) {
        if (emp == null) {
            return null;
        }
        SysUser u = users.selectByEmpNo(emp);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("emp_no", emp);
        m.put("name", u == null ? null : u.getName());
        return m;
    }

    /** 020 BOARD_RESULT 코드 이름(화면 꼬리표용). 모르는 코드는 코드 그대로. */
    private static String boardResultName(String code) {
        if (code == null) {
            return null;
        }
        if ("PASSED".equals(code)) {
            return "가결";
        }
        if ("REJECTED".equals(code)) {
            return "부결";
        }
        if ("SCHEDULED".equals(code)) {
            return "의결 예정";
        }
        return code;
    }

    private static String stateName(BidPrep p) {
        if (CANCELLED.equals(p.getStateCd())) {   // 한 상태 코드, 두 표시명 — 개설 전은 확정 취소, 개설 뒤는 중단(qa P3-3)
            return p.getOpenedAt() == null ? "확정 취소" : "중단(미참여)";
        }
        if (IN_PROGRESS.equals(p.getStateCd())) {   // 024 시드 이름('진행(사전준비 중)')은 다시 실행할 수 없어 표시만 여기서 바꾼다
            return STATE_NAMES.get(IN_PROGRESS);
        }
        if (p.getStateName() != null) {
            return p.getStateName();
        }
        String n = STATE_NAMES.get(p.getStateCd());
        return n == null ? p.getStateCd() : n;
    }

    private Map<String, Object> stateOut(String bid, String state) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("bid_case_id", bid);
        m.put("state_cd", state);
        return m;
    }

    private static BidPrepTask find(List<BidPrepTask> tasks, String cd) {
        for (BidPrepTask t : tasks) {
            if (t.getTaskCd().equals(cd)) {
                return t;
            }
        }
        return null;
    }

    private void log(String bid, String event, String from, String to, String task, Long reqId, String reason,
                     SysUser by, Actor actor) {
        mapper.insertLog(bid, event, from, to, task, reqId, reason, by.getEmpNo(), BoardMaterialService.verified(actor),
                Times.nowIso());
    }

    // ── 내부: 역할·오류 ──────────────────────────────────────────────────

    private static String roleOf(SysUser u) {
        return u.getRole() == null ? "" : u.getRole().trim();
    }

    private static boolean isLead(SysUser u) {
        return BidAssignmentService.LEAD_ROLE.equals(roleOf(u));
    }

    private static boolean isHead(SysUser u) {
        return BidAssignmentService.HEAD_ROLE.equals(roleOf(u));
    }

    /** 영업팀·영업팀장. */
    private static boolean isSales(SysUser u) {
        return BidAssignmentService.MEMBER_ROLE.equals(roleOf(u)) || isLead(u);
    }

    private static void requireSales(SysUser me) {
        if (!isSales(me)) {
            throw new ApiException(403, "이 기능을 쓸 권한이 없습니다.");
        }
    }

    /** 이력 사유 칸(200자) 맞춤 — 결재 의견은 500자까지 받으므로 잘라 쓴다. 비면 null. */
    private static String clip(String s) {
        if (s == null || s.isEmpty()) {
            return null;
        }
        return s.length() > 200 ? s.substring(0, 200) : s;
    }

    private static void requireTransit(int rows) {
        if (rows != 1) {
            throw stateChanged();
        }
    }

    private static JsonNode readJson(String s) {
        try {
            return JSON.readTree(s == null ? "{}" : s);
        } catch (IOException e) {
            throw new ApiException(500, "요청 내용을 읽을 수 없습니다.");
        }
    }

    private static List<String> textList(JsonNode arr) {
        List<String> out = new ArrayList<>();
        for (JsonNode n : arr) {
            out.add(n.asText());
        }
        return out;
    }

    private static ApiException notReady(Eval ev) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("code", "NOT_READY");
        d.put("message", "필수 과제가 모두 끝나지 않았습니다.");
        d.put("missing", new ArrayList<>(ev.missing));
        return ApiException.withDetail(409, d);
    }

    private static ApiException stateChanged() {
        return coded(409, "STATE_CHANGED", "그 사이 상태가 바뀌었습니다. 새로 고친 뒤 다시 시도하세요.");
    }

    private static ApiException alreadyActive() {
        return coded(409, "PREP_ALREADY_ACTIVE", "이 기관에는 이미 진행 중인 제안 건이 있습니다.");
    }

    private static ApiException coded(int status, String code, String message) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("code", code);
        d.put("message", message);
        return ApiException.withDetail(status, d);
    }
}
