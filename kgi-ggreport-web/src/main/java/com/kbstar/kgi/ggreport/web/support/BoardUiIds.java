package com.kbstar.kgi.ggreport.web.support;

import javax.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
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
            "board_list", "board_write", "board_review", "approvals_inbox", "approvals_mine",
            "prep_detail")));   // 제안 준비 현황 › 기관 상세의 이사회 일정 등록(meeting_save)
    public static final Set<String> BUTTONS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "open", "refresh", "create", "save_version", "submit", "withdraw", "rework", "result_save",
            "snapshot_open", "history_open", "review_open", "acts_open", "approve", "reject", "cancel_request",
            "confirmed_docx", "meeting_save",
            "profit_upload",    // 사전준비 상세 4단계 수익성 분석표 올리기 → 이사회 자료 자동 초안(NEXT 121 N2)
            "script_docx")));   // 사전준비 상세 7단계 발표 대본 Word(NEXT 113 ⑤) — 확정 이사회 자료를 읽은 감사 줄용

    static final String PROFIT_UPLOAD = "profit_upload";
    static final String SCRIPT_DOCX = "script_docx";
    static final String PREP_DETAIL = "prep_detail";

    /** 행위 코드(BOARD_MATERIAL_ACT.ACTION_CD) — 컨트롤러가 {@link #of(HttpServletRequest, String)} 에 넘긴다. */
    public static final String ACT_LIST = "LIST";
    public static final String ACT_CREATE = "CREATE";
    public static final String ACT_VIEW = "VIEW";
    public static final String ACT_SAVE = "SAVE";
    public static final String ACT_SCRIPT_DOCX = "SCRIPT_DOCX";

    /**
     * 사전준비 상세에서만 쓰는 버튼 → 그 버튼이 유효한 행위. 화면(prep_detail)만이 아니라 행위(주소)까지 묶는다(security 11-26 ② 하) —
     * 그 밖의 이사회 자료 주소(결재 올리기·승인·확정본 내려받기·회의 날짜 저장 등)에서는 UNKNOWN·ui_valid=false.
     */
    private static final Map<String, Set<String>> PREP_ONLY = new HashMap<String, Set<String>>();

    static {
        PREP_ONLY.put(PROFIT_UPLOAD, Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(ACT_LIST, ACT_CREATE, ACT_VIEW, ACT_SAVE))));
        PREP_ONLY.put(SCRIPT_DOCX, Collections.singleton(ACT_SCRIPT_DOCX));
    }

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

    /** 행위를 모르는 경로용 — 사전준비 전용 버튼(profit_upload·script_docx)은 항상 UNKNOWN. */
    public static Ui of(HttpServletRequest req) {
        return of(req, null);
    }

    /** 행위(action)까지 보는 판정 — 사전준비 전용 버튼은 prep_detail 화면이고 그 버튼이 허용한 행위일 때만 유효. */
    public static Ui of(HttpServletRequest req, String action) {
        String s = clean(req.getHeader(H_SCREEN));
        String b = clean(req.getHeader(H_BUTTON));
        boolean sv = s != null && SCREENS.contains(s);
        boolean bv = b != null && BUTTONS.contains(b);
        Set<String> only = b == null ? null : PREP_ONLY.get(b);
        if (bv && only != null) {
            bv = PREP_DETAIL.equals(s) && action != null && only.contains(action);
        }
        return new Ui(sv ? s : UNKNOWN, bv ? b : UNKNOWN, sv && bv);
    }

    private static String clean(String v) {
        return v == null ? null : v.trim();
    }
}
