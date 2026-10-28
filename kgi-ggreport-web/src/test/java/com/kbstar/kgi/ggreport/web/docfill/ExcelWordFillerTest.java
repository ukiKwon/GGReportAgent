package com.kbstar.kgi.ggreport.web.docfill;

import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.wp.usermodel.HeaderFooterType;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFHyperlinkRun;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.xmlbeans.XmlCursor;
import org.junit.Test;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTcPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STMerge;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigInteger;
import java.util.Arrays;
import java.util.Date;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * 엑셀 → 워드 자동 기입의 <b>타당성 스파이크</b>(P3). 직접 만든 샘플로 위험 항목을 하나씩 눌러 본다.
 * 실제 양식의 특이점은 샘플이 없어 검증하지 못한다 — 여기 통과가 실양식 통과의 증명은 아니다.
 *
 * <p>검증 항목: ① run 쪼개짐 ② 병합 셀·중첩 표·키워드 중복 ③ 수식·숫자/날짜 서식 ④ 서식 유지
 * ⑤ 재실행 안전·덮어쓰기 보호 ⑥ 못 하는 것은 조용히 넘어가지 않고 보고.
 */
public class ExcelWordFillerTest {

    // ── 도구 ──────────────────────────────────────────────────────────────

    private static final class Result {
        final FillReport report;
        final XWPFDocument doc;
        final byte[] docBytes;

        Result(FillReport report, XWPFDocument doc, byte[] docBytes) {
            this.report = report;
            this.doc = doc;
            this.docBytes = docBytes;
        }
    }

    private static byte[] bytes(XWPFDocument d) throws IOException {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        d.write(o);
        return o.toByteArray();
    }

    private static byte[] bytes(Workbook w) throws IOException {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        w.write(o);
        return o.toByteArray();
    }

    private static Result run(Workbook x, XWPFDocument d, FillRule... rules) throws IOException {
        return run(bytes(x), bytes(d), rules);
    }

    private static Result run(byte[] xlsx, byte[] docx, FillRule... rules) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        FillReport report = ExcelWordFiller.fill(new ByteArrayInputStream(xlsx),
                new ByteArrayInputStream(docx), Arrays.asList(rules), out);
        byte[] result = out.toByteArray();
        return new Result(report, new XWPFDocument(new ByteArrayInputStream(result)), result);
    }

    private static XSSFWorkbook sheet(String... cells) {
        // "B1=노원구" 형식
        XSSFWorkbook wb = new XSSFWorkbook();
        Sheet s = wb.createSheet("Sheet1");
        for (String c : cells) put(s, c.substring(0, c.indexOf('=')), c.substring(c.indexOf('=') + 1));
        return wb;
    }

    private static void put(Sheet s, String addr, String text) {
        org.apache.poi.ss.util.CellReference ref = new org.apache.poi.ss.util.CellReference(addr);
        Row row = s.getRow(ref.getRow()) != null ? s.getRow(ref.getRow()) : s.createRow(ref.getRow());
        row.createCell(ref.getCol()).setCellValue(text);
    }

    private static XWPFParagraph para(XWPFDocument d, String... runTexts) {
        XWPFParagraph p = d.createParagraph();
        for (String t : runTexts) p.createRun().setText(t);
        return p;
    }

    private static XWPFTable labelTable(XWPFDocument d, String... labels) {
        XWPFTable t = d.createTable(labels.length, 2);
        for (int i = 0; i < labels.length; i++) t.getRow(i).getCell(0).setText(labels[i]);
        return t;
    }

    private static String cellText(XWPFDocument d, int table, int row, int col) {
        return d.getTables().get(table).getRow(row).getCell(col).getText();
    }

    private static String bodyText(XWPFDocument d, int paragraph) {
        return d.getParagraphs().get(paragraph).getText();
    }

    // ── ① 표의 라벨 칸 → 오른쪽 칸 ────────────────────────────────────────

    @Test
    public void 표의_라벨_칸이면_오른쪽_칸에_적는다() throws Exception {
        XWPFDocument d = new XWPFDocument();
        labelTable(d, "기관명", "사업명");
        Result r = run(sheet("B1=노원구", "B2=구금고 지정"), d,
                FillRule.cell("기관명", null, "B1"), FillRule.cell("사업명", null, "B2"));
        assertEquals("노원구", cellText(r.doc, 0, 0, 1));
        assertEquals("구금고 지정", cellText(r.doc, 0, 1, 1));
        assertTrue(r.report.toString(), r.report.allOk());
        assertEquals("라벨 칸은 그대로", "기관명", cellText(r.doc, 0, 0, 0));
    }

    @Test
    public void 라벨에_콜론이_붙어_있어도_오른쪽_칸에_적는다() throws Exception {
        XWPFDocument d = new XWPFDocument();
        labelTable(d, "사업명 :");
        Result r = run(sheet("A1=X"), d, FillRule.cell("사업명", null, "A1"));
        assertEquals("X", cellText(r.doc, 0, 0, 1));
        assertEquals("사업명 :", cellText(r.doc, 0, 0, 0));
    }

    // ── ② 문단 안 — 키워드 바로 뒤 ────────────────────────────────────────

    @Test
    public void 문단의_콜론_뒤에_적고_서식을_물려받는다() throws Exception {
        XWPFDocument d = new XWPFDocument();
        XWPFParagraph p = d.createParagraph();
        XWPFRun label = p.createRun();
        label.setText("사업명:");
        label.setBold(true);
        label.setFontSize(14);
        Result r = run(sheet("A1=구금고 지정"), d, FillRule.cell("사업명", null, "A1"));
        assertEquals("사업명: 구금고 지정", bodyText(r.doc, 0));
        XWPFRun value = r.doc.getParagraphs().get(0).getRuns().get(1);
        assertTrue("서식(굵게)을 물려받는다", value.isBold());
        assertEquals(14, value.getFontSize());
    }

    @Test
    public void 콜론이_없는_문장_속_키워드_바로_뒤에_끼워_넣는다() throws Exception {
        XWPFDocument d = new XWPFDocument();
        para(d, "본 제안은 기관명 대상으로 합니다.");
        Result r = run(sheet("A1=노원구"), d, FillRule.cell("기관명", null, "A1"));
        assertEquals("본 제안은 기관명 노원구 대상으로 합니다.", bodyText(r.doc, 0));
    }

    // ── ① Word가 글을 쪼갠 경우 ───────────────────────────────────────────

    @Test
    public void 키워드가_여러_run으로_쪼개져_있어도_찾는다() throws Exception {
        XWPFDocument d = new XWPFDocument();
        XWPFParagraph p = d.createParagraph();
        XWPFRun a = p.createRun();
        a.setText("사업");
        XWPFRun b = p.createRun();
        b.setText("명");
        b.setItalic(true);                       // 서식이 달라 Word가 실제로 이렇게 쪼갠다
        XWPFRun c = p.createRun();
        c.setText(":");
        Result r = run(sheet("A1=구금고 지정"), d, FillRule.cell("사업명", null, "A1"));
        assertEquals("사업명: 구금고 지정", bodyText(r.doc, 0));
        List<XWPFRun> runs = r.doc.getParagraphs().get(0).getRuns();
        assertEquals("원래 run은 그대로", "사업", runs.get(0).text());
        assertEquals("명", runs.get(1).text());
        assertTrue(runs.get(1).isItalic());
        assertEquals(":", runs.get(2).text());
    }

    @Test
    public void run_한가운데에_삽입하면_둘로_갈라_서식을_양쪽에_유지한다() throws Exception {
        XWPFDocument d = new XWPFDocument();
        XWPFParagraph p = d.createParagraph();
        XWPFRun one = p.createRun();
        one.setText("계약금액 및 기간");
        one.setFontFamily("맑은 고딕");
        one.setFontSize(11);
        Result r = run(sheet("A1=1,234원"), d, FillRule.cell("계약금액", null, "A1"));
        assertEquals("계약금액 1,234원 및 기간", bodyText(r.doc, 0));
        for (XWPFRun x : r.doc.getParagraphs().get(0).getRuns()) {
            assertEquals("가른 조각마다 같은 글꼴", "맑은 고딕", x.getFontFamily());
            assertEquals(11, x.getFontSize());
        }
    }

    // ── ② 중복·병합·중첩 ──────────────────────────────────────────────────

    @Test
    public void 같은_키워드가_여러_번이면_기본은_전부_FIRST면_첫_곳만() throws Exception {
        XWPFDocument d = new XWPFDocument();
        para(d, "기관명:");
        para(d, "기관명:");
        Result all = run(sheet("A1=노원구"), d, FillRule.cell("기관명", null, "A1"));
        assertEquals("기관명: 노원구", bodyText(all.doc, 0));
        assertEquals("기관명: 노원구", bodyText(all.doc, 1));
        assertEquals(2, all.report.of("기관명").filledCount());

        Result first = run(bytes(sheet("A1=노원구")), bytes(d),
                FillRule.cell("기관명", null, "A1").occurrence(FillRule.Occurrence.FIRST));
        assertEquals("기관명: 노원구", bodyText(first.doc, 0));
        assertEquals("두 번째는 그대로", "기관명:", bodyText(first.doc, 1));
        assertEquals(1, first.report.of("기관명").filledCount());
    }

    @Test
    public void 가로_병합된_라벨_칸도_다음_칸에_적는다() throws Exception {
        XWPFDocument d = new XWPFDocument();
        XWPFTable t = d.createTable(1, 3);
        t.getRow(0).getCell(0).setText("기관명");
        CTTcPr pr = t.getRow(0).getCell(0).getCTTc().addNewTcPr();
        pr.addNewGridSpan().setVal(BigInteger.valueOf(2));
        Result r = run(sheet("A1=노원구"), d, FillRule.cell("기관명", null, "A1"));
        assertEquals("노원구", cellText(r.doc, 0, 0, 1));
        assertEquals("", cellText(r.doc, 0, 0, 2));
    }

    @Test
    public void 오른쪽이_세로_병합의_이어짐_칸이면_병합_시작_칸에_적는다() throws Exception {
        XWPFDocument d = new XWPFDocument();
        XWPFTable t = d.createTable(3, 2);
        t.getRow(0).getCell(0).setText("구분");
        t.getRow(1).getCell(0).setText("담당자");
        t.getRow(2).getCell(0).setText("연락처");
        t.getRow(0).getCell(1).getCTTc().addNewTcPr().addNewVMerge().setVal(STMerge.RESTART);
        t.getRow(1).getCell(1).getCTTc().addNewTcPr().addNewVMerge();     // 이어짐
        t.getRow(2).getCell(1).getCTTc().addNewTcPr().addNewVMerge();
        Result r = run(sheet("A1=홍길동"), d, FillRule.cell("담당자", null, "A1"));
        assertEquals("홍길동", cellText(r.doc, 0, 0, 1));
        assertEquals("", cellText(r.doc, 0, 1, 1));
        assertTrue(r.report.of("담당자").warnings().toString(), !r.report.of("담당자").warnings().isEmpty());
    }

    @Test
    public void 중첩_표_안의_라벨도_찾는다() throws Exception {
        XWPFDocument d = new XWPFDocument();
        XWPFTable outer = d.createTable(1, 1);
        XWPFTableCell host = outer.getRow(0).getCell(0);
        XmlCursor cur = host.getParagraphs().get(0).getCTP().newCursor();
        XWPFTable inner = host.insertNewTbl(cur);
        assertNotNull(inner);
        org.apache.poi.xwpf.usermodel.XWPFTableRow irow = inner.createRow();
        while (irow.getTableCells().size() < 2) irow.addNewTableCell();
        irow.getCell(0).setText("기관명");
        Result r = run(sheet("A1=노원구"), d, FillRule.cell("기관명", null, "A1"));
        XWPFTable got = r.doc.getTables().get(0).getRow(0).getCell(0).getTables().get(0);
        assertEquals("노원구", got.getRow(0).getCell(1).getText());
    }

    @Test
    public void 머리글과_바닥글의_키워드도_채운다() throws Exception {
        XWPFDocument d = new XWPFDocument();
        d.createParagraph().createRun().setText("본문");
        d.createHeader(HeaderFooterType.DEFAULT).createParagraph().createRun().setText("문서번호:");
        Result r = run(sheet("A1=2026-001"), d, FillRule.cell("문서번호", null, "A1"));
        assertEquals("문서번호: 2026-001", r.doc.getHeaderList().get(0).getParagraphs().get(0).getText());
    }

    // ── ③ 엑셀 값: 서식·수식·병합 ─────────────────────────────────────────

    @Test
    public void 엑셀에_보이는_그대로의_글자를_쓴다() throws Exception {
        XSSFWorkbook wb = new XSSFWorkbook();
        Sheet s = wb.createSheet("Sheet1");
        Row row = s.createRow(0);
        CellStyle money = wb.createCellStyle();
        money.setDataFormat(wb.getCreationHelper().createDataFormat().getFormat("#,##0"));
        row.createCell(0).setCellValue(1234567);
        row.getCell(0).setCellStyle(money);
        CellStyle date = wb.createCellStyle();
        date.setDataFormat(wb.getCreationHelper().createDataFormat().getFormat("yyyy-mm-dd"));
        row.createCell(1).setCellValue(new Date(1793000000000L));
        row.getCell(1).setCellStyle(date);
        CellStyle pct = wb.createCellStyle();
        pct.setDataFormat(wb.getCreationHelper().createDataFormat().getFormat("0.0%"));
        row.createCell(2).setCellValue(0.256);
        row.getCell(2).setCellStyle(pct);
        row.createCell(3).setCellValue("00123");                        // 앞자리 0이 있는 문자열
        row.createCell(4).setCellFormula("SUM(A1,1)");                  // 수식
        row.getCell(4).setCellStyle(money);

        XWPFDocument d = new XWPFDocument();
        labelTable(d, "금액", "일자", "비율", "코드", "합계");
        Result r = run(wb, d,
                FillRule.cell("금액", null, "A1"), FillRule.cell("일자", null, "B1"),
                FillRule.cell("비율", null, "C1"), FillRule.cell("코드", null, "D1"),
                FillRule.cell("합계", null, "E1"));
        assertEquals("1,234,567", cellText(r.doc, 0, 0, 1));
        assertEquals("2026-10-26", cellText(r.doc, 0, 1, 1));   // UTC 기준 1793000000s
        assertEquals("25.6%", cellText(r.doc, 0, 2, 1));
        assertEquals("00123", cellText(r.doc, 0, 3, 1));
        assertEquals("수식은 계산한 값", "1,234,568", cellText(r.doc, 0, 4, 1));
    }

    @Test
    public void 병합_셀_안쪽_주소를_줘도_병합의_값을_쓴다() throws Exception {
        XSSFWorkbook wb = sheet("A1=병합값");
        wb.getSheetAt(0).addMergedRegion(new CellRangeAddress(0, 1, 0, 2));
        XWPFDocument d = new XWPFDocument();
        labelTable(d, "항목");
        Result r = run(wb, d, FillRule.cell("항목", null, "C2"));
        assertEquals("병합값", cellText(r.doc, 0, 0, 1));
    }

    @Test
    public void 머리글과_키로_행을_찾는다() throws Exception {
        XSSFWorkbook wb = new XSSFWorkbook();
        Sheet s = wb.createSheet("계약");
        put(s, "A1", "기관명");
        put(s, "B1", "계약금액");
        put(s, "A2", "노원구");
        put(s, "B2", "1억");
        put(s, "A3", "도봉구");
        put(s, "B3", "2억");
        XWPFDocument d = new XWPFDocument();
        labelTable(d, "계약금액");
        Result r = run(wb, d, FillRule.lookup("계약금액", "계약", 1, "계약금액", "기관명", "도봉구"));
        assertEquals("2억", cellText(r.doc, 0, 0, 1));
    }

    private static String shown(String format, Object value, boolean formula) throws Exception {
        XSSFWorkbook wb = new XSSFWorkbook();
        Sheet sh = wb.createSheet("S");
        CellStyle st = wb.createCellStyle();
        st.setDataFormat(wb.getCreationHelper().createDataFormat().getFormat(format));
        org.apache.poi.ss.usermodel.Cell c = sh.createRow(0).createCell(0);
        if (formula) c.setCellFormula((String) value);
        else if (value instanceof java.time.LocalDateTime) c.setCellValue((java.time.LocalDateTime) value);
        else c.setCellValue((java.time.LocalDate) value);
        c.setCellStyle(st);
        ExcelSource src = ExcelSource.open(new ByteArrayInputStream(bytes(wb)));
        try {
            return src.valueAt(null, "A1").value;
        } finally {
            src.close();
        }
    }

    @Test
    public void 한글이_든_날짜_서식도_보이는_그대로_읽는다() throws Exception {
        // ⚠️ 실측된 POI 결함: DataFormatter는 서식에 한글이 있으면 날짜로 인식 못 하고 46323.0을 낸다.
        java.time.LocalDate d = java.time.LocalDate.of(2026, 10, 28);
        assertEquals("2026년 10월 28일", shown("yyyy\"년\" m\"월\" d\"일\"", d, false));
        assertEquals("2026년 10월 28일", shown("yyyy\"년\" m\"월\" d\"일\"", "DATE(2026,10,28)", true));
        assertEquals("2026년 10월 08일", shown("yyyy\"년\" mm\"월\" dd\"일\"", java.time.LocalDate.of(2026, 10, 8), false));
        assertEquals("2026년 10월 28일", shown("yyyy\\년 m\\월 d\\일", d, false));
        assertEquals("2026년 10월 28일", shown("[$-412]yyyy\"년\" m\"월\" d\"일\"", d, false));
        assertEquals("26.10.28", shown("yy.mm.dd", d, false));                     // ASCII는 POI 그대로
        assertEquals("2026-10-28", shown("yyyy-mm-dd", d, false));
        // 시각: h 뒤의 m은 '분'이다
        assertEquals("14시 05분", shown("h\"시\" mm\"분\"", java.time.LocalDateTime.of(2026, 10, 28, 14, 5), false));
        assertEquals("2026-10-28 14:05", shown("yyyy-mm-dd hh:mm", java.time.LocalDateTime.of(2026, 10, 28, 14, 5), false));
    }

    @Test
    public void 한글_날짜_변환기_판정() {
        assertTrue(ExcelDateFormat.isNonAsciiDateFormat("yyyy\"년\" m\"월\" d\"일\""));
        assertFalse("ASCII뿐이면 POI에 맡긴다", ExcelDateFormat.isNonAsciiDateFormat("yyyy-mm-dd"));
        assertFalse("숫자 서식은 날짜가 아니다", ExcelDateFormat.isNonAsciiDateFormat("#,##0\"원\""));
        assertFalse("General", ExcelDateFormat.isNonAsciiDateFormat("General"));
        assertFalse(ExcelDateFormat.isNonAsciiDateFormat(null));
        assertEquals("yyyy'년' M'월' d'일'", ExcelDateFormat.toJavaPattern("yyyy\"년\" m\"월\" d\"일\""));
    }

    // ── ⑤ 재실행 안전·보호 ────────────────────────────────────────────────

    @Test
    public void 두_번_돌려도_같은_결과다() throws Exception {
        XWPFDocument d = new XWPFDocument();
        labelTable(d, "기관명");
        para(d, "사업명: ");
        byte[] x = bytes(sheet("A1=노원구", "A2=구금고"));
        FillRule[] rules = {FillRule.cell("기관명", null, "A1"), FillRule.cell("사업명", null, "A2")};
        Result once = run(x, bytes(d), rules);
        Result twice = run(x, once.docBytes, rules);
        assertEquals("노원구", cellText(twice.doc, 0, 0, 1));
        assertEquals("사업명: 구금고", bodyText(twice.doc, 0).trim());
        assertEquals(FillReport.Status.ALREADY_FILLED, twice.report.of("기관명").status());
        assertEquals(FillReport.Status.ALREADY_FILLED, twice.report.of("사업명").status());
    }

    @Test
    public void 오른쪽_칸에_다른_내용이_있으면_덮어쓰지_않고_충돌로_보고한다() throws Exception {
        XWPFDocument d = new XWPFDocument();
        XWPFTable t = labelTable(d, "기관명");
        t.getRow(0).getCell(1).setText("기존값");
        byte[] x = bytes(sheet("A1=노원구"));
        Result keep = run(x, bytes(d), FillRule.cell("기관명", null, "A1"));
        assertEquals("기존값", cellText(keep.doc, 0, 0, 1));
        assertEquals(FillReport.Status.CONFLICT, keep.report.of("기관명").status());
        assertFalse(keep.report.allOk());

        Result over = run(x, bytes(d), FillRule.cell("기관명", null, "A1").overwrite(true));
        assertEquals("노원구", cellText(over.doc, 0, 0, 1));
    }

    @Test
    public void 이미_적힌_문단의_콜론_뒤_내용은_덮어쓰지_않는다() throws Exception {
        XWPFDocument d = new XWPFDocument();
        para(d, "사업명: 이전 사업");
        Result r = run(sheet("A1=새 사업"), d, FillRule.cell("사업명", null, "A1"));
        assertEquals("사업명: 이전 사업", bodyText(r.doc, 0));
        assertEquals(FillReport.Status.CONFLICT, r.report.of("사업명").status());
    }

    @Test
    public void 값_안에_키워드가_있어도_연쇄로_채우지_않는다() throws Exception {
        XWPFDocument d = new XWPFDocument();
        labelTable(d, "기관명");
        Result r = run(sheet("A1=기관명 개선"), d, FillRule.cell("기관명", null, "A1"));
        assertEquals("기관명 개선", cellText(r.doc, 0, 0, 1));
        assertEquals(1, r.report.of("기관명").filledCount());
    }

    @Test
    public void 여러_줄_값은_줄바꿈으로_적는다() throws Exception {
        XWPFDocument d = new XWPFDocument();
        labelTable(d, "주소");
        Result r = run(sheet("A1=서울시\n노원구"), d, FillRule.cell("주소", null, "A1"));
        assertEquals("서울시\n노원구", cellText(r.doc, 0, 0, 1));
    }

    @Test
    public void 짧은_키워드는_더_긴_단어_안에서도_걸린다_labelOnly로_막는다() throws Exception {
        // ⚠️ 알려진 위험: 문단 안에서는 글자 그대로(부분 문자열) 찾는다. 한국어는 조사가 붙어
        // 단어 경계를 믿을 수 없다. "기관명"은 "수요기관명"에도 걸린다.
        XWPFDocument d = new XWPFDocument();
        para(d, "수요기관명 안내");
        labelTable(d, "기관명");
        byte[] x = bytes(sheet("A1=노원구"));

        Result loose = run(x, bytes(d), FillRule.cell("기관명", null, "A1"));
        assertEquals("엉뚱한 곳에도 들어간다", "수요기관명 노원구 안내", bodyText(loose.doc, 0));
        assertEquals(2, loose.report.of("기관명").filledCount());

        Result strict = run(x, bytes(d), FillRule.cell("기관명", null, "A1").labelOnly(true));
        assertEquals("수요기관명 안내", bodyText(strict.doc, 0));
        assertEquals("노원구", cellText(strict.doc, 0, 0, 1));
        assertEquals(1, strict.report.of("기관명").filledCount());
    }

    @Test
    public void labelOnly는_콜론_꼴_문단도_채운다() throws Exception {
        XWPFDocument d = new XWPFDocument();
        para(d, "기관명 : ");
        para(d, "기관명에 대한 설명");
        Result r = run(sheet("A1=노원구"), d, FillRule.cell("기관명", null, "A1").labelOnly(true));
        assertEquals("기관명 : 노원구", bodyText(r.doc, 0).trim());
        assertEquals("기관명에 대한 설명", bodyText(r.doc, 1));
    }

    // ── ⑥ 못 하는 것은 조용히 넘어가지 않는다 ─────────────────────────────

    @Test
    public void 키워드가_없으면_보고하고_문서는_그대로다() throws Exception {
        XWPFDocument d = new XWPFDocument();
        para(d, "아무 내용");
        Result r = run(sheet("A1=X"), d, FillRule.cell("없는키워드", null, "A1"));
        assertEquals(FillReport.Status.KEYWORD_NOT_FOUND, r.report.of("없는키워드").status());
        assertEquals("아무 내용", bodyText(r.doc, 0));
    }

    @Test
    public void 엑셀_값을_못_가져오면_문서를_건드리지_않고_이유를_보고한다() throws Exception {
        XSSFWorkbook wb = sheet("A1=값");
        wb.getSheetAt(0).createRow(5).createCell(0).setCellFormula("1/0");
        XWPFDocument d = new XWPFDocument();
        labelTable(d, "가", "나", "다", "라");
        Result r = run(wb, d,
                FillRule.cell("가", "없는시트", "A1"),
                FillRule.cell("나", null, "Z99"),            // 빈 셀
                FillRule.cell("다", null, "A6"),             // #DIV/0!
                FillRule.lookup("라", null, 1, "없는머리글", "가", "x"));
        for (String k : new String[]{"가", "나", "다", "라"}) {
            assertEquals(k, FillReport.Status.SOURCE_PROBLEM, r.report.of(k).status());
        }
        assertTrue(r.report.of("다").sourceProblem().contains("오류값"));
        assertEquals("", cellText(r.doc, 0, 2, 1));
    }

    @Test
    public void 조건에_맞는_행이_둘이면_고르지_않고_문제로_보고한다() throws Exception {
        XSSFWorkbook wb = new XSSFWorkbook();
        Sheet s = wb.createSheet("S");
        put(s, "A1", "기관명");
        put(s, "B1", "금액");
        put(s, "A2", "동명구");
        put(s, "B2", "1");
        put(s, "A3", "동명구");
        put(s, "B3", "2");
        XWPFDocument d = new XWPFDocument();
        labelTable(d, "금액");
        Result r = run(wb, d, FillRule.lookup("금액", null, 1, "금액", "기관명", "동명구"));
        assertEquals(FillReport.Status.SOURCE_PROBLEM, r.report.of("금액").status());
        assertEquals("", cellText(r.doc, 0, 0, 1));
    }

    @Test
    public void 하이퍼링크_안의_키워드는_추측하지_않고_미지원으로_보고한다() throws Exception {
        XWPFDocument d = new XWPFDocument();
        XWPFParagraph p = d.createParagraph();
        XWPFHyperlinkRun h = p.createHyperlinkRun("https://example.com");
        h.setText("사업명");
        Result r = run(sheet("A1=X"), d, FillRule.cell("사업명", null, "A1"));
        assertEquals(FillReport.Status.UNSUPPORTED, r.report.of("사업명").status());
    }

    // ── ⑤ 파일 입출력(한글 파일명)·규모 ───────────────────────────────────

    @Test
    public void 한글_파일명으로_저장해도_다시_열린다() throws Exception {
        XWPFDocument d = new XWPFDocument();
        labelTable(d, "기관명");
        Result r = run(sheet("A1=노원구"), d, FillRule.cell("기관명", null, "A1"));
        java.io.File f = java.io.File.createTempFile("제안서_", "_노원구.docx");
        try {
            java.nio.file.Files.write(f.toPath(), r.docBytes);
            XWPFDocument back = new XWPFDocument(new java.io.FileInputStream(f));
            assertEquals("노원구", back.getTables().get(0).getRow(0).getCell(1).getText());
            back.close();
        } finally {
            f.delete();
        }
    }

    @Test
    public void 큰_문서와_큰_엑셀도_수초_안에_끝난다() throws Exception {
        XWPFDocument d = new XWPFDocument();
        for (int i = 0; i < 3000; i++) para(d, "일반 문단 " + i + " 입니다. 여러 단어가 들어 있는 문장.");
        for (int i = 0; i < 100; i++) labelTable(d, "라벨" + i + "호");
        XSSFWorkbook wb = new XSSFWorkbook();
        Sheet s = wb.createSheet("S");
        put(s, "A1", "기관명");
        put(s, "B1", "금액");
        for (int i = 0; i < 20000; i++) {
            Row row = s.createRow(i + 1);
            row.createCell(0).setCellValue("기관" + i);
            row.createCell(1).setCellValue(i);
        }
        FillRule[] rules = new FillRule[20];
        for (int i = 0; i < rules.length; i++) {
            rules[i] = FillRule.lookup("라벨" + i + "호", "S", 1, "금액", "기관명", "기관" + (i * 900));
        }
        long t0 = System.nanoTime();
        Result r = run(wb, d, rules);
        long ms = (System.nanoTime() - t0) / 1_000_000;
        System.out.println("[docfill] 문단 3000 + 표 100 + 엑셀 20000행 + 규칙 20 → " + ms + "ms, 결과 " + r.docBytes.length + "B");
        assertTrue(r.report.toString(), r.report.allOk());
        assertEquals("900", cellText(r.doc, 1, 0, 1));   // 라벨1호 → 기관900
        assertTrue("너무 느리다: " + ms + "ms", ms < 20000);
    }
}
