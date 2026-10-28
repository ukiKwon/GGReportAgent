package com.kbstar.kgi.ggreport.web.support;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * 사용자별 메뉴 권한의 <b>규칙</b> — 사번 형식, 결재 등급, 결재 가능 메뉴.
 *
 * <p>결재(CAN_APPROVE)는 <b>결재 개념이 확인된 메뉴에서만</b> 켤 수 있다(사용자 확정 2026-10-28:
 * "메뉴별로 결재가 있는지 없는지 모르면 일단 체크를 해두지는 마"). 지금 확인된 것은 결재함과 작업함
 * (디자이너 작업물 승인)뿐이다. 새 메뉴에 결재가 생기면 여기에 추가한다 — 모르는 메뉴는 꺼 둔다.
 *
 * <p>⚠️ {@code Menus.MENUS}(→ {@code GET /menus}, 골든 04·05)에는 필드를 더하지 않는다. 그래서
 * 이 정보는 이쪽에 따로 둔다.
 */
public final class MenuPerms {

    private MenuPerms() {
    }

    public static final Set<String> APPROVABLE =
            Collections.unmodifiableSet(new HashSet<>(Arrays.asList("approvals", "tasks")));

    public static boolean isApprovable(String menuKey) {
        return APPROVABLE.contains(menuKey);
    }

    /** 결재 등급 값 → 화면 이름. 순서가 곧 높낮이다. */
    public static final Map<String, String> GRADES = grades();

    private static Map<String, String> grades() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("NONE", "해당 없음");
        m.put("TEAM_LEAD", "팀장급");
        m.put("DEPT_HEAD", "부장급");
        m.put("EXECUTIVE", "대표급");
        return Collections.unmodifiableMap(m);
    }

    public static final Set<String> STATUSES =
            Collections.unmodifiableSet(new HashSet<>(Arrays.asList("ACTIVE", "LOCKED", "RETIRED")));

    /** 사번: 숫자 7자리. null 이면 false. */
    public static boolean isEmpNo(String s) {
        if (s == null || s.length() != 7) {
            return false;
        }
        for (int i = 0; i < 7; i++) {
            if (s.charAt(i) < '0' || s.charAt(i) > '9') {
                return false;
            }
        }
        return true;
    }
}
