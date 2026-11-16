package com.kbstar.kgi.ggreport.web.support;

import javax.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * 시스템 관리 쓰기(/sysadmin/**·PUT /menus)가 싣는 "어느 화면·어느 버튼"({@code X-Screen-Id}·{@code X-Button-Id}).
 * {@link BoardUiIds} 와 같은 규칙 — 허용 목록 밖·없음은 원문을 저장하지 않고 UNKNOWN(400 아님).
 * ⚠️ 클라이언트 자기신고 값이다. 서버가 확인하는 것은 "허용된 이름인가"뿐이다. 화면을 만들면 여기와 admin.js 상수를 같이 더한다.
 */
public final class AdminUiIds {

    public static final Set<String> SCREENS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "admin_users", "admin_perms", "admin_menus")));
    public static final Set<String> BUTTONS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "user_create", "user_save", "user_lock", "user_unlock", "user_retire", "user_restore",
            "approver_save", "perm_save", "menu_save")));

    private AdminUiIds() {
    }

    public static BoardUiIds.Ui of(HttpServletRequest req) {
        String s = clean(req.getHeader(BoardUiIds.H_SCREEN));
        String b = clean(req.getHeader(BoardUiIds.H_BUTTON));
        boolean sv = s != null && SCREENS.contains(s);
        boolean bv = b != null && BUTTONS.contains(b);
        return new BoardUiIds.Ui(sv ? s : BoardUiIds.UNKNOWN, bv ? b : BoardUiIds.UNKNOWN, sv && bv);
    }

    private static String clean(String v) {
        return v == null ? null : v.trim();
    }
}
