package com.kbstar.kgi.ggreport.web.support;

import javax.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/** 대시보드(NEXT 102) 화면·버튼 식별자 — PrepUiIds 와 같은 규칙(허용 목록 밖은 UNKNOWN, 400 아님). ⚠️ 클라이언트 자기신고. 화면 상수와 같이 바꾼다. */
public final class PrepBoardUiIds {
    public static final Set<String> SCREENS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList("prep_dashboard")));
    public static final Set<String> BUTTONS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList("open", "refresh", "dash_check")));

    private PrepBoardUiIds() {
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
