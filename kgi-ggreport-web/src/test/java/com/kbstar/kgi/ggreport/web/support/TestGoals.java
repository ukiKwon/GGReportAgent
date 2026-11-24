package com.kbstar.kgi.ggreport.web.support;

import org.springframework.jdbc.core.JdbcTemplate;

/** 시험 바탕 — 제안 확정 조건(NEXT 114: 결재 끝난 올해 목표 기관만)을 맞추는 올해 목표 행. 가상 값(사번은 시드 영업팀). */
public final class TestGoals {
    private TestGoals() {
    }

    public static int thisYear() {
        return Integer.parseInt(Times.todayKst().substring(0, 4));
    }

    /** 살아 있는 올해 목표가 없으면 한 행(SAVE·REV 1, 번호 = 최대+1)을 넣고 번호를 돌려준다. 이미 있으면 null. */
    public static Integer seedThisYear(JdbcTemplate jdbc, String inst) {
        int y = thisYear();
        Integer have = jdbc.queryForObject("SELECT COUNT(*) FROM INST_BID_TARGET b WHERE b.INSTITUTION_ID=? AND b.KIND_CD='GOAL' AND b.TARGET_YEAR=?"
                + " AND b.ACTION_CD<>'CANCEL' AND NOT EXISTS (SELECT 1 FROM INST_BID_TARGET n WHERE n.INSTITUTION_ID=b.INSTITUTION_ID"
                + " AND n.TARGET_NO=b.TARGET_NO AND n.REV_NO>b.REV_NO)", Integer.class, inst, y);
        if (have != null && have > 0) {
            return null;
        }
        int no = jdbc.queryForObject("SELECT COALESCE(MAX(TARGET_NO), 0) FROM INST_BID_TARGET WHERE INSTITUTION_ID=?", Integer.class, inst) + 1;
        jdbc.update("INSERT INTO INST_BID_TARGET (INSTITUTION_ID, TARGET_NO, REV_NO, ACTION_CD, KIND_CD, TARGET_YEAR, TAG_CD, EDITOR_EMP_NO, EDITOR_NAME,"
                + " EMP_VERIFIED, SCREEN_ID, BUTTON_ID, UI_VALID, SAVED_AT) VALUES (?, ?, 1, 'SAVE', 'GOAL', ?, 'NEW', '3918264', '김영업',"
                + " 0, 'bid_board', 'seed', 1, '2026-11-25T00:00:00+09:00')", inst, no, y);
        return no;
    }

    /** 트랜잭션 없는 시험의 뒷정리용. */
    public static void remove(JdbcTemplate jdbc, String inst, int no) {
        jdbc.update("DELETE FROM INST_BID_TARGET WHERE INSTITUTION_ID=? AND TARGET_NO=?", inst, no);
    }
}
