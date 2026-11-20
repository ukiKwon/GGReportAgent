package com.kbstar.kgi.ggreport.web.support;

import javax.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * 사전준비 양식(049) 요청이 싣는 "어느 화면·어느 버튼" 식별자({@code X-Screen-Id}·{@code X-Button-Id}). {@link PrepUiIds}·{@link DesignUiIds} 와 같은 규칙 —
 * 허용 목록 밖의 값은 원문을 저장하지 않고 {@code UNKNOWN} 으로 바꾼다. 쓰기·내려받기는 서비스가 유효하지 않으면 400 UI_ID_REQUIRED 로 막고,
 * 열람·판 목록은 UNKNOWN 이어도 기록만 한다. ⚠️ 클라이언트 자기신고 값이다.
 * 화면을 새로 만들면(S3 의 prep_form 화면, S4 의 결재함 보기) 여기 목록과 프런트 상수를 같이 더한다.
 * PrepUiIds 는 건드리지 않는다(다른 세션 소유) — 양식 화면·버튼은 이 목록만 본다.
 */
public final class PrepFormUiIds {

    public static final Set<String> SCREENS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "prep_form", "prep_detail")));
    public static final Set<String> BUTTONS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "form_open", "form_refresh", "form_prefill", "form_refill", "form_save", "form_confirm", "form_unconfirm",
            "form_history", "form_docx", "form_draft_docx")));

    private PrepFormUiIds() {
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
