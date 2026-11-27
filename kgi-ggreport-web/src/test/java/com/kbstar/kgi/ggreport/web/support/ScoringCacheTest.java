package com.kbstar.kgi.ggreport.web.support;

import org.junit.Test;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import static org.junit.Assert.*;

/** ScoringCache — 항목 수·글자 수 예산(NEXT 121 하-2). */
public class ScoringCacheTest {

    private static ScoringTable.Result res(int cells, int chars) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < chars; i++) { sb.append('가'); }
        List<String> row = new ArrayList<String>();
        for (int i = 0; i < cells; i++) { row.add(sb.toString()); }
        return new ScoringTable.Result("TABLE", Collections.singletonList(row), null, 0);
    }

    @Test
    public void 무게는_글자_수에_문자열마다_24를_더한다() {
        assertEquals(99, ScoringCache.weigh(res(3, 9)));   // 3 × (24 + 9)
        assertEquals(0, ScoringCache.weigh(null));
    }

    @Test
    public void 예산을_넘으면_오래_안_쓴_것부터_버린다() {
        ScoringCache c = new ScoringCache(100, 800);           // 한 건 상한 100
        c.put("a", res(1, 66));                                  // 무게 24 + 66 = 90
        c.put("b", res(1, 66));
        assertNotNull(c.get("a"));                               // a 를 최근으로
        for (int i = 0; i < 7; i++) { c.put("k" + i, res(1, 66)); }   // 9건 = 810 > 800
        assertNull(c.get("b"));
        assertNotNull(c.get("a"));
        assertTrue(c.totalChars() <= 800);
    }

    @Test
    public void 한_건이_예산의_8분의_1을_넘으면_기억하지_않는다() {
        ScoringCache c = new ScoringCache(100, 800);
        assertTrue(c.put("edge", res(1, 76)));                  // 24 + 76 = 100 — 경계는 기억한다
        assertFalse(c.put("big", res(1, 77)));                  // 24 + 77 = 101 > 100
        c.put("edge", null);                                     // edge 를 비워 총 무게 0 으로
        assertNull(c.get("big"));
        assertEquals(0, c.totalChars());
    }

    @Test
    public void 항목_수_상한과_표_없음_기억() {
        ScoringCache c = new ScoringCache(2, 8000);
        assertTrue(c.put("x", null));
        c.put("y", null);
        c.put("z", null);
        assertEquals(2, c.size());
        assertNull(c.get("x"));
        assertNotNull(c.get("z"));
        assertNull(c.get("z").getResult());
    }

    @Test
    public void 같은_키를_다시_넣으면_무게를_다시_센다() {
        ScoringCache c = new ScoringCache(10, 800);
        c.put("a", res(1, 49));   // 73
        c.put("a", res(1, 9));    // 33
        assertEquals(33, c.totalChars());
        assertEquals(1, c.size());
    }
}
