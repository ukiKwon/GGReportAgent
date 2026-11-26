package com.kbstar.kgi.ggreport.web.support;

import javax.servlet.http.HttpServletRequest;

/**
 * 발표 대본 AI 초안 전용 — 화면 prep_detail·버튼 script_ai_draft 일 때만 그 값, 아니면 UNKNOWN·ui_valid=false(거절하지 않는다 — PrepUiIds.forScript 와 같다).
 * BoardUiIds.Ui 의 생성자가 package-private 이라 같은 support 패키지에 둔다(BoardUiIds 를 고치지 않는다). ⚠️ 자기신고 값.
 * 6e 가 BoardUiIds 에 script_ai_draft 를 등록하면 이사회 자료 감사 줄은 BoardUiIds.of(req, 행위)로 바꾼다.
 */
public final class ScriptDraftUiIds {

    public static final String SCREEN = "prep_detail";
    public static final String BUTTON = "script_ai_draft";

    private ScriptDraftUiIds() {
    }

    public static BoardUiIds.Ui of(HttpServletRequest req) {
        String s = clean(req.getHeader(BoardUiIds.H_SCREEN));
        String b = clean(req.getHeader(BoardUiIds.H_BUTTON));
        boolean sv = SCREEN.equals(s);
        boolean bv = BUTTON.equals(b);
        return new BoardUiIds.Ui(sv ? s : BoardUiIds.UNKNOWN, bv ? b : BoardUiIds.UNKNOWN, sv && bv);
    }

    private static String clean(String v) { return v == null ? null : v.trim(); }
}
