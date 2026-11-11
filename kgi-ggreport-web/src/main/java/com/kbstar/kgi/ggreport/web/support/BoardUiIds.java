package com.kbstar.kgi.ggreport.web.support;

import javax.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * 이사회 자료 요청이 싣는 "어느 화면·어느 버튼" 식별자. 요청 헤더 {@code X-Screen-Id}·{@code X-Button-Id}(GET 에는 본문이 없으므로 헤더).
 * 허용 목록 밖의 값은 원문을 저장하지 않고 {@code UNKNOWN} 으로 바꾼다 — 헤더에 개인정보·긴 문자열·로그 위조 문자열을 못 싣게 한다.
 * ⚠️ 클라이언트가 보내는 자기신고 값이다(사번과 마찬가지로 위조 가능). 감사 기록의 "어느 화면·버튼"은 화면이 정직하게 보낸다는 전제이고,
 * 서버가 확인할 수 있는 것은 "허용된 이름인가"뿐이다. 화면을 새로 만들면 여기 목록과 프런트 상수를 같이 더한다.
 */
public final class BoardUiIds {

    public static final String UNKNOWN = "UNKNOWN";
    public static final String H_SCREEN = "X-Screen-Id";
    public static final String H_BUTTON = "X-Button-Id";

    public static final Set<String> SCREENS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "board_list", "board_write", "board_review", "approvals_inbox", "approvals_mine")));
    public static final Set<String> BUTTONS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "open", "refresh", "create", "save_version", "submit", "withdraw", "rework", "result_save",
            "snapshot_open", "history_open", "review_open", "acts_open", "approve", "reject", "cancel_request")));

    private BoardUiIds() {
    }

    public static final class Ui {
        private final String screen;
        private final String button;
        private final boolean valid;

        Ui(String screen, String button, boolean valid) {
            this.screen = screen;
            this.button = button;
            this.valid = valid;
        }

        public String getScreen() { return screen; }
        public String getButton() { return button; }
        public boolean isValid() { return valid; }
    }

    /** 요청이 없는 경로(후처리 등)용 — UNKNOWN·ui_valid=false. */
    public static Ui unknown() {
        return new Ui(UNKNOWN, UNKNOWN, false);
    }

    public static Ui of(HttpServletRequest req) {
        String s = clean(req.getHeader(H_SCREEN));
        String b = clean(req.getHeader(H_BUTTON));
        boolean sv = s != null && SCREENS.contains(s);
        boolean bv = b != null && BUTTONS.contains(b);
        return new Ui(sv ? s : UNKNOWN, bv ? b : UNKNOWN, sv && bv);
    }

    private static String clean(String v) {
        return v == null ? null : v.trim();
    }
}
