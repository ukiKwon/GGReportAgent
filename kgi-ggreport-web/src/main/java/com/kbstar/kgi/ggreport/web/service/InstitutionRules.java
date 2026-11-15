package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.Institution;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;

/** 기관 계산 규칙. 서울 날짜 기준. */
public final class InstitutionRules {

    public static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    private InstitutionRules() {
    }

    /**
     * 개원 예정(PLANNED)인데 개원일이 지났다 — 상태는 바꾸지 않고 '확인 필요'만 낸다.
     * 연·연월 정밀도는 그 기간의 마지막 날을 기준으로 한다(아직 개원 못 한 달을 오탐하지 않으려고).
     */
    public static boolean openCheckNeeded(String opStatus, String openDate, LocalDate today) {
        if (!"PLANNED".equals(opStatus) || openDate == null) {
            return false;
        }
        try {
            LocalDate last;
            switch (openDate.length()) {
                case 4:
                    last = LocalDate.of(Integer.parseInt(openDate), 12, 31);
                    break;
                case 7:
                    last = YearMonth.parse(openDate).atEndOfMonth();
                    break;
                case 10:
                    last = LocalDate.parse(openDate);
                    break;
                default:
                    return false;
            }
            return today.isAfter(last);
        } catch (RuntimeException e) {
            return false;
        }
    }

    public static Institution decorate(Institution i, LocalDate today) {
        if (i != null) {
            i.setOpenCheckNeeded(openCheckNeeded(i.getOpStatus(), i.getOpenDate(), today));
        }
        return i;
    }
}
