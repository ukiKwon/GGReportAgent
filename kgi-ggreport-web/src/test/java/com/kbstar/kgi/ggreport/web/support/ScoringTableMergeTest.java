package com.kbstar.kgi.ggreport.web.support;

import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** 선정 평가표 HWPX 병합 복원(NEXT 113 ④) — 세로·가로 병합과 묶음 배점이 r·c·rs·cs 로 남는다. 기존 rows·total 은 그대로. */
public class ScoringTableMergeTest {

    private static final String HEAD = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><hs:sec xmlns:hs=\"http://www.hancom.co.kr/hwpml/2011/section\" xmlns:hp=\"http://www.hancom.co.kr/hwpml/2011/paragraph\"><hp:p><hp:run>";
    private static final String TAIL = "</hp:run></hp:p></hs:sec>";

    /** 주소·병합 속성이 있는 칸. col/row 가 음수면 cellAddr 를, span 이 0 이하면 cellSpan 을 쓰지 않는다. */
    private static String tc(String text, int col, int row, int cs, int rs) {
        return "<hp:tc><hp:subList><hp:p><hp:run><hp:t>" + text + "</hp:t></hp:run></hp:p></hp:subList>"
                + (col >= 0 ? "<hp:cellAddr colAddr=\"" + col + "\" rowAddr=\"" + row + "\"/>" : "")
                + (cs > 0 ? "<hp:cellSpan colSpan=\"" + cs + "\" rowSpan=\"" + rs + "\"/>" : "")
                + "</hp:tc>";
    }

    private static String tr(String... tcs) {
        StringBuilder b = new StringBuilder("<hp:tr>");
        for (String t : tcs) {
            b.append(t);
        }
        return b.append("</hp:tr>").toString();
    }

    private static byte[] hwpx(String sectionXml) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        try (ZipOutputStream z = new ZipOutputStream(bo)) {
            z.putNextEntry(new ZipEntry("Contents/section0.xml"));
            z.write(sectionXml.getBytes(StandardCharsets.UTF_8));
            z.closeEntry();
        }
        return bo.toByteArray();
    }

    /** 부문 rowspan, 배점 하나가 세부 3줄을 묶음, '평가 방법' 열 rowspan, 합계 100(계 칸은 가로 병합). */
    private static String mergedTable() {
        return "<hp:tbl>"
                + tr(tc("부문", 0, 0, 1, 1), tc("세부 항목", 1, 0, 1, 1), tc("배 점", 2, 0, 1, 1), tc("평가 방법", 3, 0, 1, 1))
                + tr(tc("1. 신용도", 0, 1, 1, 3), tc("가. 신용평가", 1, 1, 1, 1), tc("10", 2, 1, 1, 3), tc("계량", 3, 1, 1, 3))
                + tr(tc("나. 재무구조", 1, 2, 1, 1))
                + tr(tc("다. 부채비율", 1, 3, 1, 1))
                + tr(tc("계", 0, 4, 2, 1), tc("100", 2, 4, 1, 1), tc("", 3, 4, 1, 1))
                + "</hp:tbl>";
    }

    private static ScoringTable.Cell at(ScoringTable.Result r, int row, int col) {
        for (ScoringTable.Cell c : r.getCells()) {
            if (c.getR() == row && c.getC() == col) {
                return c;
            }
        }
        return null;
    }

    @Test
    public void 병합_표의_위치와_병합_수를_복원하고_기존_필드는_그대로다() throws Exception {
        ScoringTable.Result r = ScoringTable.extract("hwpx", hwpx(HEAD + mergedTable() + TAIL));
        assertNotNull(r);
        assertEquals("TABLE", r.getKind());
        assertEquals(Integer.valueOf(100), r.getTotal());
        assertEquals(0, r.getPage());
        // 기존 모양: 행마다 실제로 있는 칸만(병합으로 빠진 칸은 비어 있지 않고 그냥 없다)
        assertEquals(5, r.getRows().size());
        assertEquals(4, r.getRows().get(0).size());
        assertEquals(4, r.getRows().get(1).size());
        assertEquals(1, r.getRows().get(2).size());
        assertEquals("배 점", r.getRows().get(0).get(2));
        // 새 필드
        assertEquals(5, r.getRowCount());
        assertEquals(4, r.getColCount());
        assertEquals(1, r.getCandidateCount());
        assertEquals(0, r.getTableIndex());
        assertFalse(r.isOutOfRange());
        ScoringTable.Cell dept = at(r, 1, 0);
        assertEquals("1. 신용도", dept.getText());
        assertEquals(3, dept.getRs());
        assertEquals(1, dept.getCs());
        ScoringTable.Cell pts = at(r, 1, 2);
        assertEquals("10", pts.getText());
        assertEquals(3, pts.getRs());   // 배점 하나가 세부 3줄을 묶는다
        assertEquals(3, at(r, 1, 3).getRs());   // 평가 방법 열 세로 병합
        assertEquals("나. 재무구조", at(r, 2, 1).getText());   // 병합 아래 줄은 칸 수가 줄어도 열 위치가 남는다
        assertNull(at(r, 2, 0));
        ScoringTable.Cell sum = at(r, 4, 0);
        assertEquals("계", sum.getText());
        assertEquals(2, sum.getCs());
        assertEquals(1, sum.getRs());
        assertEquals("100", at(r, 4, 2).getText());
        assertEquals(13, r.getCells().size());
    }

    @Test
    public void 병합_속성이_없는_파일은_span_1과_순서대로의_위치() throws Exception {
        String t = "<hp:tbl>" + tr(tc("항목", -1, 0, 0, 0), tc("배점", -1, 0, 0, 0))
                + tr(tc("가", -1, 0, 0, 0), tc("10", -1, 0, 0, 0)) + tr(tc("계", -1, 0, 0, 0), tc("10", -1, 0, 0, 0)) + "</hp:tbl>";
        ScoringTable.Result r = ScoringTable.extract("hwpx", hwpx(HEAD + t + TAIL));
        assertNotNull(r);
        assertEquals(6, r.getCells().size());
        assertEquals(3, r.getRowCount());
        assertEquals(2, r.getColCount());
        ScoringTable.Cell c = at(r, 1, 1);
        assertEquals("10", c.getText());
        assertEquals(1, c.getRs());
        assertEquals(1, c.getCs());
        assertEquals(Integer.valueOf(10), r.getTotal());
    }

    @Test
    public void 후보_표가_둘이면_첫_표가_기본이고_후보_수와_머리가_돌아온다() throws Exception {
        String second = "<hp:tbl>" + tr(tc("구분", 0, 0, 1, 1), tc("배점(점)", 1, 0, 1, 1))
                + tr(tc("가격", 0, 1, 1, 1), tc("30", 1, 1, 1, 1)) + tr(tc("합계", 0, 2, 1, 1), tc("30", 1, 2, 1, 1)) + "</hp:tbl>";
        byte[] data = hwpx(HEAD + mergedTable() + "</hp:run></hp:p><hp:p><hp:run>" + second + TAIL);
        ScoringTable.Result first = ScoringTable.extract("hwpx", data);
        assertEquals(2, first.getCandidateCount());
        assertEquals(0, first.getTableIndex());
        assertEquals(Integer.valueOf(100), first.getTotal());
        assertEquals(2, first.getCandidateHeads().size());
        assertTrue(first.getCandidateHeads().get(0), first.getCandidateHeads().get(0).contains("배 점"));
        assertTrue(first.getCandidateHeads().get(1), first.getCandidateHeads().get(1).contains("배점(점)"));
        ScoringTable.Result pick = ScoringTable.extract("hwpx", data, 1);
        assertEquals(1, pick.getTableIndex());
        assertEquals(Integer.valueOf(30), pick.getTotal());
        assertEquals("가격", at(pick, 1, 0).getText());
        assertFalse(pick.isOutOfRange());
        assertTrue(ScoringTable.extract("hwpx", data, 2).isOutOfRange());
    }
}
