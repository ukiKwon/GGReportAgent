package com.kbstar.kgi.ggreport.web.support;

/** 사업계획 반입·내려받기 감사의 화면·버튼 — 전부 서버 고정값이다(헤더로 받지 않는다, InstUiIds.csvImport 선례). 화면 저장이 반입 이력을 흉내 내지 못하게. */
public final class PlanUiIds {

    public static final String SCREEN_IMPORT = "plan_import";
    public static final String BUTTON_UPLOAD = "plan_upload";
    public static final String SCREEN_SEED = "plan_seed";
    public static final String BUTTON_SEED = "plan_seed_apply";
    public static final String SCREEN_MISSING = "plan_missing";
    public static final String BUTTON_MISSING = "plan_missing_csv";

    private PlanUiIds() {
    }

    public static BoardUiIds.Ui upload() { return new BoardUiIds.Ui(SCREEN_IMPORT, BUTTON_UPLOAD, true); }
    public static BoardUiIds.Ui seed() { return new BoardUiIds.Ui(SCREEN_SEED, BUTTON_SEED, true); }
    public static BoardUiIds.Ui missing() { return new BoardUiIds.Ui(SCREEN_MISSING, BUTTON_MISSING, true); }

    // 045 사업계획 수집 요청 — 요청하는 쪽(기관 사업계획 화면) / 처리 화면(개발부서)
    public static final String SCREEN_COLLECT = "plan_collect";
    public static final String BUTTON_COLLECT_REQUEST = "plan_collect_request";
    public static final String BUTTON_COLLECT_CANCEL = "plan_collect_cancel";
    public static final String SCREEN_COLLECT_ADMIN = "plan_collect_admin";
    public static final String BUTTON_COLLECT_EXPORT = "plan_collect_export";
    public static final String BUTTON_COLLECT_MARK = "plan_collect_mark";
    public static final String BUTTON_COLLECT_RUN = "plan_collect_run";
    public static final String BUTTON_COLLECT_EXCLUDE = "plan_collect_exclude";
    public static final String BUTTON_COLLECT_FAIL = "plan_collect_fail";
    public static final String BUTTON_COLLECT_REQUEST_BATCH = "plan_collect_request_batch";

    public static BoardUiIds.Ui collectRequest() { return new BoardUiIds.Ui(SCREEN_COLLECT, BUTTON_COLLECT_REQUEST, true); }
    public static BoardUiIds.Ui collectCancel() { return new BoardUiIds.Ui(SCREEN_COLLECT, BUTTON_COLLECT_CANCEL, true); }
    public static BoardUiIds.Ui collectRequestBatch() { return new BoardUiIds.Ui(SCREEN_COLLECT, BUTTON_COLLECT_REQUEST_BATCH, true); }
    public static BoardUiIds.Ui collectExport() { return new BoardUiIds.Ui(SCREEN_COLLECT_ADMIN, BUTTON_COLLECT_EXPORT, true); }
    public static BoardUiIds.Ui collectMark() { return new BoardUiIds.Ui(SCREEN_COLLECT_ADMIN, BUTTON_COLLECT_MARK, true); }
    public static BoardUiIds.Ui collectRun() { return new BoardUiIds.Ui(SCREEN_COLLECT_ADMIN, BUTTON_COLLECT_RUN, true); }
    public static BoardUiIds.Ui collectExclude() { return new BoardUiIds.Ui(SCREEN_COLLECT_ADMIN, BUTTON_COLLECT_EXCLUDE, true); }
    public static BoardUiIds.Ui collectFail() { return new BoardUiIds.Ui(SCREEN_COLLECT_ADMIN, BUTTON_COLLECT_FAIL, true); }
}
