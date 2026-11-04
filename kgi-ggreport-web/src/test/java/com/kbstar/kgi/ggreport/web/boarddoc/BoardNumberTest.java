package com.kbstar.kgi.ggreport.web.boarddoc;

import org.junit.Test;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Collections;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

public class BoardNumberTest {

    private static BigDecimal d(String s) {
        return new BigDecimal(s);
    }

    @Test
    public void sumAddsExactly() {
        assertEquals(0, BoardNumber.sum(Arrays.asList(d("1"), d("2.5"), d("3.25"))).compareTo(d("6.75")));
        assertEquals(0, BoardNumber.sum(Collections.singletonList(d("-4"))).compareTo(d("-4")));
    }

    @Test
    public void sumRejectsEmptyAndNull() {
        try {
            BoardNumber.sum(Collections.<BigDecimal>emptyList());
            fail();
        } catch (IllegalArgumentException expected) {
            // ok
        }
        try {
            BoardNumber.sum(Arrays.asList(d("1"), null));
            fail();
        } catch (IllegalArgumentException expected) {
            // ok
        }
    }

    @Test
    public void convertsMillionToEok() {
        assertEquals("123.45", BoardNumber.eok(d("12345")));
        assertEquals("1.00", BoardNumber.eok(d("100")));
        assertEquals("0.00", BoardNumber.eok(d("0")));
    }

    @Test
    public void sumFirstThenRoundOnce() {
        // 0.4 + 0.4 = 0.8 백만원 = 0.008 억원 → 0.01. 개별로 반올림하면 0.00 + 0.00.
        assertEquals("0.01", BoardNumber.eok(BoardNumber.sum(Arrays.asList(d("0.4"), d("0.4")))));
        assertEquals("0.00", BoardNumber.eok(d("0.4")));
    }

    @Test
    public void halfUpAtTheBoundary() {
        assertEquals("0.01", BoardNumber.eok(d("0.5")));      // 0.005 억원
        assertEquals("0.00", BoardNumber.eok(d("0.49")));     // 0.0049
        assertEquals("1.01", BoardNumber.eok(d("100.5")));    // 1.005
        assertEquals("-1.01", BoardNumber.eok(d("-100.5")));  // -1.005 → 0 에서 멀어지는 쪽
        assertEquals("-0.01", BoardNumber.eok(d("-0.5")));
    }

    @Test
    public void negativeZeroIsPlainZero() {
        assertEquals("0.00", BoardNumber.eok(d("-0.4")));     // -0.004 → -0.00
        assertEquals("0.00", BoardNumber.eok(d("-0")));
        assertEquals("0.00", BoardNumber.eok(new BigDecimal("-0.0")));
    }

    @Test
    public void negativeUsesAsciiHyphen() {
        String s = BoardNumber.eok(d("-12345"));
        assertEquals("-123.45", s);
        assertEquals('-', s.charAt(0));
    }

    @Test
    public void thousandsSeparatorsAndRollover() {
        assertEquals("1,234,567.89", BoardNumber.eok(d("123456789")));
        assertEquals("1,000.00", BoardNumber.eok(d("100000")));
        assertEquals("1,000.00", BoardNumber.eok(d("99999.5")));    // 999.995 → 1,000.00
        assertEquals("-1,234,567.89", BoardNumber.eok(d("-123456789")));
    }

    @Test
    public void parenJoinsTwoValues() {
        assertEquals("5.00 (1.00)", BoardNumber.paren("5.00", "1.00"));
        assertEquals("-0.50 (0.00)", BoardNumber.paren("-0.50", "0.00"));
    }
}
