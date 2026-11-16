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
}
