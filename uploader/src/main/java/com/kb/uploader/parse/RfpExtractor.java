package com.kb.uploader.parse;

import kr.dogfoot.hwplib.object.HWPFile;
import kr.dogfoot.hwplib.object.bodytext.Section;
import kr.dogfoot.hwplib.object.bodytext.control.Control;
import kr.dogfoot.hwplib.object.bodytext.control.ControlTable;
import kr.dogfoot.hwplib.object.bodytext.control.gso.GsoControl;
import kr.dogfoot.hwplib.object.bodytext.control.table.Cell;
import kr.dogfoot.hwplib.object.bodytext.control.table.Row;
import kr.dogfoot.hwplib.object.bodytext.paragraph.Paragraph;
import kr.dogfoot.hwplib.reader.HWPReader;
import kr.dogfoot.hwplib.tool.textextractor.ForControl;
import kr.dogfoot.hwplib.tool.textextractor.ForParagraph;
import kr.dogfoot.hwplib.tool.textextractor.TextExtractOption;
import kr.dogfoot.hwpxlib.object.HWPXFile;
import kr.dogfoot.hwpxlib.reader.HWPXReader;
import kr.dogfoot.hwpxlib.tool.textextractor.TextMarks;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** RFP 원문(pdf/hwp/hwpx)에서 문단과 표를 순서대로 추출한다. */
@Component
public class RfpExtractor {

    // HWPX 텍스트 추출 시 표 구조를 되살리기 위한 제어문자 마커
    private static final char TABLE_START = '\u0001';
    private static final char TABLE_END = '\u0002';
    private static final char ROW_SEP = '\u0003';
    private static final char CELL_SEP = '\u0004';

    public ExtractedDocument extract(Path file) throws Exception {
        String name = file.getFileName().toString().toLowerCase();
        ExtractedDocument doc;
        if (name.endsWith(".pdf")) {
            doc = extractPdf(file);
        } else if (name.endsWith(".hwpx")) {
            doc = extractHwpx(file);
        } else if (name.endsWith(".hwp")) {
            doc = extractHwp(file);
        } else {
            throw new IllegalArgumentException("지원하지 않는 RFP 형식: " + name);
        }
        if (doc.isEmpty()) {
            throw new IllegalStateException("문서에서 텍스트를 추출하지 못했습니다 (스캔 이미지 PDF이거나 암호화된 문서일 수 있음)");
        }
        return doc;
    }

    // ── PDF ────────────────────────────────────────────────────────────
    ExtractedDocument extractPdf(Path file) throws Exception {
        try (PDDocument pdf = PDDocument.load(file.toFile())) {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            ExtractedDocument doc = new ExtractedDocument();
            doc.addText(stripper.getText(pdf));
            return doc;
        }
    }

    // ── HWP (5.x 바이너리) ─────────────────────────────────────────────
    ExtractedDocument extractHwp(Path file) throws Exception {
        HWPFile hwp = HWPReader.fromFile(file.toFile());
        ExtractedDocument doc = new ExtractedDocument();
        TextExtractOption option = new TextExtractOption();
        option.setMethod(kr.dogfoot.hwplib.tool.textextractor.TextExtractMethod.InsertControlTextBetweenParagraphText);
        option.setInsertParaHead(false);
        for (Section section : hwp.getBodyText().getSectionList()) {
            for (Paragraph p : section) {
                doc.addText(p.getNormalString());
                if (p.getControlList() == null) continue;
                for (Control control : p.getControlList()) {
                    if (control instanceof ControlTable) {
                        doc.addTable(hwpTable((ControlTable) control, option));
                    } else if (control instanceof GsoControl) {
                        // 글상자 등 도형 안의 텍스트
                        StringBuilder sb = new StringBuilder();
                        try {
                            ForControl.extract(control, option, null, sb);
                        } catch (RuntimeException ignore) {
                            // 도형 종류에 따라 텍스트가 없을 수 있음
                        }
                        doc.addText(sb.toString());
                    }
                }
            }
        }
        return doc;
    }

    private List<List<String>> hwpTable(ControlTable table, TextExtractOption option) throws Exception {
        List<List<String>> rows = new ArrayList<>();
        for (Row row : table.getRowList()) {
            List<String> cells = new ArrayList<>();
            for (Cell cell : row.getCellList()) {
                StringBuilder sb = new StringBuilder();
                for (Paragraph cp : cell.getParagraphList()) {
                    // 셀 안의 중첩 표·글상자 텍스트까지 포함
                    ForParagraph.extract(cp, -1, 0xFFFF, false, option, null, sb);
                    sb.append(' ');
                }
                cells.add(sb.toString());
            }
            rows.add(cells);
        }
        return rows;
    }

    // ── HWPX ───────────────────────────────────────────────────────────
    ExtractedDocument extractHwpx(Path file) throws Exception {
        HWPXFile hwpx = HWPXReader.fromFile(file.toFile());
        TextMarks marks = new TextMarks()
            .paraSeparatorAnd("\n")
            .lineBreakAnd("\n")
            .tabAnd(" ")
            .tableStartAnd(String.valueOf(TABLE_START))
            .tableEndAnd(String.valueOf(TABLE_END))
            .tableRowSeparatorAnd(String.valueOf(ROW_SEP))
            .tableCellSeparatorAnd(String.valueOf(CELL_SEP));
        String text = kr.dogfoot.hwpxlib.tool.textextractor.TextExtractor.extract(
            hwpx, kr.dogfoot.hwpxlib.tool.textextractor.TextExtractMethod.InsertControlTextBetweenParagraphText,
            false, marks);
        return fromMarkedText(text);
    }

    /** 마커가 들어간 텍스트를 문단/표 블록으로 되돌린다. 중첩 표는 바깥 셀의 텍스트로 합친다. */
    static ExtractedDocument fromMarkedText(String text) {
        ExtractedDocument doc = new ExtractedDocument();
        StringBuilder plain = new StringBuilder();
        List<List<String>> rows = null;
        List<String> row = null;
        StringBuilder cell = null;
        int depth = 0;
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (ch == TABLE_START) {
                if (depth == 0) {
                    doc.addText(plain.toString());
                    plain.setLength(0);
                    rows = new ArrayList<>();
                    row = new ArrayList<>();
                    cell = new StringBuilder();
                } else {
                    cell.append(' ');
                }
                depth++;
            } else if (ch == TABLE_END) {
                depth = Math.max(0, depth - 1);
                if (depth == 0 && rows != null) {
                    row.add(cell.toString());
                    rows.add(row);
                    doc.addTable(rows);
                    rows = null;
                } else if (cell != null) {
                    cell.append(' ');
                }
            } else if (depth == 1 && ch == CELL_SEP) {
                row.add(cell.toString());
                cell = new StringBuilder();
            } else if (depth == 1 && ch == ROW_SEP) {
                row.add(cell.toString());
                rows.add(row);
                row = new ArrayList<>();
                cell = new StringBuilder();
            } else if (depth > 0) {
                cell.append(ch == CELL_SEP || ch == ROW_SEP ? ' ' : ch);
            } else {
                plain.append(ch);
            }
        }
        doc.addText(plain.toString());
        return doc;
    }
}
