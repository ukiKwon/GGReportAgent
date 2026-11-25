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
