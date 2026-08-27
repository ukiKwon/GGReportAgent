package com.kbstar.kgi.ggreport.web.dto;

import java.util.Map;

/**
 * {@code GET /menus?role=영업팀} — 화면이 탭을 켜고 끌 때 쓴다.
 *
 * <p>{@code role} 을 안 주면 이게 아니라 {@link MenusResponse}(격자)가 나간다.
 * ⚠️ <b>모르는 질의 파라미터는 무시한다</b> — 골든 {@code 05} 는
 * {@code ?team=전산팀&position=팀장} 을 보내는데 서버는 {@code role} 만 보므로
 * 응답이 골든 {@code 04}(격자)와 <b>완전히 같다.</b> 이건 버그가 아니라 계약이다.
 */
public class RoleMenusResponse {

    private String role;
    private Map<String, Boolean> menus;

    public RoleMenusResponse() {
    }

    public RoleMenusResponse(String role, Map<String, Boolean> menus) {
        this.role = role;
        this.menus = menus;
    }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public Map<String, Boolean> getMenus() { return menus; }
    public void setMenus(Map<String, Boolean> menus) { this.menus = menus; }
}
