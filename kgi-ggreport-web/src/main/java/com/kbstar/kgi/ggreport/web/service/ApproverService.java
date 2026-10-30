package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.PermChange;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.SysUserView;
import com.kbstar.kgi.ggreport.web.mapper.PermChangeLogMapper;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.support.ApproverRules;
import com.kbstar.kgi.ggreport.web.support.MenuPerms;
import com.kbstar.kgi.ggreport.web.support.Ranks;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 결재라인 — 사용자별 상위 결재자. 기본은 팀·직위로 <b>자동 결정</b>({@link ApproverRules}),
 * 관리자가 <b>지정</b>하면 그 뒤로는 자동 재계산에서 빠진다(단, 직급이 바뀌어 규칙에 어긋나면 자동 해제된다). 모든 변경은
 * {@code PERM_CHANGE_LOG} 에 같은 트랜잭션으로 남는다.
 */
@Service
public class ApproverService {

    public static final String AUTO = "AUTO";
    public static final String MANUAL = "MANUAL";

    private final SysUserMapper users;
    private final PermChangeLogMapper changeLog;

    public ApproverService(SysUserMapper users, PermChangeLogMapper changeLog) {
        this.users = users;
        this.changeLog = changeLog;
    }

    @Transactional(readOnly = true)
    public List<SysUserView> views() {
        List<SysUser> all = users.selectAll();
        Map<String, SysUser> byEmp = index(all);
        List<SysUserView> out = new java.util.ArrayList<>();
        for (SysUser u : all) {
            out.add(view(u, all, byEmp));
        }
        return out;
    }

    /**
     * 자동 모드 사용자의 결재자를 규칙대로 다시 맞춘다. 사용자 등록·역할·등급·상태가 바뀔 때마다
     * 호출한다(호출한 쪽의 트랜잭션에 참여). 퇴직자는 건드리지 않는다 — 그때의 결재선을 남긴다.
     *
     * <p>먼저 <b>직급이 바뀌어 규칙({@link Ranks#mayApprove})에 어긋나게 된 수동 지정</b>을 해제(AUTO)한다 —
     * 해제된 사용자는 같은 호출의 자동 단계에서 새 결재자가 정해진다(후보가 없거나 모호하면 비어 NEEDS).
     * 진행 중인 결재 요청의 결재선은 상신 때 스냅샷이라 건드리지 않는다(교착되면 관리자가 취소한다).
     */
    @Transactional
    public void recomputeAuto(Actor actor) {
        String now = Times.nowIso();
        List<SysUser> all = users.selectAll();
        if (releaseRankMismatch(actor, all, now)) {
            all = users.selectAll();   // 해제 반영본으로 자동 단계를 돌린다
        }
        for (SysUser u : all) {
            if (u.getApproverManual() == 1 || "RETIRED".equals(u.getStatus())) {
                continue;
            }
            ApproverRules.Result r = ApproverRules.resolve(u, all);
            String target = r.getState() == ApproverRules.State.OK ? r.getEmpNo() : null;
            if (!same(u.getApproverEmpNo(), target)) {
                users.updateApprover(u.getEmpNo(), target, 0, now);
                log(actor, u.getEmpNo(), "user:APPROVER", u.getApproverEmpNo(), target, now);
            }
        }
    }

    /** 수동 지정 중 결재자가 상신자보다 엄격히 높지 않게 된 쌍을 AUTO 로 푼다(결재자 값은 자동 단계가 정한다). */
    private boolean releaseRankMismatch(Actor actor, List<SysUser> all, String now) {
        Map<String, SysUser> byEmp = index(all);
        boolean any = false;
        for (SysUser u : all) {
            if (u.getApproverManual() != 1 || "RETIRED".equals(u.getStatus()) || u.getApproverEmpNo() == null) {
                continue;
            }
            SysUser a = byEmp.get(u.getApproverEmpNo());
            if (a == null || Ranks.mayApprove(u, a)) {
                continue;
            }
            users.updateApprover(u.getEmpNo(), u.getApproverEmpNo(), 0, now);
            log(actor, u.getEmpNo(), "user:APPROVER_RELEASED", u.getApproverEmpNo(), "RANK", now);
            log(actor, u.getEmpNo(), "user:APPROVER_MODE", MANUAL, AUTO, now);
            any = true;
        }
        return any;
    }

    @Transactional
    public SysUserView assign(String empNo, String approverEmpNo, String mode, Actor actor) {
        SysUser before = MenuPerms.isEmpNo(empNo) ? users.selectByEmpNo(empNo) : null;
        if (before == null) {
            throw new ApiException(404, "user not found");
        }
        if (!AUTO.equals(mode) && !MANUAL.equals(mode)) {
            throw new ApiException(400, "mode 는 AUTO 또는 MANUAL 이어야 합니다.");
        }
        List<SysUser> all = users.selectAll();
        String now = Times.nowIso();
        String target;
        int manual;
        if (AUTO.equals(mode)) {
            ApproverRules.Result r = ApproverRules.resolve(before, all);
            target = r.getState() == ApproverRules.State.OK ? r.getEmpNo() : null;
            manual = 0;
        } else {
            target = approverEmpNo == null ? null : approverEmpNo.trim();
            validateManual(before, target, all);
            manual = 1;
        }
        users.updateApprover(empNo, target, manual, now);
        diff(actor, empNo, "user:APPROVER", before.getApproverEmpNo(), target, now);
        diff(actor, empNo, "user:APPROVER_MODE", before.getApproverManual() == 1 ? MANUAL : AUTO,
                manual == 1 ? MANUAL : AUTO, now);
        List<SysUser> fresh = users.selectAll();
        return view(users.selectByEmpNo(empNo), fresh, index(fresh));
    }

    // ── 내부 ───────────────────────────────────────────────────────────

    private void validateManual(SysUser user, String target, List<SysUser> all) {
        if (!MenuPerms.isEmpNo(target)) {
            throw new ApiException(400, "상위 결재자의 사번(숫자 7자리)을 지정하세요.");
        }
        if (target.equals(user.getEmpNo())) {
            throw new ApiException(400, "자기 자신을 결재자로 지정할 수 없습니다.");
        }
        Map<String, SysUser> byEmp = index(all);
        SysUser a = byEmp.get(target);
        if (a == null) {
            throw new ApiException(400, "등록되지 않은 사번입니다.");
        }
        if (!ApproverRules.active(a)) {
            throw new ApiException(400, "사용 중이 아닌(잠김·퇴직) 사용자는 결재자가 될 수 없습니다.");
        }
        if ("NONE".equals(a.getApprovalGrade())) {
            throw new ApiException(400, "결재 등급이 있는 사용자만 결재자가 될 수 있습니다.");
        }
        if (!Ranks.mayApprove(user, a)) {
            throw new ApiException(400, "결재자는 상신자보다 직급이 높아야 합니다 — "
                    + label(a) + "은(는) " + label(user) + "보다 높지 않습니다.");
        }
        if (ApproverRules.wouldCycle(user.getEmpNo(), target, byEmp)) {
            throw new ApiException(400, "결재선이 순환합니다 — 그 사람의 결재 체인에 이미 이 사용자가 있습니다.");
        }
    }

    /** 오류 문구용 "이름(직위)". 직위가 비어 있으면 이름만. */
    private static String label(SysUser u) {
        String p = u.getPositionTitle();
        return u.getName() + (p == null || p.trim().isEmpty() ? "" : "(" + p.trim() + ")");
    }

    private static Map<String, SysUser> index(List<SysUser> all) {
        Map<String, SysUser> m = new LinkedHashMap<>();
        for (SysUser u : all) {
            m.put(u.getEmpNo(), u);
        }
        return m;
    }

    private SysUserView view(SysUser u, List<SysUser> all, Map<String, SysUser> byEmp) {
        SysUserView v = new SysUserView();
        v.setEmpNo(u.getEmpNo());
        v.setName(u.getName());
        v.setRole(u.getRole());
        v.setPositionTitle(u.getPositionTitle());
        v.setApprovalGrade(u.getApprovalGrade());
        v.setApproverEmpNo(u.getApproverEmpNo());
        v.setApproverManual(u.getApproverManual());
        v.setStatus(u.getStatus());
        v.setFailedLogins(u.getFailedLogins());
        v.setLastLoginAt(u.getLastLoginAt());
        v.setCreatedAt(u.getCreatedAt());
        v.setUpdatedAt(u.getUpdatedAt());
        boolean manual = u.getApproverManual() == 1;
        v.setApproverMode(manual ? MANUAL : AUTO);
        SysUser a = u.getApproverEmpNo() == null ? null : byEmp.get(u.getApproverEmpNo());
        v.setApproverName(a == null ? null : a.getName());
        if (manual) {
            boolean ok = a != null && ApproverRules.active(a);
            v.setApproverState(ok ? "MANUAL_OK" : "MANUAL_INVALID");
            if (!ok) {
                v.setApproverNote(a == null ? "지정된 결재자가 없습니다." : "지정한 결재자(" + a.getName() + ")가 사용 중이 아닙니다.");
            }
        } else {
            ApproverRules.Result r = ApproverRules.resolve(u, all);
            switch (r.getState()) {
                case OK:
                    v.setApproverState("AUTO_OK");
                    break;
                case TOP:
                    v.setApproverState("TOP");
                    break;
                case NONE:
                    v.setApproverState("NEEDS");
                    v.setApproverNote("한 단계 위 결재자가 없어 자동으로 정할 수 없습니다.");
                    break;
                default:
                    v.setApproverState("NEEDS");
                    v.setApproverNote("후보가 " + r.getCandidates().size() + "명이라 자동으로 정할 수 없습니다: "
                            + names(r.getCandidates(), byEmp));
            }
        }
        for (SysUser s : ApproverRules.chain(u, byEmp)) {
            v.getChain().add(new SysUserView.Step(s.getEmpNo(), s.getName(), s.getPositionTitle(), s.getStatus()));
        }
        return v;
    }

    private static String names(List<String> emps, Map<String, SysUser> byEmp) {
        StringBuilder sb = new StringBuilder();
        for (String e : emps) {
            SysUser u = byEmp.get(e);
            sb.append(sb.length() == 0 ? "" : ", ").append(u == null ? e : u.getName());
        }
        return sb.toString();
    }

    private static boolean same(String a, String b) {
        return (a == null ? "" : a).equals(b == null ? "" : b);
    }

    private void diff(Actor actor, String target, String item, String before, String after, String now) {
        if (!same(before, after)) {
            log(actor, target, item, before, after, now);
        }
    }

    private void log(Actor actor, String target, String item, String before, String after, String now) {
        PermChange c = new PermChange();
        c.setChangedAt(now);
        c.setActorEmpNo(actor == null ? null : actor.getEmpNo());
        c.setTargetEmpNo(target);
        c.setItem(item);
        c.setBeforeValue(before);
        c.setAfterValue(after);
        changeLog.insert(c);
    }
}
