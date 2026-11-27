package com.kbstar.kgi.ggreport.web.service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 대시보드 열 정의(NEXT 102) — 엑셀 칸 27칸 + 제안서 제출(PROPOSAL_SUBMIT, NEXT 120 ①) = 28칸(사용자 11-20 ①, 11-23 F7, 11-26).
 * 묶음 머리(BOARD 이사회·SUBMIT_APPR 제안서제출품의·CONTRACT_APPR 협약체결품의)는 GROUPS 의 표시용이다 — 칸이 아니라서 ALL 에 없고 PUT 도 404 다.
 * NOTICE = 공고 상태 기록(037) 값 그대로·읽기 전용(②), AUTO = 시스템 기록 → 아이콘(고칠 수 없음), MANUAL = 담당 영업 체크(③④⑥).
 * 이사회 진행(T5)은 대시보드에 내지 않는다(security F7 — 노출 축소). SUBMIT_DOCS 는 조건부 수동 체크 — RFP 서류 자동 추출·대조와 [확인]=V 는 다음 단계(⑤).
 * 코드는 [A-Z0-9_]{1,17} — 감사 TASK_CD 에 'CK_' 를 붙여 BID_PREP_ACT.TASK_CD(20) 에 맞춘다. 열을 바꾸면 화면 상수·시험을 같이 바꾼다.
 */
final class PrepBoardColumns {

    static final String NOTICE = "NOTICE";
    static final String AUTO = "AUTO";
    static final String MANUAL = "MANUAL";
    static final String AUDIT_PREFIX = "CK_";
    private static final String CODE = "[A-Z0-9_]{1,17}";

    static final class Col {
        final String cd;
        final String label;
        final String group;
        final String kind;

        Col(String cd, String label, String group, String kind) {
            this.cd = cd; this.label = label; this.group = group; this.kind = kind;
        }

        boolean editable() { return MANUAL.equals(kind); }
    }

    static final Map<String, String> GROUPS;
    static final List<Col> ALL;
    private static final Map<String, Col> BY_CD;

    static {
        Map<String, String> g = new LinkedHashMap<String, String>();
        g.put("BOARD", "이사회");
        g.put("SUBMIT_APPR", "제안서제출품의");
        g.put("CONTRACT_APPR", "협약체결품의");
        GROUPS = Collections.unmodifiableMap(g);
        List<Col> l = new ArrayList<Col>(Arrays.asList(
                new Col("NOTICE_CHECK", "입찰공고확인", null, NOTICE),
                new Col("INST_ANALYSIS", "기관 정보 분석", null, AUTO),          // T1
                new Col("PROFIT", "수익성분석", null, AUTO),                    // T3
                new Col("FIN_COMMITTEE", "가격결정위원회(재무)", null, MANUAL),
                new Col("BIZ_COMMITTEE", "출연금심의위원회(사업부)", null, MANUAL),
                new Col("BOARD_SECRETARIAT", "사무국", "BOARD", MANUAL),
                new Col("BOARD_AUDIT", "감사·감시", "BOARD", MANUAL),
                new Col("BOARD_COMPLIANCE", "준법", "BOARD", MANUAL),
                new Col("PROPOSAL", "제안서", null, AUTO),                      // 디자이너 작업 최종완료
                new Col("PRESENT_DOC", "발표자료", null, MANUAL),
                new Col("SUBMIT_DOCS", "제출서류", null, MANUAL),               // 조건부 수동 — 다음 단계에 상세 [확인]
                new Col("SUBMIT_MONITOR", "감시", "SUBMIT_APPR", MANUAL),
                new Col("SUBMIT_PROPERTY", "재산상이익", "SUBMIT_APPR", MANUAL),
                new Col("PROPOSAL_SUBMIT", "제안서 제출", null, MANUAL),         // NEXT 120 ① — 담당 영업 체크(이름·날짜 자동, 사용자 11-26)
                new Col("PT", "PT", null, MANUAL),
                new Col("RESULT", "결과발표", null, MANUAL),
                new Col("PRIORITY_NEGO", "우선협상", null, MANUAL),
                new Col("AGREE_LEGAL", "협약서(법률)", null, MANUAL),
                new Col("CONTRACT_AUDIT", "감사·감시", "CONTRACT_APPR", MANUAL),
                new Col("CONTRACT_STRATEGY", "전략", "CONTRACT_APPR", MANUAL),
                new Col("CONTRACT_PROPERTY", "재산상이익", "CONTRACT_APPR", MANUAL),
                new Col("CONTRACT_BRANCH", "영업점안내", "CONTRACT_APPR", MANUAL),
                new Col("ATM", "ATM", null, MANUAL),
                new Col("KB_CARD", "KB카드", null, MANUAL),
                new Col("IT_BUILD", "전산구축", null, MANUAL),
                new Col("VIP", "VIP 지정", null, MANUAL),
                new Col("RATE_APPROVAL", "금리승인", null, MANUAL),
                new Col("CEREMONY", "협약식", null, MANUAL)));
        ALL = Collections.unmodifiableList(l);
        Map<String, Col> m = new HashMap<String, Col>();
        for (Col c : l) {
            m.put(c.cd, c);
        }
        BY_CD = Collections.unmodifiableMap(m);
    }

    private PrepBoardColumns() {
    }

    /** 형식 밖이거나 모르는 코드(묶음 머리 포함)면 null. */
    static Col byCode(String raw) {
        return raw == null || !raw.matches(CODE) ? null : BY_CD.get(raw);
    }

    /**
     * 공고 칸(NOTICE)의 '확인' — 값(공고 상태)은 읽기 전용 그대로지만, 담당 영업이 "누락·미확인 없이 확인했다"(DONE)와 그 취소(NONE)는 적는다.
     * 누가·언제 확인했는지 이력으로 남기려는 것(사용자 11-25). 진행·대상 아님은 받지 않는다.
     */
    static boolean confirmable(Col c) {
        return c != null && NOTICE.equals(c.kind);
    }

    /** 감사 칸(BID_PREP_ACT.TASK_CD)용 — 형식 밖이면 null(경로 원문을 저장하지 않는다). */
    static String auditTask(String raw) {
        return raw != null && raw.matches(CODE) ? AUDIT_PREFIX + raw : null;
    }
}
