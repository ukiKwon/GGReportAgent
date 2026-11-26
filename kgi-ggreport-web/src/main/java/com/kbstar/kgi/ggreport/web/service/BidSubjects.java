package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BidPrep;

/**
 * 입찰 대상(064 BID_CASES.BID_SUBJECT_CD, 코드표 BID_SUBJECT) — NEXT 125.
 * 1단계는 표시 이름만 만든다. 확정 입력 검증·제목 추정은 2·3단계에서 여기 더한다.
 */
public final class BidSubjects {
    public static final String GROUP = "BID_SUBJECT";
    public static final String MAIN_BANK = "MAIN_BANK";
    public static final String FUND_MGMT = "FUND_MGMT";
    public static final String CORP_CARD = "CORP_CARD";
    public static final String ETC = "ETC";

    private BidSubjects() {
    }

    /** 공고명처럼 비어 있으면 null 로(앞뒤 공백은 그대로 둔다). */
    public static String blankToNull(String s) {
        return s == null || s.trim().isEmpty() ? null : s;
    }

    public static String label(BidPrep p) {
        return p == null ? null : label(p.getBidSubjectCd(), p.getBidSubjectEtc(), p.getBidSubjectCodeName());
    }

    /** ETC 이고 손 이름이 있으면 그 이름, 아니면 코드표 이름, 코드표에 없으면 코드 그대로. 코드가 없으면 null. */
    static String label(String cd, String etc, String codeName) {
        if (cd == null || cd.trim().isEmpty()) {
            return null;
        }
        String c = cd.trim();
        if (ETC.equals(c) && etc != null && !etc.trim().isEmpty()) {
            return etc.trim();
        }
        if (codeName != null && !codeName.trim().isEmpty()) {
            return codeName.trim();
        }
        return c;
    }
}
