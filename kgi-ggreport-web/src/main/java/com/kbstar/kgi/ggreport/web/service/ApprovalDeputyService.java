package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.ApprovalDeputy;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.ApprovalIn;
import com.kbstar.kgi.ggreport.web.mapper.ApprovalDeputyMapper;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.support.MenuPerms;
import com.kbstar.kgi.ggreport.web.support.Ranks;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 대결 지정 — <b>결재자 본인이</b> 부재 기간 동안 자기 결재를 맡길 사람을 지정한다(관리자는 조회·취소·대리 지정).
 *
 * <p>대결자 자격은 <b>고정하지 않는다</b>(업무에 따라 부장의 대결자를 다른 팀장으로 둘 수도 있다).
 * 막는 것은 둘뿐이다: 자기 자신, 그리고 결재 시점의 방향 규칙({@link Ranks#mayDecide}) — 상신자가 대결자보다
 * 상위 직급이면 그 대결자는 그 건을 결재하지 못한다. 대결자가 과장 미만이면 <b>경고만</b> 한다.
 */
@Service
public class ApprovalDeputyService {

    /** 한 번에 지정할 수 있는 최대 기간(일). 장기 위임을 습관으로 두지 않게 한다. */
    public static final int MAX_DAYS = 90;

    private final ApprovalDeputyMapper deputies;
    private final SysUserMapper users;
    private final CallerService callers;
    private final PermissionService permissions;

    public ApprovalDeputyService(ApprovalDeputyMapper deputies, SysUserMapper users, CallerService callers,
                                 PermissionService permissions) {
        this.deputies = deputies;
        this.users = users;
        this.callers = callers;
        this.permissions = permissions;
    }

    /** 내 지정(내가 결재자) + 나를 대결자로 둔 지정. 관리자는 {@code all=true} 로 전체. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(Actor actor, boolean all) {
        SysUser me = callers.require(actor);
        boolean admin = permissions.canAdmin(me.getEmpNo());
        if (all && !admin) {
            throw new ApiException(403, "이 기능을 쓸 권한이 없습니다.");
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (ApprovalDeputy d : deputies.selectOpen(null, Times.todayKst())) {
            if (all || d.getPrincipalEmpNo().equals(me.getEmpNo()) || d.getDeputyEmpNo().equals(me.getEmpNo())) {
                out.add(view(d, null));
            }
        }
        return out;
    }

    @Transactional
    public Map<String, Object> create(ApprovalIn.DeputyForm in, Actor actor) {
        SysUser me = callers.require(actor);
        String principalEmp = blank(in.getPrincipalEmpNo()) ? me.getEmpNo() : in.getPrincipalEmpNo().trim();
        if (!principalEmp.equals(me.getEmpNo()) && !permissions.canAdmin(me.getEmpNo())) {
            throw new ApiException(403, "대결은 결재자 본인만 지정할 수 있습니다.");
        }
        SysUser principal = active(principalEmp, "결재자");
        if ("NONE".equals(principal.getApprovalGrade())) {
            throw new ApiException(400, "결재 등급이 있는 사용자만 대결자를 지정할 수 있습니다.");
        }
        if (!MenuPerms.isEmpNo(in.getDeputyEmpNo())) {
            throw new ApiException(400, "대결자의 사번(숫자 7자리)을 지정하세요.");
        }
        SysUser deputy = active(in.getDeputyEmpNo().trim(), "대결자");
        if (deputy.getEmpNo().equals(principal.getEmpNo())) {
            throw new ApiException(400, "자기 자신을 대결자로 지정할 수 없습니다.");
        }
        LocalDate start = date(in.getStartDate(), "시작일");
        LocalDate end = date(in.getEndDate(), "종료일");
        LocalDate today = LocalDate.parse(Times.todayKst());
        if (start.isBefore(today)) {
            throw new ApiException(400, "시작일은 오늘 이후여야 합니다.");
        }
        if (end.isBefore(start)) {
            throw new ApiException(400, "종료일은 시작일 이후여야 합니다.");
        }
        if (ChronoUnit.DAYS.between(start, end) + 1 > MAX_DAYS) {
            throw new ApiException(400, "대결 기간은 최대 " + MAX_DAYS + "일까지 지정할 수 있습니다.");
        }
        String reason = blank(in.getReason()) ? null : in.getReason().trim();
        if (reason != null && reason.length() > 200) {
            throw new ApiException(400, "사유는 200자 이내로 입력하세요.");
        }
        if (deputies.countOverlap(principal.getEmpNo(), start.toString(), end.toString()) > 0) {
            throw new ApiException(409, "그 기간에 이미 대결 지정이 있습니다. 먼저 취소하세요.");
        }
        ApprovalDeputy d = new ApprovalDeputy();
        d.setPrincipalEmpNo(principal.getEmpNo());
        d.setDeputyEmpNo(deputy.getEmpNo());
        d.setStartDate(start.toString());
        d.setEndDate(end.toString());
        d.setReason(reason);
        d.setCreatedBy(me.getEmpNo());
        d.setCreatedAt(Times.nowIso());
        deputies.insert(d);
        String warning = Ranks.of(deputy) < Ranks.USUAL_DEPUTY_MIN
                ? "대결자는 보통 과장급 이상입니다. 업무상 필요하면 그대로 두어도 됩니다." : null;
        return view(deputies.selectById(d.getDeputyId()), warning);
    }

    @Transactional
    public void cancel(Long id, Actor actor) {
        SysUser me = callers.require(actor);
        ApprovalDeputy d = deputies.selectById(id);
        if (d == null) {
            throw new ApiException(404, "대결 지정을 찾을 수 없습니다.");
        }
        if (!d.getPrincipalEmpNo().equals(me.getEmpNo()) && !permissions.canAdmin(me.getEmpNo())) {
            throw new ApiException(403, "결재자 본인 또는 관리자만 취소할 수 있습니다.");
        }
        if (deputies.cancel(id, me.getEmpNo(), Times.nowIso()) == 0) {
            throw new ApiException(409, "이미 취소된 지정입니다.");
        }
    }

    /** {@code deputy} 가 {@code today} 에 대결하는 결재자들의 사번. */
    @Transactional(readOnly = true)
    public List<String> principalsOf(String deputyEmp, String today) {
        List<String> out = new ArrayList<>();
        for (ApprovalDeputy d : deputies.selectActiveForDeputy(deputyEmp, today)) {
            out.add(d.getPrincipalEmpNo());
        }
        return out;
    }

    // ── 내부 ───────────────────────────────────────────────────────────

    private SysUser active(String emp, String label) {
        SysUser u = MenuPerms.isEmpNo(emp) ? users.selectByEmpNo(emp) : null;
        if (u == null) {
            throw new ApiException(400, "등록되지 않은 " + label + "입니다.");
        }
        if (!"ACTIVE".equals(u.getStatus())) {
            throw new ApiException(400, "사용 중이 아닌(잠김·퇴직) 사용자는 " + label + "가 될 수 없습니다.");
        }
        return u;
    }

    private static LocalDate date(String s, String label) {
        try {
            return LocalDate.parse(s == null ? "" : s.trim());
        } catch (DateTimeParseException e) {
            throw new ApiException(400, label + "은 YYYY-MM-DD 형식이어야 합니다.");
        }
    }

    private static boolean blank(String s) {
        return s == null || s.trim().isEmpty();
    }

    private Map<String, Object> view(ApprovalDeputy d, String warning) {
        Map<String, Object> m = new LinkedHashMap<>();
        SysUser p = users.selectByEmpNo(d.getPrincipalEmpNo());
        SysUser dep = users.selectByEmpNo(d.getDeputyEmpNo());
        m.put("deputy_id", d.getDeputyId());
        m.put("principal_emp_no", d.getPrincipalEmpNo());
        m.put("principal_name", p == null ? null : p.getName());
        m.put("deputy_emp_no", d.getDeputyEmpNo());
        m.put("deputy_name", dep == null ? null : dep.getName());
        m.put("deputy_position", dep == null ? null : dep.getPositionTitle());
        m.put("start_date", d.getStartDate());
        m.put("end_date", d.getEndDate());
        m.put("reason", d.getReason());
        m.put("created_by", d.getCreatedBy());
        m.put("active_now", d.getStartDate().compareTo(Times.todayKst()) <= 0
                && d.getEndDate().compareTo(Times.todayKst()) >= 0);
        m.put("warning", warning);
        return m;
    }
}
