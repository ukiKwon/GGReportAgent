package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.domain.ApprovalRequest;
import com.kbstar.kgi.ggreport.web.domain.ApprovalStep;
import com.kbstar.kgi.ggreport.web.domain.PermChange;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.ApprovalIn;
import com.kbstar.kgi.ggreport.web.dto.MenuDefinition;
import com.kbstar.kgi.ggreport.web.dto.SysAdminIn;
import com.kbstar.kgi.ggreport.web.mapper.ApprovalRequestMapper;
import com.kbstar.kgi.ggreport.web.mapper.PermChangeLogMapper;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.support.ApprovalTypes;
import com.kbstar.kgi.ggreport.web.support.ApproverRules;
import com.kbstar.kgi.ggreport.web.support.MenuPerms;
import com.kbstar.kgi.ggreport.web.support.Menus;
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
 * 단계 처리 자격: 지정된 결재자 본인, 또는 그 결재자의 <b>유효한 대결자</b>. 어느 쪽이든
 * {@link Ranks#mayDecide} 방향 규칙(상신자가 처리자보다 상위 직급이면 불가)을 통과해야 하고, 본인 요청은
 * 결재할 수 없다. 반려는 의견이 필수다. 마지막 단계가 승인되면 유형별 후처리를 같은 트랜잭션에서 실행한다 —
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

    public ApprovalRequestService(ApprovalRequestMapper requests, SysUserMapper users, CallerService callers,
                                  PermissionService permissions, ApprovalDeputyService deputies,
                                  PermChangeLogMapper changeLog) {
        this.requests = requests;
        this.users = users;
        this.callers = callers;
        this.permissions = permissions;
        this.deputies = deputies;
        this.changeLog = changeLog;
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
        List<ApprovalStep> steps = requests.selectSteps(id);
        ApprovalStep cur = current(steps, r);
        SysUser requester = users.selectByEmpNo(r.getRequesterEmpNo());
        String how = eligibility(me, requester, cur);
        if (how == null) {
            throw new ApiException(403, "이 요청을 결재할 수 없습니다 — 결재자(또는 유효한 대결자)가 아니거나, "
                    + "상신자보다 낮은 직급이거나, 본인의 요청입니다.");
        }
        String now = Times.nowIso();
        requests.updateStep(cur.getStepId(), approve ? "APPROVED" : "REJECTED", me.getEmpNo(),
                "DEPUTY".equals(how) ? 1 : 0, comment.isEmpty() ? null : comment, now);
        if (!approve) {
            skipRest(steps, cur, now);
            requests.updateRequest(id, "REJECTED", r.getCurrentStep(), "반려", now);
        } else if (cur.getStepNo() < steps.size()) {
            requests.updateRequest(id, "PENDING", cur.getStepNo() + 1, null, null);
        } else {
            String note = applyApproved(r, me);
            requests.updateRequest(id, "APPROVED", cur.getStepNo(), note, now);
        }
        return view(requests.selectById(id), me);
    }

    @Transactional
    public Map<String, Object> cancel(Long id, Actor actor) {
        SysUser me = callers.require(actor);
        ApprovalRequest r = require(id);
        if (!r.getRequesterEmpNo().equals(me.getEmpNo()) && !permissions.canAdmin(me.getEmpNo())) {
            throw new ApiException(403, "상신자 본인 또는 관리자만 취소할 수 있습니다.");
        }
        if (!"PENDING".equals(r.getStatus())) {
            throw new ApiException(409, "이미 처리된 요청입니다.");
        }
        String now = Times.nowIso();
        skipRest(requests.selectSteps(id), null, now);
        requests.updateRequest(id, "CANCELLED", r.getCurrentStep(),
                r.getRequesterEmpNo().equals(me.getEmpNo()) ? "상신자가 취소" : "관리자가 취소", now);
        return view(requests.selectById(id), me);
    }

    // ── 조회 ───────────────────────────────────────────────────────────

    /** {@code box}: mine(내가 올린 것) · inbox(내가 결재할 것, 대결 포함) · all(관리자 전용, 최근 200건). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(String box, Actor actor) {
        SysUser me = callers.require(actor);
        List<ApprovalRequest> rows = new ArrayList<>();
        if ("mine".equals(box)) {
            rows = requests.selectByRequester(me.getEmpNo());
        } else if ("inbox".equals(box)) {
            for (ApprovalRequest r : requests.selectPending()) {
                if (eligibility(me, users.selectByEmpNo(r.getRequesterEmpNo()),
                        current(requests.selectSteps(r.getReqId()), r)) != null) {
                    rows.add(r);
                }
            }
        } else if ("all".equals(box)) {
            if (!permissions.canAdmin(me.getEmpNo())) {
                throw new ApiException(403, "이 기능을 쓸 권한이 없습니다.");
            }
            rows = requests.selectAll();
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

    /** 상신자의 상위 결재자(활성·방향 규칙 통과). 최상위(대표급)면 null, 정해지지 않았으면 400. */
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
        if (!Ranks.mayDecide(requester, a)) {
            throw new ApiException(400, "상위 직급자에게만 결재를 올릴 수 있습니다 — 상위 결재자의 직급이 더 낮게 지정돼 있습니다.");
        }
        return a;
    }

    /**
     * 이 사람이 이 단계를 처리할 수 있는가. {@code "SELF"}(결재자 본인·관리자 확인) · {@code "DEPUTY"}(대결) ·
     * {@code null}(불가). 방향 규칙은 본인·대결자 모두에게 적용한다.
     */
    private String eligibility(SysUser me, SysUser requester, ApprovalStep step) {
        if (me.getEmpNo().equals(requester.getEmpNo())) {
            return null;
        }
        if ("ADMIN".equals(step.getKind())) {
            return permissions.canAdmin(me.getEmpNo()) ? "SELF" : null;
        }
        if (!Ranks.mayDecide(requester, me)) {
            return null;
        }
        if (me.getEmpNo().equals(step.getApproverEmpNo())) {
            return "SELF";
        }
        return deputies.principalsOf(me.getEmpNo(), Times.todayKst()).contains(step.getApproverEmpNo())
                ? "DEPUTY" : null;
    }

    private void skipRest(List<ApprovalStep> steps, ApprovalStep after, String now) {
        for (ApprovalStep s : steps) {
            if ("PENDING".equals(s.getStatus()) && (after == null || s.getStepNo() > after.getStepNo())) {
                requests.updateStep(s.getStepId(), "SKIPPED", null, 0, null, now);
            }
        }
    }

    /** 최종 승인 후처리. 권한 신청이면 신청한 사용자의 권한을 반영하고 변경 이력에 요청 번호를 남긴다. */
    private String applyApproved(ApprovalRequest r, SysUser decider) {
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
        String how = pending && requester != null ? eligibility(me, requester, current(steps, r)) : null;
        m.put("can_decide", how != null);
        m.put("acting_as_deputy", "DEPUTY".equals(how));
        m.put("can_cancel", pending && (r.getRequesterEmpNo().equals(me.getEmpNo())
                || permissions.canAdmin(me.getEmpNo())));
        return m;
    }
}
