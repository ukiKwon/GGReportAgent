package com.kbstar.kgi.ggreport.web.service;

import org.junit.Test;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** NEXT 120 ①·125 S3a — 띠 칸·건 상태 판정(순수 로직). */
public class PrepStage5Test {

    private static Map<String, String> m(String... kv) {
        Map<String, String> r = new HashMap<String, String>();
        for (int i = 0; i < kv.length; i += 2) { r.put(kv[i], kv[i + 1]); }
        return r;
    }

    private static final Map<String, String> EMPTY = Collections.<String, String>emptyMap();

    @Test
    public void 시작_전과_준비_중은_상태로_가른다() {
        assertArrayEquals(new String[]{"BEFORE", null}, PrepStage5.of("CONFIRMED", null, EMPTY));
        assertArrayEquals(new String[]{"BEFORE", null}, PrepStage5.of("OPEN_PENDING", null, EMPTY));
        assertArrayEquals(new String[]{"PREP", null}, PrepStage5.of("IN_PROGRESS", "2026-11-01T00:00:00+00:00", EMPTY));
        assertArrayEquals(new String[]{"PREP", null}, PrepStage5.of("WRITING", "x", EMPTY));
    }

    @Test
    public void 제출_선정_협약_순서로_칸이_올라간다() {
        assertArrayEquals(new String[]{"SUBMITTED", null}, PrepStage5.of("IN_PROGRESS", "x", m("PROPOSAL_SUBMIT", "DONE")));
        assertArrayEquals(new String[]{"CONTRACT_PLANNED", null}, PrepStage5.of("IN_PROGRESS", "x", m("PROPOSAL_SUBMIT", "DONE", "RESULT", "WON")));
        assertArrayEquals(new String[]{"CONTRACT_DONE", null}, PrepStage5.of("IN_PROGRESS", "x", m("RESULT", "WON", "CEREMONY", "DONE")));
    }

    @Test
    public void 협약_완료는_협약식_완료_또는_협약식_대상_아님과_협약서_완료다() {
        assertTrue(PrepStage5.contractDone("DONE", null));
        assertTrue(PrepStage5.contractDone("NA", "DONE"));
        assertFalse(PrepStage5.contractDone("NONE", "DONE"));   // 협약서만 끝난 것은 협약 예정
        assertFalse(PrepStage5.contractDone("NA", "IN_PROGRESS"));
        assertArrayEquals(new String[]{"CONTRACT_PLANNED", null}, PrepStage5.of("IN_PROGRESS", "x", m("RESULT", "WON", "CEREMONY", "NONE", "AGREE_LEGAL", "DONE")));
        assertArrayEquals(new String[]{"CONTRACT_DONE", null}, PrepStage5.of("IN_PROGRESS", "x", m("RESULT", "WON", "CEREMONY", "NA", "AGREE_LEGAL", "DONE")));
    }

    @Test
    public void 탈락은_중단보다_먼저고_중단은_시작_뒤와_시작_전으로_나뉜다() {
        assertArrayEquals(new String[]{"ENDED", "DROP"}, PrepStage5.of("IN_PROGRESS", "x", m("RESULT", "LOST")));
        assertArrayEquals(new String[]{"ENDED", "DROP"}, PrepStage5.of("CANCELLED", "x", m("RESULT", "LOST")));   // 탈락 뒤 중단해도 탈락
        assertArrayEquals(new String[]{"ENDED", "STOP"}, PrepStage5.of("CANCELLED", "2026-11-01T00:00:00+00:00", EMPTY));
        assertArrayEquals(new String[]{"ENDED", "UNCONFIRMED"}, PrepStage5.of("CANCELLED", null, EMPTY));
    }

    @Test
    public void 건_상태_열쇠() {
        assertEquals("ACTIVE", PrepStage5.status("IN_PROGRESS", "x", EMPTY));
        assertEquals("DROPPED", PrepStage5.status("IN_PROGRESS", "x", m("RESULT", "LOST")));
        assertEquals("CONTRACTED", PrepStage5.status("IN_PROGRESS", "x", m("CEREMONY", "DONE")));
        assertEquals("STOPPED", PrepStage5.status("CANCELLED", "x", EMPTY));
        assertEquals("UNCONFIRMED", PrepStage5.status("CANCELLED", null, EMPTY));
        assertEquals("NONE", PrepStage5.status(null, null, EMPTY));
        assertEquals("DROPPED", PrepStage5.status("CANCELLED", "x", m("RESULT", "LOST")));
        assertEquals("CONTRACTED", PrepStage5.status("CANCELLED", "x", m("CEREMONY", "DONE")));
    }

    @Test
    public void 옛_결과발표_완료_진행은_선정_탈락으로_추정하지_않는다() {
        assertEquals("UNDECIDED", PrepStage5.resultCd("DONE"));
        assertEquals("UNDECIDED", PrepStage5.resultCd("IN_PROGRESS"));
        assertEquals("WON", PrepStage5.resultCd("WON"));
        assertEquals("LOST", PrepStage5.resultCd("LOST"));
        assertNull(PrepStage5.resultCd("NA"));
        assertNull(PrepStage5.resultCd("NONE"));
        assertNull(PrepStage5.resultCd(null));
        assertArrayEquals(new String[]{"PREP", null}, PrepStage5.of("IN_PROGRESS", "x", m("RESULT", "DONE")));   // 단계 판정에서는 무시
        assertEquals("ACTIVE", PrepStage5.status("IN_PROGRESS", "x", m("RESULT", "DONE")));
    }

    @Test
    public void 진행_중은_상태_6종이면서_탈락_협약_완료가_아닌_건() {
        for (String s : new String[]{"CONFIRMED", "OPEN_PENDING", "IN_PROGRESS", "APPROVAL_PENDING", "WRITABLE", "WRITING"}) {
            assertTrue(s, PrepStage5.blocking(s, EMPTY));
            assertFalse(s, PrepStage5.blocking(s, m("RESULT", "LOST")));
            assertFalse(s, PrepStage5.blocking(s, m("CEREMONY", "DONE")));
        }
        assertFalse(PrepStage5.blocking("CANCELLED", EMPTY));
        assertTrue(PrepStage5.blocking("IN_PROGRESS", m("RESULT", "WON")));   // 선정만으로는 끝나지 않는다
    }
}
