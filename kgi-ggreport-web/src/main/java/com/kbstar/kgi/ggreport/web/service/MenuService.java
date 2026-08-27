package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.RoleMenu;
import com.kbstar.kgi.ggreport.web.mapper.RoleMenuMapper;
import com.kbstar.kgi.ggreport.web.support.Menus;
import org.springframework.stereotype.Service;

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
}
