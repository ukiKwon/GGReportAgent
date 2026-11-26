package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BidPrep;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

/** 입찰 대상 표시 이름 규칙(NEXT 125 1단계). */
public class BidSubjectsTest {

    @Test
    public void ETC이고_손_이름이_있으면_손_이름() {
        assertEquals("퇴직연금 운용기관", BidSubjects.label("ETC", "퇴직연금 운용기관", "기타"));
    }

    @Test
    public void ETC인데_손_이름이_비면_코드표_이름() {
        assertEquals("기타", BidSubjects.label("ETC", "  ", "기타"));
    }

    @Test
    public void 코드표_이름을_쓴다() {
        assertEquals("자금관리 금융기관", BidSubjects.label("FUND_MGMT", null, "자금관리 금융기관"));
    }

    @Test
    public void 코드표에_없으면_코드_그대로() {
        assertEquals("NEW_X", BidSubjects.label("NEW_X", null, null));
    }

    @Test
    public void 코드가_없으면_null() {
        assertNull(BidSubjects.label(null, "x", "y"));
        assertNull(BidSubjects.label("  ", "x", "y"));
        assertNull(BidSubjects.label((BidPrep) null));
    }

    @Test
    public void 공고명은_비면_null() {
        assertNull(BidSubjects.blankToNull(null));
        assertNull(BidSubjects.blankToNull("  "));
        assertEquals("가상 공고", BidSubjects.blankToNull("가상 공고"));
    }
}
