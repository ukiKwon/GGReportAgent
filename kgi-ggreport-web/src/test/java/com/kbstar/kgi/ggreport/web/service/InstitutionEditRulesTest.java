package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.Institution;
import com.kbstar.kgi.ggreport.web.domain.InstitutionImportRow;
import com.kbstar.kgi.ggreport.web.domain.InstitutionUpdateIn;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.junit.Test;

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** 입력 검사·확정 규칙(순수 단위). 오류는 400 {@link ApiException} 고정 문구. */
public class InstitutionEditRulesTest {

    private static final InstitutionEditRules.CodeCheck CODES =
            (g, c) -> "INST_OP_STATUS".equals(g) && ("OPERATING".equals(c) || "PLANNED".equals(c));

    private static void rejects(Runnable r) {
        try {
            r.run();
            fail("400 이어야 한다");
        } catch (ApiException e) {
            assertEquals(400, e.getStatus());
        }
    }

    private static Institution inst() {
        return new Institution();
    }

    private static Institution confirmed() {
        Institution i = inst();
        i.setContractEnd("2027-03-01");
        i.setContractEndConfirmed(true);
        i.setContractEndSrcNo("제2026-1393호");
        return i;
    }

    // ---- url / notice / 날짜

    @Test
    public void 링크_거부와_통과() {
        for (String bad : new String[]{"javascript:alert(1)", "ftp://x.kr/a", "https://u:p@x.kr/", "https://x.kr/a b",
                "//x.kr", "http://x.kr/‮", "http://x.kr/​", "http://x.kr/\"", "http://x.kr/<a>"}) {
            final String v = bad;
            rejects(() -> InstitutionEditRules.url(v));
        }
        StringBuilder long501 = new StringBuilder("https://x.kr/");
        while (long501.length() < 501) {
            long501.append('a');
        }
        rejects(() -> InstitutionEditRules.url(long501.toString()));
        String ok = "https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo=R26BK01656425&bidPbancOrd=000";
        assertEquals(ok, InstitutionEditRules.url(ok));
        assertNull(InstitutionEditRules.url("  "));
        assertNull(InstitutionEditRules.url(null));
    }

    @Test
    public void 공고_번호() {
        assertEquals("제2026-1393호", InstitutionEditRules.notice("제2026-1393호"));
        assertEquals("R26BK01656425", InstitutionEditRules.notice("R26BK01656425"));
        rejects(() -> InstitutionEditRules.notice("a;b"));
        StringBuilder s51 = new StringBuilder();
        for (int i = 0; i < 51; i++) {
            s51.append('a');
        }
        rejects(() -> InstitutionEditRules.notice(s51.toString()));
    }

    @Test
    public void 개원일_형식() {
        for (String ok : new String[]{"2028", "2028-03", "2028-03-01"}) {
            assertEquals(ok, InstitutionEditRules.openDate(ok));
        }
        for (String bad : new String[]{"2028-13", "2028-02-30", "1999", "2028-3", "abc"}) {
            final String v = bad;
            rejects(() -> InstitutionEditRules.openDate(v));
        }
    }

    // ---- resolve: 입찰 예정일·확정

    private static InstitutionUpdateIn upd(String date, Boolean conf, String url, String no) {
        InstitutionUpdateIn u = new InstitutionUpdateIn();
        if (date != null) {
            u.setContractEnd("null".equals(date) ? null : date);
        }
        if (conf != null) {
            u.setContractEndConfirmed(conf);
        }
        if (url != null) {
            u.setContractEndSrcUrl(url);
        }
        if (no != null) {
            u.setContractEndSrcNo(no);
        }
        return u;
    }

    @Test
    public void 날짜를_바꾸면서_확정_여부를_안_보내면_400() {
        rejects(() -> InstitutionEditRules.resolve(inst(), upd("2027-03-01", null, null, null), CODES));
        rejects(() -> InstitutionEditRules.resolve(confirmed(), upd("2027-04-01", null, null, null), CODES));
    }

    @Test
    public void 추정으로_저장하면_출처가_비고_이력은_날짜_한_칸() {
        InstitutionUpdateIn u = upd("2027-03-01", false, null, null);
        List<InstitutionEditRules.Change> ch = InstitutionEditRules.resolve(inst(), u, CODES);
        assertEquals(1, ch.size());
        assertEquals("CONTRACT_END", ch.get(0).field);
        assertFalse(u.getContractEndConfirmed());
        assertNull(u.getContractEndSrcUrl());
    }

    @Test
    public void 확정은_출처가_필요하고_있으면_이력_두_칸() {
        rejects(() -> InstitutionEditRules.resolve(inst(), upd("2027-03-01", true, null, null), CODES));
        InstitutionUpdateIn u = upd("2027-03-01", true, "https://x.kr/a", null);
        List<InstitutionEditRules.Change> ch = InstitutionEditRules.resolve(inst(), u, CODES);
        assertEquals(2, ch.size());
        assertEquals("CONTRACT_END_CONFIRMED", ch.get(1).field);
        assertEquals("Y", ch.get(1).newVal);
        assertEquals("https://x.kr/a", ch.get(1).srcUrl);
    }

    @Test
    public void 날짜가_바뀌면_옛_출처를_이어_쓰지_않는다() {
        rejects(() -> InstitutionEditRules.resolve(confirmed(), upd("2027-04-01", true, null, null), CODES));
        InstitutionUpdateIn u = upd("2027-04-01", false, null, null);
        InstitutionEditRules.resolve(confirmed(), u, CODES);
        assertNull(u.getContractEndSrcNo());
    }

    @Test
    public void 같은_날짜의_확정이_이어지면_옛_출처를_쓴다_바뀐_것이_없으면_이력_없음() {
        InstitutionUpdateIn u = upd("2027-03-01", true, null, null);
        List<InstitutionEditRules.Change> ch = InstitutionEditRules.resolve(confirmed(), u, CODES);
        assertTrue(ch.isEmpty());
        // 출처 없는 옛 확정 행을 그대로 보내도 거부하지 않는다
        Institution legacy = inst();
        legacy.setContractEnd("2027-03-01");
        legacy.setContractEndConfirmed(true);
        assertTrue(InstitutionEditRules.resolve(legacy, upd("2027-03-01", true, null, null), CODES).isEmpty());
    }

    @Test
    public void 날짜가_없으면_확정_불가_비우면_추정() {
        rejects(() -> InstitutionEditRules.resolve(inst(), upd(null, true, null, null), CODES));
        rejects(() -> InstitutionEditRules.resolve(confirmed(), upd("null", true, null, null), CODES));
        InstitutionUpdateIn u = upd("null", null, null, null);
        List<InstitutionEditRules.Change> ch = InstitutionEditRules.resolve(confirmed(), u, CODES);
        assertEquals(2, ch.size());
        assertFalse(u.getContractEndConfirmed());
    }

    @Test
    public void 없는_날짜_형식_불량은_400() {
        rejects(() -> InstitutionEditRules.resolve(inst(), upd("2027-02-30", false, null, null), CODES));
        rejects(() -> InstitutionEditRules.resolve(inst(), upd("2027/03/01", false, null, null), CODES));
    }

    // ---- resolve: 운영 상태

    private static InstitutionUpdateIn op(String st, String od, String url, String no) {
        InstitutionUpdateIn u = new InstitutionUpdateIn();
        if (st != null) {
            u.setOpStatus(st);
        }
        if (od != null) {
            u.setOpenDate(od);
        }
        if (url != null) {
            u.setOpSrcUrl(url);
        }
        if (no != null) {
            u.setOpSrcNo(no);
        }
        return u;
    }

    @Test
    public void 개원_예정은_개원일과_출처가_필요() {
        rejects(() -> InstitutionEditRules.resolve(inst(), op("PLANNED", null, null, "제1호"), CODES));
        rejects(() -> InstitutionEditRules.resolve(inst(), op("PLANNED", "2031", null, null), CODES));
        List<InstitutionEditRules.Change> ch = InstitutionEditRules.resolve(inst(), op("PLANNED", "2031", null, "제1호"), CODES);
        assertEquals(2, ch.size());
        assertEquals("OP_STATUS", ch.get(0).field);
        assertEquals("OPEN_DATE", ch.get(1).field);
    }

    @Test
    public void 모르는_상태는_400() {
        rejects(() -> InstitutionEditRules.resolve(inst(), op("FOO", null, null, "제1호"), CODES));
        rejects(() -> InstitutionEditRules.resolve(inst(), op("", null, null, "제1호"), CODES));
    }

    @Test
    public void L1_상태를_안_바꾸는_저장이_출처를_모두_비우면_400() {
        Institution planned = inst();
        planned.setOpStatus("PLANNED");
        planned.setOpenDate("2031");
        planned.setOpSrcNo("제1호");
        rejects(() -> InstitutionEditRules.resolve(planned, op(null, null, "", ""), CODES));
        InstitutionUpdateIn u = op(null, "2032", null, null);
        List<InstitutionEditRules.Change> ch = InstitutionEditRules.resolve(planned, u, CODES);
        assertEquals(1, ch.size());
        assertEquals("제1호", u.getOpSrcNo());
    }

    // ---- 반입 이력 diff (B3)

    @Test
    public void 반입_diff_바뀐_칸만_확정은_강등으로() {
        InstitutionImportRow row = new InstitutionImportRow();
        row.setContractEnd("2027-09-09");
        row.setTerm(3);
        Institution cur = confirmed();
        cur.setTerm(3);
        List<InstitutionEditRules.Change> ch = InstitutionEditRules.diffImport(cur, row);
        assertEquals(2, ch.size());
        assertEquals("CONTRACT_END", ch.get(0).field);
        assertEquals("CONTRACT_END_CONFIRMED", ch.get(1).field);
        assertEquals("N", ch.get(1).newVal);
        row.setContractEnd("2027-03-01");
        assertTrue(InstitutionEditRules.diffImport(cur, row).isEmpty());
        assertTrue(InstitutionEditRules.diffImport(cur, new InstitutionImportRow()).isEmpty());
    }

    // ---- importDateChanged (qa §4) · P3-1 · P3-3 (2026-11-15)

    private static InstitutionImportRow rowEnd(String end) {
        InstitutionImportRow r = new InstitutionImportRow();
        r.setContractEnd(end);
        return r;
    }

    private static Institution instEnd(String end) {
        Institution i = inst();
        i.setContractEnd(end);
        return i;
    }

    @Test
    public void importDateChanged_다섯_경우() {
        assertTrue(InstitutionEditRules.importDateChanged(instEnd(null), rowEnd("2026-10-29")));        // 처음 채움
        assertFalse(InstitutionEditRules.importDateChanged(instEnd("2026-10-29"), rowEnd("2026-10-29"))); // 같은 날짜
        assertFalse(InstitutionEditRules.importDateChanged(instEnd("2026-10-29"), rowEnd(null)));         // 안 보냄
        assertFalse(InstitutionEditRules.importDateChanged(instEnd("2026-10-29"), rowEnd("")));           // 빈 문자열 = 안 보냄
        assertTrue(InstitutionEditRules.importDateChanged(null, rowEnd("2026-10-29")));                   // cur 없음
    }

    @Test
    public void diffImport는_빈_문자열_날짜를_안_보낸_것으로_본다() {
        assertTrue(InstitutionEditRules.diffImport(confirmed(), rowEnd("")).isEmpty());
    }

    @Test
    public void 같은_날짜의_공백_포함_입력은_trim해서_upd에_반영하고_이력은_없다() {
        InstitutionUpdateIn u = new InstitutionUpdateIn();
        u.setContractEnd(" 2027-03-01 ");
        List<InstitutionEditRules.Change> ch = InstitutionEditRules.resolve(confirmed(), u, CODES);
        assertTrue(ch.isEmpty());
        assertEquals("2027-03-01", u.getContractEnd());
    }
}
