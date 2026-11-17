package com.kbstar.kgi.ggreport.web.support;

import org.junit.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import static org.junit.Assert.*;

/** 목표 기관 화면·버튼 자기신고 머리글 — 허용 목록 밖은 UNKNOWN. */
public class TargetUiIdsTest {
    private static MockHttpServletRequest req(String screen, String button) {
        MockHttpServletRequest r = new MockHttpServletRequest();
        if (screen != null) r.addHeader("X-Screen-Id", screen);
        if (button != null) r.addHeader("X-Button-Id", button);
        return r;
    }

    @Test public void 허용_화면과_버튼은_valid() {
        BoardUiIds.Ui ui = TargetUiIds.of(req("bid_board", "add_bid_target"), TargetUiIds.ADD);
        assertTrue(ui.isValid());
        assertEquals("add_bid_target", ui.getButton());
        assertTrue(TargetUiIds.of(req("map_popover", "change_target_tag"), TargetUiIds.EDIT).isValid());
    }

    @Test public void 넣기_집합에_edit_버튼은_UNKNOWN() {
        BoardUiIds.Ui ui = TargetUiIds.of(req("bid_board", "edit_bid_target"), TargetUiIds.ADD);
        assertFalse(ui.isValid());
        assertEquals(BoardUiIds.UNKNOWN, ui.getButton());
    }

    @Test public void 화면_없음_또는_모르는_화면() {
        assertEquals(BoardUiIds.UNKNOWN, TargetUiIds.of(req(null, "cancel_bid_target"), TargetUiIds.CANCEL).getScreen());
        assertFalse(TargetUiIds.of(req("evil", "cancel_bid_target"), TargetUiIds.CANCEL).isValid());
    }
}
