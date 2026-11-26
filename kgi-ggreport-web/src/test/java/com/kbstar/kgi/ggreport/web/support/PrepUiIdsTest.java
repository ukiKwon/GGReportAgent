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

    private static BoardUiIds.Ui confirmOf(String screen, String button) {
        MockHttpServletRequest req = new MockHttpServletRequest();
        if (screen != null) { req.addHeader(BoardUiIds.H_SCREEN, screen); }
        if (button != null) { req.addHeader(BoardUiIds.H_BUTTON, button); }
        return PrepUiIds.forConfirm(req);
    }

    @Test
    public void 제안_확정은_입찰_현황판의_confirm만_유효하다() {
        assertTrue(confirmOf("bid_board", "confirm").isValid());
        for (String s : new String[]{"map_popover", "bid_notice", "prep_detail", null}) {
            BoardUiIds.Ui u = confirmOf(s, "confirm");
            assertEquals(BoardUiIds.UNKNOWN, u.getScreen());
            assertEquals("confirm", u.getButton());
            assertFalse(u.isValid());
        }
        BoardUiIds.Ui b = confirmOf("bid_board", "open_prep");
        assertEquals("bid_board", b.getScreen());
        assertEquals(BoardUiIds.UNKNOWN, b.getButton());
        assertFalse(b.isValid());
    }

    private static BoardUiIds.Ui scoringOf(String screen, String button) {
        MockHttpServletRequest req = new MockHttpServletRequest();
        if (screen != null) { req.addHeader(BoardUiIds.H_SCREEN, screen); }
        if (button != null) { req.addHeader(BoardUiIds.H_BUTTON, button); }
        return PrepUiIds.forScoring(req);
    }

    @Test
    public void 평가표_읽기는_prep_detail_scoring_read만_새_이름으로_유효하고_옛_refresh도_받는다() {
        BoardUiIds.Ui ok = scoringOf("prep_detail", "scoring_read");
        assertEquals("scoring_read", ok.getButton());
        assertTrue(ok.isValid());
        assertTrue(scoringOf("prep_detail", "refresh").isValid());            // 열려 있는 옛 화면
        BoardUiIds.Ui other = scoringOf("prep_list", "scoring_read");
        assertEquals("prep_list", other.getScreen());   // 허용 목록 화면 이름은 남지만 짝이 아니라 무효(PrepAttachApiTest 와 같다)
        assertEquals(BoardUiIds.UNKNOWN, other.getButton());
        assertFalse(other.isValid());
        assertEquals(BoardUiIds.UNKNOWN, of("prep_detail", "scoring_read").getButton());   // 일반 of 에는 없다
    }

    @Test
    public void 평가표_읽기는_두_짝_밖의_짝을_일반_목록으로_넘기지_않는다() {
        String[][] others = {{"approvals_inbox", "approve"}, {"prep_list", "refresh"}, {"prep_detail", "approve"},
                {"prep_detail", "attach_upload"}, {"bid_board", "confirm"}, {null, null}};
        for (String[] p : others) {
            BoardUiIds.Ui u = scoringOf(p[0], p[1]);
            assertEquals(p[0] + "/" + p[1], BoardUiIds.UNKNOWN, u.getButton());   // 버튼 이름은 남기지 않는다
            assertFalse(p[0] + "/" + p[1], u.isValid());
        }
    }

    private static BoardUiIds.Ui scriptOf(String screen, String button) {
        MockHttpServletRequest req = new MockHttpServletRequest();
        if (screen != null) { req.addHeader(BoardUiIds.H_SCREEN, screen); }
        if (button != null) { req.addHeader(BoardUiIds.H_BUTTON, button); }
        return PrepUiIds.forScript(req);
    }

    @Test
    public void 발표_대본은_prep_detail_script_docx만_유효하고_일반_목록에는_없다() {
        BoardUiIds.Ui ok = scriptOf("prep_detail", "script_docx");
        assertEquals("prep_detail", ok.getScreen());
        assertEquals("script_docx", ok.getButton());
        assertTrue(ok.isValid());
        BoardUiIds.Ui otherScreen = scriptOf("prep_list", "script_docx");
        assertEquals(BoardUiIds.UNKNOWN, otherScreen.getScreen());
        assertFalse(otherScreen.isValid());
        BoardUiIds.Ui otherButton = scriptOf("prep_detail", "attach_upload");
        assertEquals(BoardUiIds.UNKNOWN, otherButton.getButton());
        assertFalse(otherButton.isValid());
        BoardUiIds.Ui general = of("prep_detail", "script_docx");   // 일반 of — 첨부 올리기 같은 다른 사전준비 주소
        assertEquals(BoardUiIds.UNKNOWN, general.getButton());
        assertFalse(general.isValid());
    }

    @Test
    public void 입찰_없음_알림의_계속_작성은_prep_detail_nobid_continue로_받아들여진다() {
        BoardUiIds.Ui ui = of("prep_detail", "nobid_continue");
        assertEquals("prep_detail", ui.getScreen());
        assertEquals("nobid_continue", ui.getButton());
        assertTrue(ui.isValid());
    }
}
