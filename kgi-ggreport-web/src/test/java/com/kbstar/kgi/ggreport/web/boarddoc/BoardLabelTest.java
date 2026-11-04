package com.kbstar.kgi.ggreport.web.boarddoc;

import org.junit.Test;

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class BoardLabelTest {

    @Test
    public void keyRemovesSpacesMiddleDotsCommasAndPeriods() {
        assertEquals("공금예금합계", BoardLabel.key(" 공금·예금, 합계. "));
        assertEquals("공금예금", BoardLabel.key("공금ㆍ예금"));
        assertEquals("2세부산출표", BoardLabel.key("2.세부 산출표"));
        assertEquals("3-1판단기준표", BoardLabel.key("3-1.판단 기준표"));
    }

    @Test
    public void keyFoldsWidthAndCase() {
        assertEquals("abc(1)", BoardLabel.key("ＡＢＣ（１）"));
        assertEquals("순현재가치(npv)", BoardLabel.key("순 현재가치(NPV)"));
    }

    @Test
    public void keyDropsFormulaTail() {
        assertEquals("영업이익(c)", BoardLabel.key("영업이익(C) = (A)-(B)"));
        assertEquals("영업이익(c)", BoardLabel.key("영업이익(C)＝(A)-(B)"));
        assertEquals("", BoardLabel.key("=A1+B1"));
    }

    @Test
    public void keyOfNullAndBlankIsEmpty() {
        assertEquals("", BoardLabel.key(null));
        assertEquals("", BoardLabel.key(""));
        assertEquals("", BoardLabel.key("   · , . "));
    }

    @Test
    public void spacingAndFormulaVariantsMatchTheSameLabel() {
        assertTrue(BoardLabel.matches(BoardLabel.parse("순현재가치(NPV)"), "순 현재가치(NPV)"));
        assertTrue(BoardLabel.matches(BoardLabel.parse("법인세분지방소득세"), "법인세분 지방소득세"));
        assertTrue(BoardLabel.matches(BoardLabel.parse("영업이익(C)"), "영업이익(C) = (A)-(B)"));
        assertTrue(BoardLabel.matches(BoardLabel.parse("영업이익(C) = (A)-(B)"), "영업이익(C)"));
    }

    @Test
    public void prefixMatchOnlyWithStar() {
        assertFalse(BoardLabel.matches(BoardLabel.parse("수익"), "수익금액 소계"));
        assertTrue(BoardLabel.matches(BoardLabel.parse("수익*"), "수익금액 소계"));
        assertTrue(BoardLabel.matches(BoardLabel.parse("수익*"), "수익"));
    }

    @Test
    public void prefixIsOneDirectionOnly() {
        assertFalse(BoardLabel.matches(BoardLabel.parse("수익금액 소계*"), "수익"));
        assertFalse(BoardLabel.matches(BoardLabel.parse("수익금액 소계"), "수익"));
    }

    @Test
    public void emptyNormalizedNeverMatches() {
        assertFalse(BoardLabel.matches(BoardLabel.parse("수익*"), ""));
        assertFalse(BoardLabel.matches(BoardLabel.parse("수익"), " · "));
        assertFalse(BoardLabel.matches(BoardLabel.parse("수익"), null));
        assertFalse(BoardLabel.matchesKey(BoardLabel.parse("수익"), ""));
    }

    @Test
    public void parseRejectsEmptyAndShortPrefix() {
        for (String bad : new String[] {null, "", " ", " · , ", "*", " * ", "가*", "A *", "=abc"}) {
            try {
                BoardLabel.parse(bad);
                fail("거부되어야 한다: " + bad);
            } catch (IllegalArgumentException expected) {
                // ok
            }
        }
        assertTrue(BoardLabel.parse("가").getKey().length() == 1);   // 접두가 아니면 1자도 허용
        assertTrue(BoardLabel.parse("수익*").isPrefix());
        assertFalse(BoardLabel.parse("수익").isPrefix());
    }

    @Test
    public void aliasesMatchAnyOne() {
        List<BoardLabel.Spec> al = BoardLabel.parseAliases("법인세 및 지방소득세(H)|법인세 및 법인세분지방소득세(H)");
        assertEquals(2, al.size());
        assertTrue(BoardLabel.matchesAny(al, "법인세 및 법인세분 지방소득세(H)"));
        assertTrue(BoardLabel.matchesAny(al, "법인세및지방소득세(H)"));
        assertFalse(BoardLabel.matchesAny(al, "순이익(I)"));
        assertFalse(BoardLabel.matchesAny(al, ""));
    }

    @Test
    public void aliasListRejectsEmptyAlias() {
        try {
            BoardLabel.parseAliases("가나|");
            fail("빈 별칭은 거부");
        } catch (IllegalArgumentException expected) {
            // ok
        }
    }

    @Test
    public void errorMessagesCarryNoLabelText() {
        try {
            BoardLabel.parse("비밀라벨*");
            BoardLabel.parse("가*");
            fail();
        } catch (IllegalArgumentException e) {
            assertFalse(e.getMessage().contains("가"));
        }
    }
}
