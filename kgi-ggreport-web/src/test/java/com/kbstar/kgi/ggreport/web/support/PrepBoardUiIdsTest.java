package com.kbstar.kgi.ggreport.web.support;

import org.junit.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** PrepBoardUiIds.forCheck — 현황판 칸 체크와 상세 2단계 [다음] 확인(NEXT 121 N1). 값은 클라이언트 자기신고다. */
public class PrepBoardUiIdsTest {

    private static MockHttpServletRequest req(String screen, String button) {
        MockHttpServletRequest r = new MockHttpServletRequest();
        if (screen != null) { r.addHeader(BoardUiIds.H_SCREEN, screen); }
        if (button != null) { r.addHeader(BoardUiIds.H_BUTTON, button); }
        return r;
    }

    @Test
    public void 현황판_칸_체크는_그대로_유효하다() {
        assertTrue(PrepBoardUiIds.forCheck(req("prep_dashboard", "dash_check"), "FIN_COMMITTEE").isValid());
        assertTrue(PrepBoardUiIds.forCheck(req("prep_dashboard", "dash_check"), "NOTICE_CHECK").isValid());
    }

    @Test
    public void 상세_다음_확인은_입찰공고확인_칸에서만_유효하다() {
        BoardUiIds.Ui ok = PrepBoardUiIds.forCheck(req("prep_detail", "notice_confirm"), "NOTICE_CHECK");
        assertEquals("prep_detail", ok.getScreen());
        assertEquals("notice_confirm", ok.getButton());
        assertTrue(ok.isValid());
        BoardUiIds.Ui otherCol = PrepBoardUiIds.forCheck(req("prep_detail", "notice_confirm"), "FIN_COMMITTEE");
        assertEquals(BoardUiIds.UNKNOWN, otherCol.getScreen());
        assertEquals(BoardUiIds.UNKNOWN, otherCol.getButton());
        assertFalse(otherCol.isValid());
        BoardUiIds.Ui mixed = PrepBoardUiIds.forCheck(req("prep_dashboard", "notice_confirm"), "NOTICE_CHECK");
        assertEquals("prep_dashboard", mixed.getScreen());
        assertEquals(BoardUiIds.UNKNOWN, mixed.getButton());
        assertFalse(mixed.isValid());
    }

    @Test
    public void 칸_체크는_현황판_짝과_상세_다음_확인_밖의_짝을_유효로_치지_않는다() {
        String[][] others = {{"approvals_inbox", "approve"}, {"prep_detail", "scoring_read"}, {"prep_detail", "refresh"},
                {"prep_detail", "profit_upload"}, {null, null}};
        for (String[] p : others) {
            BoardUiIds.Ui u = PrepBoardUiIds.forCheck(req(p[0], p[1]), "NOTICE_CHECK");
            assertFalse(p[0] + "/" + p[1], u.isValid());
            assertEquals(p[0] + "/" + p[1], BoardUiIds.UNKNOWN, u.getScreen());   // 화면은 prep_dashboard 가 아니면 원문을 남기지 않는다
        }
        assertFalse(PrepBoardUiIds.forCheck(req("prep_list", "dash_check"), "NOTICE_CHECK").isValid());   // 화면이 다르면 무효
    }

    @Test
    public void 목록용_of는_상세_이름을_받지_않는다() {
        BoardUiIds.Ui u = PrepBoardUiIds.of(req("prep_detail", "notice_confirm"));
        assertEquals(BoardUiIds.UNKNOWN, u.getScreen());
        assertEquals(BoardUiIds.UNKNOWN, u.getButton());
        assertFalse(u.isValid());
    }
}
