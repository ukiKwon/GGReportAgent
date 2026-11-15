package com.kbstar.kgi.ggreport.web.service;

import org.junit.Test;

import java.time.LocalDate;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** 개원 예정 '확인 필요' 계산(순수 함수). 연·연월 정밀도는 기간의 마지막 날 기준. */
public class InstitutionRulesTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 15);

    @Test
    public void 날짜_정밀도의_지난_날만_참() {
        assertTrue(InstitutionRules.openCheckNeeded("PLANNED", "2026-11-14", TODAY));
        assertFalse(InstitutionRules.openCheckNeeded("PLANNED", "2026-11-15", TODAY));
    }

    @Test
    public void 연도만_알면_그해_12월_31일까지는_거짓() {
        assertFalse(InstitutionRules.openCheckNeeded("PLANNED", "2026", LocalDate.of(2026, 12, 31)));
        assertTrue(InstitutionRules.openCheckNeeded("PLANNED", "2026", LocalDate.of(2027, 1, 1)));
    }

    @Test
    public void 연월만_알면_월말까지는_거짓() {
        assertFalse(InstitutionRules.openCheckNeeded("PLANNED", "2026-11", LocalDate.of(2026, 11, 30)));
        assertTrue(InstitutionRules.openCheckNeeded("PLANNED", "2026-11", LocalDate.of(2026, 12, 1)));
    }

    @Test
    public void 운영이거나_개원일이_없거나_형식이_이상하면_거짓() {
        assertFalse(InstitutionRules.openCheckNeeded("OPERATING", "2020-01-01", TODAY));
        assertFalse(InstitutionRules.openCheckNeeded("PLANNED", null, TODAY));
        assertFalse(InstitutionRules.openCheckNeeded("PLANNED", "abc", TODAY));
        assertFalse(InstitutionRules.openCheckNeeded("PLANNED", "20-1", TODAY));
    }
}
