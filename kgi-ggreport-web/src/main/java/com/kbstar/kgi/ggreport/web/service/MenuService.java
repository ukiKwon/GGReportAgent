package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.RoleMenu;
import com.kbstar.kgi.ggreport.web.dto.MenuChangesIn;
import com.kbstar.kgi.ggreport.web.mapper.RoleMenuMapper;
import com.kbstar.kgi.ggreport.web.support.Menus;
import com.kbstar.kgi.ggreport.web.support.Teams;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 역할별 메뉴 조회. Python {@code server/routers/menus.py} 의 GET 쪽 +
 * {@code menu_repository.load_overrides}.
 *
 * <p>⚠️ 이 엔드포인트는 <b>누가 부르는지 확인하지 않는다.</b> 권한은 화면 노출
 * 제어이지 보안 경계가 아니다 — 프로필이 자기신고라 서버가 신원을 확인할 방법이
 * 애초에 없다. 실제 차단은 폐쇄망 + 앞단 인증이 맡는다.
 */
@Service
public class MenuService {

    private final RoleMenuMapper mapper;

    public MenuService(RoleMenuMapper mapper) {
        this.mapper = mapper;
    }

    /** {@code {역할: {메뉴: 켜짐}}} — 저장된 것만. 없으면 빈 맵. */
    public Map<String, Map<String, Boolean>> overrides() {
        Map<String, Map<String, Boolean>> out = new LinkedHashMap<>();
        List<RoleMenu> rows = mapper.selectAll();
        for (RoleMenu row : rows) {
            Map<String, Boolean> byMenu = out.get(row.getRole());
            if (byMenu == null) {
                byMenu = new LinkedHashMap<>();
                out.put(row.getRole(), byMenu);
            }
            byMenu.put(row.getMenu(), row.isEnabled());
        }
        return out;
    }

    /** 그 역할이 볼 메뉴(저장값이 기본값을 덮어쓴다). */
    public Map<String, Boolean> menusFor(String role) {
        return Menus.menusFor(role, overrides());
    }

    /** 관리 화면용 역할×메뉴 격자. */
    public Map<String, Map<String, Boolean>> allRoles() {
        return Menus.allRoles(overrides());
    }

    /**
     * 바뀐 칸만 저장한다 — Task 5B.4. Python {@code put_menus} + {@code save_changes}.
     *
     * <p>⚠️ <b>자물쇠 검사를 저장 전에 한다.</b> 저장하고 나서 확인하면 이미 아무도 못
     * 들어가는 상태가 된 뒤다 — 되돌릴 화면이 바로 그 화면이라 <b>복구 방법이 없다.</b>
     * 그래서 "저장 뒤의 모습"을 메모리에 먼저 그려 보고 판단한다.
     *
     * @return 저장한 칸 수
     */
    @Transactional
    public int save(List<MenuChangesIn.MenuChange> changes) {
        for (MenuChangesIn.MenuChange change : changes) {
            if (!Menus.MENU_KEYS.contains(change.getMenu())) {
                throw ApiException.badRequest("모르는 메뉴입니다: " + change.getMenu());
            }
            if (!Teams.ROLES.contains(change.getRole())) {
                throw ApiException.badRequest("모르는 역할입니다: " + change.getRole());
            }
        }

        Map<String, Map<String, Boolean>> after = Menus.allRoles(overrides());
        for (MenuChangesIn.MenuChange change : changes) {
            Map<String, Boolean> row = after.get(change.getRole());
            if (row == null) {
                row = new LinkedHashMap<>();
                after.put(change.getRole(), row);
            }
            row.put(change.getMenu(), change.isEnabled());
        }
        if (!anyoneCanAdminister(after)) {
            throw ApiException.badRequest(
                    "권한관리 메뉴를 모든 역할에서 끌 수 없습니다 — "
                            + "그러면 아무도 이 화면에 들어올 수 없어 되돌릴 방법이 없습니다. "
                            + "먼저 다른 역할에 권한관리를 켜 주세요.");
        }

        for (MenuChangesIn.MenuChange change : changes) {
            upsert(change);
        }
        return changes.size();
    }

    private static boolean anyoneCanAdminister(Map<String, Map<String, Boolean>> grid) {
        for (Map<String, Boolean> row : grid.values()) {
            if (Boolean.TRUE.equals(row.get(Menus.ADMIN_MENU))) {
                return true;
            }
        }
        return false;
    }

    /**
     * upsert — 원본은 {@code ON CONFLICT DO UPDATE} 지만 Oracle 9i~11g 에는 그 문법이
     * 없다. 갱신 먼저, 걸린 행이 없으면 삽입한다.
     *
     * <p>⚠️ 이 메서드는 {@link #save} 의 트랜잭션 안에서만 부른다 — 갱신과 삽입 사이에
     * 다른 트랜잭션이 같은 (역할, 메뉴)를 넣으면 삽입이 PK 로 실패한다. 관리 화면은
     * 동시 저장이 드물지만, 실패하더라도 <b>조용히 덮이지는 않는다.</b>
     */
    private void upsert(MenuChangesIn.MenuChange change) {
        int updated = mapper.updateEnabled(change.getRole(), change.getMenu(), change.isEnabled());
        if (updated == 0) {
            mapper.insert(change.getRole(), change.getMenu(), change.isEnabled());
        }
    }
}
