package com.kbstar.kgi.ggreport.web.support;

import javax.servlet.http.HttpServletRequest;
import java.util.*;

/** 올해 목표 기관(043)·설명회 기록(044) 쓰기 요청의 X-Screen-Id·X-Button-Id. 허용 목록 밖은 UNKNOWN·ui_valid=false
 *  (InstUiIds.bankContract 와 같은 규칙). 버튼은 엔드포인트마다 허용 집합이 따로다. ⚠️ 클라이언트 자기신고 머리글. */
public final class TargetUiIds {
    public static final Set<String> SCREENS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList("bid_board", "map_popover")));
    public static final String BTN_ADD = "add_bid_target", BTN_EDIT = "edit_bid_target", BTN_TAG = "change_target_tag", BTN_CANCEL = "cancel_bid_target";
    public static final Set<String> ADD = Collections.singleton(BTN_ADD);
    public static final Set<String> EDIT = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(BTN_EDIT, BTN_TAG)));
    public static final Set<String> CANCEL = Collections.singleton(BTN_CANCEL);

    private TargetUiIds() { }

    public static BoardUiIds.Ui of(HttpServletRequest req, Set<String> buttons) {
        String s = clean(req.getHeader(BoardUiIds.H_SCREEN));
        String b = clean(req.getHeader(BoardUiIds.H_BUTTON));
        boolean sv = s != null && SCREENS.contains(s);
        boolean bv = b != null && buttons.contains(b);
        return new BoardUiIds.Ui(sv ? s : BoardUiIds.UNKNOWN, bv ? b : BoardUiIds.UNKNOWN, sv && bv);
    }

    private static String clean(String v) { return v == null ? null : v.trim(); }
}
