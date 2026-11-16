package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.InstPlanDoc;
import com.kbstar.kgi.ggreport.web.domain.InstPlanItem;
import org.junit.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** 사업계획 판정 규칙(오래됨·기간 지남·계산값) 단위 시험 — Spring·DB 없음. */
public class InstitutionPlanRulesTest {

    @Test
    public void 오래됨은_12개월_초과부터다() {
        LocalDate today = LocalDate.of(2026, 11, 16);
        assertFalse("딱 12개월은 오래됨이 아니다", InstitutionPlanService.isStale("2025-11-16", today));
        assertTrue("하루 넘으면 오래됨", InstitutionPlanService.isStale("2025-11-15", today));
        assertFalse(InstitutionPlanService.isStale("2026-11-16", today));
    }

    @Test
    public void 오래됨_윤일_경계() {
        LocalDate leap = LocalDate.of(2028, 2, 29);   // 12개월 전 = 2027-02-28(말일 보정)
        assertFalse(InstitutionPlanService.isStale("2027-02-28", leap));
        assertTrue(InstitutionPlanService.isStale("2027-02-27", leap));
    }

    private static InstPlanDoc doc(Integer to) {
        InstPlanDoc d = new InstPlanDoc();
        d.setPeriodTo(to);
        return d;
    }

    @Test
    public void 기간_지남은_끝_연도가_올해_미만일_때다() {
        LocalDate today = LocalDate.of(2026, 11, 16);
        assertFalse("끝 = 올해", InstitutionPlanService.periodEnded(doc(2026), today));
        assertTrue("끝 = 작년", InstitutionPlanService.periodEnded(doc(2025), today));
        assertFalse(InstitutionPlanService.periodEnded(doc(2030), today));
        assertFalse("끝 연도 없음", InstitutionPlanService.periodEnded(doc(null), today));
    }

    private static InstPlanItem item(String no, String state, String amount, String unit) {
        InstPlanItem i = new InstPlanItem();
        i.setItemNo(no);
        i.setBudgetStateCd(state);
        i.setBudgetAmount(amount == null ? null : new BigDecimal(amount));
        i.setBudgetUnitCd(unit);
        return i;
    }

    @Test
    public void 하위가_없으면_계산값은_null이다() {
        InstPlanItem parent = item("1", "NOT_IN_SOURCE", null, null);
        assertNull(InstitutionPlanService.calculated(parent, null));
        assertNull(InstitutionPlanService.calculated(parent, Collections.<InstPlanItem>emptyList()));
    }

    @Test
    public void 상위_자신이_금액이면_계산값은_null이다() {
        InstPlanItem parent = item("1", "AMOUNT", "1000", "MIL_KRW");
        List<InstPlanItem> kids = Arrays.asList(item("1-1", "AMOUNT", "400", "MIL_KRW"));
        assertNull(InstitutionPlanService.calculated(parent, kids));
    }

    @Test
    public void 하위가_모두_금액이고_단위가_같으면_합을_준다() {
        InstPlanItem parent = item("1", "NOT_IN_SOURCE", null, null);
        List<InstPlanItem> kids = Arrays.asList(item("1-1", "AMOUNT", "400.5", "MIL_KRW"), item("1-2", "AMOUNT", "100", "MIL_KRW"));
        Map<String, Object> c = InstitutionPlanService.calculated(parent, kids);
        assertEquals("AMOUNT", c.get("state_cd"));
        assertEquals("500.5", c.get("amount"));
        assertEquals("MIL_KRW", c.get("unit_cd"));
        assertEquals(2, c.get("child_count"));
        assertEquals(Boolean.TRUE, c.get("is_calculated"));
    }

    @Test
    public void 하위_하나가_금액이_아니면_UNVERIFIED다() {
        InstPlanItem parent = item("1", "NOT_IN_SOURCE", null, null);
        List<InstPlanItem> kids = Arrays.asList(item("1-1", "AMOUNT", "400", "MIL_KRW"), item("1-2", "NOT_IN_SOURCE", null, null));
        Map<String, Object> c = InstitutionPlanService.calculated(parent, kids);
        assertEquals("UNVERIFIED", c.get("state_cd"));
        assertNull(c.get("amount"));
        assertNull(c.get("unit_cd"));
    }
}
