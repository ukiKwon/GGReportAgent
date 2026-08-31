package com.kbstar.kgi.ggreport.web.domain;

/**
 * 역할별 메뉴 노출 1행({@code ROLE_MENUS}).
 *
 * <p>Python 쪽에는 대응하는 pydantic 모델이 없다 — {@code menu_repository.load_overrides}
 * 가 {@code dict[역할][메뉴] = 켜짐} 을 바로 만들어 썼기 때문이다. Java 는 행을
 * 그대로 받을 타입이 있어야 해서 여기서 하나 세운다. <b>이 타입은 JSON 으로 나가지
 * 않는다</b> — {@code GET /menus} 응답은 기본값 위에 이 값을 덮어쓴 결과다(골든 {@code 04}·{@code 05}).
 *
 * <p>행이 없다는 것은 '꺼짐'이 아니라 <b>'아직 정하지 않음'</b>이라 앱 기본값이
 * 적용된다. 여기엔 사람이 명시적으로 정한 것만 쌓인다.
 */
public class RoleMenu {

    private String role;
    private String menu;
    /** DB 컬럼은 {@code NUMBER(1)}/{@code SMALLINT} 다. 0/1 ↔ boolean 은 드라이버가 맡는다. */
    private boolean enabled;

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getMenu() { return menu; }
    public void setMenu(String menu) { this.menu = menu; }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
}
