package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.boarddoc.BoardDocSpec;
import org.junit.Test;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

/** 기본 양식 BoardDocSpec.find(DEFAULT_ID, false)에서 칸 key 가 r1_c2·r2_c2·r4_c2·r1_c8 이라는 가정을 시험한다. 틀리면 이 시험이 먼저 깨진다. */
public class BoardScriptFiguresTest {

    private static BoardDocSpec.Doc doc() {
        return BoardDocSpec.find(BoardDocSpec.DEFAULT_ID, false);
    }

    private static Map<String, Map<String, String>> values(String a1, String a2, String a4, String b) {
        Map<String, Map<String, String>> v = new HashMap<String, Map<String, String>>();
        Map<String, String> a = new HashMap<String, String>();
        if (a1 != null) a.put("r1_c2", a1);
        if (a2 != null) a.put("r2_c2", a2);
        if (a4 != null) a.put("r4_c2", a4);
        v.put("A", a);
        Map<String, String> bb = new HashMap<String, String>();
        if (b != null) bb.put("r1_c8", b);
        v.put("B", bb);
        return v;
    }

    @Test
    public void 표_A_출연금_예비비_합계와_표_B_명목가치_순이익을_라벨로_찾는다() {
        BoardScriptFigures f = BoardScriptFigures.of(doc(), values("5.00", "1,000.50", "9.00", "10.14"));
        assertEquals(new BigDecimal("1005.50"), f.exclIt);
        assertEquals(new BigDecimal("9.00"), f.total);
        assertEquals(new BigDecimal("10.14"), f.profit);
    }

    @Test
    public void 예비비가_비면_합산하지_않는다() {
        BoardScriptFigures f = BoardScriptFigures.of(doc(), values("5.00", null, "9.00", null));
        assertNull(f.exclIt);
        assertEquals(new BigDecimal("9.00"), f.total);
        assertNull(f.profit);
    }

    @Test
    public void 숫자가_아닌_값은_null() {
        BoardScriptFigures f = BoardScriptFigures.of(doc(), values("가", "5.00 (1.00)", "1.234", "-"));
        assertNull(f.exclIt);
        assertNull(f.total);
        assertNull(f.profit);
        assertNull(BoardScriptFigures.num(null));
        assertNull(BoardScriptFigures.num("1,2345"));      // 쉼표는 천 단위 3자리일 때만
        assertEquals(new BigDecimal("1234.5"), BoardScriptFigures.num("1,234.5"));
    }

    @Test
    public void 값_맵이_비어도_죽지_않는다() {
        BoardScriptFigures f = BoardScriptFigures.of(doc(), new HashMap<String, Map<String, String>>());
        assertNull(f.exclIt);
        assertNull(f.total);
        assertNull(f.profit);
        BoardScriptFigures g = BoardScriptFigures.of(null, null);
        assertNull(g.profit);
    }
}
