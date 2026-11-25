package com.kbstar.kgi.ggreport.web.support;

import javax.servlet.http.HttpServletRequest;
import java.util.*;

/** 올해 목표·관심 기관(043·044)·설명회 기록(046 예약) 쓰기 요청의 X-Screen-Id·X-Button-Id. 허용 목록 밖은 UNKNOWN·ui_valid=false
 *  (InstUiIds.bankContract 와 같은 규칙). 버튼은 엔드포인트마다 허용 집합이 따로다. ⚠️ 클라이언트 자기신고 머리글. */
public final class TargetUiIds {
    public static final Set<String> SCREENS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList("bid_board", "map_popover")));
    public static final String BTN_ADD = "add_bid_target", BTN_ADD_WATCH = "add_watch_target", BTN_EDIT = "edit_bid_target",
            BTN_TAG = "change_target_tag", BTN_NEXT_YEAR = "goal_next_year", BTN_CANCEL = "cancel_bid_target",
            BTN_TO_GOAL = "move_to_goal", BTN_TO_WATCH = "move_to_watch",
            BTN_CHANGE = "submit_target_change", BTN_SAVE_VALUES = "save_target_values",   // NEXT 114 — 일괄 창 [수정하기]
            BTN_CARRY = "carry_targets", BTN_TERM = "set_term_start",   // 056 — 일괄 변경·자동 이월·협약 개시일
            BTN_AIM = "set_target_aim_rank";                            // 063 — 금고 방식 고르기(단건·일괄 모두)
    public static final Set<String> ADD = Collections.singleton(BTN_ADD);
    public static final Set<String> ADD_WATCH = Collections.singleton(BTN_ADD_WATCH);
    public static final Set<String> EDIT = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(BTN_EDIT, BTN_TAG, BTN_NEXT_YEAR, BTN_AIM)));
    public static final Set<String> CANCEL = Collections.singleton(BTN_CANCEL);
    public static final Set<String> TO_GOAL = Collections.singleton(BTN_TO_GOAL);
    public static final Set<String> TO_WATCH = Collections.singleton(BTN_TO_WATCH);
    public static final Set<String> CHANGE = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(BTN_CHANGE, BTN_SAVE_VALUES, BTN_AIM)));
    public static final Set<String> CARRY = Collections.singleton(BTN_CARRY);
    public static final Set<String> TERM = Collections.singleton(BTN_TERM);
    public static final String BTN_HEART = "toggle_watch_heart";   // 061 지도 ♥
    public static final Set<String> WATCH_ON = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(BTN_HEART, BTN_ADD_WATCH)));
    public static final Set<String> WATCH_OFF = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(BTN_HEART, BTN_CANCEL)));

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
