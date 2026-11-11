package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.domain.ApprovalRequest;
import com.kbstar.kgi.ggreport.web.domain.ApprovalStep;
import com.kbstar.kgi.ggreport.web.domain.BoardMaterial;
import com.kbstar.kgi.ggreport.web.domain.PermChange;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.ApprovalIn;
import com.kbstar.kgi.ggreport.web.dto.BoardMaterialIn;
import com.kbstar.kgi.ggreport.web.dto.MenuDefinition;
import com.kbstar.kgi.ggreport.web.dto.PrepIn;
import com.kbstar.kgi.ggreport.web.dto.SysAdminIn;
import com.kbstar.kgi.ggreport.web.mapper.ApprovalRequestMapper;
import com.kbstar.kgi.ggreport.web.mapper.PermChangeLogMapper;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.support.ApprovalTypes;
import com.kbstar.kgi.ggreport.web.support.ApproverRules;
import com.kbstar.kgi.ggreport.web.support.MenuPerms;
import com.kbstar.kgi.ggreport.web.support.Menus;
import com.kbstar.kgi.ggreport.web.support.Pii;
import com.kbstar.kgi.ggreport.web.support.Ranks;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 결재 요청 — 상신·결재·반려·취소. 지금 상신할 수 있는 유형은 <b>권한 신청</b>({@link ApprovalTypes#PERM_REQUEST}).
 *
 * <p>결재선은 상신 때 <b>스냅샷</b>으로 고정한다(상위 결재자가 나중에 바뀌어도 진행 중인 건은 안 바뀐다).
 * 단계 처리 자격: 지정된 결재자 본인, 또는 그 결재자의 <b>유효한 대결자</b>. 결재자 본인은
 * {@link Ranks#mayApprove}(상신자보다 직급이 엄격히 높아야 함 — 같은 직급 불가), 대결자는
 * {@link Ranks#mayDecide}(상신자보다 낮지만 않으면 됨 — 같은 직급 가능)를 통과해야 하고, 본인 요청은
 * 결재할 수 없다. 관리자 확인(ADMIN) 단계는 이 규칙과 무관하다. 반려는 의견이 필수다. 마지막 단계가 승인되면 유형별 후처리를 같은 트랜잭션에서 실행한다 —
 * 후처리가 실패하면 승인도 되돌아간다(승인됐는데 반영이 안 된 상태를 남기지 않는다).
 *
 * <p>⚠️ 호출자는 {@link CallerService} 가 확인한다. 사번은 앞단 인증이 없으면 자기신고다.
 */
@Service
public class ApprovalRequestService {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final ApprovalRequestMapper requests;
    private final SysUserMapper users;
    private final CallerService callers;
    private final PermissionService permissions;
    private final ApprovalDeputyService deputies;
    private final PermChangeLogMapper changeLog;
    private final NotificationCommandService notes;
    private final BidAssignmentService assignments;
    private final BoardMaterialService materials;
    private final PrepService prep;

    /** 쪽지 종류 — 결재자에게 가는 알림 / 상신자에게 가는 결과. 쪽지함이 둘 다 결재함으로 이어 준다. */
    public static final String KIND_ALERT = "결재알림";
    public static final String KIND_RESULT = "결재결과";
    public static final String LINK_INBOX = "approvals:inbox";
    public static final String LINK_MINE = "approvals:mine";

    public ApprovalRequestService(ApprovalRequestMapper requests, SysUserMapper users, CallerService callers,
                                  PermissionService permissions, ApprovalDeputyService deputies,
                                  PermChangeLogMapper changeLog, NotificationCommandService notes,
                                  BidAssignmentService assignments, BoardMaterialService materials,
                                  PrepService prep) {
        this.prep = prep;
        this.requests = requests;
        this.users = users;
        this.callers = callers;
        this.permissions = permissions;
        this.deputies = deputies;
        this.changeLog = changeLog;
        this.notes = notes;
        this.assignments = assignments;
        this.materials = materials;
    }

    public List<Map<String, Object>> types() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (ApprovalTypes.Type t : ApprovalTypes.ALL) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("key", t.getKey());
            m.put("label", t.getLabel());
            m.put("submittable", t.isSubmittable());
            m.put("line", t.getLine());
            out.add(m);
        }
        return out;
    }

    // ── 상신 ───────────────────────────────────────────────────────────

    /**
     * 담당자 변경 신청(019 S2-b). 검증·결재자 계산은 {@link BidAssignmentService#planChange}가 하고(결재선은 서버가 정한다 —
     * 본문의 결재자·상신자는 받지 않는다), 여기서는 요청·결재선 행을 만들고 입찰 건에 진행 중 신청을 선점한다.
     * 선점 실패(409)는 이 트랜잭션이 롤백해 요청 행도 남지 않는다.
     */
    @Transactional
    public Map<String, Object> submitAssigneeChange(ApprovalIn.AssigneeChange in, Actor actor) {
        SysUser me = callers.require(actor);
        String reason = in.getReason() == null ? "" : in.getReason().trim();
        if (reason.isEmpty() || reason.length() > 200) {
            throw new ApiException(400, "변경 사유를 1~200자로 입력하세요.");
        }
        if (!Pii.scan(reason).isEmpty()) {
            throw new ApiException(422, "사유에 개인정보로 보이는 값이 있습니다. 지우고 다시 입력하세요.");   // 검출값은 싣지 않는다
        }
        String bid = in.getBidCaseId() == null ? "" : in.getBidCaseId().trim();
        if (bid.isEmpty() || bid.length() > 64) {
            throw new ApiException(400, "입찰 건을 지정하세요.");
        }
        BidAssignmentService.ChangePlan plan =
                assignments.planChange(bid, in.getAddEmpNos(), in.getRemoveEmpNos(), me);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("bid_case_id", plan.getBidCaseId());
        payload.put("group_ver", plan.getGroupVer());
        payload.put("add_emp_nos", plan.getAdd());
        payload.put("remove_emp_nos", plan.getRemove());
        payload.put("reason", reason);
        ApprovalRequest r = new ApprovalRequest();
        r.setReqType(ApprovalTypes.ASSIGNEE_CHANGE);
        r.setRequesterEmpNo(me.getEmpNo());
        r.setTitle(assignments.changeTitle(plan.getBidCaseId()));
        r.setPayload(write(payload));
        r.setStatus("PENDING");
        r.setCurrentStep(1);
        r.setCreatedAt(Times.nowIso());
        requests.insert(r);
        ApprovalStep s = step(1, "LINE", plan.getApprover().getEmpNo());
        s.setReqId(r.getReqId());
        requests.insertStep(s);
        assignments.claimPending(plan, r.getReqId());
        notifyStep(r, s, me);
        return view(requests.selectById(r.getReqId()), me);
    }

    /**
     * 이사회 자료 제출(020). 검증·결재자 계산은 materials.planSubmit 이 하고(결재선은 서버가 정한다 — 본문의 결재자·상신자는 받지 않는다),
     * 여기서는 요청·결재선 행을 만들고 자료를 SUBMITTED 로 선점한다. 선점 실패(409)는 이 트랜잭션이 롤백해 요청 행도 남지 않는다.
     */
    @Transactional
    public Map<String, Object> submitBoardMaterial(String materialId, Integer snapNo, Actor actor) {
        SysUser me = callers.require(actor);
        BoardMaterialService.SubmitPlan plan = materials.planSubmit(materialId, me, snapNo);
        BoardMaterial m = plan.getMaterial();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("material_id", m.getMaterialId());
        payload.put("snap_no", m.getCurSnap());
        ApprovalRequest r = new ApprovalRequest();
        r.setReqType(ApprovalTypes.BOARD_SUBMIT);
        r.setRequesterEmpNo(me.getEmpNo());
        r.setTitle("이사회 자료 제출 — " + (m.getInstitutionName() == null ? "" : m.getInstitutionName()) + " " + m.getBoardYear());
        r.setPayload(write(payload));
        r.setStatus("PENDING");
        r.setCurrentStep(1);
        r.setCreatedAt(Times.nowIso());
        requests.insert(r);
        ApprovalStep s = step(1, "LINE", plan.getApprover().getEmpNo());
        s.setReqId(r.getReqId());
        requests.insertStep(s);
        materials.claimSubmit(plan, r.getReqId(), me, actor);
        notifyStep(r, s, me);
        return view(requests.selectById(r.getReqId()), me);
    }

    /**
     * 사전준비 개설 신청(NEXT 70, BID_OPEN). 검증·결재자 계산은 prep.planOpen 이 하고(결재선은 서버가 정한다 — 본문의 결재자·상신자는 받지 않는다),
     * 여기서는 요청·결재선 행을 만들고 건을 OPEN_PENDING 으로 선점한다. 지명자는 payload 에만 둔다(승인 전에는 배정·권한 없음).
     * 선점 실패(409)는 이 트랜잭션이 롤백해 요청 행도 남지 않는다.
     */
    @Transactional
    public Map<String, Object> submitBidOpen(String bidCaseId, PrepIn.Open in, Actor actor) {
        SysUser me = callers.require(actor);
        PrepService.OpenPlan plan = prep.planOpen(bidCaseId, in == null ? null : in.getEmpNos(),
                in == null ? null : in.getComment(), me);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("bid_case_id", plan.getBidCaseId());
        payload.put("nominee_emp_nos", plan.getNominees());
        if (plan.getComment() != null) {
            payload.put("comment", plan.getComment());
        }
        ApprovalRequest r = new ApprovalRequest();
        r.setReqType(ApprovalTypes.BID_OPEN);
        r.setRequesterEmpNo(me.getEmpNo());
        r.setTitle("사전준비 개설 신청 — " + nameOrEmpty(plan.getInstitutionName()));
        r.setPayload(write(payload));
        r.setStatus("PENDING");
        r.setCurrentStep(1);
        r.setCreatedAt(Times.nowIso());
        requests.insert(r);
        ApprovalStep s = step(1, "LINE", plan.getApprover().getEmpNo());
        s.setReqId(r.getReqId());
        requests.insertStep(s);
        prep.claimOpen(plan, r.getReqId(), me, actor);
        notifyStep(r, s, me);
        return view(requests.selectById(r.getReqId()), me);
    }

    /** 사전준비 기획승인 상신(NEXT 70, PREP_APPROVAL) — 결재자는 영업부장 고정. 필수 과제 완료는 prep.planPlanApproval 이 서버에서 다시 판정한다. */
    @Transactional
    public Map<String, Object> submitPrepApproval(String bidCaseId, Actor actor) {
        SysUser me = callers.require(actor);
        PrepService.PlanPlan plan = prep.planPlanApproval(bidCaseId, me);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("bid_case_id", plan.getBidCaseId());
        ApprovalRequest r = new ApprovalRequest();
        r.setReqType(ApprovalTypes.PREP_APPROVAL);
        r.setRequesterEmpNo(me.getEmpNo());
        r.setTitle("사전준비 기획승인 — " + nameOrEmpty(plan.getInstitutionName()));
        r.setPayload(write(payload));
        r.setStatus("PENDING");
        r.setCurrentStep(1);
        r.setCreatedAt(Times.nowIso());
        requests.insert(r);
        ApprovalStep s = step(1, "LINE", plan.getApprover().getEmpNo());
        s.setReqId(r.getReqId());
        requests.insertStep(s);
        prep.claimPlan(plan, r.getReqId(), me, actor);
        notifyStep(r, s, me);
        return view(requests.selectById(r.getReqId()), me);
    }

    /** 회수 — 담당자 누구나, 결재 전(PENDING)일 때만. 요청은 CANCELLED, 자료는 DRAFT. */
    @Transactional
    public Map<String, Object> withdrawBoardSubmit(String materialId, Actor actor) {
        SysUser me = callers.require(actor);
        Long reqId = materials.planWithdraw(materialId, me);
        ApprovalRequest r = require(reqId);
        if (!"PENDING".equals(r.getStatus())) {
            throw new ApiException(409, "이미 처리된 요청입니다.");
        }
        String now = Times.nowIso();
        skipRest(requests.selectSteps(reqId), null, now);
        requireOne(requests.updateRequest(reqId, "CANCELLED", r.getCurrentStep(), "담당자가 회수", now));
        materials.afterSubmitEnded(reqId, materialId, "WITHDRAW", me.getEmpNo(), actor != null && actor.isVerified() ? 1 : 0);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("material_id", Long.valueOf(materialId));
        m.put("status_cd", "DRAFT");
        return m;
    }

    /**
     * 재작성 요구 — 영업부장. 결재 중(SUBMITTED)이면 그 결재 요청을 REJECTED(사유 기록)로 끝내고, 확정(CONFIRMED)이면 요청이 없다.
     * 어느 쪽이든 자료는 DRAFT 로 돌아가고 결과·개최일·확정 정보가 해제된다.
     */
    @Transactional
    public Map<String, Object> reworkBoardMaterial(String materialId, BoardMaterialIn.Rework in, Actor actor) {
        SysUser me = callers.require(actor);
        BoardMaterialService.ReworkPlan plan = materials.planRework(materialId, me, in);
        Long reqId = materials.reworkReqId(plan);
        if (reqId != null) {
            ApprovalRequest r = require(reqId);
            if (!"PENDING".equals(r.getStatus())) {
                throw new ApiException(409, "이미 처리된 요청입니다.");
            }
            String now = Times.nowIso();
            List<ApprovalStep> steps = requests.selectSteps(reqId);
            ApprovalStep cur = current(steps, r);
            requireOne(requests.updateStep(cur.getStepId(), "REJECTED", me.getEmpNo(), 0, plan.getReason(), now));
            skipRest(steps, cur, now);
            requireOne(requests.updateRequest(reqId, "REJECTED", r.getCurrentStep(), "영업부장 재작성 요구", now));
            notifyResult(r, users.selectByEmpNo(r.getRequesterEmpNo()), me, "영업부장이 재작성을 요구했습니다 — 사유: " + plan.getReason());
        }
        return materials.applyRework(plan, me, actor);
    }

    @Transactional
    public Map<String, Object> submitPerm(ApprovalIn.PermRequest in, Actor actor) {
        SysUser me = callers.require(actor);
        String reason = in.getReason() == null ? "" : in.getReason().trim();
        if (reason.isEmpty() || reason.length() > 200) {
            throw new ApiException(400, "신청 사유를 1~200자로 입력하세요.");
        }
        List<SysAdminIn.Perm> changes = in.getChanges();
        if (changes == null || changes.isEmpty() || changes.size() > Menus.MENUS.size()) {
            throw new ApiException(400, "신청할 메뉴 권한을 하나 이상 고르세요.");
        }
        // 상신 시점 본인 유효 권한 스냅샷 — 결재 카드의 '바뀌기 전 값'. 서버가 만든 값만 쓴다(요청 본문의 before 는 무시).
        // before 는 표시용이다 — 승인 반영(applyApproved)은 신청값 다섯 키(menu/view/write/edit/approve)만 읽는다.
        Map<String, PermissionService.Row> nowPerms = new java.util.HashMap<>();
        for (PermissionService.Row row : permissions.effective(me.getEmpNo())) {
            nowPerms.put(row.getMenuKey(), row);
        }
        boolean needsAdmin = false;
        List<Map<String, Object>> payloadChanges = new ArrayList<>();
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (SysAdminIn.Perm c : changes) {
            if (!knownMenu(c.getMenu()) || !seen.add(c.getMenu())) {
                throw new ApiException(400, "알 수 없거나 중복된 메뉴입니다: " + c.getMenu());
            }
            if (c.isApprove() && !MenuPerms.isApprovable(c.getMenu())) {
                throw new ApiException(400, "이 메뉴에는 결재 기능이 없어 결재 권한을 신청할 수 없습니다: " + c.getMenu());
            }
            if (Menus.ADMIN_MENU.equals(c.getMenu()) || c.isApprove()) {
                needsAdmin = true;
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("menu", c.getMenu());
            m.put("view", c.isView());
            m.put("write", c.isWrite());
            m.put("edit", c.isEdit());
            m.put("approve", c.isApprove());
            PermissionService.Row cur = nowPerms.get(c.getMenu());
            if (cur != null) {
                Map<String, Object> before = new LinkedHashMap<>();
                before.put("view", cur.isView());
                before.put("write", cur.isWrite());
                before.put("edit", cur.isEdit());
                before.put("approve", cur.isApprove());
                m.put("before", before);
            }
            payloadChanges.add(m);
        }
        List<ApprovalStep> steps = new ArrayList<>();
        SysUser line = lineApprover(me);
        if (line != null) {
            steps.add(step(steps.size() + 1, "LINE", line.getEmpNo()));
        } else {
            needsAdmin = true;      // 최상위(대표급)는 올릴 곳이 없어 관리자 확인으로 갈음한다
        }
        if (needsAdmin) {
            steps.add(step(steps.size() + 1, "ADMIN", null));
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("reason", reason);
        payload.put("changes", payloadChanges);
        ApprovalRequest r = new ApprovalRequest();
        r.setReqType(ApprovalTypes.PERM_REQUEST);
        r.setRequesterEmpNo(me.getEmpNo());
        r.setTitle("권한 신청 — " + changes.size() + "개 메뉴");
        r.setPayload(write(payload));
        r.setStatus("PENDING");
        r.setCurrentStep(1);
        r.setCreatedAt(Times.nowIso());
        requests.insert(r);
        for (ApprovalStep s : steps) {
            s.setReqId(r.getReqId());
            requests.insertStep(s);
        }
        notifyStep(r, steps.get(0), me);
        return view(requests.selectById(r.getReqId()), me);
    }

    // ── 결재 ───────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> decide(Long id, ApprovalIn.Decision in, Actor actor) {
        SysUser me = callers.require(actor);
        ApprovalRequest r = require(id);
        if (!"PENDING".equals(r.getStatus())) {
            throw new ApiException(409, "이미 처리된 요청입니다.");
        }
        boolean approve = "APPROVE".equals(in.getDecision());
        if (!approve && !"REJECT".equals(in.getDecision())) {
            throw new ApiException(400, "decision 은 APPROVE 또는 REJECT 여야 합니다.");
        }
        String comment = in.getComment() == null ? "" : in.getComment().trim();
        if (comment.length() > 500) {
            throw new ApiException(400, "의견은 500자 이내로 입력하세요.");
        }
        if (!approve && comment.isEmpty()) {
            throw new ApiException(400, "반려할 때는 의견을 적어야 합니다.");
        }
        if (ApprovalTypes.BOARD_SUBMIT.equals(r.getReqType())) {   // 이사회 자료 제출 결재 의견: 제어문자 400·개인정보 422(security S2). 다른 유형은 기존 동작 유지
            String checked = BoardMaterialService.checkedText(comment, 500, "의견", !approve);
            comment = checked == null ? "" : checked;
        } else if (ApprovalTypes.isPrep(r.getReqType())) {   // 사전준비 결재 의견도 같은 규칙(제어문자 400·개인정보 422)
            String checked = BoardMaterialService.checkedText(comment, 500, "의견", !approve);
            comment = checked == null ? "" : checked;
        }
        List<ApprovalStep> steps = requests.selectSteps(id);
        ApprovalStep cur = current(steps, r);
        SysUser requester = users.selectByEmpNo(r.getRequesterEmpNo());
        String how = eligibility(me, requester, cur, r.getReqType());
        if (how == null) {
            throw new ApiException(403, "이 요청을 결재할 수 없습니다 — 결재자(또는 유효한 대결자)가 아니거나, "
                    + "직급이 맞지 않거나(결재자는 상신자보다 높아야 하고 대결자는 상신자보다 낮으면 안 됩니다), 본인의 요청입니다.");
        }
        String now = Times.nowIso();
        requireOne(requests.updateStep(cur.getStepId(), approve ? "APPROVED" : "REJECTED", me.getEmpNo(),
                "DEPUTY".equals(how) ? 1 : 0, comment.isEmpty() ? null : comment, now));
        if (!approve) {
            skipRest(steps, cur, now);
            requireOne(requests.updateRequest(id, "REJECTED", r.getCurrentStep(), "반려", now));
            if (ApprovalTypes.BOARD_SUBMIT.equals(r.getReqType())) {
                materials.afterSubmitEnded(id, readPayloadMaterialId(r), "REJECT", me.getEmpNo(),
                        actor != null && actor.isVerified() ? 1 : 0);
            }
            if (ApprovalTypes.BID_OPEN.equals(r.getReqType())) {
                prep.afterOpenEnded(id, readPayloadBid(r), "OPEN_REJECT", comment, me, actor != null && actor.isVerified() ? 1 : 0);
            } else if (ApprovalTypes.PREP_APPROVAL.equals(r.getReqType())) {
                prep.afterPlanEnded(id, readPayloadBid(r), "PLAN_REJECT", comment, me, actor != null && actor.isVerified() ? 1 : 0);
            }
            notifyResult(r, requester, me, "반려되었습니다" + (comment.isEmpty() ? "" : " — 사유: " + comment));
        } else if (cur.getStepNo() < steps.size()) {
            requireOne(requests.updateRequest(id, "PENDING", cur.getStepNo() + 1, null, null));
            for (ApprovalStep s : steps) {
                if (s.getStepNo() == cur.getStepNo() + 1) {
                    notifyStep(r, s, requester);          // 다음 결재자(와 그 대결자)에게
                }
            }
        } else {
            String note = applyApproved(r, me, actor);
            requireOne(requests.updateRequest(id, "APPROVED", cur.getStepNo(), note, now));   // 0행이면 후처리째 롤백
            notifyResult(r, requester, me, "승인되어 반영되었습니다");
        }
        return view(requests.selectById(id), me);
    }

    @Transactional
    public Map<String, Object> cancel(Long id, Actor actor) {
        SysUser me = callers.require(actor);
        ApprovalRequest r = require(id);
        boolean own = r.getRequesterEmpNo().equals(me.getEmpNo());
        if (!own && (ApprovalTypes.ASSIGNEE_CHANGE.equals(r.getReqType()) || ApprovalTypes.BOARD_SUBMIT.equals(r.getReqType())
                || ApprovalTypes.isPrep(r.getReqType()))) {
            throw new ApiException(403, "이 요청은 신청자 본인만 취소할 수 있습니다.");   // 관리자도 불가(영업팀 내부 정보, 2026-11-10 사용자 결정)
        }
        if (!own && !permissions.canAdmin(me.getEmpNo())) {
            throw new ApiException(403, "상신자 본인 또는 관리자만 취소할 수 있습니다.");
        }
        if (!"PENDING".equals(r.getStatus())) {
            throw new ApiException(409, "이미 처리된 요청입니다.");
        }
        if (ApprovalTypes.BOARD_SUBMIT.equals(r.getReqType())) {
            materials.planWithdraw(readPayloadMaterialId(r), me);   // 현재 담당자만 취소 가능(담당에서 빠진 신청자는 403/404), 이미 SUBMITTED 가 아니면 409
        }
        String now = Times.nowIso();
        skipRest(requests.selectSteps(id), null, now);
        requireOne(requests.updateRequest(id, "CANCELLED", r.getCurrentStep(),
                r.getRequesterEmpNo().equals(me.getEmpNo()) ? "상신자가 취소" : "관리자가 취소", now));
        if (ApprovalTypes.ASSIGNEE_CHANGE.equals(r.getReqType())) {
            assignments.releasePending(r);          // 그 요청이 잡고 있던 선점만 푼다(다른 요청의 선점은 그대로)
        }
        if (ApprovalTypes.BOARD_SUBMIT.equals(r.getReqType())) {
            materials.afterSubmitEnded(id, readPayloadMaterialId(r), "WITHDRAW", me.getEmpNo(),
                    actor != null && actor.isVerified() ? 1 : 0);   // 신청자 본인 취소 = 회수와 같다
        }
        if (ApprovalTypes.BID_OPEN.equals(r.getReqType())) {
            prep.afterOpenEnded(id, readPayloadBid(r), "OPEN_WITHDRAW", null, me, actor != null && actor.isVerified() ? 1 : 0);
        } else if (ApprovalTypes.PREP_APPROVAL.equals(r.getReqType())) {
            prep.afterPlanEnded(id, readPayloadBid(r), "PLAN_WITHDRAW", null, me, actor != null && actor.isVerified() ? 1 : 0);
        }
        if (!r.getRequesterEmpNo().equals(me.getEmpNo())) {      // 남이 취소했을 때만 알린다
            notifyResult(r, users.selectByEmpNo(r.getRequesterEmpNo()), me, "관리자가 취소했습니다");
        }
        return view(requests.selectById(id), me);
    }

    // ── 쪽지 알림 ─────────────────────────────────────────────────────

    /**
     * 이 단계의 결재자에게 개인 쪽지를 보낸다. 받는 사람은 사번으로 지정한다(이름은 겹칠 수 있다).
     * <ul>
     *   <li>LINE 단계: 결재자 + 그날 유효한 대결자(방향 규칙을 통과하는 사람만 — 결재할 수 없는 사람에게는 보내지 않는다)</li>
     *   <li>ADMIN 단계: 시스템 관리자 전원(활성, 상신자 본인 제외)</li>
     * </ul>
     */
    private void notifyStep(ApprovalRequest r, ApprovalStep step, SysUser requester) {
        List<String> to = new ArrayList<>();
        Map<String, String> viaDeputy = new LinkedHashMap<>();     // 대결자 사번 → 대신하는 결재자 이름
        if ("ADMIN".equals(step.getKind())) {
            for (SysUser u : users.selectAll()) {
                if ("ACTIVE".equals(u.getStatus()) && !u.getEmpNo().equals(requester.getEmpNo())
                        && permissions.canAdmin(u.getEmpNo())) {
                    to.add(u.getEmpNo());
                }
            }
        } else {
            to.add(step.getApproverEmpNo());
            SysUser principal = users.selectByEmpNo(step.getApproverEmpNo());
            List<String> deps = ApprovalTypes.NO_PROXY.contains(r.getReqType())
                    ? new ArrayList<String>() : deputies.deputiesOf(step.getApproverEmpNo(), Times.todayKst());
            for (String dep : deps) {
                SysUser d = users.selectByEmpNo(dep);
                if (d != null && "ACTIVE".equals(d.getStatus()) && !dep.equals(requester.getEmpNo())
                        && Ranks.mayDecide(requester, d) && !to.contains(dep)) {
                    to.add(dep);
                    viaDeputy.put(dep, principal == null ? "" : principal.getName());
                }
            }
        }
        String who = requester.getName() + (requester.getPositionTitle() == null ? "" : "(" + requester.getPositionTitle() + ")");
        for (String emp : to) {
            String body = "[결재 요청] " + who + "님이 '" + r.getTitle() + "' 요청을 올렸습니다. 결재함에서 확인하세요."
                    + (viaDeputy.containsKey(emp) ? " (" + viaDeputy.get(emp) + "님의 대결자로 받았습니다)" : "");
            notes.create(emp, KIND_ALERT, body, null, null, LINK_INBOX, step.getStepNo(), requester.getName());
        }
    }

    /** 결과(승인·반려·취소)를 상신자에게 개인 쪽지로 알린다. */
    private void notifyResult(ApprovalRequest r, SysUser requester, SysUser actor, String what) {
        if (requester == null) {
            return;
        }
        notes.create(requester.getEmpNo(), KIND_RESULT, "[결재 결과] '" + r.getTitle() + "' 요청이 " + what + ".",
                null, null, LINK_MINE, null, actor.getName());
    }

    // ── 조회 ───────────────────────────────────────────────────────────

    /**
     * 내 권한 현황 — 권한 신청 화면이 "지금 무엇을 갖고 있는지"를 보여 주는 데 쓴다.
     * {@code /sysadmin/perms/{emp}} 는 관리자 전용이라 일반 사용자는 못 부른다. 이쪽은 <b>호출자 본인 것만</b> 준다
     * (사번을 받지 않는다 — 다른 사람의 권한을 볼 길이 없다).
     * {@code can_approve} : 결재함의 결재 권한이 있는지 — 화면이 '받은 결재' 안내를 고르는 데 쓴다.
     * {@code rank_can_approve} : 직급상 팀장 이상인가({@link Ranks#isApproverRank}) — 메뉴 권한(can_approve)과
     * 별개이며 그 값을 바꾸지 않는다. 실제 승인 허용은 여전히 {@link Ranks#mayApprove}·{@link Ranks#mayDecide}·eligibility 가 정한다.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> myPerms(Actor actor) {
        SysUser me = callers.require(actor);
        List<PermissionService.Row> rows = permissions.effective(me.getEmpNo());
        boolean canApprove = false;
        for (PermissionService.Row r : rows) {
            if ("approvals".equals(r.getMenuKey()) && r.isApprove()) {
                canApprove = true;
            }
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("emp_no", me.getEmpNo());
        m.put("name", me.getName());
        m.put("role", me.getRole());
        m.put("position_title", me.getPositionTitle());
        // 지금 상신하면 첫 번째로 받는 상위 결재자(지정·자동 모두 반영). 결재자가 잘못 지정돼(직급이 같거나 낮음·
        // 비활성) 있어도 내 권한 화면 전체가 400으로 깨지지 않게 상위 결재자만 비운다 — 상신 때는 여전히 막힌다.
        SysUser line;
        try {
            line = lineApprover(me);
        } catch (ApiException e) {
            line = null;
        }
        m.put("approver_emp_no", line == null ? null : line.getEmpNo());
        m.put("approver_name", line == null ? null : line.getName());
        m.put("can_approve", canApprove);
        m.put("rank_can_approve", Ranks.isApproverRank(me));
        m.put("menus", rows);
        return m;
    }

    /** {@code box}: mine(내가 올린 것) · inbox(내가 결재할 것, 대결 포함) · all(관리자 전용, 담당자 변경 제외, 최근 200건). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(String box, Actor actor) {
        SysUser me = callers.require(actor);
        List<ApprovalRequest> rows = new ArrayList<>();
        if ("mine".equals(box)) {
            rows = requests.selectByRequester(me.getEmpNo());
        } else if ("inbox".equals(box)) {
            for (ApprovalRequest r : requests.selectPending()) {
                if (eligibility(me, users.selectByEmpNo(r.getRequesterEmpNo()),
                        current(requests.selectSteps(r.getReqId()), r), r.getReqType()) != null) {
                    rows.add(r);
                }
            }
        } else if ("all".equals(box)) {
            if (!permissions.canAdmin(me.getEmpNo())) {
                throw new ApiException(403, "이 기능을 쓸 권한이 없습니다.");
            }
            rows = new ArrayList<>();
            for (ApprovalRequest x : requests.selectAll()) {
                if (!ApprovalTypes.ASSIGNEE_CHANGE.equals(x.getReqType()) && !ApprovalTypes.BOARD_SUBMIT.equals(x.getReqType())
                        && !ApprovalTypes.isPrep(x.getReqType())) {   // 영업팀 내부 정보 — 관리자 전체 목록에서 제외(mine·inbox 는 유지)
                    rows.add(x);
                }
            }
            if (rows.size() > 200) {
                rows = rows.subList(0, 200);
            }
        } else {
            throw new ApiException(400, "box 는 mine · inbox · all 중 하나여야 합니다.");
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (ApprovalRequest r : rows) {
            out.add(view(r, me));
        }
        return out;
    }

    // ── 내부 ───────────────────────────────────────────────────────────

    private ApprovalRequest require(Long id) {
        ApprovalRequest r = id == null ? null : requests.selectById(id);
        if (r == null) {
            throw new ApiException(404, "결재 요청을 찾을 수 없습니다.");
        }
        return r;
    }

    private static ApprovalStep step(int no, String kind, String approver) {
        ApprovalStep s = new ApprovalStep();
        s.setStepNo(no);
        s.setKind(kind);
        s.setApproverEmpNo(approver);
        s.setStatus("PENDING");
        return s;
    }

    private static ApprovalStep current(List<ApprovalStep> steps, ApprovalRequest r) {
        for (ApprovalStep s : steps) {
            if (s.getStepNo() == r.getCurrentStep()) {
                return s;
            }
        }
        throw new ApiException(500, "결재 단계 정보가 맞지 않습니다.");
    }

    /** 상신자의 상위 결재자(활성·상신자보다 엄격히 높은 직급). 최상위(대표급)면 null, 정해지지 않았으면 400. */
    private SysUser lineApprover(SysUser requester) {
        String emp = requester.getApproverEmpNo();
        if (emp == null) {
            if (ApproverRules.level(requester) >= 3) {
                return null;
            }
            throw new ApiException(400, "상위 결재자가 정해지지 않았습니다 — 시스템 관리자에게 지정을 요청하세요.");
        }
        SysUser a = users.selectByEmpNo(emp);
        if (a == null || !"ACTIVE".equals(a.getStatus())) {
            throw new ApiException(400, "상위 결재자가 사용 중이 아닙니다 — 시스템 관리자에게 재지정을 요청하세요.");
        }
        if (!Ranks.mayApprove(requester, a)) {
            throw new ApiException(400, "결재자는 상신자보다 직급이 높아야 합니다 — 지정된 상위 결재자의 직급이 같거나 낮습니다. "
                    + "시스템 관리자에게 재지정을 요청하세요.");
        }
        return a;
    }

    /**
     * 이 사람이 이 단계를 처리할 수 있는가. {@code "SELF"}(결재자 본인·관리자 확인) · {@code "DEPUTY"}(대결) ·
     * {@code null}(불가). 결재자 본인은 상신자보다 직급이 엄격히 높아야 하고({@link Ranks#mayApprove}),
     * 대결자는 같은 직급까지 허용한다({@link Ranks#mayDecide}).
     */
    private String eligibility(SysUser me, SysUser requester, ApprovalStep step, String reqType) {
        if (me.getEmpNo().equals(requester.getEmpNo())) {
            return null;
        }
        if ("ADMIN".equals(step.getKind())) {
            return permissions.canAdmin(me.getEmpNo()) ? "SELF" : null;
        }
        if (me.getEmpNo().equals(step.getApproverEmpNo())) {
            return Ranks.mayApprove(requester, me) ? "SELF" : null;
        }
        if (ApprovalTypes.NO_PROXY.contains(reqType)) {      // 담당자 변경은 결재자 본인만(대결 불가)
            return null;
        }
        return Ranks.mayDecide(requester, me)
                && deputies.principalsOf(me.getEmpNo(), Times.todayKst()).contains(step.getApproverEmpNo())
                ? "DEPUTY" : null;
    }

    /** 상태 전이 문장이 정확히 1행이 아니면 그 사이 다른 결재·취소가 먼저 끝난 것 — 409 로 끝내 트랜잭션 전체를 되돌린다. */
    private static void requireOne(int rows) {
        if (rows != 1) {
            throw new ApiException(409, "이미 처리된 요청입니다.");
        }
    }

    private void skipRest(List<ApprovalStep> steps, ApprovalStep after, String now) {
        for (ApprovalStep s : steps) {
            if ("PENDING".equals(s.getStatus()) && (after == null || s.getStepNo() > after.getStepNo())) {
                requests.updateStep(s.getStepId(), "SKIPPED", null, 0, null, now);   // 0행이어도 무시 — 요청 갱신(requireOne)이 판정한다
            }
        }
    }

    /** 최종 승인 후처리. 권한 신청이면 신청한 사용자의 권한을 반영하고 변경 이력에 요청 번호를 남긴다. */
    private String applyApproved(ApprovalRequest r, SysUser decider, Actor actor) {
        if (ApprovalTypes.ASSIGNEE_CHANGE.equals(r.getReqType())) {
            return assignments.applyChange(r, decider, actor);
        }
        if (ApprovalTypes.BOARD_SUBMIT.equals(r.getReqType())) {
            return materials.applyConfirm(r, decider, actor);
        }
        if (ApprovalTypes.BID_OPEN.equals(r.getReqType())) {
            return prep.applyOpen(r, decider, actor);
        }
        if (ApprovalTypes.PREP_APPROVAL.equals(r.getReqType())) {
            return prep.applyPlanApproval(r, decider, actor);
        }
        if (!ApprovalTypes.PERM_REQUEST.equals(r.getReqType())) {
            return null;
        }
        JsonNode payload = read(r.getPayload());
        List<SysAdminIn.Perm> changes = new ArrayList<>();
        for (JsonNode c : payload.path("changes")) {
            SysAdminIn.Perm p = new SysAdminIn.Perm();
            p.setMenu(c.path("menu").asText());
            p.setView(c.path("view").asBoolean());
            p.setWrite(c.path("write").asBoolean());
            p.setEdit(c.path("edit").asBoolean());
            p.setApprove(c.path("approve").asBoolean());
            changes.add(p);
        }
        int saved = permissions.save(r.getRequesterEmpNo(), changes, Actor.claimed(decider.getEmpNo()));
        PermChange log = new PermChange();
        log.setChangedAt(Times.nowIso());
        log.setActorEmpNo(decider.getEmpNo());
        log.setTargetEmpNo(r.getRequesterEmpNo());
        log.setItem("approval:REQUEST");
        log.setAfterValue("#" + r.getReqId());
        changeLog.insert(log);
        return "권한 반영: " + saved + "개 메뉴";
    }

    /** 결재 요청 payload 의 material_id(문자열). 없거나 숫자가 아니면 빈 문자열(→ 후처리가 409). */
    private String readPayloadMaterialId(ApprovalRequest r) {
        return read(r.getPayload()).path("material_id").asText("");
    }

    /** 사전준비 결재 요청 payload 의 bid_case_id. 없으면 빈 문자열(후크가 아무것도 하지 않는다). */
    private String readPayloadBid(ApprovalRequest r) {
        return read(r.getPayload()).path("bid_case_id").asText("");
    }

    private static String nameOrEmpty(String s) {
        return s == null ? "" : s;
    }

    private static boolean knownMenu(String key) {
        for (MenuDefinition m : Menus.MENUS) {
            if (m.getKey().equals(key)) {
                return true;
            }
        }
        return false;
    }

    private static String write(Object o) {
        try {
            return JSON.writeValueAsString(o);
        } catch (IOException e) {
            throw new ApiException(500, "요청 내용을 저장할 수 없습니다.");
        }
    }

    private static JsonNode read(String s) {
        try {
            return JSON.readTree(s == null ? "{}" : s);
        } catch (IOException e) {
            throw new ApiException(500, "요청 내용을 읽을 수 없습니다.");
        }
    }

    /** 담당자 변경 요청의 추가·해제 대상 — 사번·이름·직위만. */
    private List<Map<String, Object>> peopleOf(JsonNode payload) {
        List<Map<String, Object>> out = new ArrayList<>();
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (String key : new String[]{"add_emp_nos", "remove_emp_nos"}) {
            for (JsonNode n : payload.path(key)) {
                String emp = n.asText();
                SysUser u = seen.add(emp) ? users.selectByEmpNo(emp) : null;
                if (u != null) {
                    Map<String, Object> p = new LinkedHashMap<>();
                    p.put("emp_no", u.getEmpNo());
                    p.put("name", u.getName());
                    p.put("position_title", u.getPositionTitle());
                    out.add(p);
                }
            }
        }
        return out;
    }

    private String nameOf(String emp) {
        SysUser u = emp == null ? null : users.selectByEmpNo(emp);
        return u == null ? null : u.getName();
    }

    private Map<String, Object> view(ApprovalRequest r, SysUser me) {
        Map<String, Object> m = new LinkedHashMap<>();
        SysUser requester = users.selectByEmpNo(r.getRequesterEmpNo());
        ApprovalTypes.Type type = ApprovalTypes.find(r.getReqType());
        List<ApprovalStep> steps = requests.selectSteps(r.getReqId());
        m.put("req_id", r.getReqId());
        m.put("req_type", r.getReqType());
        m.put("type_label", type == null ? r.getReqType() : type.getLabel());
        m.put("title", r.getTitle());
        m.put("status", r.getStatus());
        m.put("current_step", r.getCurrentStep());
        m.put("requester_emp_no", r.getRequesterEmpNo());
        m.put("requester_name", requester == null ? null : requester.getName());
        m.put("requester_position", requester == null ? null : requester.getPositionTitle());
        m.put("created_at", r.getCreatedAt());
        m.put("decided_at", r.getDecidedAt());
        m.put("result_note", r.getResultNote());
        m.put("payload", read(r.getPayload()));
        if (ApprovalTypes.ASSIGNEE_CHANGE.equals(r.getReqType())) {
            m.put("people", peopleOf(read(r.getPayload())));   // 카드가 사번 대신 이름·직위를 보이게(이 유형만)
        }
        List<Map<String, Object>> sv = new ArrayList<>();
        for (ApprovalStep s : steps) {
            Map<String, Object> x = new LinkedHashMap<>();
            x.put("step_no", s.getStepNo());
            x.put("kind", s.getKind());
            x.put("approver_emp_no", s.getApproverEmpNo());
            x.put("approver_name", "ADMIN".equals(s.getKind()) ? "시스템 관리자" : nameOf(s.getApproverEmpNo()));
            x.put("status", s.getStatus());
            x.put("acted_by", s.getActedBy());
            x.put("acted_by_name", nameOf(s.getActedBy()));
            x.put("acted_as_deputy", s.getActedAsDeputy() == 1);
            x.put("comment", s.getCommentText());
            x.put("acted_at", s.getActedAt());
            sv.add(x);
        }
        m.put("steps", sv);
        boolean pending = "PENDING".equals(r.getStatus());
        String how = pending && requester != null
                ? eligibility(me, requester, current(steps, r), r.getReqType()) : null;
        m.put("can_decide", how != null);
        m.put("acting_as_deputy", "DEPUTY".equals(how));
        boolean teamInternal = ApprovalTypes.ASSIGNEE_CHANGE.equals(r.getReqType()) || ApprovalTypes.BOARD_SUBMIT.equals(r.getReqType())
                || ApprovalTypes.isPrep(r.getReqType());
        m.put("can_cancel", pending && (r.getRequesterEmpNo().equals(me.getEmpNo())
                || (!teamInternal && permissions.canAdmin(me.getEmpNo()))));
        return m;
    }
}
