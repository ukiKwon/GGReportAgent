package com.kbstar.kgi.ggreport.web.docfill;

import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.wp.usermodel.HeaderFooterType;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.Arrays;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * 사람이 Word·Excel(또는 Pages)로 직접 열어 보라고 <b>샘플 3개</b>를 {@code target/docfill-samples/}에 쓴다.
 * 자동 검증은 {@link ExcelWordFillerTest}가 하고, 여기는 눈으로 보는 용도 — 그래도 결과는 단정한다.
 */
public class DocFillShowcaseTest {

    @Test
    public void 눈으로_확인할_샘플_파일을_만든다() throws Exception {
        File dir = new File("target/docfill-samples");
        assertTrue(dir.isDirectory() || dir.mkdirs());

        // ── 엑셀: 입찰 현황표 + 요약 시트
        XSSFWorkbook wb = new XSSFWorkbook();
        Sheet list = wb.createSheet("입찰현황");
        String[] head = {"기관명", "사업명", "계약금액", "계약기간", "담당자"};
        Object[][] rows = {
                {"노원구", "2027~2030 구금고 지정", 12345678900L, "2027-01-01 ~ 2030-12-31", "김영업"},
                {"도봉구", "2027~2030 구금고 지정", 9876543210L, "2027-01-01 ~ 2030-12-31", "이영업"},
                {"광진구", "2027~2030 구금고 지정", 8765432100L, "2027-01-01 ~ 2030-12-31", "박영업"}};
        Row h = list.createRow(0);
        for (int i = 0; i < head.length; i++) h.createCell(i).setCellValue(head[i]);
        CellStyle money = wb.createCellStyle();
        money.setDataFormat(wb.getCreationHelper().createDataFormat().getFormat("#,##0\"원\""));
        for (int r = 0; r < rows.length; r++) {
            Row row = list.createRow(r + 1);
            for (int c = 0; c < head.length; c++) {
                if (rows[r][c] instanceof Long) {
                    row.createCell(c).setCellValue((Long) rows[r][c]);
                    row.getCell(c).setCellStyle(money);
                } else {
                    row.createCell(c).setCellValue((String) rows[r][c]);
                }
            }
        }
        Sheet sum = wb.createSheet("요약");
        sum.createRow(0).createCell(0).setCellValue("문서번호");
        sum.getRow(0).createCell(1).setCellValue("KB-2026-0142");
        sum.createRow(1).createCell(0).setCellValue("작성일");
        sum.getRow(1).createCell(1).setCellFormula("DATE(2026,10,28)");
        CellStyle date = wb.createCellStyle();
        date.setDataFormat(wb.getCreationHelper().createDataFormat().getFormat("yyyy\"년\" m\"월\" d\"일\""));
        sum.getRow(1).getCell(1).setCellStyle(date);
        ByteArrayOutputStream xo = new ByteArrayOutputStream();
        wb.write(xo);
        write(new File(dir, "샘플_입찰현황.xlsx"), xo.toByteArray());

        // ── 워드 양식: 표지 표 + 문장 속 키워드(굵은 글씨로 쪼개짐) + 머리글
        XWPFDocument d = new XWPFDocument();
        XWPFParagraph title = d.createParagraph();
        XWPFRun tr = title.createRun();
        tr.setText("금고 지정 입찰 제안서");
        tr.setBold(true);
        tr.setFontSize(22);
        XWPFTable t = d.createTable(5, 2);
        String[] labels = {"기관명", "사업명", "계약금액", "계약기간", "담당자"};
        for (int i = 0; i < labels.length; i++) t.getRow(i).getCell(0).setText(labels[i]);
        XWPFParagraph prose = d.createParagraph();
        prose.createRun().setText("본 제안서는 ");
        XWPFRun b1 = prose.createRun();
        b1.setText("기관");
        b1.setBold(true);
        XWPFRun b2 = prose.createRun();
        b2.setText("명");
        b2.setBold(true);
        b2.setColor("1F4E79");
        prose.createRun().setText("에 제출하며, 계약금액은 부가세 별도입니다.");
        d.createHeader(HeaderFooterType.DEFAULT).createParagraph().createRun().setText("문서번호:");
        d.createParagraph().createRun().setText("작성일:");
        ByteArrayOutputStream dout = new ByteArrayOutputStream();
        d.write(dout);
        write(new File(dir, "샘플_제안서양식.docx"), dout.toByteArray());

        // ── 실행
        FillRule[] rules = {
                FillRule.lookup("기관명", "입찰현황", 1, "기관명", "기관명", "노원구").labelOnly(true),
                FillRule.lookup("사업명", "입찰현황", 1, "사업명", "기관명", "노원구"),
                FillRule.lookup("계약금액", "입찰현황", 1, "계약금액", "기관명", "노원구").labelOnly(true),
                FillRule.lookup("계약기간", "입찰현황", 1, "계약기간", "기관명", "노원구"),
                FillRule.lookup("담당자", "입찰현황", 1, "담당자", "기관명", "노원구"),
                FillRule.cell("문서번호", "요약", "B1"),
                FillRule.cell("작성일", "요약", "B2")};
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        FillReport report = ExcelWordFiller.fill(new FileInputStream(new File(dir, "샘플_입찰현황.xlsx")),
                new FileInputStream(new File(dir, "샘플_제안서양식.docx")), Arrays.asList(rules), out);
        write(new File(dir, "결과_제안서_노원구.docx"), out.toByteArray());
        System.out.println("[docfill] 샘플 → " + dir.getAbsolutePath() + "\n" + report);

        XWPFDocument back = new XWPFDocument(new java.io.ByteArrayInputStream(out.toByteArray()));
        try {
            assertEquals("노원구", back.getTables().get(0).getRow(0).getCell(1).getText());
            assertEquals("12,345,678,900원", back.getTables().get(0).getRow(2).getCell(1).getText());
            // 본문 문단 순서: 0 제목, 1 문장(표는 문단이 아니다), 2 작성일
            assertEquals("작성일: 2026년 10월 28일", back.getParagraphs().get(2).getText());
            assertEquals("문서번호: KB-2026-0142", back.getHeaderList().get(0).getParagraphs().get(0).getText());
            // '기관명' 표 라벨은 채우고, 문장 속 "기관명"(굵게 쪼개짐)은 labelOnly라 건드리지 않는다.
            assertEquals("본 제안서는 기관명에 제출하며, 계약금액은 부가세 별도입니다.",
                    back.getParagraphs().get(1).getText());
        } finally {
            back.close();
        }
    }

    private static void write(File f, byte[] data) throws Exception {
        FileOutputStream o = new FileOutputStream(f);
        try {
            o.write(data);
        } finally {
            o.close();
        }
    }
}
