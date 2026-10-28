package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.domain.PermChange;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.MenuDefinition;
import com.kbstar.kgi.ggreport.web.dto.SysAdminIn;
import com.kbstar.kgi.ggreport.web.dto.SysUserView;
import com.kbstar.kgi.ggreport.web.service.AccessLogService;
import com.kbstar.kgi.ggreport.web.service.ApproverService;
import com.kbstar.kgi.ggreport.web.service.PermissionService;
import com.kbstar.kgi.ggreport.web.service.UserAdminService;
import com.kbstar.kgi.ggreport.web.support.MenuPerms;
import com.kbstar.kgi.ggreport.web.support.Menus;
import com.kbstar.kgi.ggreport.web.support.Ranks;
import com.kbstar.kgi.ggreport.web.support.Teams;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 시스템 관리 — 사용자·권한·접근 이력. 모든 메서드가 {@link AdminGuard} 를 먼저 지난다.
 *
 * <p>⚠️ {@code /menus}(역할×메뉴 격자, 골든 04·05)는 건드리지 않는다. 이쪽은 <b>사용자 단위</b> 위에 얹는
 * 새 API 라 {@code /sysadmin} 아래에 둔다.
 */
@RestController
@RequestMapping("/sysadmin")
public class SysAdminController {

    private final AdminGuard guard;
    private final UserAdminService userAdmin;
    private final PermissionService permissions;
    private final ApproverService approvers;
    private final AccessLogService accessLog;

    public SysAdminController(AdminGuard guard, UserAdminService userAdmin, PermissionService permissions,
                              ApproverService approvers, AccessLogService accessLog) {
        this.guard = guard;
        this.userAdmin = userAdmin;
        this.permissions = permissions;
        this.approvers = approvers;
        this.accessLog = accessLog;
    }

    /** 화면이 선택지를 그릴 때 쓰는 목록(역할·결재 등급·상태·메뉴 + 결재 가능 여부). */
    @GetMapping("/meta")
    public Map<String, Object> meta(HttpServletRequest req) {
        guard.require(req);
        List<Map<String, Object>> menus = new ArrayList<>();
        for (MenuDefinition m : Menus.MENUS) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("key", m.getKey());
            row.put("label", m.getLabel());
            row.put("approvable", MenuPerms.isApprovable(m.getKey()));
            menus.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("roles", Teams.ROLES);
        out.put("ranks", Ranks.LIST);
        out.put("grades", MenuPerms.GRADES);
        out.put("statuses", MenuPerms.STATUSES);
        out.put("menus", menus);
        return out;
    }

    @GetMapping("/users")
    public Map<String, Object> users(HttpServletRequest req) {
        guard.require(req);
        return java.util.Collections.<String, Object>singletonMap("users", approvers.views());
    }

    @PostMapping("/users")
    public SysUser create(@RequestBody SysAdminIn.UserForm in, HttpServletRequest req) {
        return userAdmin.create(in, guard.require(req));
    }

    @PutMapping("/users/{empNo}")
    public SysUser update(@PathVariable("empNo") String empNo, @RequestBody SysAdminIn.UserForm in,
                          HttpServletRequest req) {
        return userAdmin.update(empNo, in, guard.require(req));
    }

    @PutMapping("/users/{empNo}/status")
    public SysUser status(@PathVariable("empNo") String empNo, @RequestBody SysAdminIn.Status in,
                          HttpServletRequest req) {
        return userAdmin.setStatus(empNo, in.getStatus(), guard.require(req));
    }

    /** 상위 결재자 지정(MANUAL)·자동으로 되돌리기(AUTO). */
    @PutMapping("/users/{empNo}/approver")
    public SysUserView approver(@PathVariable("empNo") String empNo, @RequestBody SysAdminIn.Approver in,
                                HttpServletRequest req) {
        return approvers.assign(empNo, in.getApproverEmpNo(), in.getMode(), guard.require(req));
    }

    @GetMapping("/perms/{empNo}")
    public Map<String, Object> perms(@PathVariable("empNo") String empNo, HttpServletRequest req) {
        guard.require(req);
        return java.util.Collections.<String, Object>singletonMap("menus", permissions.effective(empNo));
    }

    @PutMapping("/perms/{empNo}")
    public Map<String, Object> savePerms(@PathVariable("empNo") String empNo,
                                         @RequestBody SysAdminIn.PermChanges in, HttpServletRequest req) {
        int saved = permissions.save(empNo, in.getChanges(), guard.require(req));
        return java.util.Collections.<String, Object>singletonMap("saved", saved);
    }

    @GetMapping("/perm-changes")
    public Map<String, Object> permChanges(@RequestParam(name = "emp", required = false) String emp,
                                           HttpServletRequest req) {
        guard.require(req);
        List<PermChange> rows = permissions.recentChanges(MenuPerms.isEmpNo(emp) ? emp : null, 100);
        return java.util.Collections.<String, Object>singletonMap("items", rows);
    }

    @GetMapping("/access-log")
    public AccessLogService.Page accessLog(@RequestParam(name = "from", required = false) String from,
                                           @RequestParam(name = "to", required = false) String to,
                                           @RequestParam(name = "emp", required = false) String emp,
                                           @RequestParam(name = "event", required = false) String event,
                                           @RequestParam(name = "page", defaultValue = "0") int page,
                                           @RequestParam(name = "size", defaultValue = "50") int size,
                                           HttpServletRequest req) {
        guard.require(req);
        return accessLog.search(from, to, emp, event, page, size);
    }
}
