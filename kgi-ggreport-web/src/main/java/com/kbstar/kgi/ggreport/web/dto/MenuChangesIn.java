package com.kbstar.kgi.ggreport.web.dto;

import java.util.ArrayList;
import java.util.List;

/**
 * {@code PUT /menus} 본문 — <b>바뀐 것만</b> 보낸다.
 * Python {@code routers/menus.MenuChangesIn}.
 *
 * <p>⚠️ <b>격자 전체를 덮어쓰지 않는 이유</b>: 두 사람이 같은 관리 화면을 열어 두었을 때
 * 나중에 저장한 쪽이 <b>상대의 변경을 통째로 지운다.</b> 바뀐 칸만 upsert 한다.
 */
public class MenuChangesIn {

    private List<MenuChange> changes = new ArrayList<>();

    public List<MenuChange> getChanges() { return changes; }
    public void setChanges(List<MenuChange> changes) { this.changes = changes; }

    /** 격자에서 켜고 끈 칸 하나. */
    public static class MenuChange {

        private String role;
        private String menu;
        private boolean enabled;

        public String getRole() { return role; }
        public void setRole(String role) { this.role = role; }

        public String getMenu() { return menu; }
        public void setMenu(String menu) { this.menu = menu; }

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
    }
}
