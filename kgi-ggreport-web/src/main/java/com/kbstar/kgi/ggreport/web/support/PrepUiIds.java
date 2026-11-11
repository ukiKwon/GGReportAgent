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
 * 화면을 새로 만들면 여기 목록과 프런트 상수를 같이 더한다.
 */
public final class PrepUiIds {

    public static final Set<String> SCREENS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "prep_list", "prep_detail", "prep_history", "approvals_inbox", "approvals_mine", "map_popover")));
    public static final Set<String> BUTTONS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "open", "refresh", "confirm", "unconfirm", "open_request", "withdraw", "check", "uncheck",
            "plan_request", "start_writing", "history_open", "cancel_prep", "approve", "reject", "cancel_request",
            "attach_upload", "attach_download", "attach_void", "t3_set", "t3_clear", "open_prep")));

    private PrepUiIds() {
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
