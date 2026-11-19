package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BankContract;
import org.junit.Test;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
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

    @Test public void summary_lines_next_는_시작_전_줄만_그리고_lines_now_는_불변() {
        LocalDate t = LocalDate.of(2025, 5, 1);
        List<BankContract> l = Arrays.asList(c("B02", "2019", "2022-12-31"),   // PAST
                c("B04", "2023", "2026-12-31"),                                // CURRENT
                c("B02", "2027", "2030-12-31"));                               // FUTURE
        Map<String, Object> s = BankYears.summary(l, t);
        assertEquals(1, ((List<?>) s.get("lines_now")).size());
        List<?> nx = (List<?>) s.get("lines_next");
        assertEquals(1, nx.size());
        assertEquals("2027", ((Map<?, ?>) nx.get(0)).get("term_from"));
        assertEquals("OTHER", s.get("kb_now"));
        assertEquals(Integer.valueOf(2030), s.get("last_kb_year"));
    }

    @Test public void summary_lines_next_없으면_빈_배열() {
        Map<String, Object> s = BankYears.summary(Arrays.asList(c("B04", "2023", "2026-12-31")), LocalDate.of(2025, 5, 1));
        assertTrue(((List<?>) s.get("lines_next")).isEmpty());
        assertTrue(((List<?>) BankYears.summary(null, LocalDate.of(2025, 5, 1)).get("lines_next")).isEmpty());
    }

    @Test public void summary_lines_next_시작일_오름차순_끝난줄_제외() {
        BankContract a = c("B04", "2029", "2031"); a.setContractNo(1);
        BankContract b = c("B02", "2027-03", "2030"); b.setContractNo(2);
        BankContract d = c("B04", "2027", "2028"); d.setContractNo(3);
        BankContract past = c("B02", "2010", "2012"); past.setContractNo(4);
        List<?> nx = (List<?>) BankYears.summary(Arrays.asList(a, b, d, past), LocalDate.of(2025, 5, 1)).get("lines_next");
        assertEquals(3, nx.size());
        assertEquals("2027", ((Map<?, ?>) nx.get(0)).get("term_from"));
        assertEquals("2027-03", ((Map<?, ?>) nx.get(1)).get("term_from"));
        assertEquals("2029", ((Map<?, ?>) nx.get(2)).get("term_from"));
    }
}
