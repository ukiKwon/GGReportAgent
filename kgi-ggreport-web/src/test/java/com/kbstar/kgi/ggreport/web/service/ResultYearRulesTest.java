package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BankContract;
import org.junit.Test;
import java.util.*;
import static org.junit.Assert.*;

/** 약정 → 귀속 목표 연도(NEXT 105) — 순수 단위. */
public class ResultYearRulesTest {
    private static BankContract line(int no, String rank, String bank, String from) {
        BankContract c = new BankContract();
        c.setContractNo(no); c.setRankCd(rank); c.setBankCd(bank); c.setTermFrom(from);
        return c;
    }

    @Test public void 기록이_없으면_104_추정과_같다() {
        for (String from : new String[]{"2030-01-01", "2030-03-01", "2030"}) {
            assertEquals(from, TargetResultRules.targetYearOf(from), ResultYearRules.yearOf(from, null));
            assertEquals(from, TargetResultRules.targetYearOf(from), ResultYearRules.yearOf(from, new HashMap<Integer, String>()));
        }
    }

    @Test public void 개시일과_같으면_그_목표_연도() {
        Map<Integer, String> st = new HashMap<Integer, String>();
        st.put(2026, "2027-03-01");
        assertEquals(Integer.valueOf(2026), ResultYearRules.yearOf("2027-03-01", st));
    }

    @Test public void 두_해의_기록_날짜가_완전히_같으면_추정으로_간다() {
        Map<Integer, String> st = new HashMap<Integer, String>();
        st.put(2026, "2027-01-01"); st.put(2027, "2027-01-01");
        assertEquals(TargetResultRules.targetYearOf("2027-01-01"), ResultYearRules.yearOf("2027-01-01", st));
    }

    @Test public void 연도만_시작이면_기록과_맞추지_않고_추정() {
        Map<Integer, String> st = new HashMap<Integer, String>();
        st.put(2026, "2027-03-01");
        assertEquals(TargetResultRules.targetYearOf("2027"), ResultYearRules.yearOf("2027", st));
    }

    @Test public void 연월만_시작이면_기록과_맞추지_않고_추정() {
        Map<Integer, String> st = new HashMap<Integer, String>();
        st.put(2026, "2027-03-01");
        assertEquals(TargetResultRules.targetYearOf("2027-03"), ResultYearRules.yearOf("2027-03", st));
    }

    @Test public void 약정_시작이_없으면_null() {
        assertNull(ResultYearRules.yearOf(null, null));
    }

    @Test public void verdict_줄_없음_국민_그_밖() {
        Map<Integer, String> none = new HashMap<Integer, String>();
        assertEquals(TargetResultRules.UNREGISTERED, ResultYearRules.verdict(null, none, 2029));
        assertEquals(TargetResultRules.SUCCESS, ResultYearRules.verdict(Arrays.asList(line(1, "FIRST", "B02", "2030-01-01")), none, 2029));
        assertEquals(TargetResultRules.FAIL, ResultYearRules.verdict(Arrays.asList(line(1, "FIRST", "B03", "2030-01-01")), none, 2029));
    }
}
