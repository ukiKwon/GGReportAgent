package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.PermChange;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.SysAdminIn;
import com.kbstar.kgi.ggreport.web.mapper.PermChangeLogMapper;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.support.MenuPerms;
import com.kbstar.kgi.ggreport.web.support.Menus;
import com.kbstar.kgi.ggreport.web.support.Ranks;
import com.kbstar.kgi.ggreport.web.support.Teams;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 사용자 등록·수정·상태 변경. 삭제는 없다 — 퇴직({@code RETIRED})으로 이력을 남긴다.
 *
 * <p>입력은 서버가 다시 검증한다(화면 검증을 믿지 않는다): 사번 숫자 7자리, 역할은 {@code Teams.ROLES} 중
 * 하나, 결재 등급·상태는 허용 목록. 바뀐 값은 {@code PERM_CHANGE_LOG} 에 같은 트랜잭션으로 남긴다.
 * 마지막 관리자를 잠그거나 퇴직시키거나 관리자 권한이 없는 역할로 바꾸는 변경은 거부한다.
 */
@Service
public class UserAdminService {

    private final SysUserMapper users;
    private final PermChangeLogMapper changeLog;
    private final PermissionService permissions;
    private final ApproverService approvers;

    public UserAdminService(SysUserMapper users, PermChangeLogMapper changeLog, PermissionService permissions,
                            ApproverService approvers) {
        this.users = users;
        this.changeLog = changeLog;
        this.permissions = permissions;
        this.approvers = approvers;
    }

    @Transactional(readOnly = true)
    public List<SysUser> list() {
        return users.selectAll();
    }

    @Transactional
    public SysUser create(SysAdminIn.UserForm in, Actor actor) {
        String empNo = in.getEmpNo() == null ? null : in.getEmpNo().trim();
        if (!MenuPerms.isEmpNo(empNo)) {
            throw new ApiException(400, "사번은 숫자 7자리여야 합니다.");
        }
        validate(in);
        if (users.selectByEmpNo(empNo) != null) {
            throw new ApiException(409, "이미 등록된 사번입니다.");
        }
        String now = Times.nowIso();
        SysUser u = new SysUser();
        u.setEmpNo(empNo);
        u.setName(in.getName().trim());
        u.setRole(in.getRole());
        u.setPositionTitle(blankToNull(in.getPositionTitle()));
        u.setApprovalGrade(gradeOf(in));
        u.setStatus("ACTIVE");
        u.setCreatedAt(now);
        u.setUpdatedAt(now);
        try {
            users.insert(u);
        } catch (DuplicateKeyException e) {
            throw new ApiException(409, "이미 등록된 사번입니다.");
        }
        log(actor, empNo, "user:CREATE", null, u.getRole(), now);
        approvers.recomputeAuto(actor);   // 새 사용자의 결재자(자동)와, 새 팀장·부장이 생겨 바뀌는 사람들
        return users.selectByEmpNo(empNo);
    }

    @Transactional
    public SysUser update(String empNo, SysAdminIn.UserForm in, Actor actor) {
        SysUser before = require(empNo);
        validate(in);
        String role = in.getRole();
        if (!role.equals(before.getRole()) && "ACTIVE".equals(before.getStatus())
                && permissions.viewWouldBe(before, before.getRole(), Menus.ADMIN_MENU)
                && !permissions.viewWouldBe(before, role, Menus.ADMIN_MENU)
                && !permissions.otherAdminExists(empNo)) {
            throw new ApiException(400, "마지막 관리자의 역할은 관리자 권한이 없는 역할로 바꿀 수 없습니다.");
        }
        String now = Times.nowIso();
        String grade = gradeOf(in);
        users.updateProfile(empNo, in.getName().trim(), role, blankToNull(in.getPositionTitle()), grade, now);
        diff(actor, empNo, "user:NAME", before.getName(), in.getName().trim(), now);
        diff(actor, empNo, "user:ROLE", before.getRole(), role, now);
        diff(actor, empNo, "user:POSITION_TITLE", before.getPositionTitle(), blankToNull(in.getPositionTitle()), now);
        diff(actor, empNo, "user:APPROVAL_GRADE", before.getApprovalGrade(), grade, now);
        approvers.recomputeAuto(actor);
        return users.selectByEmpNo(empNo);
    }

    @Transactional
    public SysUser setStatus(String empNo, String status, Actor actor) {
        SysUser before = require(empNo);
        if (!MenuPerms.STATUSES.contains(status)) {
            throw new ApiException(400, "알 수 없는 상태입니다.");
        }
        if (!"ACTIVE".equals(status) && "ACTIVE".equals(before.getStatus())
                && permissions.canAdmin(empNo) && !permissions.otherAdminExists(empNo)) {
            throw new ApiException(400, "마지막 관리자는 잠그거나 퇴직 처리할 수 없습니다. 다른 관리자를 먼저 지정하세요.");
        }
        String now = Times.nowIso();
        users.updateStatus(empNo, status, "ACTIVE".equals(status), now);
        diff(actor, empNo, "user:STATUS", before.getStatus(), status, now);
        approvers.recomputeAuto(actor);   // 결재자가 잠기거나 퇴직하면 자동 모드 사용자의 결재자가 다시 정해진다
        return users.selectByEmpNo(empNo);
    }

    // ── 내부 ───────────────────────────────────────────────────────────

    private SysUser require(String empNo) {
        SysUser u = MenuPerms.isEmpNo(empNo) ? users.selectByEmpNo(empNo) : null;
        if (u == null) {
            throw new ApiException(404, "user not found");
        }
        return u;
    }

    private static void validate(SysAdminIn.UserForm in) {
        if (in.getName() == null || in.getName().trim().isEmpty() || in.getName().trim().length() > 50) {
            throw new ApiException(400, "이름은 1~50자로 입력하세요.");
        }
        if (in.getRole() == null || !Teams.ROLES.contains(in.getRole())) {
            throw new ApiException(400, "알 수 없는 역할입니다.");
        }
        String pos = in.getPositionTitle() == null ? "" : in.getPositionTitle().trim();
        if (!pos.isEmpty() && !Ranks.LIST.contains(pos)) {
            throw new ApiException(400, "직위는 " + String.join("·", Ranks.LIST) + " 중 하나여야 합니다.");
        }
        String g = in.getApprovalGrade();
        if (g != null && !g.isEmpty() && !MenuPerms.GRADES.containsKey(g)) {
            throw new ApiException(400, "알 수 없는 결재 등급입니다.");
        }
    }

    private static String gradeOf(SysAdminIn.UserForm in) {
        return in.getApprovalGrade() == null || in.getApprovalGrade().isEmpty() ? "NONE" : in.getApprovalGrade();
    }

    private static String blankToNull(String s) {
        return s == null || s.trim().isEmpty() ? null : s.trim();
    }

    private void diff(Actor actor, String target, String item, String before, String after, String now) {
        if ((before == null ? "" : before).equals(after == null ? "" : after)) {
            return;
        }
        log(actor, target, item, before, after, now);
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
