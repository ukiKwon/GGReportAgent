package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BankContract;
import org.junit.Test;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import static org.junit.Assert.*;

/** 연도별 국민은행 유치 상태 계산(039 줄 기반, 순수 로직). */
public class BankYearsTest {
    private static BankContract c(String bank, String from, String to) {
        BankContract b = new BankContract(); b.setBankCd(bank); b.setTermFrom(from); b.setTermTo(to); b.setContractNo(1); b.setRankCd("FIRST"); return b;
    }

    @Test public void covers_와_yearOf() {
        assertFalse(BankYears.covers(null, "2022", 2021));
        assertTrue(BankYears.covers(null, "2022", 2022));
        assertTrue(BankYears.covers("2019", "2022-12-31", 2020));
        assertNull(BankYears.yearOf("20a1"));
        assertNull(BankYears.yearOf(null));
        assertEquals(Integer.valueOf(2022), BankYears.yearOf("2022-12-31"));
    }

    @Test public void 연도_상태_세_가지() {
        List<BankContract> l = Arrays.asList(c("B02", "2019", "2022-12-31"), c("B04", "2023", "2026-12-31"));
        assertEquals(BankYears.KB, BankYears.yearState(l, 2020));
        assertEquals(BankYears.OTHER, BankYears.yearState(l, 2024));
        assertEquals(BankYears.NO_RECORD, BankYears.yearState(l, 2010));
        assertEquals(BankYears.NO_RECORD, BankYears.yearState(Collections.<BankContract>emptyList(), 2024));
        assertEquals(BankYears.NO_RECORD, BankYears.yearState(null, 2024));
    }

    @Test public void lastKbYear_와_nowState_는_지금_줄만() {
        List<BankContract> l = Arrays.asList(c("B02", "2019", "2022-12-31"), c("B04", "2023", "2026-12-31"));
        assertEquals(Integer.valueOf(2022), BankYears.lastKbYear(l));
        assertNull(BankYears.lastKbYear(Arrays.asList(c("B04", "2023", "2026-12-31"))));
        assertEquals(BankYears.OTHER, BankYears.nowState(l, LocalDate.of(2025, 5, 1)));
        assertEquals(BankYears.KB, BankYears.nowState(l, LocalDate.of(2021, 5, 1)));
        assertEquals(BankYears.NO_RECORD, BankYears.nowState(l, LocalDate.of(2030, 1, 1)));
    }
}
