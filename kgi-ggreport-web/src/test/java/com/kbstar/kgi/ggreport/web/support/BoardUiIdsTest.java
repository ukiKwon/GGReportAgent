package com.kbstar.kgi.ggreport.web.support;

import org.junit.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** BoardUiIds — 사전준비 4단계 자동 초안(profit_upload)은 prep_detail 짝만(NEXT 121 N2). */
public class BoardUiIdsTest {

    private static BoardUiIds.Ui of(String screen, String button) {
        MockHttpServletRequest r = new MockHttpServletRequest();
        r.addHeader(BoardUiIds.H_SCREEN, screen);
        r.addHeader(BoardUiIds.H_BUTTON, button);
        return BoardUiIds.of(r);
    }

    private static BoardUiIds.Ui of(String screen, String button, String action) {
        MockHttpServletRequest r = new MockHttpServletRequest();
        r.addHeader(BoardUiIds.H_SCREEN, screen);
        r.addHeader(BoardUiIds.H_BUTTON, button);
        return BoardUiIds.of(r, action);
    }

    @Test
    public void 자동_초안은_prep_detail_profit_upload만_유효하다() {
        assertTrue(of("prep_detail", "profit_upload", "CREATE").isValid());
        BoardUiIds.Ui bad = of("board_list", "profit_upload", "CREATE");
        assertEquals("board_list", bad.getScreen());
        assertEquals(BoardUiIds.UNKNOWN, bad.getButton());
        assertFalse(bad.isValid());
    }

    @Test
    public void profit_upload는_목록_만들기_열기_버전_저장_네_행위에서만_유효하다() {
        for (String a : new String[]{"LIST", "CREATE", "VIEW", "SAVE"}) {
            assertTrue(a, of("prep_detail", "profit_upload", a).isValid());
        }
        for (String a : new String[]{"SUBMIT", "WITHDRAW", "REWORK", "RESULT", "MEETING", "DOWNLOAD", "CONFIRM", "SNAPSHOT_VIEW", "HISTORY", "REVIEW", "ACTS", null}) {
            BoardUiIds.Ui u = of("prep_detail", "profit_upload", a);
            assertEquals(a, "prep_detail", u.getScreen());
            assertEquals(a, BoardUiIds.UNKNOWN, u.getButton());
            assertFalse(a, u.isValid());
        }
        assertFalse(of("prep_detail", "profit_upload").isValid());   // 행위를 모르는 경로(승인 확정 후처리 등)
    }

    @Test
    public void script_docx는_SCRIPT_DOCX_행위의_prep_detail_짝만_유효하다() {
        assertTrue(of("prep_detail", "script_docx", "SCRIPT_DOCX").isValid());
        assertFalse(of("board_list", "script_docx", "SCRIPT_DOCX").isValid());
        assertFalse(of("prep_detail", "script_docx", "VIEW").isValid());
        assertFalse(of("prep_detail", "script_docx").isValid());
    }

    @Test
    public void script_ai_draft는_AI_보내기_결과_두_행위의_prep_detail_짝만_유효하다() {
        assertTrue(of("prep_detail", "script_ai_draft", "SCRIPT_AI_SEND").isValid());
        assertTrue(of("prep_detail", "script_ai_draft", "SCRIPT_AI_DRAFT").isValid());
        assertFalse(of("board_list", "script_ai_draft", "SCRIPT_AI_SEND").isValid());
        assertFalse(of("prep_detail", "script_ai_draft", "VIEW").isValid());
        assertFalse(of("prep_detail", "script_ai_draft", "SCRIPT_DOCX").isValid());
        assertFalse(of("prep_detail", "script_ai_draft").isValid());
        assertFalse("다른 버튼은 AI 행위로 유효하지 않다", of("prep_detail", "script_docx", "SCRIPT_AI_SEND").isValid());
        assertEquals(BoardUiIds.UNKNOWN, of("prep_detail", "script_ai_draft", "VIEW").getButton());
    }

    @Test
    public void board_view는_LIST_VIEW_행위의_prep_detail_짝만_유효하다() {
        assertTrue(of("prep_detail", "board_view", "LIST").isValid());
        assertTrue(of("prep_detail", "board_view", "VIEW").isValid());
        for (String a : new String[]{"CREATE", "SAVE", "SUBMIT", "SNAPSHOT_LIST", "SCRIPT_DOCX", "CONFIRM", null}) {
            BoardUiIds.Ui u = of("prep_detail", "board_view", a);
            assertEquals(a, BoardUiIds.UNKNOWN, u.getButton());
            assertFalse(a, u.isValid());
        }
        assertFalse(of("board_list", "board_view", "LIST").isValid());
        assertFalse(of("prep_detail", "board_view").isValid());
    }

    @Test
    public void 기존_짝은_그대로다() {
        assertTrue(of("board_list", "create").isValid());
        assertTrue(of("board_write", "save_version").isValid());
        assertTrue(of("prep_detail", "meeting_save").isValid());
        assertTrue(of("approvals_inbox", "approve", "CONFIRM").isValid());
    }
}
