package com.kbstar.kgi.ggreport.web.support;

import javax.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * 이사회 회의록(047) 요청이 싣는 "어느 화면·어느 버튼" 식별자 — {@link BoardUiIds} 와 같은 규칙(헤더 X-Screen-Id·X-Button-Id,
 * 허용 목록 밖은 원문을 버리고 UNKNOWN). 자기신고 값이라 위조할 수 있다. 화면을 새로 만들면 여기와 프런트 상수를 같이 더한다.
 * {@code board_write} 는 이사회 자료 상세 안의 탭에서 부를 때 쓴다.
 */
public final class MinutesUiIds {

    public static final Set<String> SCREENS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "board_minutes", "board_minutes_list", "board_minutes_upload", "board_write")));
    public static final Set<String> BUTTONS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "minutes_tab", "minutes_list", "minutes_open", "minutes_transcript", "minutes_preview", "minutes_upload",
            "minutes_edit", "minutes_meta", "minutes_todo", "minutes_history", "minutes_scope_open", "minutes_scope_add",
            "minutes_scope_remove", "minutes_delete", "minutes_acts")));

    private MinutesUiIds() {
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
