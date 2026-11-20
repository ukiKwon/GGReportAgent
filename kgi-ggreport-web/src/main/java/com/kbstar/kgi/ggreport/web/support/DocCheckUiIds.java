package com.kbstar.kgi.ggreport.web.support;

import javax.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * 작업함 파일 점검(NEXT 106)이 감사에 남기는 "어느 화면·어느 버튼"(security S16). {@link BoardUiIds} 와 같은 규칙 —
 * 허용 목록 밖이면 원문을 저장하지 않고 UNKNOWN(ui_valid=false). ⚠️ 클라이언트 자기신고 값이다.
 * 이름은 후보다 — design-reviewer 가 정하면 여기와 프런트 상수를 같이 바꾼다.
 */
public final class DocCheckUiIds {

    public static final Set<String> SCREENS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "design_work", "task_work", "design_review", "approvals_inbox")));
    public static final Set<String> BUTTONS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "doc_check_ack", "doc_check_unack", "doc_check_recheck", "doc_check_submit_anyway", "submit", "design_complete")));

    private DocCheckUiIds() {
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
