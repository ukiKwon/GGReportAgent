package com.kbstar.kgi.ggreport.web.support;

import javax.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * 기관 편집({@code PUT /institutions/{id}}) 요청이 싣는 {@code X-Screen-Id}·{@code X-Button-Id}. {@link HeadUiIds} 와 같은 규칙 —
 * 허용 목록 밖의 값은 원문을 저장하지 않고 {@code UNKNOWN}. ⚠️ 클라이언트 자기신고 값이다.
 *
 * <p>반입 경로(CSV·inbox)는 요청 헤더가 아니라 서버가 고정값을 넣는다({@link #csvImport()}, {@link #inboxApply()}).
 * 그 화면 id 는 헤더로는 <b>받지 않는다</b>(허용 목록 {@link #SCREENS} 에 넣지 않음) — 화면 저장이 반입 이력을 흉내 내지 못하게.
 */
public final class InstUiIds {

    public static final String SCREEN_CSV_IMPORT = "csv_import";
    public static final String SCREEN_INBOX_APPLY = "inbox_apply";
    public static final String BUTTON_IMPORT = "import_upsert";

    public static final Set<String> SCREENS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "institution_edit", "map_popover", "bid_board", "bid_notice")));
    public static final Set<String> BUTTONS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "save_basic", "save_schedule", "save_open_status", "open_edit")));

    private InstUiIds() {
    }

    public static BoardUiIds.Ui of(HttpServletRequest req) {
        String s = clean(req.getHeader(BoardUiIds.H_SCREEN));
        String b = clean(req.getHeader(BoardUiIds.H_BUTTON));
        boolean sv = s != null && SCREENS.contains(s);
        boolean bv = b != null && BUTTONS.contains(b);
        return new BoardUiIds.Ui(sv ? s : BoardUiIds.UNKNOWN, bv ? b : BoardUiIds.UNKNOWN, sv && bv);
    }

    /** CSV 반입(POST /institutions/import)이 남기는 이력용 고정 화면·버튼. */
    public static BoardUiIds.Ui csvImport() {
        return new BoardUiIds.Ui(SCREEN_CSV_IMPORT, BUTTON_IMPORT, true);
    }

    /** inbox 반입 배치가 남기는 이력용 고정 화면·버튼. */
    public static BoardUiIds.Ui inboxApply() {
        return new BoardUiIds.Ui(SCREEN_INBOX_APPLY, BUTTON_IMPORT, true);
    }

    private static String clean(String v) {
        return v == null ? null : v.trim();
    }
}
