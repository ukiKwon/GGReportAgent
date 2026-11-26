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
        return render(c, InstSummaryDocBuilder.RENDER_VER, draft);
    }

    private static byte[] render(JsonNode c, int ver, boolean draft) {
        return DocxKit.render(InstSummaryDocBuilder.build(c, ver, draft), DocxKit.Footer.pageNumberOnly());
    }

    private static JsonNode json(String single) {
        try {
            return JSON.readTree(single.replace('\'', '"'));
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void set(JsonNode c, String objPath, String field, String singleQuotedJson) {
        ((ObjectNode) c.at(objPath)).set(field, json(singleQuotedJson));
    }

    /** 4행×3열: 부문(rs2)·항목·배점(rs2) / 세부 / 1.신용도(rs2)·a·10(rs2) / b. */
    private static final String SCORING = "{'row_count':4,'col_count':3,'total':100,'source':{'attach_id':7,'file':'공고.hwpx','table':0},'cells':["
            + "{'r':0,'c':0,'rs':2,'cs':1,'text':'부문'},{'r':0,'c':1,'rs':1,'cs':1,'text':'항목'},{'r':0,'c':2,'rs':2,'cs':1,'text':'배점'},"
            + "{'r':1,'c':1,'rs':1,'cs':1,'text':'세부'},"
            + "{'r':2,'c':0,'rs':2,'cs':1,'text':'1. 신용도'},{'r':2,'c':1,'rs':1,'cs':1,'text':'a'},{'r':2,'c':2,'rs':2,'cs':1,'text':'10'},"
            + "{'r':3,'c':1,'rs':1,'cs':1,'text':'b'}]}";

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
    public void 옛_판_2는_연도_표_종료_뒤_칸을_비우고_빗금만_칠한다_뜻이_바뀐_시험_v2_회귀() throws Exception {   // v3 에서 종료 뒤 값을 쓰므로 판 2 를 명시해 옛 모양을 지킨다
        byte[] b = render(content(BIZ_ROWS, YEARS_2027_2030), 2, false);
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
            InstSummaryDocBuilder.build(content(BIZ_ROWS, "null"), 4, false);
            fail("RENDER_VER 4 는 아직 없다");
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

    @Test
    public void 출력_판_1_2_3을_지원하고_그_밖은_아니다() {   // 뜻이 바뀐 시험: 판 3 지원, 4 는 미지원
        assertTrue(InstSummaryDocBuilder.supports(1));
        assertTrue(InstSummaryDocBuilder.supports(2));
        assertTrue(InstSummaryDocBuilder.supports(3));
        assertFalse(InstSummaryDocBuilder.supports(0));
        assertFalse(InstSummaryDocBuilder.supports(4));
        assertEquals(3, InstSummaryDocBuilder.RENDER_VER);
    }

    // ── v3(샘플 두 쪽) ──────────────────────────────────────────────────

    @Test
    public void v3_연도_표는_종료_뒤_칸에도_값을_쓰고_빗금은_그대로이며_자금수익_줄이_굵다() throws Exception {
        byte[] b = render(content(BIZ_ROWS, YEARS_2027_2030), false);
        XWPFTable years = innerTables(read(b), 2).get(1);
        assertEquals("종료(2028) 뒤 2029 칸 값", "9", years.getRow(1).getCell(3).getText());
        assertEquals("9", years.getRow(1).getCell(4).getText());
        assertEquals("1300", years.getRow(1).getCell(2).getText());
        assertEquals("빗금은 종료 뒤 4칸만", 4, count(part(b, "word/document.xml"), "w:val=\"thinDiagStripe\""));
        assertTrue("자금수익 라벨 굵게", years.getRow(2).getCell(0).getParagraphs().get(0).getRuns().get(0).isBold());
        assertTrue("자금수익 값 굵게", years.getRow(2).getCell(1).getParagraphs().get(0).getRuns().get(0).isBold());
        assertFalse("평잔 줄은 굵지 않다", years.getRow(1).getCell(1).getParagraphs().get(0).getRuns().get(0).isBold());
    }

    @Test
    public void v3_현황_표_첫_칸_머리는_직함이고_비면_기관장이다_옛_판은_늘_기관장() throws Exception {
        JsonNode c = content(BIZ_ROWS, "null");
        set(c, "/fields", "head_title", "{'val':'원장','note':null}");
        assertEquals("원장", innerTables(read(render(c, false)), 0).get(0).getRow(0).getCell(0).getText());
        assertEquals("기관장", innerTables(read(render(c, 2, false)), 0).get(0).getRow(0).getCell(0).getText());
        set(c, "/fields", "head_title", "{'val':'  ','note':null}");
        assertEquals("기관장", innerTables(read(render(c, false)), 0).get(0).getRow(0).getCell(0).getText());
        assertEquals("칸이 아예 없는 v2 본문", "기관장",
                innerTables(read(render(content(BIZ_ROWS, "null"), false)), 0).get(0).getRow(0).getCell(0).getText());
    }

    @Test
    public void v3_예산_운영_방식_표는_구분_내용_머리_줄이_있고_옛_판은_없다() throws Exception {
        XWPFTable fund3 = innerTables(read(render(content(BIZ_ROWS, "null"), false)), 2).get(0);
        assertEquals(2, fund3.getRows().size());
        assertEquals("구분", fund3.getRow(0).getCell(0).getText());
        assertEquals("내용", fund3.getRow(0).getCell(1).getText());
        assertEquals("일반회계", fund3.getRow(1).getCell(0).getText());
        assertEquals("머리 줄 반복", 1, fund3.getRow(0).getCtRow().getTrPr().sizeOfTblHeaderArray());
        XWPFTable fund2 = innerTables(read(render(content(BIZ_ROWS, "null"), 2, false)), 2).get(0);
        assertEquals("옛 판은 머리 줄 없음", 1, fund2.getRows().size());
    }

    @Test
    public void v3_조직현황_주석은_쌍점이고_옛_판은_쌍점이_없다() throws Exception {
        assertTrue(part(render(content(BIZ_ROWS, "null"), false), "word/document.xml").contains("※ 조직현황 : 3국 20과"));
        String old = part(render(content(BIZ_ROWS, "null"), 2, false), "word/document.xml");
        assertTrue(old.contains("※ 조직현황 3국 20과"));
        assertFalse(old.contains("조직현황 :"));
    }

    @Test
    public void v3_MMDA_산정_기준은_들여_쓴_점_줄이고_각주_번호가_표_뒤_주석으로_이어진다() throws Exception {
        JsonNode c = content(BIZ_ROWS, YEARS_2027_2030);
        set(c, "/lists", "mmda_basis", "[{'text':'기준 가','note':'각주 하나'},{'text':'기준 나','note':null},{'text':'기준 다','note':'각주 둘'}]");
        String xml = part(render(c, false), "word/document.xml");
        int head = xml.indexOf("ㅇ MMDA 예상 평잔 산정 기준");
        int a = xml.indexOf("· 기준 가");
        int n1 = xml.indexOf("주1) 각주 하나");
        int b = xml.indexOf("· 기준 나");
        int d = xml.indexOf("· 기준 다");
        int n2 = xml.indexOf("주2) 각주 둘");
        int n3 = xml.indexOf("주3) 추정치입니다");
        assertTrue(head >= 0 && head < a && a < n1 && n1 < b && b < d && d < n2 && n2 < n3);
        assertFalse("기준 줄은 ㅇ 단계가 아니다", xml.contains("ㅇ 기준 가"));
    }

    @Test
    public void 옛_판_2는_산정_기준을_ㅇ_줄로_내고_표_뒤_주석은_주1부터다_현_거래_은행_줄도_그대로() throws Exception {
        String xml = part(render(content(BIZ_ROWS, YEARS_2027_2030), 2, false), "word/document.xml");
        assertTrue(xml.contains("ㅇ 기준 1"));
        assertFalse(xml.contains("· 기준 1"));
        assertTrue(xml.contains("주1) 추정치입니다"));
        assertTrue(xml.contains("현 거래 은행: 1금고 가상은행"));
        assertFalse("옛 판은 2쪽이 없다", xml.contains("참고자료 2."));
    }

    @Test
    public void v3_사업_줄은_굵게_표시할_수_있고_문자열_줄은_굵지_않다() throws Exception {
        XWPFTable biz = innerTables(read(render(content("[{'group':'A','sub':'a1','lines':[{'text':'굵은 줄','bold':true},{'text':'보통','bold':false},'옛 문자열']}]",
                "null"), false)), 1).get(0);
        List<org.apache.poi.xwpf.usermodel.XWPFParagraph> ps = biz.getRow(1).getCell(2).getParagraphs();
        assertEquals(3, ps.size());
        assertTrue(ps.get(0).getRuns().get(0).isBold());
        assertFalse(ps.get(1).getRuns().get(0).isBold());
        assertFalse(ps.get(2).getRuns().get(0).isBold());
        assertTrue(ps.get(0).getText().contains("굵은 줄"));
    }

    @Test
    public void v3는_현_거래_은행_자동_줄을_빼고_기대효과_규칙은_그대로다() throws Exception {
        JsonNode c = content(BIZ_ROWS, "null");
        String xml = part(render(c, false), "word/document.xml");
        assertFalse(xml.contains("현 거래 은행"));
        assertTrue(xml.contains("경쟁 1"));
        assertFalse("기대효과가 비면 소제목도 없다", xml.contains("우리 회사 기대효과"));
        set(c, "/lists", "effect", "['효과 1']");
        assertTrue(part(render(c, false), "word/document.xml").contains("우리 회사 기대효과"));
    }

    @Test
    public void v3_2쪽은_쪽_나눔_뒤_제목과_소제목_병합_표와_머리_줄_반복과_합계_줄이다() throws Exception {
        JsonNode c = content(BIZ_ROWS, "null");
        set(c, "/tables", "scoring", SCORING);
        byte[] b = render(c, false);
        String xml = part(b, "word/document.xml");
        assertTrue("쪽 나눔", xml.contains("w:type=\"page\""));
        assertTrue(xml.indexOf("w:type=\"page\"") < xml.indexOf("참고자료 2."));
        assertTrue(xml.contains("참고자료 2. 「가상구청」 금고 지정 평가 기준표"));
        assertTrue(xml.contains("■ 평가 항목 및 배점 기준"));
        assertTrue("합계 줄(표에 계 칸이 없을 때)", xml.contains("합계 100점"));
        XWPFDocument d = read(b);
        assertEquals("겉 표 + 평가표", 2, d.getTables().size());
        XWPFTable t = d.getTables().get(1);
        assertEquals(4, t.getRows().size());
        // 부문(0,0) rs=2 → restart, 아래 줄에는 이어짐 칸
        assertEquals("restart", t.getRow(0).getCell(0).getCTTc().getTcPr().getVMerge().getVal().toString());
        assertNull(t.getRow(1).getCell(0).getCTTc().getTcPr().getVMerge().getVal());
        assertEquals("1. 신용도", t.getRow(2).getCell(0).getText());
        assertEquals("restart", t.getRow(2).getCell(0).getCTTc().getTcPr().getVMerge().getVal().toString());
        assertEquals("10", t.getRow(2).getCell(2).getText());
        assertEquals("restart", t.getRow(2).getCell(2).getCTTc().getTcPr().getVMerge().getVal().toString());
        assertEquals("머리 두 줄 반복(첫 행 칸이 세로 병합 2)", 1, t.getRow(0).getCtRow().getTrPr().sizeOfTblHeaderArray());
        assertEquals(1, t.getRow(1).getCtRow().getTrPr().sizeOfTblHeaderArray());
        assertTrue("본문 줄은 반복하지 않는다", t.getRow(2).getCtRow().getTrPr() == null || t.getRow(2).getCtRow().getTrPr().sizeOfTblHeaderArray() == 0);
    }

    @Test
    public void v3_2쪽_가로_병합과_표_안_계_칸이_있으면_합계_줄을_덧붙이지_않고_빈_자리는_채운다() throws Exception {
        JsonNode c = content(BIZ_ROWS, "null");
        set(c, "/tables", "scoring", "{'row_count':2,'col_count':3,'total':100,'source':null,'cells':["
                + "{'r':0,'c':0,'rs':1,'cs':2,'text':'구분'},{'r':0,'c':2,'rs':1,'cs':1,'text':'배점'},{'r':1,'c':0,'rs':1,'cs':1,'text':'계'}]}");
        byte[] b = render(c, false);
        assertFalse(part(b, "word/document.xml").contains("합계 100점"));
        XWPFTable t = read(b).getTables().get(1);
        assertEquals("2", t.getRow(0).getCell(0).getCTTc().getTcPr().getGridSpan().getVal().toString());
        assertEquals("원본에 없는 자리는 빈 칸", 3, t.getRow(1).getTableCells().size());
    }

    @Test
    public void v3_평가표가_없거나_비면_1쪽만_낸다_옛_판은_평가표가_있어도_무시한다() throws Exception {
        JsonNode c = content(BIZ_ROWS, "null");
        String none = part(render(c, false), "word/document.xml");
        assertFalse(none.contains("w:type=\"page\""));
        assertFalse(none.contains("참고자료 2."));
        set(c, "/tables", "scoring", "{'row_count':1,'col_count':1,'total':null,'source':null,'cells':[]}");
        assertFalse(part(render(c, false), "word/document.xml").contains("참고자료 2."));
        set(c, "/tables", "scoring", SCORING);
        assertFalse(part(render(c, 2, false), "word/document.xml").contains("참고자료 2."));
        assertFalse(part(render(c, 1, false), "word/document.xml").contains("참고자료 2."));
    }

    @Test
    public void v3_2쪽_제목은_입찰_종류를_1쪽과_같이_쓰고_비면_생략하며_초안_표시는_1쪽_제목에만_붙는다() throws Exception {
        JsonNode c = content(BIZ_ROWS, "null");
        set(c, "/tables", "scoring", SCORING);
        String xml = part(render(c, true), "word/document.xml");
        assertTrue(xml.contains("[확정 전 초안] 참고자료 1. 「가상구청」 금고 지정 관련 요약"));
        assertTrue(xml.contains("참고자료 2. 「가상구청」 금고 지정 평가 기준표"));
        assertEquals(1, count(xml, "확정 전 초안"));
        set(c, "/fields", "bid_kind", "{'val':null,'note':null}");
        assertTrue(part(render(c, false), "word/document.xml").contains("참고자료 2. 「가상구청」 평가 기준표"));
    }

    // ── v3 서식(사용자 샘플 맞춤, 11-26 디자인 규격) ─────────────────────

    private static String cj(int r, int c, int rs, int cs, String text) {
        return "{'r':" + r + ",'c':" + c + ",'rs':" + rs + ",'cs':" + cs + ",'text':'" + text + "'}";
    }

    /** 샘플 2쪽 — 22행×5열(머리 1 + 본문 20 + 합계 1), qa 보고서 3절과 같은 값. */
    private static String sample22x5() {
        String[] cells = {
            cj(0, 0, 1, 1, "평가 부문"), cj(0, 1, 1, 1, "평가 항목"), cj(0, 2, 1, 1, "세부 평가 항목"), cj(0, 3, 1, 1, "배점"), cj(0, 4, 1, 1, "평가 방법"),
            cj(1, 0, 5, 1, "재무안전성\\n(10점)"), cj(1, 1, 2, 1, "신용평가"), cj(1, 2, 1, 1, "국내 신용평가기관 평가 결과"), cj(1, 3, 1, 1, "2"), cj(1, 4, 7, 1, "계량"),
            cj(2, 2, 1, 1, "국외 신용평가기관 평가 결과"), cj(2, 3, 1, 1, "2"),
            cj(3, 1, 3, 1, "재무지표"), cj(3, 2, 1, 1, "최근 3년간 평균 자기자본비율(BIS)"), cj(3, 3, 1, 1, "2"),
            cj(4, 2, 1, 1, "최근 3년간 평균 고정이하여신비율(NPL)"), cj(4, 3, 1, 1, "2"),
            cj(5, 2, 1, 1, "최근 3년간 평균 총자산이익률(ROA)"), cj(5, 3, 1, 1, "2"),
            cj(6, 0, 5, 1, "자금운용\\n(50점)"), cj(6, 1, 2, 1, "적용금리"), cj(6, 2, 1, 1, "수시입출금식 예금(MMDA)금리"), cj(6, 3, 1, 1, "20"),
            cj(7, 2, 1, 1, "정기예금 금리"), cj(7, 3, 1, 1, "20"),
            cj(8, 1, 3, 1, "서비스"), cj(8, 2, 1, 1, "자금 업무 전담 직원 지정 및 업무효율화 방안"), cj(8, 3, 3, 1, "10"), cj(8, 4, 13, 1, "비계량"),
            cj(9, 2, 1, 1, "각종 금융수수료 면제 및 우대"),
            cj(10, 2, 1, 1, "부동산원 본사 내 ATM 설치"),
            cj(11, 0, 7, 1, "시스템 관리\\n(25점)"), cj(11, 1, 3, 1, "시스템 구축"), cj(11, 2, 1, 1, "부동산원 시스템과 은행 시스템 연계 구축"), cj(11, 3, 3, 1, "15"),
            cj(12, 2, 1, 1, "금융사고 예방을 위한 내부통제 기능"),
            cj(13, 2, 1, 1, "기타 부가서비스 제공 및 구축방안"),
            cj(14, 1, 4, 1, "유지보수"), cj(14, 2, 1, 1, "유지보수 범위 및 수행 방안"), cj(14, 3, 4, 1, "10"),
            cj(15, 2, 1, 1, "유지보수 전담 지원조직 및 지원인력의 전문성"),
            cj(16, 2, 1, 1, "장애발생 시 대응체계"),
            cj(17, 2, 1, 1, "장비구성 변경 시(증설, 업그레이드 등) 지원 방안"),
            cj(18, 0, 3, 1, "기타지원\\n(15점)"), cj(18, 1, 1, 1, "상생협력"), cj(18, 2, 1, 1, "지역 상생 및 ESG 경영 실천을 위한 부동산원과 금융기관 간 협력 방안"), cj(18, 3, 1, 1, "5"),
            cj(19, 1, 2, 1, "직원혜택"), cj(19, 2, 1, 1, "대출 조건 우대(적용금리, 한도, 수수료)"), cj(19, 3, 2, 1, "10"),
            cj(20, 2, 1, 1, "예금 조건 우대(적용금리, 수수료)"),
            cj(21, 0, 1, 3, "합계"), cj(21, 3, 1, 1, "100"), cj(21, 4, 1, 1, "-")
        };
        return "{'row_count':22,'col_count':5,'total':100,'source':null,'cells':[" + String.join(",", cells) + "]}";
    }

    /** 머리 1행 + 본문 (rows-1)행, 2열, 칸마다 짧은 한 줄 — 단계 선택 시험용. */
    private static String shortRows(int rows) {
        StringBuilder sb = new StringBuilder("{'row_count':" + rows + ",'col_count':2,'total':null,'source':null,'cells':[");
        sb.append(cj(0, 0, 1, 1, "항목")).append(',').append(cj(0, 1, 1, 1, "배점"));
        for (int r = 1; r < rows; r++) {
            sb.append(',').append(cj(r, 0, 1, 1, "가" + r)).append(',').append(cj(r, 1, 1, 1, "1"));
        }
        return sb.append("]}").toString();
    }

    private static final String YEARS_2027_2031 = "{'unit':'억원','from':2027,'to':2031,'end':2029,"
            + "'mmda':{'2027':'5,000','2028':'10,000','2029':'15,000','2030':'10,000','2031':'5,000'},"
            + "'income':{'2027':'15','2028':'30','2029':'45','2030':'30','2031':'15'},'notes':[]}";

    private static long[] gridTw(XWPFTable t) {
        org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTblGridCol[] g = t.getCTTbl().getTblGrid().getGridColArray();
        long[] out = new long[g.length];
        for (int i = 0; i < g.length; i++) {
            out[i] = Long.parseLong(g[i].getW().toString());
        }
        return out;
    }

    /** 열 폭(tw)이 기대 비율과 ±tol tw 안에서 같다. */
    private static void assertGrid(String msg, XWPFTable t, double[] pct, double tol) {
        long[] tw = gridTw(t);
        assertEquals(msg + " 열 수", pct.length, tw.length);
        double sumTw = 0;
        double sumPct = 0;
        for (int k = 0; k < tw.length; k++) {
            sumTw += tw[k];
            sumPct += pct[k];
        }
        for (int k = 0; k < tw.length; k++) {
            assertEquals(msg + " " + k + "열", sumTw * pct[k] / sumPct, tw[k], tol);
        }
    }

    /** 음영 채움색 — 이 POI 판은 byte[] 로 돌려주므로 16진 대문자로 바꾼다. */
    private static String fill(XWPFTableCell c) {
        Object f = c.getCTTc().getTcPr().getShd().getFill();
        if (f instanceof byte[]) {
            StringBuilder sb = new StringBuilder();
            for (byte x : (byte[]) f) {
                sb.append(String.format("%02X", x & 0xff));
            }
            return sb.toString();
        }
        return String.valueOf(f);
    }

    private static String vAlign(XWPFTableCell c) {
        return c.getCTTc().getTcPr().getVAlign() == null ? null : c.getCTTc().getTcPr().getVAlign().getVal().toString();
    }

    private static String jc(XWPFTableCell c) {
        org.openxmlformats.schemas.wordprocessingml.x2006.main.CTPPr p = c.getParagraphs().get(0).getCTP().getPPr();
        return p == null || p.getJc() == null ? null : p.getJc().getVal().toString();
    }

    private static boolean allBold(org.apache.poi.xwpf.usermodel.XWPFParagraph p) {
        for (org.apache.poi.xwpf.usermodel.XWPFRun r : p.getRuns()) {
            if (!r.isBold()) {
                return false;
            }
        }
        return !p.getRuns().isEmpty();
    }

    private static boolean noneBold(XWPFTableCell c) {
        for (org.apache.poi.xwpf.usermodel.XWPFParagraph p : c.getParagraphs()) {
            for (org.apache.poi.xwpf.usermodel.XWPFRun r : p.getRuns()) {
                if (r.isBold()) {
                    return false;
                }
            }
        }
        return true;
    }

    private static boolean isRestart(XWPFTableCell c) {
        org.openxmlformats.schemas.wordprocessingml.x2006.main.CTVMerge m = c.getCTTc().getTcPr().getVMerge();
        return m != null && m.getVal() != null && "restart".equals(m.getVal().toString());
    }

    private static boolean isContinue(XWPFTableCell c) {
        org.openxmlformats.schemas.wordprocessingml.x2006.main.CTVMerge m = c.getCTTc().getTcPr().getVMerge();
        return m != null && m.getVal() == null;
    }

    private static String runSz(org.apache.poi.xwpf.usermodel.XWPFParagraph p) {
        return p.getRuns().get(0).getCTR().getRPr().getSzArray(0).getVal().toString();
    }

    private static String spacing(org.apache.poi.xwpf.usermodel.XWPFParagraph p, boolean before) {
        org.openxmlformats.schemas.wordprocessingml.x2006.main.CTSpacing s = p.getCTP().getPPr().getSpacing();
        return (before ? s.getBefore() : s.getAfter()).toString();
    }

    private static org.apache.poi.xwpf.usermodel.XWPFParagraph findPara(List<org.apache.poi.xwpf.usermodel.XWPFParagraph> ps, String startsWith) {
        for (org.apache.poi.xwpf.usermodel.XWPFParagraph p : ps) {
            if (p.getText().startsWith(startsWith)) {
                return p;
            }
        }
        fail("문단 없음: " + startsWith);
        return null;
    }

    @Test
    public void v3_샘플_22x5_평가표는_열_폭이_글자_길이_비례이고_병합_머리_합계_줄이_맞다() throws Exception {
        JsonNode c = content(BIZ_ROWS, YEARS_2027_2031);
        set(c, "/tables", "scoring", sample22x5());
        byte[] b = render(c, false);
        XWPFTable t = read(b).getTables().get(1);
        assertEquals(22, t.getRows().size());
        assertGrid("평가표", t, new double[]{13.75, 13.75, 50, 8.75, 13.75}, 1.0);
        int restarts = 0;
        for (XWPFTableRow r : t.getRows()) {
            for (XWPFTableCell cell : r.getTableCells()) {
                if (isRestart(cell)) {
                    restarts++;
                }
            }
        }
        assertEquals("세로 병합 시작 = 부문 4 + 항목 7 + 배점 4 + 방법 2", 17, restarts);
        assertEquals("합계 줄 첫 칸 가로 3칸", "3", t.getRow(21).getCell(0).getCTTc().getTcPr().getGridSpan().getVal().toString());
        assertEquals("합계 줄 칸 수(합계·100·-)", 3, t.getRow(21).getTableCells().size());
        assertEquals("머리 줄 반복은 0행만", 1, t.getRow(0).getCtRow().getTrPr().sizeOfTblHeaderArray());
        for (int r = 1; r < 22; r++) {
            assertTrue("행 " + r, t.getRow(r).getCtRow().getTrPr() == null || t.getRow(r).getCtRow().getTrPr().sizeOfTblHeaderArray() == 0);
        }
        assertFalse("표 안 합계 줄이 있으니 덧붙임 없음", part(b, "word/document.xml").contains("합계 100점"));
        assertEquals("종료(2029) 뒤 2030·2031 두 행 = 4칸 빗금", 4, count(part(b, "word/document.xml"), "w:val=\"thinDiagStripe\""));
        assertEquals("콤마 값은 그대로", "10,000", innerTables(read(b), 2).get(1).getRow(1).getCell(4).getText());
    }

    @Test
    public void v3_평가표_본문_칸은_세로_가운데이고_세부_열만_왼쪽_나머지_가운데이며_묶음_열만_굵다() throws Exception {
        JsonNode c = content(BIZ_ROWS, "null");
        set(c, "/tables", "scoring", sample22x5());
        XWPFTable t = read(render(c, false)).getTables().get(1);
        for (int r = 1; r < 22; r++) {
            int col = 0;
            for (XWPFTableCell cell : t.getRow(r).getTableCells()) {
                org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTcPr pr = cell.getCTTc().getTcPr();
                int span = pr.getGridSpan() == null ? 1 : Integer.parseInt(pr.getGridSpan().getVal().toString());
                assertEquals("세로 가운데 " + r + "," + col, "center", vAlign(cell));
                assertTrue("음영 없음 " + r + "," + col, pr.getShd() == null);
                if (!isContinue(cell)) {   // 세로 병합에 가려진 칸은 빈 문단이라 정렬을 보지 않는다
                    if (col == 2) {
                        assertEquals("세부 항목 열은 왼쪽(jc 없음) " + r, null, jc(cell));
                    } else {
                        assertEquals("그 밖은 가운데 " + r + "," + col, "center", jc(cell));
                    }
                    boolean total = r == 21;
                    boolean bold = allBold(cell.getParagraphs().get(0));
                    if (col == 0 && !total) {
                        assertTrue("0열 본문 굵게 " + r, bold);
                    } else {
                        assertFalse("0열 밖·합계 줄은 보통 " + r + "," + col, bold);
                    }
                }
                col += span;
            }
        }
        assertEquals("머리 칸은 굵고 음영(F2F2F2)", "F2F2F2", fill(t.getRow(0).getCell(0)));
        assertTrue(allBold(t.getRow(0).getCell(0).getParagraphs().get(0)));
        assertEquals("부문 칸은 두 줄", "재무안전성", t.getRow(1).getCell(0).getParagraphs().get(0).getRuns().get(0).getText(0));
    }

    @Test
    public void v3_평가표_글자_단계는_샘플이면_A_40행은_C_36행은_B다() throws Exception {
        JsonNode c = content(BIZ_ROWS, "null");
        set(c, "/tables", "scoring", sample22x5());
        XWPFTable a = read(render(c, false)).getTables().get(1);
        org.apache.poi.xwpf.usermodel.XWPFParagraph body = a.getRow(1).getCell(2).getParagraphs().get(0);
        assertEquals("A 단계 10pt", "20", runSz(body));
        assertEquals("A 앞 3pt", "60", spacing(body, true));
        assertEquals("A 뒤 3pt", "60", spacing(body, false));
        assertEquals("머리 글자도 같은 단계", "20", runSz(a.getRow(0).getCell(0).getParagraphs().get(0)));

        set(c, "/tables", "scoring", shortRows(36));
        org.apache.poi.xwpf.usermodel.XWPFParagraph b = read(render(c, false)).getTables().get(1).getRow(1).getCell(0).getParagraphs().get(0);
        assertEquals("B 단계 10pt", "20", runSz(b));
        assertEquals("B 간격 0", "0", spacing(b, true));
        assertEquals("0", spacing(b, false));

        set(c, "/tables", "scoring", shortRows(40));
        XWPFTable t40 = read(render(c, false)).getTables().get(1);
        org.apache.poi.xwpf.usermodel.XWPFParagraph cc = t40.getRow(1).getCell(0).getParagraphs().get(0);
        assertEquals("C 단계 9pt", "18", runSz(cc));
        assertEquals("C 간격 0", "0", spacing(cc, true));
        assertEquals("머리 글자도 9pt", "18", runSz(t40.getRow(0).getCell(0).getParagraphs().get(0)));
    }

    @Test
    public void v3_1쪽_겉_표는_8대92이고_이름표는_두_줄_보통_음영_없음_가운데이며_옛_판은_그대로다() throws Exception {
        XWPFDocument d = read(render(content(BIZ_ROWS, "null"), false));
        XWPFTable outer = d.getTables().get(0);
        assertGrid("겉 표", outer, new double[]{8, 92}, 1.0);
        XWPFTableCell tag = outer.getRow(0).getCell(0);
        org.apache.poi.xwpf.usermodel.XWPFParagraph p = tag.getParagraphs().get(0);
        assertEquals("추진", p.getRuns().get(0).getText(0));
        assertEquals("두 줄(줄바꿈 뒤)", "배경", p.getRuns().get(2).getText(0));
        assertTrue("음영 없음", tag.getCTTc().getTcPr().getShd() == null);
        assertEquals("세로 가운데", "center", vAlign(tag));
        assertEquals("가로 가운데", "center", jc(tag));
        assertTrue("보통 굵기", noneBold(tag));
        assertEquals("3행 세로 병합", "restart", tag.getCTTc().getTcPr().getVMerge().getVal().toString());
        XWPFTableCell etc = outer.getRow(3).getCell(0);
        assertEquals("기타", etc.getParagraphs().get(0).getRuns().get(0).getText(0));
        assertTrue(etc.getCTTc().getTcPr().getShd() == null);
        // 옛 판은 14/86, 음영·굵은 한 줄 이름표 그대로
        XWPFTable old = read(render(content(BIZ_ROWS, "null"), 2, false)).getTables().get(0);
        assertGrid("옛 판 겉 표", old, new double[]{14, 86}, 1.0);
        assertEquals("추진 배경", old.getRow(0).getCell(0).getText());
        assertEquals("F2F2F2", fill(old.getRow(0).getCell(0)));
    }

    @Test
    public void v3_현황_표는_열_폭_13_20_16_17_20_14이고_머리가_임직원수_기관형태이며_옛_판은_띄어_쓴다() throws Exception {
        XWPFTable st = innerTables(read(render(content(BIZ_ROWS, "null"), false)), 0).get(0);
        assertGrid("현황 표", st, new double[]{13, 20, 16, 17, 20, 14}, 3.0);   // 열이 많아 반올림 오차가 마지막 열에 쌓인다
        assertEquals("임직원수", st.getRow(0).getCell(2).getText());
        assertEquals("기관형태", st.getRow(0).getCell(4).getText());
        XWPFTable old = innerTables(read(render(content(BIZ_ROWS, "null"), 2, false)), 0).get(0);
        assertEquals("임직원 수", old.getRow(0).getCell(2).getText());
        assertEquals("기관 형태", old.getRow(0).getCell(4).getText());
        long[] tw = gridTw(old);
        assertEquals("옛 판 현황 표는 균등 폭(마지막 열만 나머지)", tw[0], tw[1]);
    }

    @Test
    public void v3_사업_표는_8_20_72이고_묶음_세부_칸이_가운데이며_sub_없는_행은_줄이_모두_굵을_때만_이름표가_굵다() throws Exception {
        String rowsJson = "[{'group':'A','sub':'a1','lines':[{'text':'내용','bold':false}]},{'group':'A','sub':'a2','lines':[{'text':'내용 둘','bold':false}]},"
                + "{'group':'B','sub':null,'lines':[{'text':'굵은 하나','bold':true},{'text':'굵은 둘','bold':true}]},"
                + "{'group':'C','sub':null,'lines':[{'text':'굵음','bold':true},{'text':'보통','bold':false}]}]";
        XWPFTable biz = innerTables(read(render(content(rowsJson, "null"), false)), 1).get(0);
        assertGrid("사업 표", biz, new double[]{8, 20, 72}, 2.0);
        XWPFTableCell group = biz.getRow(1).getCell(0);
        assertTrue(isRestart(group));
        assertEquals("center", vAlign(group));
        assertEquals("center", jc(group));
        assertTrue("묶음 칸은 보통", noneBold(group));
        assertEquals("세부 칸 가운데", "center", jc(biz.getRow(1).getCell(1)));
        assertEquals("center", vAlign(biz.getRow(1).getCell(1)));
        XWPFTableCell b = biz.getRow(3).getCell(0);
        assertEquals("2", b.getCTTc().getTcPr().getGridSpan().getVal().toString());
        assertTrue("줄이 모두 굵으면 이름표도 굵다", allBold(b.getParagraphs().get(0)));
        assertEquals("center", jc(b));
        assertTrue("줄 하나라도 보통이면 이름표는 보통", noneBold(biz.getRow(4).getCell(0)));
        // 옛 판은 문자열 줄·옛 폭 그대로
        XWPFTable old = innerTables(read(render(content(BIZ_ROWS, "null"), 2, false)), 1).get(0);
        assertGrid("옛 판 사업 표", old, new double[]{18, 18, 64}, 2.0);
        assertEquals("옛 판 이름표는 왼쪽(jc 없음)", null, jc(old.getRow(1).getCell(0)));
    }

    @Test
    public void v3_예산_운영_방식_표는_13_87이고_구분_칸이_가운데_가운데이다() throws Exception {
        XWPFTable fund = innerTables(read(render(content(BIZ_ROWS, "null"), false)), 2).get(0);
        assertGrid("운영 방식 표", fund, new double[]{13, 87}, 1.0);
        XWPFTableCell kind = fund.getRow(1).getCell(0);
        assertEquals("일반회계", kind.getText());
        assertEquals("center", jc(kind));
        assertEquals("center", vAlign(kind));
        assertTrue(noneBold(kind));
        assertGrid("옛 판 운영 방식 표", innerTables(read(render(content(BIZ_ROWS, "null"), 2, false)), 2).get(0), new double[]{20, 80}, 1.0);
    }

    @Test
    public void v3_연도_표는_구분_20이고_머리가_YYYY년이며_단위는_위첨자_줄_이름은_가운데이다() throws Exception {
        XWPFTable y = innerTables(read(render(content(BIZ_ROWS, YEARS_2027_2030), false)), 2).get(1);
        assertGrid("연도 표", y, new double[]{20, 20, 20, 20, 20}, 3.0);
        org.apache.poi.xwpf.usermodel.XWPFParagraph unit = y.getRow(0).getCell(0).getParagraphs().get(0);
        assertEquals("구분", unit.getRuns().get(0).getText(0));
        assertTrue(unit.getRuns().get(0).isBold());
        assertEquals("(단위 : 억원)", unit.getRuns().get(1).getText(0));
        assertEquals("superscript", unit.getRuns().get(1).getCTR().getRPr().getVertAlignArray(0).getVal().toString());
        assertEquals("2027년", y.getRow(0).getCell(1).getText());
        org.apache.poi.xwpf.usermodel.XWPFParagraph end = y.getRow(0).getCell(2).getParagraphs().get(0);
        assertEquals("종료 해는 굵은 '2028년' + 위첨자", "2028년", end.getRuns().get(0).getText(0));
        assertEquals("협약 종료", end.getRuns().get(1).getText(0));
        assertEquals("MMDA 줄 이름 가운데", "center", jc(y.getRow(1).getCell(0)));
        assertEquals("자금수익 가운데", "center", jc(y.getRow(2).getCell(0)));
        assertTrue("자금수익 굵게", allBold(y.getRow(2).getCell(0).getParagraphs().get(0)));
        assertFalse("MMDA 줄 이름은 보통", allBold(y.getRow(1).getCell(0).getParagraphs().get(0)));
        assertEquals("값 칸은 오른쪽", "right", jc(y.getRow(1).getCell(1)));
        // 옛 판: '2027' 그대로, '구분(억원)'
        XWPFTable old = innerTables(read(render(content(BIZ_ROWS, YEARS_2027_2030), 2, false)), 2).get(1);
        assertEquals("2027", old.getRow(0).getCell(1).getText());
        assertEquals("구분(억원)", old.getRow(0).getCell(0).getText());
    }

    @Test
    public void v3_소제목은_굵고_네모_소제목은_11pt이며_옛_판은_그대로다() throws Exception {
        JsonNode c = content(BIZ_ROWS, "null");
        set(c, "/lists", "effect", "['효과 1']");
        XWPFDocument d = read(render(c, false));
        XWPFTable outer = d.getTables().get(0);
        assertEquals("11pt", "22", runSz(findPara(d.getParagraphs(), "■ [")));
        assertTrue(allBold(findPara(d.getParagraphs(), "■ [")));
        assertTrue("현황", allBold(findPara(outer.getRow(0).getCell(1).getParagraphs(), "- 가상구청 현황")));
        assertTrue("주요 사업", allBold(findPara(outer.getRow(1).getCell(1).getParagraphs(), "- 기관 주요 사업")));   // 1~2행 0열은 세로 병합 이어짐 칸
        assertTrue("운영자금", allBold(findPara(outer.getRow(2).getCell(1).getParagraphs(), "- 운영자금 관련 고려사항")));
        assertTrue("경쟁은행", allBold(findPara(outer.getRow(3).getCell(1).getParagraphs(), "- 경쟁은행 동향")));
        assertTrue("기대효과", allBold(findPara(outer.getRow(3).getCell(1).getParagraphs(), "- 우리 회사 기대효과")));
        assertFalse("ㅇ 줄은 보통", allBold(findPara(outer.getRow(3).getCell(1).getParagraphs(), "ㅇ 경쟁 1")));
        set(c, "/tables", "scoring", SCORING);
        XWPFDocument d2 = read(render(c, false));
        assertEquals("2쪽 소제목도 11pt", "22", runSz(findPara(d2.getParagraphs(), "■ 평가 항목")));
        // 옛 판(2): 소제목 보통 굵기·■ 10pt
        XWPFDocument old = read(render(c, 2, false));
        assertEquals("20", runSz(findPara(old.getParagraphs(), "■ [")));
        assertFalse(allBold(findPara(old.getTables().get(0).getRow(1).getCell(1).getParagraphs(), "- 기관 주요 사업")));
    }

    @Test
    public void v3_MMDA_점_줄은_끝에_위첨자_주n을_붙이고_각주_줄은_전각_공백_두_개로_들여_쓴다_표_뒤_주석은_들여쓰지_않는다() throws Exception {
        JsonNode c = content(BIZ_ROWS, YEARS_2027_2030);
        set(c, "/lists", "mmda_basis", "[{'text':'기준 가','note':'각주 하나'},{'text':'기준 나','note':null}]");
        XWPFDocument d = read(render(c, false));
        List<org.apache.poi.xwpf.usermodel.XWPFParagraph> ps = d.getTables().get(0).getRow(2).getCell(1).getParagraphs();
        org.apache.poi.xwpf.usermodel.XWPFParagraph line = findPara(ps, "　· 기준 가");
        org.apache.poi.xwpf.usermodel.XWPFRun last = line.getRuns().get(line.getRuns().size() - 1);
        assertEquals("주1)", last.getText(0));
        assertEquals("superscript", last.getCTR().getRPr().getVertAlignArray(0).getVal().toString());
        org.apache.poi.xwpf.usermodel.XWPFParagraph note = findPara(ps, "　　주1) 각주 하나");
        assertEquals("각주 9pt", "18", runSz(note));
        org.apache.poi.xwpf.usermodel.XWPFParagraph plain = findPara(ps, "　· 기준 나");
        assertFalse("각주 없는 줄은 위첨자 없음", plain.getText().contains("주"));
        assertEquals("표 뒤 주석은 번호를 이어받고 들여쓰지 않는다", "주2) 추정치입니다", findPara(ps, "주2)").getText());
    }

    @Test
    public void v3_평가표_칸_범위나_겹침이_어긋나면_IllegalArgumentException이다() {
        JsonNode c = content(BIZ_ROWS, "null");
        set(c, "/tables", "scoring", "{'row_count':2,'col_count':2,'total':null,'source':null,'cells':[{'r':1,'c':1,'rs':2,'cs':1,'text':'x'}]}");
        try {
            InstSummaryDocBuilder.build(c, 3, false);
            fail("범위 밖");
        } catch (IllegalArgumentException expected) {
            // ok
        }
        set(c, "/tables", "scoring", "{'row_count':2,'col_count':2,'total':null,'source':null,'cells':["
                + "{'r':0,'c':0,'rs':2,'cs':1,'text':'x'},{'r':1,'c':0,'rs':1,'cs':1,'text':'y'}]}");
        try {
            InstSummaryDocBuilder.build(c, 3, false);
            fail("겹침");
        } catch (IllegalArgumentException expected) {
            // ok
        }
    }

    // ── 쪽 맞춤(exact 줄 간격·여백·1쪽 단계) ─────────────────────────────

    /** 샘플 1쪽 내용(qa 보고서 3절 견본, 기관장 홍길동). ‘25 는 U+2018 — json() 이 작은따옴표를 바꾸므로. */
    private static JsonNode sampleContent(boolean doubled) {
        String ov = "'한국부동산원(舊 한국감정원)은 1969년 설립된 공공기관으로 부동산 시장의 조사·관리 및 가격공시 업무와 부동산 소비자 권리 보호를 수행',"
                + "'2020년 기관명을 한국부동산원으로 변경하면서 부동산 감정평가 업무를 민간으로 이전'";
        String comp = "'現 주거래 기업은행과 별도 입찰없이 주거래 협약관계를 유지해오고 있으며 이번 입찰은 기관이 진행하는 첫번째 주거래은행 선정',"
                + "'기업은행 외 4대 시중은행과 IM뱅크가 마케팅을 진행중인 것으로 파악되며 최근 타행 제안금리 정보를 감안한 계량부문 제안과 AI 도입 등 시스템 편의성 개선을 위한 차별화된 제안 준비중'";
        String biz = "{'group':'기관 고유사업(A)','sub':'부동산 가격공시','lines':[{'text':'토지가격·단독주택·공동주택가격 공시, 부동산 공시가격 산정시스템 운영','bold':false}]},"
                + "{'group':'기관 고유사업(A)','sub':'부동산 조사·통계','lines':[{'text':'전국지가변동률·전국주택가격동향·공동주택 실거래가격지수 조사 등','bold':false}]},"
                + "{'group':'기관 고유사업(A)','sub':'부동산 시장관리','lines':[{'text':'청약Home, 부동산거래관리시스템(RTMS), 부동산 거래 신고센터 운영','bold':false}]},"
                + "{'group':'기관 고유사업(A)','sub':'부동산 소비자보호','lines':[{'text':'감정평가 결과 타당성 조사, 공동주택관리정보시스템(K-apt) 운영 등','bold':false}]},"
                + "{'group':'정부수탁사업(B)','sub':null,'lines':[{'text':'토지보상, 지장물보상, 영업등보상, 거주자보상, 어업보상금 지급','bold':true}]}";
        String fund = "{'kind':'고유사업','lines':[{'lv':0,'text':'부동산 가격공시 및 조사·통계 사업에 사용하는 예산으로 ‘25년 기준 2,689억원'},"
                + "{'lv':1,'text':'연초 예산을 수입하여 연말까지 목적 사업에 지출하고 잔액은 국고 환입'}]},"
                + "{'kind':'보상사업','lines':[{'lv':0,'text':'토지보상, 지장물보상 등의 목적으로 정부로부터 수탁한 예산으로 ‘25년 기준 2조 3,671억원'},"
                + "{'lv':1,'text':'보상사업별로 MMDA 계좌를 개설하여 각 사업의 종료까지 계좌 유지(사업기간 1~3년)'},"
                + "{'lv':1,'text':'향후 주거래은행이 변경되어도 사업 미종료 계좌는 당행에 지속 예치되어 평잔 유지'}]}";
        String mmda = "{'text':'협약 이후 신규 보상사업 MMDA 개설 자금을 주거래 은행에 예치','note':'기관 추산 연간 평잔 누적 증가액 약 5천억원'},"
                + "{'text':'협약기간(3년) 종료시점 2029년 말까지 평잔이 누적되며 협약이 종료되더라도 사업 미종료 계좌 평잔이 유지되어 이연수익(45억원) 추가 확보 예상',"
                + "'note':'보수적 관점으로 이사회 본원 수익에 미포함(협약만료 시점까지의 수익 90억원 반영)'}";
        if (doubled) {   // 내용이 두 배인 견본 — 같은 줄들을 한 번 더 붙인다
            ov = ov + "," + ov;
            comp = comp + "," + comp;
            biz = biz + "," + biz.replace("(A)", "(C)").replace("(B)", "(D)");
            fund = fund + "," + fund.replace("고유사업'", "고유사업2'").replace("보상사업'", "보상사업2'");
            mmda = mmda + "," + mmda;
        }
        String j = "{'v':1,'form':'INST_SUMMARY','tpl_ver':3,'fields':{"
                + "'inst_name':{'val':'한국부동산원','src':null},'inst_type':{'val':'준시장형 공기업','src':null},'head_name':{'val':'홍길동','src':null},"
                + "'current_bank':{'val':'기업은행','src':null},'bid_kind':{'val':'주거래은행 선정','note':null},'head_title':{'val':'원장','note':null},"
                + "'budget':{'val':'2조 6,360억원','note':null},'staff':{'val':'1,210명','note':null},'supervisor':{'val':'국토교통부','note':null},"
                + "'address':{'val':'대구 동구','note':null},"
                + "'org_note':{'val':'[본사] 6본부 1연구원 19실처 68부단, [지사] 4권역본부 30지사 99부단','note':null}},"
                + "'lists':{'overview':[" + ov + "],'mmda_basis':[" + mmda + "],'competition':[" + comp + "],'effect':[]},"
                + "'tables':{'biz':{'src':null,'dropped':0,'rows':[" + biz + "]},'fund':{'rows':[" + fund + "]},"
                + "'years':{'unit':'억원','from':2027,'to':2031,'end':2029,"
                + "'mmda':{'2027':'5,000','2028':'10,000','2029':'15,000','2030':'10,000','2031':'5,000'},"
                + "'income':{'2027':'15','2028':'30','2029':'45','2030':'30','2031':'15'},"
                + "'notes':['공고일(9.17) 기준 MMDA 제안금리 2.85% 가정 시 예상 마진 0.50% 적용']},"
                + "'scoring':" + sample22x5() + "}}";
        return json(j);
    }

    private static String pgMar(byte[] docx, String attr) throws IOException {
        String xml = part(docx, "word/document.xml");
        int i = xml.indexOf("<w:pgMar");
        String tag = xml.substring(i, xml.indexOf('>', i));
        int a = tag.indexOf(attr + "=\"");
        return tag.substring(a + attr.length() + 2, tag.indexOf('"', a + attr.length() + 2));
    }

    @Test
    public void v3_쪽_여백은_위_아래_850_바닥글_425이고_옛_판은_1134_그대로다() throws Exception {
        byte[] v3 = render(content(BIZ_ROWS, "null"), false);
        assertEquals("850", pgMar(v3, "w:top"));
        assertEquals("850", pgMar(v3, "w:bottom"));
        assertEquals("1134", pgMar(v3, "w:left"));
        assertEquals("1134", pgMar(v3, "w:right"));
        assertEquals("425", pgMar(v3, "w:footer"));
        for (int ver = 1; ver <= 2; ver++) {
            byte[] old = render(content(BIZ_ROWS, "null"), ver, false);
            assertEquals("1134", pgMar(old, "w:top"));
            assertEquals("1134", pgMar(old, "w:bottom"));
            assertEquals("709", pgMar(old, "w:footer"));
            assertFalse("옛 판 " + ver + " 은 줄 간격 지정 없음", part(old, "word/document.xml").contains("w:line="));
        }
    }

    @Test
    public void v3_모든_문단과_표_칸이_exact_줄_간격을_받는다() throws Exception {
        JsonNode c = content(BIZ_ROWS, YEARS_2027_2030);
        set(c, "/tables", "scoring", SCORING);
        XWPFDocument d = read(render(c, false));
        for (org.apache.poi.xwpf.usermodel.XWPFParagraph p : d.getParagraphs()) {
            assertEquals("본문 문단 exact", "exact", p.getCTP().getPPr().getSpacing().getLineRule().toString());
        }
        org.apache.poi.xwpf.usermodel.XWPFParagraph body = findPara(d.getTables().get(0).getRow(0).getCell(1).getParagraphs(), "ㅇ 현황 1");
        assertEquals("exact", body.getCTP().getPPr().getSpacing().getLineRule().toString());
        assertEquals("A 단계 줄 14pt", "280", body.getCTP().getPPr().getSpacing().getLine().toString());
        assertEquals("문단 뒤 간격 0", "0", spacing(body, false));
        for (XWPFTable t : d.getTables()) {
            for (XWPFTableRow r : t.getRows()) {
                for (XWPFTableCell cell : r.getTableCells()) {
                    for (org.apache.poi.xwpf.usermodel.XWPFParagraph p : cell.getParagraphs()) {
                        assertEquals("exact", p.getCTP().getPPr().getSpacing().getLineRule().toString());
                    }
                }
            }
        }
    }

    @Test
    public void v3_샘플_1쪽은_A_또는_B_단계이고_추정_높이가_737_이하이며_내용이_두_배면_C다() {
        double[] fit = InstSummaryDocBuilder.page1Fit(sampleContent(false));
        System.out.println("v3 sample page-1 stage=" + (char) ('A' + (int) fit[0]) + " estimate=" + fit[1] + "pt");
        assertTrue("A 또는 B 단계, 실제 " + fit[0], fit[0] <= 1);
        assertTrue("추정 높이 " + fit[1], fit[1] <= 737);
        double[] twice = InstSummaryDocBuilder.page1Fit(sampleContent(true));
        System.out.println("v3 doubled page-1 stage=" + (char) ('A' + (int) twice[0]) + " estimate=" + twice[1] + "pt");
        assertEquals("두 배 견본은 C", 2, (int) twice[0]);
    }

    @Test
    public void v3_샘플_평가표는_여전히_A_단계이고_줄_간격은_14pt다() throws Exception {
        XWPFTable t = read(render(sampleContent(false), false)).getTables().get(1);
        org.apache.poi.xwpf.usermodel.XWPFParagraph p = t.getRow(1).getCell(2).getParagraphs().get(0);
        assertEquals("20", runSz(p));
        assertEquals("280", p.getCTP().getPPr().getSpacing().getLine().toString());
        assertEquals("exact", p.getCTP().getPPr().getSpacing().getLineRule().toString());
    }

    @Test
    public void v3_평가표_칸_병합_수가_int_최대여도_넘침_없이_IllegalArgumentException이다() {
        JsonNode c = content(BIZ_ROWS, "null");
        set(c, "/tables", "scoring", "{'row_count':2,'col_count':2,'total':null,'source':null,'cells':["
                + "{'r':1,'c':1,'rs':2147483647,'cs':2147483647,'text':'x'}]}");
        try {
            InstSummaryDocBuilder.build(c, 3, false);
            fail("넘침 값");
        } catch (IllegalArgumentException expected) {
            // ok
        }
    }
}
