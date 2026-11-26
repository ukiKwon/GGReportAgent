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

    /** 사전준비 상세 2단계 [다음] 확인(NEXT 121 N1) — 칸 체크 주소를 같이 쓰지만 화면·버튼은 prep_detail/notice_confirm, 칸은 입찰공고확인만. */
    public static final String NOTICE_SCREEN = "prep_detail";
    public static final String NOTICE_BUTTON = "notice_confirm";
    public static final String NOTICE_COL = "NOTICE_CHECK";

    private PrepBoardUiIds() {
    }

    /**
     * 칸 체크(PUT …/board-checks/{col}) 전용. prep_detail/notice_confirm 은 칸이 NOTICE_CHECK 일 때만 유효하고, 그 밖은 {@link #of} 와 같다
     * (현황판 prep_dashboard/dash_check 는 그대로 — 열려 있는 옛 화면도 같은 값). 거절(400)하지 않는다. ⚠️ 자기신고 값.
     */
    public static BoardUiIds.Ui forCheck(HttpServletRequest req, String colCd) {
        String s = clean(req.getHeader(BoardUiIds.H_SCREEN));
        String b = clean(req.getHeader(BoardUiIds.H_BUTTON));
        if (NOTICE_SCREEN.equals(s) && NOTICE_BUTTON.equals(b) && NOTICE_COL.equals(colCd)) {
            return new BoardUiIds.Ui(s, b, true);
        }
        return of(req);
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
