package com.kbstar.kgi.ggreport.web.docout;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** NEXT 100 S2 — 기관 정보 요약 출력 모델·렌더 단위 시험(DB·스프링 없음). 구조(XML)만 본다 — Word 에서 보이는 모양은 실물 확인이 필요하다. */
public class InstSummaryDocBuilderTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static final String BIZ_ROWS = "[{'group':'A','sub':'a1','lines':['a1 내용']},{'group':'A','sub':'a2','lines':['a2 내용','a2 둘째']},"
            + "{'group':'B','sub':null,'lines':['B 내용']},{'group':'C','sub':'c1','lines':[]}]";
    private static final String YEARS_2027_2030 = "{'unit':'억원','from':2027,'to':2030,'end':2028,'mmda':{'2027':'1200','2028':'1300','2029':'9','2030':'9'},"
            + "'income':{'2027':'12.5'},'notes':['추정치입니다']}";

    /** 가상 기관의 저장 내용(정규형과 같은 모양) — 단위 시험 전용 값. */
    private static JsonNode content(String bizRows, String years) {
        String json = ("{'v':1,'form':'INST_SUMMARY','tpl_ver':1,"
                + "'fields':{'inst_name':{'val':'가상구청','src':null},'inst_type':{'val':'자치구','src':null},"
                + "'head_name':{'val':'가상기관장','src':null},'current_bank':{'val':'1금고 가상은행 (2022~2026)','src':null},"
                + "'bid_kind':{'val':'금고 지정','note':null},'budget':{'val':'1조원','note':null},'staff':{'val':null,'note':null},"
                + "'supervisor':{'val':'가상부','note':null},'address':{'val':'가상시 가상로 1','note':null},'org_note':{'val':'3국 20과','note':null}},"
                + "'lists':{'overview':['현황 1','현황 2'],'mmda_basis':['기준 1'],'competition':['경쟁 1']},"
                + "'tables':{'biz':{'src':null,'dropped':0,'rows':" + bizRows + "},"
                + "'fund':{'rows':[{'kind':'일반회계','lines':[{'lv':0,'text':'운영 1'},{'lv':1,'text':'세부 1'}]}]},"
                + "'years':" + years + "}}").replace('\'', '"');
        try {
            return JSON.readTree(json);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static byte[] render(JsonNode c, boolean draft) {
        return DocxKit.render(InstSummaryDocBuilder.build(c, InstSummaryDocBuilder.RENDER_VER, draft), DocxKit.Footer.pageNumberOnly());
    }

    private static XWPFDocument read(byte[] b) throws IOException {
        return new XWPFDocument(new ByteArrayInputStream(b));
    }

    private static String part(byte[] docx, String prefix) throws IOException {
        try (ZipInputStream z = new ZipInputStream(new ByteArrayInputStream(docx))) {
            ZipEntry e;
            while ((e = z.getNextEntry()) != null) {
                if (e.getName().startsWith(prefix)) {
                    ByteArrayOutputStream o = new ByteArrayOutputStream();
                    byte[] buf = new byte[4096];
                    int n;
                    while ((n = z.read(buf)) > 0) {
                        o.write(buf, 0, n);
                    }
                    return new String(o.toByteArray(), StandardCharsets.UTF_8);
                }
            }
        }
        return null;
    }

    private static int count(String hay, String needle) {
        int n = 0;
        for (int i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) {
            n++;
        }
        return n;
    }

    /** 겉 표(1개)의 r행 둘째 칸 안의 표들. 겉 표는 [추진 배경(세로 3행) | 내용] 4행이다. */
    private static List<XWPFTable> innerTables(XWPFDocument d, int row) {
        XWPFTable outer = d.getTables().get(0);
        XWPFTableRow r = outer.getRow(row);
        return r.getTableCells().get(r.getTableCells().size() - 1).getTables();
    }

    @Test
    public void 주요_사업_표는_그룹_칸을_세로_병합하고_하위_구분이_없으면_두_칸을_합친다() throws Exception {
        XWPFDocument d = read(render(content(BIZ_ROWS, "null"), false));
        XWPFTable biz = innerTables(d, 1).get(0);
        assertEquals("머리 1 + 사업 4행", 5, biz.getRows().size());
        // A/a1 — 그룹 칸이 2행을 차지(restart)
        List<XWPFTableCell> r1 = biz.getRow(1).getTableCells();
        assertEquals(3, r1.size());
        assertNotNull(r1.get(0).getCTTc().getTcPr().getVMerge());
        assertEquals("restart", r1.get(0).getCTTc().getTcPr().getVMerge().getVal().toString());
        // A/a2 — 모델에서는 그룹 칸을 뺐고 렌더러가 이어짐(val 없음) 칸을 채운다
        List<XWPFTableCell> r2 = biz.getRow(2).getTableCells();
        assertEquals(3, r2.size());
        assertNotNull(r2.get(0).getCTTc().getTcPr().getVMerge());
        assertNull(r2.get(0).getCTTc().getTcPr().getVMerge().getVal());
        // B/null — 그룹 칸이 가로 2칸
        List<XWPFTableCell> r3 = biz.getRow(3).getTableCells();
        assertEquals(2, r3.size());
        assertEquals("2", r3.get(0).getCTTc().getTcPr().getGridSpan().getVal().toString());
        // C/c1 — 혼자 한 묶음이라 병합 없음
        List<XWPFTableCell> r4 = biz.getRow(4).getTableCells();
        assertEquals(3, r4.size());
        assertTrue(r4.get(0).getCTTc().getTcPr().getVMerge() == null);
    }

    @Test
    public void 사업_행이_없으면_가로_세_칸_대시_한_줄이다() throws Exception {
        XWPFDocument d = read(render(content("[]", "null"), false));
        XWPFTable biz = innerTables(d, 1).get(0);
        assertEquals(2, biz.getRows().size());
        assertEquals("—", biz.getRow(1).getCell(0).getText());
    }

    @Test
    public void 연도_표는_종료_연도_뒤_칸을_빗금으로_칠하고_종료_연도_머리에_위첨자가_있다() throws Exception {
        byte[] b = render(content(BIZ_ROWS, YEARS_2027_2030), false);
        XWPFDocument d = read(b);
        List<XWPFTable> inner = innerTables(d, 2);
        assertEquals("운영 방식 표 + 연도 표", 2, inner.size());
        XWPFTable years = inner.get(1);
        assertEquals("구분 + 연도 4열", 5, years.getRow(0).getTableCells().size());
        assertTrue(years.getRow(0).getCell(0).getText().contains("억원"));
        String xml = part(b, "word/document.xml");
        assertEquals("2029·2030 의 두 행 = 4칸만 빗금", 4, count(xml, "w:val=\"thinDiagStripe\""));
        assertEquals("종료 연도(2028) 머리의 위첨자 1개", 1, count(xml, "<w:vertAlign w:val=\"superscript\"/>"));
        assertTrue(xml.contains("협약 종료"));
        // 종료 연도 뒤 칸에는 값을 쓰지 않는다
        assertEquals("", years.getRow(1).getCell(3).getText());
        assertEquals("", years.getRow(1).getCell(4).getText());
        assertEquals("1300", years.getRow(1).getCell(2).getText());
        assertTrue("주석", xml.contains("주1) 추정치입니다"));
    }

    @Test
    public void 연도가_열_한_칸_이상이면_IllegalArgumentException이다() {
        try {
            InstSummaryDocBuilder.build(content(BIZ_ROWS, "{'unit':'억원','from':2027,'to':2037,'end':null,'mmda':{},'income':{},'notes':[]}"),
                    InstSummaryDocBuilder.RENDER_VER, false);
            fail("11열은 거부");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage(), expected.getMessage().contains("1~10"));
        }
    }

    @Test
    public void 연도_표가_없으면_운영_방식_표만_있다() throws Exception {
        XWPFDocument d = read(render(content(BIZ_ROWS, "null"), false));
        assertEquals(1, innerTables(d, 2).size());
    }

    @Test
    public void 초안이면_제목이_확정_전_초안으로_시작하고_확정본은_아니다() throws Exception {
        byte[] draft = render(content(BIZ_ROWS, "null"), true);
        assertTrue(read(draft).getParagraphs().get(0).getText().startsWith("[확정 전 초안] 참고자료 1. 「가상구청」 금고 지정 관련 요약"));
        byte[] fin = render(content(BIZ_ROWS, "null"), false);
        assertTrue(read(fin).getParagraphs().get(0).getText().startsWith("참고자료 1. 「가상구청」"));
        assertFalse(part(fin, "word/document.xml").contains("확정 전 초안"));
    }

    @Test
    public void 지원하지_않는_출력_판은_IllegalStateException이다() {
        try {
            InstSummaryDocBuilder.build(content(BIZ_ROWS, "null"), 2, false);
            fail("RENDER_VER 2 는 아직 없다");
        } catch (IllegalStateException expected) {
            // ok
        }
    }

    @Test
    public void 특수문자는_일반_글자로_들어가고_필드와_하이퍼링크는_본문에_없다() throws Exception {
        JsonNode c = content(BIZ_ROWS, "null");
        ((ObjectNode) c.at("/fields/bid_kind")).put("val", "<&\"");
        ((ObjectNode) c.at("/fields/org_note")).put("val", "http://example.com/x?a=1&b=2");
        byte[] b = render(c, false);
        String xml = part(b, "word/document.xml");
        assertTrue(xml.contains("&lt;&amp;"));
        assertFalse(xml.contains("fldSimple"));
        assertFalse(xml.contains("hyperlink"));
        assertFalse(xml.contains("instrText"));
        assertTrue("바닥글(쪽 번호)에만 필드", part(b, "word/footer").contains("fldSimple"));
    }

    @Test
    public void 빈_값은_대시로_나온다() throws Exception {
        XWPFDocument d = read(render(content(BIZ_ROWS, "null"), false));
        XWPFTable status = innerTables(d, 0).get(0);
        assertEquals("가상기관장", status.getRow(1).getCell(0).getText());
        assertEquals("임직원 수 칸은 비었다", "—", status.getRow(1).getCell(2).getText());
    }
}
