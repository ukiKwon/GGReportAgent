package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.domain.ApprovalRequest;
import com.kbstar.kgi.ggreport.web.domain.BidAssignCase;
import com.kbstar.kgi.ggreport.web.domain.BidAssignLogView;
import com.kbstar.kgi.ggreport.web.domain.BidAssignMine;
import com.kbstar.kgi.ggreport.web.domain.BidAssigneeView;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.mapper.ApprovalRequestMapper;
import com.kbstar.kgi.ggreport.web.mapper.BidAssignmentMapper;
import com.kbstar.kgi.ggreport.web.mapper.BoardMaterialMapper;
import com.kbstar.kgi.ggreport.web.mapper.PrepMapper;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.support.ApproverRules;
import com.kbstar.kgi.ggreport.web.support.MenuPerms;
import com.kbstar.kgi.ggreport.web.support.LegacyFlowSwitch;
import com.kbstar.kgi.ggreport.web.support.Ranks;
import com.kbstar.kgi.ggreport.web.support.Teams;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 입찰 건 담당자 배정(019) — S2-a: 최초 배정·조회·이력·내 담당 건·쓰기 판정 / S2-b: 담당자 변경 결재(ASSIGNEE_CHANGE).
 *
 * <p>규칙(사용자 확정 2026-11-10): 담당자는 한 건에 1~10명, 영업팀·영업팀장만 지정 가능(영업부장·디자이너·타 팀 불가).
 * 최초 배정은 영업팀장만 하고(관리자·영업부장 403) 자기 자신을 넣어도 된다(이력에 표시). 열람은 영업팀 전원
 * (영업팀·영업팀장·영업부장 — 관리자·디자이너 403).
 *
 * <p>담당자 변경 신청: 상신자는 현 활성 담당자 또는 영업팀장. 결재자는 영업팀장 — 단, 영업팀장이 상신자이거나
 * 현 담당자이거나 추가 대상이면 영업부장. 결재자는 상신자의 결재 체인에서 처음 만나는 활성 해당 역할자이고, 체인에 없으면
 * 그 역할 활성이 정확히 1명일 때만 정한다(아니면 400 APPROVER_NOT_RESOLVED). 대결 승인 불가(ApprovalTypes.NO_PROXY).
 * 건당 진행 중 변경 1건(PENDING_REQ_ID 낙관적 선점). 승인은 한 트랜잭션: GROUP_VER 확인+증가 → 행 갱신 → 이력.
 *
 * <p>⚠️ 호출자 사번은 X-Emp-No 자기신고일 수 있다({@link Actor}). 이 역할 검사는 <b>업무 규칙(실수 방지)</b>이지
 * 사칭 방지가 아니다. 이력의 {@code emp_verified} 는 "앞단 인증 주체였나"의 사실만 적는다.
 * 모든 쓰기는 한 트랜잭션이라 중간 실패 시 머리·배정·이력이 함께 되돌아간다.
 */
@Service
public class BidAssignmentService {

    public static final int MIN_ASSIGNEES = 1;
    public static final int MAX_ASSIGNEES = 10;

    static final String MEMBER_ROLE = Teams.DESIGNER_HOME_TEAM + Teams.TEAM_SUFFIX;   // 영업팀
    static final String LEAD_ROLE = Teams.leadOf(Teams.DESIGNER_HOME_TEAM);            // 영업팀장
    static final String HEAD_ROLE = Teams.FINAL_APPROVER;                              // 영업부장

    static final String ACTION_ASSIGN = "ASSIGN";
    static final String ACTION_ADD = "ADD";
    static final String ACTION_RELEASE = "RELEASE";
    static final String ACTION_HANDOVER = "HANDOVER";   // 020 (insertHandoverLog 가 SQL 에 직접 쓴다 — 코드값 문서용)
    static final String SELF_REASON = "팀장 자기 포함 배정";

    private static final ObjectMapper JSON = new ObjectMapper();

    private final BidAssignmentMapper mapper;
    private final SysUserMapper users;
    private final ApprovalRequestMapper requests;
    private final BoardMaterialMapper materials;
    private final LegacyFlowSwitch legacy;
    private final PrepMapper prepMapper;

    public BidAssignmentService(BidAssignmentMapper mapper, SysUserMapper users, ApprovalRequestMapper requests,
                                BoardMaterialMapper materials, LegacyFlowSwitch legacy, PrepMapper prepMapper) {
        this.mapper = mapper;
        this.users = users;
        this.requests = requests;
        this.materials = materials;
        this.legacy = legacy;
        this.prepMapper = prepMapper;
    }

    /**
     * 그 사번이 그 입찰 건의 <b>현재</b> 담당자인가 — 쓰기 판정의 단일 자리. 배정 테이블({@code ACTIVE_YN=1})만 본다.
     * 해제되면 다음 요청부터 false 다. 관리자 예외 없음. USERS ACTIVE 확인은 호출하는 쪽(020 BoardAccess)이 더한다.
     */
    @Transactional(readOnly = true)
    public boolean isActiveAssignee(String bidCaseId, String empNo) {
        if (bidCaseId == null || bidCaseId.isEmpty() || !MenuPerms.isEmpNo(empNo)) {
            return false;
        }
        return mapper.countActive(bidCaseId, empNo) > 0;
    }

    /** 배정 조회 — 영업팀 전원. 아직 배정 전이면 {@code assigned=false}, 담당자 빈 배열. */
    @Transactional(readOnly = true)
    public Map<String, Object> view(String bidCaseId, SysUser me) {
        requireSalesTeam(me);
        requireBidCase(bidCaseId);
        BidAssignCase head = mapper.selectCase(bidCaseId);
        List<BidAssigneeView> rows = mapper.selectActiveAssignees(bidCaseId);
        boolean assigned = head != null && !rows.isEmpty();
        boolean isAssignee = containsEmp(rows, me.getEmpNo());
        boolean lead = LEAD_ROLE.equals(roleOf(me));
        Map<String, Object> pending = assigned ? pendingChange(head) : null;
        Map<String, Object> viewer = new LinkedHashMap<>();
        viewer.put("is_assignee", isAssignee);
        viewer.put("can_assign", lead && !assigned);
        viewer.put("can_request_change", assigned && (isAssignee || lead) && pending == null);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("bid_case_id", bidCaseId);
        m.put("assigned", assigned);
        m.put("group_ver", head == null ? 0 : head.getGroupVer());
        m.put("assignees", assigneeMaps(rows));
        m.put("pending_change", pending);
        m.put("viewer", viewer);
        return m;
    }

    /**
     * 최초 배정 — 영업팀장만. 이미 배정된 건은 409 {@code ASSIGNED_ALREADY}.
     * 옛 흐름 스위치({@link LegacyFlowSwitch})가 닫히면 이 경로는 막힌다(403 {@code LEGACY_CLOSED}) —
     * 최초 배정은 '제안 확정 → 개설 신청 → 개설 승인'(NEXT 70)이 {@link #assignInitial} 로만 한다(security B2).
     */
    @Transactional
    public Map<String, Object> create(String bidCaseId, List<String> empNos, SysUser me, Actor actor) {
        if (!LEAD_ROLE.equals(roleOf(me))) {
            throw new ApiException(403, "최초 배정은 영업팀장만 할 수 있습니다.");
        }
        if (bidCaseId != null && !bidCaseId.isEmpty() && bidCaseId.length() <= 64
                && prepMapper.countActivePrepByCase(bidCaseId) > 0) {   // 스위치와 무관 — 사전준비 건은 개설 승인만이 배정한다(NEXT 70 qa P2-3)
            throw coded(409, "PREP_CASE", "제안 사전준비가 진행 중인 입찰 건입니다. 담당자는 개설 신청으로 지정하세요.");
        }
        if (!legacy.isOpen()) {
            throw coded(403, "LEGACY_CLOSED", "최초 배정은 제안 확정·개설 신청 흐름으로만 할 수 있습니다.");
        }
        List<String> targets = validateTargets(empNos);
        requireBidCase(bidCaseId);
        if (mapper.selectCase(bidCaseId) != null) {
            throw alreadyAssigned();
        }
        int verified = actor != null && actor.isVerified() ? 1 : 0;
        return assignInitial(bidCaseId, targets, me.getEmpNo(), verified, null);
    }

    /**
     * 최초 배정의 핵심 — 머리 행·배정 행·ASSIGN 이력을 한 트랜잭션으로 쓴다. 호출자가 대상 검증(validateTargets)과 권한을 끝낸 뒤 부른다.
     * {@code byEmp} 는 배정을 확정한 사람(팀장 직접 배정이면 그 팀장, 개설 승인이면 승인자), {@code reqId} 는 개설 결재 요청 번호(직접 배정이면 null).
     * 이미 머리 행이 있으면 409 {@code ASSIGNED_ALREADY}.
     */
    @Transactional
    public Map<String, Object> assignInitial(String bidCaseId, List<String> targets, String byEmp, int verified, Long reqId) {
        if (mapper.selectCase(bidCaseId) != null) {
            throw alreadyAssigned();
        }
        String now = Times.nowIso();
        try {
            mapper.insertCase(bidCaseId, byEmp, now);
        } catch (DuplicateKeyException e) {   // 동시 최초 배정 — 한쪽만 성공
            throw alreadyAssigned();
        }
        for (String emp : targets) {
            mapper.insertAssignment(bidCaseId, emp, byEmp, now);
            String reason = emp.equals(byEmp) ? SELF_REASON : null;
            mapper.insertLog(bidCaseId, ACTION_ASSIGN, emp, reqId, reason, byEmp, verified, now);
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("bid_case_id", bidCaseId);
        m.put("group_ver", 1);
        m.put("assignees", assigneeMaps(mapper.selectActiveAssignees(bidCaseId)));
        return m;
    }

    /** 배정·변경 이력(오래된 순) — 영업팀 전원. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> history(String bidCaseId, SysUser me) {
        requireSalesTeam(me);
        requireBidCase(bidCaseId);
        // '작성본 인계'(HANDOVER) 행은 그 건에 이사회 자료가 있었다는 사실과 인수자 이름을 드러낸다(security 하-3, 사용자 확정 2026-11-10).
        // 그 건의 현재 담당자·영업팀장·영업부장에게만 보이고 그 외에게는 응답에서 뺀다. 다른 행은 그대로. 호출자 활성 여부는 컨트롤러가 이미 확인했다.
        String myRole = roleOf(me);
        boolean seesHandover = LEAD_ROLE.equals(myRole) || HEAD_ROLE.equals(myRole)
                || isActiveAssignee(bidCaseId, me.getEmpNo());
        List<Map<String, Object>> out = new ArrayList<>();
        for (BidAssignLogView l : mapper.selectLog(bidCaseId)) {
            if (!seesHandover && ACTION_HANDOVER.equals(l.getActionCd())) {
                continue;
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("action_cd", l.getActionCd());
            m.put("action_name", l.getActionName());
            m.put("target_emp_no", l.getTargetEmpNo());
            m.put("target_name", l.getTargetName());
            m.put("req_id", l.getReqId());
            m.put("reason", l.getReason());
            m.put("actor_emp_no", l.getActorEmpNo());
            m.put("actor_name", l.getActorName());
            m.put("from_emp_no", l.getFromEmpNo());           // HANDOVER 만 값이 있다(해제된 사람)
            m.put("from_name", l.getFromName());
            m.put("emp_verified", l.getEmpVerified() == 1);   // false = 자기신고(위조 가능)
            m.put("logged_at", l.getLoggedAt());
            out.add(m);
        }
        return out;
    }

    /** 내가 현재 담당인 입찰 건 — 자기 사번만(파라미터로 남의 사번을 받지 않는다). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> mine(String empNo) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (BidAssignMine r : mapper.selectMine(empNo)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("bid_case_id", r.getBidCaseId());
            m.put("assigned_at", r.getAssignedAt());
            out.add(m);
        }
        return out;
    }

    /** 담당자 후보 — 열람자 규칙은 배정 조회와 같다(영업팀·영업팀장·영업부장, 그 외 403). 본인 포함, 이름순. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> candidates(SysUser me) {
        requireSalesTeam(me);
        List<Map<String, Object>> out = new ArrayList<>();
        for (SysUser u : mapper.selectCandidates(MEMBER_ROLE, LEAD_ROLE)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("emp_no", u.getEmpNo());
            m.put("name", u.getName());
            m.put("position_title", u.getPositionTitle());
            m.put("role", roleOf(u));
            out.add(m);
        }
        return out;
    }

    /** 결재 요청 제목 — {@code 담당자 변경 — 기관명}. 기관을 못 찾으면 bid_case_id 를 쓴다. */
    public String changeTitle(String bidCaseId) {
        String name = mapper.selectInstitutionName(bidCaseId);
        return "담당자 변경 — " + (name == null || name.trim().isEmpty() ? bidCaseId : name.trim());
    }

    // ── 담당자 변경 결재 (S2-b) ────────────────────────────────────────

    /** 검증을 통과한 변경 신청 계획 — 결재선(approver)까지 서버가 정한다. */
    public static final class ChangePlan {
        private final String bidCaseId;
        private final int groupVer;
        private final Long staleReqId;
        private final List<String> add;
        private final List<String> remove;
        private final SysUser approver;

        ChangePlan(String bidCaseId, int groupVer, Long staleReqId, List<String> add, List<String> remove,
                   SysUser approver) {
            this.bidCaseId = bidCaseId;
            this.groupVer = groupVer;
            this.staleReqId = staleReqId;
            this.add = add;
            this.remove = remove;
            this.approver = approver;
        }

        public String getBidCaseId() { return bidCaseId; }
        public int getGroupVer() { return groupVer; }
        public Long getStaleReqId() { return staleReqId; }
        public List<String> getAdd() { return add; }
        public List<String> getRemove() { return remove; }
        public SysUser getApprover() { return approver; }
    }

    /**
     * 변경 신청 검증 + 결재자 계산(쓰기 없음). 순서: 입찰 건(404) → 상신 자격(403) → 배정 전(409 NOT_ASSIGNED) →
     * 입력(400) → 결과 인원(400 NO_ASSIGNEE_LEFT·TOO_MANY_ASSIGNEES) → 진행 중 신청(409 CHANGE_PENDING) →
     * 결재자(400 APPROVER_NOT_RESOLVED). 오류 문구에 사번·이름을 싣지 않는다.
     */
    public ChangePlan planChange(String bidCaseId, List<String> addIn, List<String> removeIn, SysUser me) {
        boolean lead = LEAD_ROLE.equals(roleOf(me));
        if (!lead && !MEMBER_ROLE.equals(roleOf(me))) {   // 영업팀·영업팀장 외(디자이너·관리자·영업부장 등)는 건 존재 여부와 무관하게 403
            throw new ApiException(403, "담당자 변경은 현재 담당자 또는 영업팀장만 신청할 수 있습니다.");
        }
        requireBidCase(bidCaseId);
        BidAssignCase head = mapper.selectCase(bidCaseId);
        List<BidAssigneeView> cur = head == null ? new ArrayList<BidAssigneeView>() : mapper.selectActiveAssignees(bidCaseId);
        if (!lead && !containsEmp(cur, me.getEmpNo())) {
            throw new ApiException(403, "담당자 변경은 현재 담당자 또는 영업팀장만 신청할 수 있습니다.");
        }
        if (head == null || cur.isEmpty()) {
            throw coded(409, "NOT_ASSIGNED", "아직 담당자가 배정되지 않은 입찰 건입니다. 먼저 최초 배정을 하세요.");
        }
        List<String> add = normalize(addIn);
        List<String> remove = normalize(removeIn);
        if (add.isEmpty() && remove.isEmpty()) {
            throw new ApiException(400, "추가하거나 해제할 담당자를 하나 이상 지정하세요.");
        }
        for (String e : add) {
            if (remove.contains(e)) {
                throw new ApiException(400, "같은 사용자를 추가와 해제에 함께 지정할 수 없습니다.");
            }
        }
        Set<String> active = new LinkedHashSet<>();
        for (BidAssigneeView r : cur) {
            active.add(r.getEmpNo());
        }
        for (String e : remove) {
            if (!active.contains(e)) {
                throw new ApiException(400, "현재 담당자가 아닌 사용자를 해제할 수 없습니다.");
            }
        }
        boolean leadInvolved = lead;
        for (String e : add) {
            if (active.contains(e)) {
                throw new ApiException(400, "이미 담당자인 사용자를 추가할 수 없습니다.");
            }
            if (LEAD_ROLE.equals(roleOf(requireAssignable(e)))) {
                leadInvolved = true;
            }
        }
        for (String e : active) {   // 해제 대상 포함 — 현 담당자 중 영업팀장이 있으면 부장 결재
            SysUser u = users.selectByEmpNo(e);
            if (u != null && LEAD_ROLE.equals(roleOf(u))) {
                leadInvolved = true;
            }
        }
        checkResultSize(active.size() - remove.size() + add.size());
        Long stale = null;
        if (head.getPendingReqId() != null) {
            ApprovalRequest pr = requests.selectById(head.getPendingReqId());
            if (pr != null && "PENDING".equals(pr.getStatus())) {
                throw changePending();
            }
            stale = head.getPendingReqId();   // 끝난(반려·취소) 요청의 낡은 선점 — 새 신청이 교체한다
        }
        SysUser approver = resolveApprover(me, leadInvolved);
        return new ChangePlan(bidCaseId, head.getGroupVer(), stale, add, remove, approver);
    }

    /** 신청 요청 행을 만든 뒤 호출 — 입찰 건당 진행 중 신청 1건(낙관적). 0행이면 409 이고 호출한 트랜잭션이 롤백된다. */
    @Transactional
    public void claimPending(ChangePlan plan, Long reqId) {
        if (mapper.claimPending(plan.getBidCaseId(), plan.getGroupVer(), reqId, plan.getStaleReqId()) != 1) {
            throw changePending();
        }
    }

    /** 취소된 변경 신청이 잡고 있던 선점을 푼다. 다른 요청이 선점 중이면 아무것도 바꾸지 않는다(0행). */
    @Transactional
    public void releasePending(ApprovalRequest r) {
        String bid = readPayload(r.getPayload()).path("bid_case_id").asText("");
        if (!bid.isEmpty()) {
            mapper.releasePending(bid, r.getReqId());
        }
    }

    /**
     * 최종 승인 후처리(같은 트랜잭션 — 예외를 던지면 승인까지 되돌아간다). 반환값은 결재 요청의 결과 메모다.
     * 첫 문장(bumpVersion)이 GROUP_VER·선점 확인과 잠금을 겸한다.
     */
    @Transactional
    public String applyChange(ApprovalRequest r, SysUser decider, Actor actor) {
        JsonNode p = readPayload(r.getPayload());
        String bid = p.path("bid_case_id").asText("");
        int ver = p.path("group_ver").asInt(-1);
        List<String> add = textList(p.path("add_emp_nos"));
        List<String> remove = textList(p.path("remove_emp_nos"));
        String reason = p.path("reason").asText("");
        if (reason.isEmpty() || reason.length() > 200) {
            reason = null;
        }
        String d = decider.getEmpNo();
        String dRole = roleOf(decider);
        if ((!LEAD_ROLE.equals(dRole) && !HEAD_ROLE.equals(dRole)) || add.contains(d) || remove.contains(d)) {
            throw new ApiException(403, "이 담당자 변경을 승인할 수 없습니다.");   // 승인자=수혜자 방어(security 26)
        }
        String now = Times.nowIso();
        if (bid.isEmpty() || ver < 1 || mapper.bumpVersion(bid, ver, r.getReqId(), d, now) != 1) {
            throw groupVerChanged();
        }
        // bumpVersion(MyBatis 쓰기)이 1차 캐시를 비웠으므로 아래 읽기는 최신이다.
        Set<String> active = new LinkedHashSet<>();
        for (BidAssigneeView v : mapper.selectActiveAssignees(bid)) {
            active.add(v.getEmpNo());
        }
        if (active.contains(d)) {
            throw new ApiException(403, "이 담당자 변경을 승인할 수 없습니다.");
        }
        for (String e : remove) {
            if (!active.contains(e)) {
                throw groupVerChanged();
            }
        }
        SysUser requester = users.selectByEmpNo(r.getRequesterEmpNo());
        boolean leadInvolved = requester == null || LEAD_ROLE.equals(roleOf(requester));   // 알 수 없으면 보수적으로 부장만
        for (String e : active) {   // 현 담당자(해제 대상 포함) 중 영업팀장
            SysUser u = users.selectByEmpNo(e);
            if (u != null && LEAD_ROLE.equals(roleOf(u))) {
                leadInvolved = true;
            }
        }
        for (String e : add) {
            if (active.contains(e)) {
                throw groupVerChanged();
            }
            if (LEAD_ROLE.equals(roleOf(requireAssignable(e)))) {   // 상신 뒤 비활성·역할 변경 재검사
                leadInvolved = true;
            }
        }
        if (leadInvolved && !HEAD_ROLE.equals(dRole)) {   // 팀장 관련 건은 영업부장만 승인(결재선이 어긋나도 마지막에 한 번 더 막는다)
            throw coded(409, "APPROVER_ROLE_MISMATCH",
                    "영업팀장이 관련된 담당자 변경은 영업부장만 승인할 수 있습니다. 반려하거나 취소하고 다시 신청하세요.");
        }
        checkResultSize(active.size() - remove.size() + add.size());
        int verified = actor != null && actor.isVerified() ? 1 : 0;
        for (String e : remove) {
            if (mapper.updateRelease(bid, e, d, now) != 1) {
                throw groupVerChanged();
            }
            mapper.insertLog(bid, ACTION_RELEASE, e, r.getReqId(), reason, d, verified, now);
        }
        for (String e : add) {
            if (mapper.updateReactivate(bid, e, d, now) == 0) {
                mapper.insertAssignment(bid, e, d, now);
            }
            mapper.insertLog(bid, ACTION_ADD, e, r.getReqId(), reason, d, verified, now);
        }
        handoverMaterials(bid, remove, add, r.getReqId(), d, verified, now);
        cancelPendingSubmit(bid);
        return "담당자 변경 반영: 추가 " + add.size() + "명, 해제 " + remove.size() + "명";
    }

    /**
     * 020 — 담당에서 빠지는 사람이 만들었거나 마지막으로 저장한 이사회 자료가 있으면, 새로 추가된 담당자 전원에게 인계한 사실을
     * 변경 이력(BID_ASSIGN_LOG HANDOVER: 해제된 사람→받은 사람 쌍마다 1행)과 자료 이력(BOARD_MATERIAL_LOG)에 남긴다. 자료는 입찰 건 소속이라
     * 값·버전은 그대로이고, 현재 담당자 전원이 이어서 쓴다(작성 책임자 칸 없음). 추가가 없으면 남은 담당자 중 쓸 수 있는 사람 전원이 받는 사람이다.
     * 받는 사람은 USERS ACTIVE ∧ 영업 계열이어야 한다(security P1) — 한 명도 없으면 409 NO_HANDOVER_TARGET 으로 승인째 되돌린다.
     * 배정 이력에는 자료 번호를 남기지 않는다(존재 은닉, security P2). 같은 트랜잭션이라 하나라도 실패하면 승인까지 되돌아간다.
     */
    private void handoverMaterials(String bid, List<String> remove, List<String> add, Long reqId, String decider,
                                   int verified, String now) {
        if (remove.isEmpty()) {
            return;
        }
        Map<Long, String> fromOf = new LinkedHashMap<>();   // 자료 번호 → 해제된 사람(여러 명이면 먼저 걸린 사람)
        for (String from : remove) {
            for (Long mid : materials.selectInvolvedIds(bid, from)) {   // FOR UPDATE — 같은 건의 자료 생성과 직렬화
                if (!fromOf.containsKey(mid)) {
                    fromOf.put(mid, from);
                }
            }
        }
        if (fromOf.isEmpty()) {
            return;
        }
        List<String> to = new ArrayList<>(add);   // add 는 applyChange 의 requireAssignable 이 이미 ACTIVE·영업 계열로 검사했다
        if (to.isEmpty()) {
            for (BidAssigneeView v : mapper.selectActiveAssignees(bid)) {
                SysUser u = users.selectByEmpNo(v.getEmpNo());
                boolean ok = u != null && "ACTIVE".equals(u.getStatus())
                        && (MEMBER_ROLE.equals(roleOf(u)) || LEAD_ROLE.equals(roleOf(u)));
                if (ok && !to.contains(v.getEmpNo())) {
                    to.add(v.getEmpNo());
                }
            }
        }
        if (to.isEmpty()) {
            throw coded(409, "NO_HANDOVER_TARGET",
                    "작성본을 넘겨받을 사용 중인 담당자가 없습니다. 담당자를 추가해 다시 신청하세요.");
        }
        Set<String> pairs = new LinkedHashSet<>();
        for (Map.Entry<Long, String> e : fromOf.entrySet()) {
            for (String t : to) {
                materials.insertLog(e.getKey(), "HANDOVER", null, null, null, null, null, e.getValue(), t, reqId, null,
                        decider, verified, now);
                if (pairs.add(e.getValue() + ">" + t)) {
                    mapper.insertHandoverLog(bid, t, e.getValue(), reqId, decider, verified, now);
                }
            }
        }
    }

    /** 그 입찰 건의 현재 활성 담당자 중 영업팀장이 있으면 true(자료 제출은 이 경우 영업부장 결재). */
    @Transactional(readOnly = true)
    boolean anyActiveLead(String bidCaseId) {
        for (BidAssigneeView v : mapper.selectActiveAssignees(bidCaseId)) {
            SysUser u = users.selectByEmpNo(v.getEmpNo());
            if (u != null && LEAD_ROLE.equals(roleOf(u))) {
                return true;
            }
        }
        return false;
    }

    /** 021(제출 흐름) 후크 — 담당자가 바뀌면 대기 중인 제출 확정을 취소한다. 019 에서는 자리만이다. */
    public void cancelPendingSubmit(String bidCaseId) {
        // 021 에서 구현한다.
    }

    // ── 내부 ───────────────────────────────────────────────────────────

    private static String roleOf(SysUser u) {
        return u.getRole() == null ? "" : u.getRole().trim();
    }

    private static boolean containsEmp(List<BidAssigneeView> rows, String emp) {
        for (BidAssigneeView r : rows) {
            if (r.getEmpNo().equals(emp)) {
                return true;
            }
        }
        return false;
    }

    /** 영업팀 전원(영업팀·영업팀장·영업부장). 디자이너·관리자(전산팀 등)는 403. */
    private static void requireSalesTeam(SysUser me) {
        String role = roleOf(me);
        if (!MEMBER_ROLE.equals(role) && !LEAD_ROLE.equals(role) && !HEAD_ROLE.equals(role)) {
            throw new ApiException(403, "이 기능을 쓸 권한이 없습니다.");
        }
    }

    private void requireBidCase(String bidCaseId) {
        if (bidCaseId == null || bidCaseId.isEmpty() || mapper.countBidCase(bidCaseId) == 0) {
            throw ApiException.notFound("bid case not found");   // BidCaseQueryService 와 같은 문구
        }
    }

    /** 사번 형식·중복·인원 수·ACTIVE·역할을 검사한다. 사번 값은 오류 문구에 싣지 않는다. */
    List<String> validateTargets(List<String> empNos) {
        if (empNos == null || empNos.size() < MIN_ASSIGNEES || empNos.size() > MAX_ASSIGNEES) {
            throw new ApiException(400, "담당자는 " + MIN_ASSIGNEES + "명 이상 " + MAX_ASSIGNEES + "명 이하로 지정하세요.");
        }
        Set<String> seen = new LinkedHashSet<>();
        for (String raw : empNos) {
            String e = raw == null ? null : raw.trim();
            if (!MenuPerms.isEmpNo(e)) {
                throw new ApiException(400, "사번(숫자 7자리) 형식이 아닌 값이 있습니다.");
            }
            if (!seen.add(e)) {
                throw new ApiException(400, "같은 사번이 중복되어 있습니다.");
            }
        }
        for (String e : seen) {
            requireAssignable(e);
        }
        return new ArrayList<>(seen);
    }

    /** 담당자가 될 수 있는 사용자(ACTIVE, 영업팀·영업팀장 — 영업부장·디자이너·타 팀 불가)인지 확인하고 돌려준다. */
    SysUser requireAssignable(String e) {
        SysUser u = users.selectByEmpNo(e);
        if (u == null || !"ACTIVE".equals(u.getStatus())) {
            throw new ApiException(400, "등록되지 않았거나 사용 중이 아닌 사용자가 있습니다.");
        }
        String role = roleOf(u);
        if (HEAD_ROLE.equals(role)) {
            throw new ApiException(400, "영업부장은 담당자로 지정할 수 없습니다.");
        }
        if (!MEMBER_ROLE.equals(role) && !LEAD_ROLE.equals(role)) {
            throw new ApiException(400, "담당자는 영업팀·영업팀장 사용자만 지정할 수 있습니다.");
        }
        return u;
    }

    /** 변경 신청의 사번 목록 정리 — null 은 빈 목록, 형식·중복·개수 검사(인원 수 상한은 한 번에 10명). */
    private static List<String> normalize(List<String> in) {
        List<String> out = new ArrayList<>();
        if (in == null) {
            return out;
        }
        if (in.size() > MAX_ASSIGNEES) {
            throw new ApiException(400, "한 번에 지정할 수 있는 인원은 " + MAX_ASSIGNEES + "명까지입니다.");
        }
        Set<String> seen = new LinkedHashSet<>();
        for (String raw : in) {
            String e = raw == null ? null : raw.trim();
            if (!MenuPerms.isEmpNo(e)) {
                throw new ApiException(400, "사번(숫자 7자리) 형식이 아닌 값이 있습니다.");
            }
            if (!seen.add(e)) {
                throw new ApiException(400, "같은 사번이 중복되어 있습니다.");
            }
        }
        out.addAll(seen);
        return out;
    }

    private static void checkResultSize(int result) {
        if (result < MIN_ASSIGNEES) {
            throw coded(400, "NO_ASSIGNEE_LEFT", "변경 후 담당자가 한 명도 남지 않습니다. 담당자는 최소 1명이어야 합니다.");
        }
        if (result > MAX_ASSIGNEES) {
            throw coded(400, "TOO_MANY_ASSIGNEES", "변경 후 담당자가 " + MAX_ASSIGNEES + "명을 넘습니다.");
        }
    }

    /**
     * 결재자 해석. 상신자 결재 체인({@link ApproverRules#chain})에서 처음 만나는 <b>활성</b> 해당 역할자 →
     * 없으면 그 역할 활성이 <b>정확히 1명</b>일 때만 그 사람 → 아니면 400. 어느 경우든 상신자보다 직급이 엄격히
     * 높아야 한다({@link Ranks#mayApprove}). 시드에는 영업팀장·영업부장이 각 2명이라 체인이 없으면 정해지지 않는다.
     */
    SysUser resolveApprover(SysUser requester, boolean headApproves) {
        String role = headApproves ? HEAD_ROLE : LEAD_ROLE;
        List<SysUser> all = users.selectAll();
        Map<String, SysUser> byEmp = new HashMap<>();
        for (SysUser u : all) {
            byEmp.put(u.getEmpNo(), u);
        }
        SysUser found = null;
        for (SysUser u : ApproverRules.chain(requester, byEmp)) {
            if (ApproverRules.active(u) && role.equals(roleOf(u))) {
                found = u;
                break;
            }
        }
        if (found == null) {
            List<SysUser> same = new ArrayList<>();
            for (SysUser u : all) {
                if (ApproverRules.active(u) && role.equals(roleOf(u))) {
                    same.add(u);
                }
            }
            if (same.size() == 1) {
                found = same.get(0);
            }
        }
        if (found == null || !Ranks.mayApprove(requester, found)) {
            throw coded(400, "APPROVER_NOT_RESOLVED",
                    "결재자를 정할 수 없습니다 — 시스템 관리자에게 상위 결재자 지정을 요청하세요.");
        }
        return found;
    }

    /** 진행 중인 변경 신청(없거나 끝났으면 null) — {@code PENDING_REQ_ID} 가 가리키는 요청이 PENDING 일 때만. */
    private Map<String, Object> pendingChange(BidAssignCase head) {
        if (head == null || head.getPendingReqId() == null) {
            return null;
        }
        ApprovalRequest r = requests.selectById(head.getPendingReqId());
        if (r == null || !"PENDING".equals(r.getStatus())) {
            return null;
        }
        JsonNode p = readPayload(r.getPayload());
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("req_id", r.getReqId());
        m.put("add_emp_nos", textList(p.path("add_emp_nos")));
        m.put("remove_emp_nos", textList(p.path("remove_emp_nos")));
        m.put("add_people", people(textList(p.path("add_emp_nos"))));
        m.put("remove_people", people(textList(p.path("remove_emp_nos"))));
        m.put("requested_by", r.getRequesterEmpNo());
        SysUser requester = users.selectByEmpNo(r.getRequesterEmpNo());
        m.put("requested_by_name", requester == null ? null : requester.getName());
        return m;
    }

    /** 사번 목록 → [{emp_no,name}]. USERS 에 없으면 name 은 null. 읽기만 한다. */
    private List<Map<String, Object>> people(List<String> empNos) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (String e : empNos) {
            SysUser u = users.selectByEmpNo(e);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("emp_no", e);
            m.put("name", u == null ? null : u.getName());
            out.add(m);
        }
        return out;
    }

    private static JsonNode readPayload(String s) {
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

    private static ApiException coded(int status, String code, String message) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("code", code);
        d.put("message", message);
        return ApiException.withDetail(status, d);
    }

    private static ApiException alreadyAssigned() {
        return coded(409, "ASSIGNED_ALREADY", "이미 담당자가 배정된 입찰 건입니다. 변경은 담당자 변경 신청으로 하세요.");
    }

    private static ApiException changePending() {
        return coded(409, "CHANGE_PENDING", "이 입찰 건에는 진행 중인 담당자 변경 신청이 있습니다. 끝난 뒤 다시 신청하세요.");
    }

    private static ApiException groupVerChanged() {
        return coded(409, "GROUP_VER_CHANGED",
                "담당자 구성이 신청 이후 바뀌어 승인할 수 없습니다. 반려하거나 취소하고 다시 신청하세요.");
    }

    private static List<Map<String, Object>> assigneeMaps(List<BidAssigneeView> rows) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (BidAssigneeView r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("emp_no", r.getEmpNo());
            m.put("name", r.getName());
            m.put("position_title", r.getPositionTitle());
            m.put("assigned_at", r.getAssignedAt());
            out.add(m);
        }
        return out;
    }
}
