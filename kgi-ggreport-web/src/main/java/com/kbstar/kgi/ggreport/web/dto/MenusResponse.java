package com.kbstar.kgi.ggreport.web.dto;

import java.util.List;
import java.util.Map;

/**
 * {@code GET /menus} — 관리 화면용 역할×메뉴 격자. 골든 {@code 04}·{@code 05}.
 *
 * <p>⚠️ {@code roles} 의 키는 <b>한글 역할명</b>이고 값의 키는 메뉴 key 다.
 * Jackson 의 snake_case 변환은 POJO 프로퍼티에만 적용되고 <b>Map 키는 건드리지
 * 않는다</b> — 그래서 {@code map}·{@code regions} 같은 메뉴 키가 그대로 나간다.
 */
public class MenusResponse {

    private List<MenuDefinition> menus;
    private Map<String, Map<String, Boolean>> roles;

    public MenusResponse() {
    }

    public MenusResponse(List<MenuDefinition> menus, Map<String, Map<String, Boolean>> roles) {
        this.menus = menus;
        this.roles = roles;
    }

    public List<MenuDefinition> getMenus() { return menus; }
    public void setMenus(List<MenuDefinition> menus) { this.menus = menus; }

    public Map<String, Map<String, Boolean>> getRoles() { return roles; }
    public void setRoles(Map<String, Map<String, Boolean>> roles) { this.roles = roles; }
}
