package com.kbstar.kgi.ggreport.web.support;

import javax.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * 디자인 검토 흐름(051)이 싣는 "어느 화면·어느 버튼" 식별자({@code X-Screen-Id}·{@code X-Button-Id}). {@link BoardUiIds} 와 같은 규칙 —
 * 허용 목록 밖의 값은 원문을 저장하지 않고 {@code UNKNOWN}(ui_valid=false)으로 바꾼다(400 아님). ⚠️ 클라이언트 자기신고 값이다.
 * 화면·버튼 이름은 후보다 — design-reviewer 가 최종 이름을 정하면 여기 목록과 프런트 상수를 같이 바꾼다.
 */
public final class DesignUiIds {

    public static final Set<String> SCREENS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "design_work", "design_review", "approvals_inbox", "notify_inbox")));
    public static final Set<String> BUTTONS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "design_open", "design_complete", "design_revise", "design_comment", "design_ack", "design_view",
            "forward", "finalize", "return", "approve", "reject", "submit")));

    private DesignUiIds() {
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
