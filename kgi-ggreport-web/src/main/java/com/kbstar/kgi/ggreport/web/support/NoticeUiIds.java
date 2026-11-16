package com.kbstar.kgi.ggreport.web.support;

import javax.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * 공고 상태 기록(037) 요청의 "어느 화면·어느 버튼"({@code X-Screen-Id}·{@code X-Button-Id}). {@link PrepUiIds} 와 같은 규칙 —
 * 허용 목록 밖은 원문을 저장하지 않고 UNKNOWN(UI_VALID=0). 쓰는 곳은 입찰 공고 현황 하나(design-reviewer 11-16 P2-3).
 * save_confirmed = '공고 종료' 확인 창을 거쳐 저장. ⚠️ 클라이언트 자기신고 값이다(확인 창은 실수 방지이지 보안 경계가 아니다).
 */
public final class NoticeUiIds {

    public static final String SCREEN = "bid_notice";
    public static final String SAVE = "save";
    public static final String SAVE_CONFIRMED = "save_confirmed";

    public static final Set<String> SCREENS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(SCREEN)));
    public static final Set<String> BUTTONS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(SAVE, SAVE_CONFIRMED)));

    private NoticeUiIds() {
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
