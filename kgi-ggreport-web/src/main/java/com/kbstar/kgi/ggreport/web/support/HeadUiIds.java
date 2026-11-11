package com.kbstar.kgi.ggreport.web.support;

import javax.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * 기관장 정보(NEXT 72·77, 026) 요청이 싣는 "어느 화면·어느 버튼" 식별자({@code X-Screen-Id}·{@code X-Button-Id}). {@link PrepUiIds} 와 같은 규칙 —
 * 허용 목록 밖의 값은 원문을 저장하지 않고 {@code UNKNOWN} 으로 바꾼다. ⚠️ 클라이언트 자기신고 값이다.
 * 화면을 새로 만들면 여기 목록과 프런트 상수를 같이 더한다.
 */
public final class HeadUiIds {

    public static final Set<String> SCREENS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "bid_board", "head_card", "head_queue", "head_unmatched", "head_photo_changes", "prep_detail", "map_popover")));
    public static final Set<String> BUTTONS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "open_card", "refresh", "head_add", "head_confirm", "head_reject", "item_add", "item_confirm", "item_reject",
            "item_withdraw", "item_void", "photo_upload", "photo_view", "photo_void", "photo_restore", "open_queue",
            "open_unmatched", "unmatched_view", "unmatched_assign", "unmatched_reject", "open_photo_changes")));

    private HeadUiIds() {
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
