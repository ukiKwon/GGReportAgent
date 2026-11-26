package com.kbstar.kgi.ggreport.web.docout;

import org.apache.poi.xwpf.usermodel.IBodyElement;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** NEXT 100 S0 — 문서 모델·렌더러 단위 시험(DB·스프링 없음). 구조(XML)만 본다 — Word 에서 보이는 모양은 실물 확인이 필요하다. */
public class DocxKitTest {

    private static DocModel.Cell cell(String t) {
        return DocModel.Cell.text(t);
    }

    @SafeVarargs
    private static DocModel.Table table(int cols, boolean cantSplit, List<DocModel.Cell>... rows) {
        return new DocModel.Table(cols, null, Arrays.asList(rows), 0, cantSplit);
    }

    private static List<DocModel.Cell> row(DocModel.Cell... cells) {
        return Arrays.asList(cells);
    }

    private static XWPFDocument read(byte[] bytes) throws IOException {
        return new XWPFDocument(new ByteArrayInputStream(bytes));
    }

    /** zip 안에서 이름이 prefix 로 시작하는 첫 파일의 글자. 없으면 null. */
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

    private static byte[] render(DocModel.Block... blocks) {
        return DocxKit.render(new DocModel(Arrays.asList(blocks)), null);
    }

    @Test
    public void 겉_표_칸에_안쪽_표를_넣으면_순서가_지켜지고_칸은_문단으로_끝난다() throws Exception {
        DocModel.Table inner = table(2, true, row(cell("a"), cell("b")));
        List<DocModel.Block> content = new ArrayList<DocModel.Block>();
        content.add(DocModel.Para.plain("앞 문단"));
        content.add(inner);   // 칸의 마지막이 표 — 렌더러가 빈 문단을 붙인다
        DocModel.Table outer = table(2, false, row(cell("왼쪽"), DocModel.Cell.of(content)));
        XWPFDocument d = read(render(outer));
        XWPFTableCell c = d.getTables().get(0).getRow(0).getCell(1);
        assertEquals(1, c.getTables().size());
        List<IBodyElement> els = c.getBodyElements();
        assertEquals(3, els.size());
        assertTrue(els.get(0) instanceof XWPFParagraph);
        assertTrue(els.get(1) instanceof XWPFTable);
        assertTrue("칸의 마지막 요소는 문단", els.get(2) instanceof XWPFParagraph);
        assertEquals("앞 문단", ((XWPFParagraph) els.get(0)).getText());
    }

    @Test
    public void 표_속_표_깊이는_2까지다() {
        DocModel.Table l3 = table(1, true, row(cell("c")));
        DocModel.Table l2 = table(1, true, row(DocModel.Cell.of(Collections.<DocModel.Block>singletonList(l3))));
        try {
            table(1, false, row(DocModel.Cell.of(Collections.<DocModel.Block>singletonList(l2))));
            fail("깊이 3 은 거부");
        } catch (IllegalStateException expected) {
            // ok
        }
        // 깊이 2 는 허용
        table(1, false, row(DocModel.Cell.of(Collections.<DocModel.Block>singletonList(l3))));
    }

    @Test
    public void 세로_병합_행_수는_부모_경계를_넘지_않는다() {
        assertArrayEquals(new int[]{2, 0, 1},
                Groups.rowspans(Arrays.asList("X", "X", "Y"), Arrays.asList("a", "a", "a")));
        assertArrayEquals(new int[]{1, 1, 1},
                Groups.rowspans(Arrays.asList("X", "X", "X"), Arrays.asList("a", "b", "a")));
        assertArrayEquals(new int[]{3, 0, 0},
                Groups.rowspans(Arrays.asList("X", "X", "X"), Arrays.asList("a", "a", "a")));
        assertArrayEquals(new int[]{1, 1}, Groups.rowspans(Arrays.<String>asList("X", "X"), Arrays.<String>asList(null, null)));
        assertArrayEquals(new int[0], Groups.rowspans(Collections.<String>emptyList(), Collections.<String>emptyList()));
    }

    @Test
    public void 세로_병합은_첫_칸_restart_이어지는_칸_continue로_나가고_행에서_뺀_칸은_자리를_채운다() throws Exception {
        int[] spans = Groups.rowspans(Arrays.asList("X", "X", "Y"), Arrays.asList("a", "a", "a"));
        // 행: [그룹(2행), 값] [값] [그룹, 값]
        DocModel.Table t = table(2, true,
                row(cell("a").withSpan(1, spans[0]), cell("1")),
                row(cell("2")),
                row(cell("a").withSpan(1, spans[2]), cell("3")));
        String xml = part(render(t), "word/document.xml");
        assertEquals("restart 1번", 1, count(xml, "w:vMerge w:val=\"restart\""));
        assertEquals("continue(값 없음) 1번", 1, count(xml, "<w:vMerge/>"));
        XWPFDocument d = read(render(t));
        assertEquals("세로로 이어진 행에도 tc 가 있다(2칸)", 2, d.getTables().get(0).getRow(1).getTableCells().size());
    }

    @Test
    public void 대분류가_없는_행은_가로로_두_칸을_합친다() throws Exception {
        DocModel.Table t = table(2, true,
                row(cell("전체").withSpan(2, 1)),
                row(cell("l"), cell("r")));
        byte[] b = render(t);
        XWPFDocument d = read(b);
        assertEquals(1, d.getTables().get(0).getRow(0).getTableCells().size());
        assertEquals(2, d.getTables().get(0).getRow(1).getTableCells().size());
        assertTrue(part(b, "word/document.xml").contains("<w:gridSpan w:val=\"2\"/>"));
    }

    @Test
    public void 연도_열은_종료_연도_뒤_칸을_빗금으로_칠하고_종료_연도_머리에_위첨자가_있다() throws Exception {
        int from = 2027;
        int to = 2031;
        int end = 2029;
        int n = Groups.yearColumns(from, to);
        assertEquals(5, n);
        List<DocModel.Cell> head = new ArrayList<DocModel.Cell>();
        List<DocModel.Cell> data = new ArrayList<DocModel.Cell>();
        head.add(DocModel.Cell.header("구분"));
        data.add(cell("MMDA"));
        for (int y = from; y <= to; y++) {
            if (y == end) {
                head.add(new DocModel.Cell(Collections.<DocModel.Block>singletonList(
                        DocModel.Para.of(DocModel.Bullet.NONE, 0, DocModel.Run.bold(String.valueOf(y)), DocModel.Run.sup("협약 종료"))),
                        1, 1, true, DocModel.Shade.HEADER, DocModel.Align.CENTER));
            } else {
                head.add(DocModel.Cell.header(String.valueOf(y)));
            }
            data.add(cell("1").withShade(y > end ? DocModel.Shade.HATCH : DocModel.Shade.NONE));
        }
        byte[] b = render(new DocModel.Table(1 + n, null, Arrays.asList(head, data), 1, true));
        XWPFDocument d = read(b);
        assertEquals("구분 + 연도 5열", 6, d.getTables().get(0).getRow(0).getTableCells().size());
        String xml = part(b, "word/document.xml");
        assertEquals("2030·2031 칸만 빗금", 2, count(xml, "w:val=\"thinDiagStripe\""));
        assertEquals("종료 연도 머리의 위첨자", 1, count(xml, "<w:vertAlign w:val=\"superscript\"/>"));
        assertEquals("머리 행만 tblHeader", 1, count(xml, "<w:tblHeader/>"));
    }

    @Test
    public void 연도_열이_열_개를_넘으면_IllegalArgumentException이다_400_변환은_호출부_몫() {
        assertEquals(10, Groups.yearColumns(2027, 2036));
        try {
            Groups.yearColumns(2027, 2037);   // 11열
            fail();
        } catch (IllegalArgumentException e) {
            assertTrue(e.getMessage(), e.getMessage().contains("1~10"));
        }
        try {
            Groups.yearColumns(2030, 2029);   // 거꾸로
            fail();
        } catch (IllegalArgumentException e) {
            assertTrue(e.getMessage(), e.getMessage().contains("1~10"));
        }
    }

    @Test
    public void 양방향_제어_문자는_빼고_글자_순서를_뒤집지_못한다() throws Exception {
        // RLO(202E)·LRI(2066)·PDI(2069)·ALM(061C)·LRM/RLM(200E·200F) — 본문에 그대로 두면 Word 가 표시 순서를 뒤집는다
        // 보이지 않는 문자를 소스에 글자로 적지 않고 숫자로 적는다
        String rlo = String.valueOf((char) 0x202E);
        String lri = String.valueOf((char) 0x2066);
        byte[] b = render(DocModel.Para.plain("가" + rlo + "나" + lri + "다" + (char) 0x2069 + "라" + (char) 0x061C + "마"
                + (char) 0x200E + "바" + (char) 0x200F + "사"));
        assertEquals("가나다라마바사", read(b).getParagraphs().get(0).getText());
        String xml = part(b, "word/document.xml");
        assertFalse(xml.contains(rlo));
        assertFalse(xml.contains(lri));
        assertEquals("가나다", DocxKit.clean("가" + (char) 0x202B + "나" + (char) 0x2067 + "다"));
    }

    @Test
    public void 특수문자는_일반_글자로_들어가고_필드와_하이퍼링크는_본문에_없다() throws Exception {
        DocModel.Table t = table(1, false, row(cell("<&\"")));
        byte[] b = render(new DocModel.Heading("제목 <b>", 14), t,
                DocModel.Para.plain("http://example.com/x?a=1&b=2"));
        String xml = part(b, "word/document.xml");
        assertTrue(xml.contains("&lt;&amp;"));
        assertFalse(xml.contains("fldSimple"));
        assertFalse(xml.contains("hyperlink"));
        assertFalse(xml.contains("instrText"));
        XWPFDocument d = read(b);
        assertEquals("<&\"", d.getTables().get(0).getRow(0).getCell(0).getText());
    }

    @Test
    public void 제어_문자는_빼고_렌더링이_깨지지_않는다() throws Exception {
        byte[] b = render(DocModel.Para.plain("a\u0001b\u0000c\ud800d"));
        assertEquals("abcd", read(b).getParagraphs().get(0).getText());
    }

    @Test
    public void 겉_표에는_cantSplit이_없고_작은_표에는_있다() throws Exception {
        String open = part(render(table(1, false, row(cell("x")))), "word/document.xml");
        assertEquals(0, count(open, "cantSplit"));
        String closed = part(render(table(1, true, row(cell("x")))), "word/document.xml");
        assertEquals(1, count(closed, "cantSplit"));
    }

    @Test
    public void 한글_글꼴이_맑은_고딕이고_용지는_A4다() throws Exception {
        String xml = part(render(DocModel.Para.plain("가")), "word/document.xml");
        assertTrue(xml.contains("w:eastAsia=\"맑은 고딕\""));
        assertTrue(xml.contains("w:w=\"11906\""));
        assertTrue(xml.contains("w:h=\"16838\""));
    }

    @Test
    public void 바닥글에_쪽_번호_필드가_들어간다() throws Exception {
        byte[] b = DocxKit.render(new DocModel(Collections.<DocModel.Block>singletonList(DocModel.Para.plain("본문"))),
                DocxKit.Footer.pageNumberOnly());
        String footer = part(b, "word/footer");
        assertTrue("바닥글 파일이 있어야 한다", footer != null);
        assertTrue(footer.contains("fldSimple"));
        assertTrue(footer.contains("PAGE"));
        assertFalse("본문에는 필드 없음", part(b, "word/document.xml").contains("fldSimple"));
    }

    @Test
    public void 줄_간격을_지정하면_exact_line이_기록되고_지정하지_않으면_line_속성이_없다() throws Exception {
        String plain = part(render(DocModel.Para.plain("가"), table(1, true, row(cell("x")))), "word/document.xml");
        assertFalse("미지정은 line 없음", plain.contains("w:line="));
        assertFalse(plain.contains("w:lineRule"));
        DocModel.Para exact = DocModel.Para.plain("나").withSpacing(0, 0).withLineSpacing(12.5);
        String xml = part(render(exact), "word/document.xml");
        assertTrue(xml.contains("w:line=\"250\""));
        assertTrue(xml.contains("w:lineRule=\"exact\""));
        assertTrue("앞뒤 간격과 함께", xml.contains("w:before=\"0\"") && xml.contains("w:after=\"0\""));
        String head = part(render(new DocModel.Heading("제목", 14).withLineSpacing(18)), "word/document.xml");
        assertTrue(head.contains("w:line=\"360\"") && head.contains("w:lineRule=\"exact\""));
        try {
            DocModel.Para.plain("x").withLineSpacing(12.3);
            fail("0.5pt 단위만");
        } catch (IllegalArgumentException expected) {
            // ok
        }
    }

    @Test
    public void 간격용_문단은_모델이_정했을_때만_exact_줄_높이를_받는다() throws Exception {
        DocModel.Table t = table(1, true, row(cell("x")));
        String def = part(render(t), "word/document.xml");
        assertFalse("기본은 간격용 문단에도 line 없음", def.contains("w:line="));
        String tight = part(DocxKit.render(new DocModel(Arrays.<DocModel.Block>asList(t, new DocModel.PageBreak())).withSpacerLine(3), null),
                "word/document.xml");
        assertTrue(tight.contains("w:line=\"60\""));
        assertTrue(tight.contains("w:lineRule=\"exact\""));
    }

    @Test
    public void 쪽_여백은_기본_1134이고_PageMargins를_주면_그_값이다() throws Exception {
        DocModel m = new DocModel(Collections.<DocModel.Block>singletonList(DocModel.Para.plain("가")));
        String def = part(DocxKit.render(m, null), "word/document.xml");
        assertTrue(def.contains("w:top=\"1134\"") && def.contains("w:bottom=\"1134\"") && def.contains("w:left=\"1134\"") && def.contains("w:right=\"1134\""));
        assertTrue(def.contains("w:header=\"709\"") && def.contains("w:footer=\"709\""));
        String custom = part(DocxKit.render(m, null, new DocxKit.PageMargins(850, 800, 1000, 1100, 600, 425)), "word/document.xml");
        assertTrue(custom.contains("w:top=\"850\"") && custom.contains("w:bottom=\"800\"") && custom.contains("w:left=\"1000\"")
                && custom.contains("w:right=\"1100\"") && custom.contains("w:header=\"600\"") && custom.contains("w:footer=\"425\""));
        String viaModel = part(DocxKit.render(m.withPageMargins(new DocxKit.PageMargins(850, 850, 1134, 1134, 709, 425)), null), "word/document.xml");
        assertTrue(viaModel.contains("w:top=\"850\"") && viaModel.contains("w:footer=\"425\""));
    }

    @Test
    public void 칸_세로_맞춤은_지정이_우선이고_미지정이면_머리_칸만_가운데다() throws Exception {
        DocModel.Cell centered = cell("a").withVAlign(DocModel.VAlign.CENTER);
        DocModel.Cell topHeader = DocModel.Cell.header("b").withVAlign(DocModel.VAlign.TOP);
        XWPFTable t = read(render(table(4, true, row(centered, topHeader, DocModel.Cell.header("c"), cell("d"))))).getTables().get(0);
        assertEquals("center", t.getRow(0).getCell(0).getCTTc().getTcPr().getVAlign().getVal().toString());
        assertEquals("top", t.getRow(0).getCell(1).getCTTc().getTcPr().getVAlign().getVal().toString());
        assertEquals("center", t.getRow(0).getCell(2).getCTTc().getTcPr().getVAlign().getVal().toString());
        assertEquals("top", t.getRow(0).getCell(3).getCTTc().getTcPr().getVAlign().getVal().toString());
    }

    @Test
    public void 격자_검증_겹침_열_초과_덜_채운_행은_거부한다() {
        try {
            table(2, true, row(cell("a").withSpan(3, 1)));
            fail("열 초과");
        } catch (IllegalStateException expected) {
            // ok
        }
        try {
            table(2, true, row(cell("a")));   // 두 번째 칸이 비었다
            fail("빈 칸");
        } catch (IllegalStateException expected) {
            // ok
        }
        try {
            table(2, true, row(cell("a").withSpan(1, 3), cell("b")), row(cell("c"), cell("d")));   // 행 초과
            fail("행 초과");
        } catch (IllegalStateException expected) {
            // ok
        }
        try {
            // 첫 행의 세로 병합 자리에 둘째 행이 칸을 2개 넣어 겹친다
            table(2, true, row(cell("a").withSpan(1, 2), cell("b")), row(cell("c"), cell("d")));
            fail("겹침");
        } catch (IllegalStateException expected) {
            // ok
        }
    }
}
