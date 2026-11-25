package com.kbstar.kgi.ggreport.web.support;

import javax.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * 사전준비 요청이 싣는 "어느 화면·어느 버튼" 식별자({@code X-Screen-Id}·{@code X-Button-Id}). {@link BoardUiIds} 와 같은 규칙 —
 * 허용 목록 밖의 값은 원문을 저장하지 않고 {@code UNKNOWN} 으로 바꾼다(400 아님 — 머리글 필수화는 NEXT 68 S8). ⚠️ 클라이언트 자기신고 값이다.
 * 결재함(approvals.js)이 개설·기획승인 결재를 회수·승인·반려할 때 보내는 approvals_mine/cancel_request·approvals_inbox/approve|reject 도 여기서 거른다.
 * [제안 확정]은 입찰 현황판에서만 한다(사용자 11-25 0시, NEXT 114) — 감사 칸은 {@link #forConfirm} 으로 bid_board/confirm 만 유효로 남긴다.
 * map_popover·bid_notice 는 다른 버튼(open_prep 등)에 계속 쓰이므로 SCREENS 에서는 빼지 않는다.
 * 입찰 없음 알림의 [계속 작성](048)은 prep_detail/nobid_continue 다(design 11-19).
 * 화면을 새로 만들면 여기 목록과 프런트 상수를 같이 더한다.
 */
public final class PrepUiIds {

    public static final Set<String> SCREENS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "prep_list", "prep_detail", "prep_history", "approvals_inbox", "approvals_mine", "map_popover", "bid_board", "bid_notice", "prep_dashboard")));
    public static final Set<String> BUTTONS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "open", "refresh", "confirm", "unconfirm", "open_request", "withdraw", "check", "uncheck",
            "plan_request", "start_writing", "history_open", "cancel_prep", "approve", "reject", "cancel_request",
            "attach_upload", "attach_download", "attach_void", "t3_set", "t3_clear", "open_prep", "nobid_continue", "open_start")));

    /** [제안 확정] 감사용 화면 — 입찰 현황판만(NEXT 114). */
    public static final Set<String> CONFIRM_SCREENS = Collections.unmodifiableSet(new HashSet<String>(Collections.singletonList("bid_board")));
    public static final String CONFIRM_BUTTON = "confirm";

    /** [사전준비 시작] 감사용 — prep_detail/open_start 만 유효(security 11-25 하). */
    public static final String START_SCREEN = "prep_detail";
    public static final String START_BUTTON = "open_start";

    private PrepUiIds() {
    }

    /** [사전준비 시작] 전용 — 화면 prep_detail, 버튼 open_start 일 때만 그 값, 아니면 UNKNOWN·ui_valid=false. 거절(400)은 하지 않는다(forConfirm 과 같은 이유). */
    public static BoardUiIds.Ui forStart(HttpServletRequest req) {
        String s = clean(req.getHeader(BoardUiIds.H_SCREEN));
        String b = clean(req.getHeader(BoardUiIds.H_BUTTON));
        boolean sv = START_SCREEN.equals(s);
        boolean bv = START_BUTTON.equals(b);
        return new BoardUiIds.Ui(sv ? s : BoardUiIds.UNKNOWN, bv ? b : BoardUiIds.UNKNOWN, sv && bv);
    }

    /**
     * [제안 확정] 전용 — 화면은 bid_board, 버튼은 confirm 일 때만 그 값, 아니면 UNKNOWN·ui_valid=false. 거절(400)은 하지 않는다:
     * 머리글은 클라이언트 자기신고라 막는 근거가 못 되고, 서버의 실제 조건은 PrepService.requireGoalTarget(목표 기관) 이다.
     */
    public static BoardUiIds.Ui forConfirm(HttpServletRequest req) {
        String s = clean(req.getHeader(BoardUiIds.H_SCREEN));
        String b = clean(req.getHeader(BoardUiIds.H_BUTTON));
        boolean sv = s != null && CONFIRM_SCREENS.contains(s);
        boolean bv = CONFIRM_BUTTON.equals(b);
        return new BoardUiIds.Ui(sv ? s : BoardUiIds.UNKNOWN, bv ? b : BoardUiIds.UNKNOWN, sv && bv);
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
