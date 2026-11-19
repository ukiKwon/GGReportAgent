package com.kbstar.kgi.ggreport.web.support;

import org.junit.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** PrepUiIds 허용 목록 — 입찰 현황판(bid_board) [제안 확정] 이 UNKNOWN 으로 바뀌지 않는지. 값은 클라이언트 자기신고다. */
public class PrepUiIdsTest {

    private static BoardUiIds.Ui of(String screen, String button) {
        MockHttpServletRequest req = new MockHttpServletRequest();
        if (screen != null) { req.addHeader(BoardUiIds.H_SCREEN, screen); }
        if (button != null) { req.addHeader(BoardUiIds.H_BUTTON, button); }
        return PrepUiIds.of(req);
    }

    @Test
    public void 입찰_현황판_제안_확정은_UNKNOWN_없이_그대로_받아들여진다() {
        BoardUiIds.Ui ui = of("bid_board", "confirm");
        assertEquals("bid_board", ui.getScreen());
        assertEquals("confirm", ui.getButton());
        assertTrue(ui.isValid());
    }

    @Test
    public void 입찰_공고_현황의_제안_확정은_bid_notice_confirm으로_UNKNOWN_없이_받아들여진다() {
        BoardUiIds.Ui ui = of("bid_notice", "confirm");
        assertEquals("bid_notice", ui.getScreen());
        assertEquals("confirm", ui.getButton());
        assertTrue(ui.isValid());
    }

    @Test
    public void 앞뒤_공백은_잘라_받아들인다() {
        BoardUiIds.Ui ui = of(" bid_board ", " confirm ");
        assertEquals("bid_board", ui.getScreen());
        assertTrue(ui.isValid());
    }

    @Test
    public void 기존_화면은_그대로_받아들여진다() {
        BoardUiIds.Ui ui = of("map_popover", "confirm");
        assertEquals("map_popover", ui.getScreen());
        assertTrue(ui.isValid());
    }

    @Test
    public void 허용_밖_화면이나_버튼은_원문_없이_UNKNOWN이고_ui_valid는_false다() {
        BoardUiIds.Ui s = of("evil\nscreen", "confirm");
        assertEquals(BoardUiIds.UNKNOWN, s.getScreen());
        assertEquals("confirm", s.getButton());
        assertFalse(s.isValid());
        BoardUiIds.Ui b = of("bid_board", "drop_table");
        assertEquals("bid_board", b.getScreen());
        assertEquals(BoardUiIds.UNKNOWN, b.getButton());
        assertFalse(b.isValid());
    }

    @Test
    public void 머리글이_없으면_둘_다_UNKNOWN이다() {
        BoardUiIds.Ui ui = of(null, null);
        assertEquals(BoardUiIds.UNKNOWN, ui.getScreen());
        assertEquals(BoardUiIds.UNKNOWN, ui.getButton());
        assertFalse(ui.isValid());
    }

    @Test
    public void 입찰_없음_알림의_계속_작성은_prep_detail_nobid_continue로_받아들여진다() {
        BoardUiIds.Ui ui = of("prep_detail", "nobid_continue");
        assertEquals("prep_detail", ui.getScreen());
        assertEquals("nobid_continue", ui.getButton());
        assertTrue(ui.isValid());
    }
}
