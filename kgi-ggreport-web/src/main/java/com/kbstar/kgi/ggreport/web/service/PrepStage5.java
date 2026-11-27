package com.kbstar.kgi.ggreport.web.service;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * NEXT 120 ①·125 — 제안 건의 띠 칸·건 상태(사용자 11-25·11-26). 근거 = BID_PREP 상태 + 손 체크(BID_PREP_CHECK)뿐, 추정 없음.
 * 결과발표 옛 값(DONE·IN_PROGRESS)은 선정/탈락으로 추정하지 않는다 — UNDECIDED(담당이 다시 고름, 사용자 11-26 ②).
 * '진행 중'(같은 목표 건의 새 확정을 막는 활성) = 상태 6종이면서 탈락·협약 완료가 아님(사용자 11-26 ①).
 * 판정 순서: 탈락 → 협약 완료 → 취소·중단(탈락 뒤 중단해도 탈락으로 남게, qa P1-3). 순수 로직.
 * 입력 맵 m = COL_CD → 현재 MARK_CD(PROPOSAL_SUBMIT·RESULT·CEREMONY·AGREE_LEGAL).
 */
public final class PrepStage5 {
    public static final String BEFORE = "BEFORE", PREP = "PREP", SUBMITTED = "SUBMITTED", PLANNED = "CONTRACT_PLANNED",
            DONE = "CONTRACT_DONE", ENDED = "ENDED";
    public static final String END_DROP = "DROP", END_STOP = "STOP", END_UNCONFIRMED = "UNCONFIRMED";
    public static final String ST_ACTIVE = "ACTIVE", ST_DROPPED = "DROPPED", ST_CONTRACTED = "CONTRACTED", ST_STOPPED = "STOPPED",
            ST_UNCONFIRMED = "UNCONFIRMED", ST_NONE = "NONE";
    public static final String R_WON = "WON", R_LOST = "LOST", R_UNDECIDED = "UNDECIDED";
    /** PrepMapper.countActiveByInstitution 과 같은 상태 목록 — 바꾸면 둘 다. */
    public static final Set<String> OPEN_STATES = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "CONFIRMED", "OPEN_PENDING", "IN_PROGRESS", "APPROVAL_PENDING", "WRITABLE", "WRITING")));

    private PrepStage5() { }

    public static boolean contractDone(String ceremony, String agree) {
        return "DONE".equals(ceremony) || ("NA".equals(ceremony) && "DONE".equals(agree));
    }

    /** 결과발표 → WON|LOST|UNDECIDED(옛 DONE·IN_PROGRESS)|null(기록 없음·NA·NONE). */
    public static String resultCd(String mark) {
        if (R_WON.equals(mark) || R_LOST.equals(mark)) return mark;
        return "DONE".equals(mark) || "IN_PROGRESS".equals(mark) ? R_UNDECIDED : null;
    }

    public static boolean isFinal(Map<String, String> m) {
        return R_LOST.equals(m.get("RESULT")) || contractDone(m.get("CEREMONY"), m.get("AGREE_LEGAL"));
    }

    /** 같은 목표 건의 새 확정·순위 잠금·추정 연결을 막는 '진행 중'인가. */
    public static boolean blocking(String state, Map<String, String> m) {
        return OPEN_STATES.contains(state) && !isFinal(m);
    }

    public static String status(String state, String openedAt, Map<String, String> m) {
        if (state == null) return ST_NONE;
        if (R_LOST.equals(m.get("RESULT"))) return ST_DROPPED;
        if (contractDone(m.get("CEREMONY"), m.get("AGREE_LEGAL"))) return ST_CONTRACTED;
        if ("CANCELLED".equals(state)) return openedAt != null ? ST_STOPPED : ST_UNCONFIRMED;
        return ST_ACTIVE;
    }

    /** [띠 칸, 끝난 종류]. */
    public static String[] of(String state, String openedAt, Map<String, String> m) {
        if (R_LOST.equals(m.get("RESULT"))) return new String[]{ENDED, END_DROP};
        if (contractDone(m.get("CEREMONY"), m.get("AGREE_LEGAL"))) return new String[]{DONE, null};
        if ("CANCELLED".equals(state)) return new String[]{ENDED, openedAt != null ? END_STOP : END_UNCONFIRMED};
        if (R_WON.equals(m.get("RESULT"))) return new String[]{PLANNED, null};
        if ("DONE".equals(m.get("PROPOSAL_SUBMIT"))) return new String[]{SUBMITTED, null};
        if ("CONFIRMED".equals(state) || "OPEN_PENDING".equals(state)) return new String[]{BEFORE, null};
        return new String[]{PREP, null};
    }
}
