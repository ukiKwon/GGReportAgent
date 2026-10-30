package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.PermChange;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.domain.UserMenuPerm;
import com.kbstar.kgi.ggreport.web.dto.MenuDefinition;
import com.kbstar.kgi.ggreport.web.dto.SysAdminIn;
import com.kbstar.kgi.ggreport.web.mapper.PermChangeLogMapper;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.mapper.UserMenuPermMapper;
import com.kbstar.kgi.ggreport.web.support.MenuPerms;
import com.kbstar.kgi.ggreport.web.support.Menus;
import com.kbstar.kgi.ggreport.web.support.Teams;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 사용자별 메뉴 권한 — <b>역할 기본값 위에 사용자 예외를 얹는다.</b>
 *
 * <p>유효 권한 = 사용자 예외 행이 있으면 그 값, 없으면 역할 기본({@link MenuService#menusFor})의 조회 여부
 * + 작성·결재 꺼짐 + 수정은 <b>영업 계열의 map·regions 만 켜짐</b>(기관 레코드 편집 담당, {@link #INSTITUTION_EDIT_MENUS}).
 * 메뉴를 받으면 <b>조회가 기본</b>이고, 작성·수정·결재를 켜면 조회도 켜진다.
 * 결재는 {@link MenuPerms#isApprovable} 인 메뉴에서만 켤 수 있다(모르는 메뉴는 거부).
 *
 * <p>⚠️ <b>잠김 방지</b>: 마지막 남은 관리자(권한관리 조회 가능 + 활성)를 빼앗는 변경은 저장 전에 거부한다
 * (메뉴 권한의 {@code MenuService.save} 와 같은 이유 — 되돌릴 화면이 그 화면이다).
 * 변경 이력은 변경과 <b>같은 트랜잭션</b>에 남긴다.
 */
@Service
public class PermissionService {

    /**
     * 기관 레코드 편집(POST/PUT /institutions, /import)을 허용하는 메뉴 — 하나라도 edit 이면 통과.
     * 영업 계열({@link Teams#isSalesFamily})은 이 두 메뉴의 edit 을 <b>역할 기본</b>으로 가진다(조회가 켜져 있을 때).
     */
    public static final List<String> INSTITUTION_EDIT_MENUS = java.util.Arrays.asList("map", "regions");

    private final SysUserMapper users;
    private final UserMenuPermMapper perms;
    private final PermChangeLogMapper changeLog;
    private final MenuService menus;

    public PermissionService(SysUserMapper users, UserMenuPermMapper perms,
                             PermChangeLogMapper changeLog, MenuService menus) {
        this.users = users;
        this.perms = perms;
        this.changeLog = changeLog;
        this.menus = menus;
    }

    /** 화면용 한 줄. */
    public static class Row {
        private final String menuKey;
        private final String label;
        private final boolean approvable;
        private final boolean view;
        private final boolean write;
        private final boolean edit;
        private final boolean approve;
        private final String source;

        Row(String menuKey, String label, boolean approvable, boolean view, boolean write, boolean edit,
            boolean approve, String source) {
            this.menuKey = menuKey;
            this.label = label;
            this.approvable = approvable;
            this.view = view;
            this.write = write;
            this.edit = edit;
            this.approve = approve;
            this.source = source;
        }

        public String getMenuKey() { return menuKey; }
        public String getLabel() { return label; }
        public boolean isApprovable() { return approvable; }
        public boolean isView() { return view; }
        public boolean isWrite() { return write; }
        public boolean isEdit() { return edit; }
        public boolean isApprove() { return approve; }
        /** {@code role}: 역할 기본값 그대로 / {@code user}: 사용자 예외가 있다. */
        public String getSource() { return source; }
    }

    @Transactional(readOnly = true)
    public List<Row> effective(String empNo) {
        SysUser u = require(empNo);
        return rows(u, byMenu(perms.selectByEmpNo(empNo)));
    }

    @Transactional(readOnly = true)
    public boolean canAdmin(String empNo) {
        if (!MenuPerms.isEmpNo(empNo)) {
            return false;
        }
        SysUser u = users.selectByEmpNo(empNo);
        return u != null && "ACTIVE".equals(u.getStatus())
                && viewOf(u, byMenu(perms.selectByEmpNo(empNo)), menus.menusFor(u.getRole()), Menus.ADMIN_MENU);
    }

    /** 등록된 활성 사용자가 그 메뉴를 볼 수 있는가(사용자 예외 > 역할 기본값). {@link #canAdmin} 의 일반형. */
    @Transactional(readOnly = true)
    public boolean canView(String empNo, String menuKey) {
        if (!MenuPerms.isEmpNo(empNo)) {
            return false;
        }
        SysUser u = users.selectByEmpNo(empNo);
        return u != null && "ACTIVE".equals(u.getStatus())
                && viewOf(u, byMenu(perms.selectByEmpNo(empNo)), menus.menusFor(u.getRole()), menuKey);
    }

    /**
     * 등록된 활성 사용자가 <b>기관 레코드</b>({@link #INSTITUTION_EDIT_MENUS})를 편집할 수 있는가 — 두 메뉴 중
     * 하나라도 '조회 + 수정'이면 true(사용자 예외 > 역할 기본값, 영업 계열은 역할 기본으로 켜짐).
     * 사용자 예외 행이 있는 메뉴는 그 행의 값이 우선이다 — 한 메뉴의 예외로 edit 을 꺼도 다른 메뉴의
     * 기본/예외값으로 판단한다(두 행 모두 끄면 차단).
     */
    @Transactional(readOnly = true)
    public boolean canEditInstitution(String empNo) {
        if (!MenuPerms.isEmpNo(empNo)) {
            return false;
        }
        SysUser u = users.selectByEmpNo(empNo);
        if (u == null || !"ACTIVE".equals(u.getStatus())) {
            return false;
        }
        for (Row r : rows(u, byMenu(perms.selectByEmpNo(empNo)))) {
            if (INSTITUTION_EDIT_MENUS.contains(r.getMenuKey()) && r.isView() && r.isEdit()) {
                return true;
            }
        }
        return false;
    }

    /**
     * 그 메뉴를 볼 수 있는 활성 사용자가, 사용자 예외 행의 CAN_EDIT 이 켜져 있거나 관리자(권한관리 조회)일 때 true.
     * 역할 기본값에는 수정 권한이 없다(켜려면 사용자 예외 행이 필요하다). — 이사회 자료 양식 편집 등이 쓴다.
     */
    @Transactional(readOnly = true)
    public boolean canEdit(String empNo, String menuKey) {
        if (!MenuPerms.isEmpNo(empNo)) {
            return false;
        }
        SysUser u = users.selectByEmpNo(empNo);
        if (u == null || !"ACTIVE".equals(u.getStatus())) {
            return false;
        }
        Map<String, UserMenuPerm> mine = byMenu(perms.selectByEmpNo(empNo));
        Map<String, Boolean> base = menus.menusFor(u.getRole());
        if (!viewOf(u, mine, base, menuKey)) {
            return false;
        }
        UserMenuPerm p = mine.get(menuKey);
        return (p != null && p.isCanEdit()) || viewOf(u, mine, base, Menus.ADMIN_MENU);
    }

    @Transactional
    public int save(String empNo, List<SysAdminIn.Perm> changes, Actor actor) {
        SysUser u = require(empNo);
        Map<String, UserMenuPerm> mine = byMenu(perms.selectByEmpNo(empNo));
        Map<String, Row> now = new HashMap<>();
        for (Row r : rows(u, mine)) {
            now.put(r.getMenuKey(), r);
        }
        String stamp = Times.nowIso();
        int saved = 0;
        List<Object[]> pending = new ArrayList<>();      // [메뉴, 새 행(UserMenuPerm), 이력들]
        for (SysAdminIn.Perm c : changes) {
            Row before = now.get(c.getMenu());
            if (before == null) {
                throw new ApiException(400, "알 수 없는 메뉴입니다: " + c.getMenu());
            }
            boolean write = c.isWrite();
            boolean edit = c.isEdit();
            boolean approve = c.isApprove();
            boolean view = c.isView();
            if (approve && !MenuPerms.isApprovable(c.getMenu())) {
                throw new ApiException(400, "'" + before.getLabel() + "' 메뉴에는 결재 기능이 없어 결재 권한을 줄 수 없습니다.");
            }
            if (!view && before.isView()) {   // 켜져 있던 조회를 껐다 → 나머지도 의미가 없다
                write = false;
                edit = false;
                approve = false;
            } else if (write || edit || approve) {
                view = true;                  // 작성·수정·결재를 켜면 조회는 따라 켜진다
            }
            if (view == before.isView() && write == before.isWrite() && edit == before.isEdit()
                    && approve == before.isApprove()) {
                continue;
            }
            UserMenuPerm p = new UserMenuPerm();
            p.setEmpNo(empNo);
            p.setMenuKey(c.getMenu());
            p.setCanView(view);
            p.setCanWrite(write);
            p.setCanEdit(edit);
            p.setCanApprove(approve);
            p.setUpdatedAt(stamp);
            pending.add(new Object[]{p, before});
        }
        if (pending.isEmpty()) {
            return 0;
        }
        // 잠김 방지 — 이 사용자의 관리자 조회가 꺼지는 변경이면, 다른 활성 관리자가 남는지 먼저 본다.
        for (Object[] it : pending) {
            UserMenuPerm p = (UserMenuPerm) it[0];
            if (Menus.ADMIN_MENU.equals(p.getMenuKey()) && !p.isCanView() && "ACTIVE".equals(u.getStatus())
                    && ((Row) it[1]).isView() && !otherAdminExists(empNo)) {
                throw new ApiException(400, "마지막 관리자의 '권한관리' 조회 권한은 끌 수 없습니다. "
                        + "그러면 아무도 시스템 관리 화면에 들어올 수 없습니다. 다른 사용자에게 먼저 권한을 주세요.");
            }
        }
        for (Object[] it : pending) {
            UserMenuPerm p = (UserMenuPerm) it[0];
            Row b = (Row) it[1];
            if (perms.update(p) == 0) {
                perms.insert(p);
            }
            log(actor, empNo, p.getMenuKey(), "CAN_VIEW", b.isView(), p.isCanView(), stamp);
            log(actor, empNo, p.getMenuKey(), "CAN_WRITE", b.isWrite(), p.isCanWrite(), stamp);
            log(actor, empNo, p.getMenuKey(), "CAN_EDIT", b.isEdit(), p.isCanEdit(), stamp);
            log(actor, empNo, p.getMenuKey(), "CAN_APPROVE", b.isApprove(), p.isCanApprove(), stamp);
            saved++;
        }
        return saved;
    }

    /** {@code excludeEmpNo} 를 뺀 활성 관리자가 한 명이라도 있나. 사용자·역할 변경 쪽에서도 쓴다. */
    @Transactional(readOnly = true)
    public boolean otherAdminExists(String excludeEmpNo) {
        Map<String, Map<String, UserMenuPerm>> all = new HashMap<>();
        for (UserMenuPerm p : perms.selectAll()) {
            Map<String, UserMenuPerm> m = all.get(p.getEmpNo());
            if (m == null) {
                m = new HashMap<>();
                all.put(p.getEmpNo(), m);
            }
            m.put(p.getMenuKey(), p);
        }
        for (SysUser u : users.selectAll()) {
            if (u.getEmpNo().equals(excludeEmpNo) || !"ACTIVE".equals(u.getStatus())) {
                continue;
            }
            Map<String, UserMenuPerm> mine = all.get(u.getEmpNo());
            if (viewOf(u, mine == null ? new HashMap<String, UserMenuPerm>() : mine,
                    menus.menusFor(u.getRole()), Menus.ADMIN_MENU)) {
                return true;
            }
        }
        return false;
    }

    /** 역할을 바꿨을 때 관리자 조회가 사라지는가(사용자 수정 쪽 잠김 방지용). */
    @Transactional(readOnly = true)
    public boolean viewWouldBe(SysUser u, String role, String menuKey) {
        SysUser probe = new SysUser();
        probe.setEmpNo(u.getEmpNo());
        probe.setRole(role);
        return viewOf(probe, byMenu(perms.selectByEmpNo(u.getEmpNo())), menus.menusFor(role), menuKey);
    }

    @Transactional(readOnly = true)
    public List<PermChange> recentChanges(String targetEmpNo, int limit) {
        return changeLog.recent(targetEmpNo, Math.max(1, Math.min(limit, 200)));
    }

    // ── 내부 ───────────────────────────────────────────────────────────

    private List<Row> rows(SysUser u, Map<String, UserMenuPerm> mine) {
        Map<String, Boolean> base = menus.menusFor(u.getRole());
        List<Row> out = new ArrayList<>();
        for (MenuDefinition m : Menus.MENUS) {
            UserMenuPerm p = mine.get(m.getKey());
            boolean approvable = MenuPerms.isApprovable(m.getKey());
            if (p != null) {
                out.add(new Row(m.getKey(), m.getLabel(), approvable, p.isCanView(), p.isCanWrite(),
                        p.isCanEdit(), p.isCanApprove(), "user"));
            } else {
                boolean view = Boolean.TRUE.equals(base.get(m.getKey()));
                boolean edit = view && Teams.isSalesFamily(u.getRole())
                        && INSTITUTION_EDIT_MENUS.contains(m.getKey());
                out.add(new Row(m.getKey(), m.getLabel(), approvable, view, false, edit, false, "role"));
            }
        }
        return out;
    }

    private boolean viewOf(SysUser u, Map<String, UserMenuPerm> mine, Map<String, Boolean> base, String key) {
        UserMenuPerm p = mine.get(key);
        return p != null ? p.isCanView() : Boolean.TRUE.equals(base.get(key));
    }

    private static Map<String, UserMenuPerm> byMenu(List<UserMenuPerm> list) {
        Map<String, UserMenuPerm> m = new LinkedHashMap<>();
        for (UserMenuPerm p : list) {
            m.put(p.getMenuKey(), p);
        }
        return m;
    }

    private SysUser require(String empNo) {
        SysUser u = MenuPerms.isEmpNo(empNo) ? users.selectByEmpNo(empNo) : null;
        if (u == null) {
            throw new ApiException(404, "user not found");
        }
        return u;
    }

    private void log(Actor actor, String target, String menu, String field, boolean before, boolean after, String stamp) {
        if (before == after) {
            return;
        }
        PermChange c = new PermChange();
        c.setChangedAt(stamp);
        c.setActorEmpNo(actor == null ? null : actor.getEmpNo());
        c.setTargetEmpNo(target);
        c.setItem("perm:" + menu + ":" + field);
        c.setBeforeValue(before ? "1" : "0");
        c.setAfterValue(after ? "1" : "0");
        changeLog.insert(c);
    }
}
