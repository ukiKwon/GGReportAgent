package com.kb.uploader.service;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.stereotype.Service;
import org.xml.sax.Attributes;
import org.xml.sax.helpers.DefaultHandler;

import javax.xml.parsers.SAXParser;
import javax.xml.parsers.SAXParserFactory;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Enumeration;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

@Service
public class FileContentService {

    public String extractText(String storedPath) {
        if (storedPath == null) return null;
        String lower = storedPath.toLowerCase();
        try {
            if (lower.endsWith(".md") || lower.endsWith(".txt")) {
                return new String(Files.readAllBytes(Paths.get(storedPath)), StandardCharsets.UTF_8);
            }
            if (lower.endsWith(".pdf")) {
                try (PDDocument doc = PDDocument.load(Paths.get(storedPath).toFile())) {
                    return new PDFTextStripper().getText(doc).trim();
                }
            }
            if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
                return extractExcelText(storedPath);
            }
            if (lower.endsWith(".hwpx")) {
                return extractHwpxText(storedPath);
            }
            if (lower.endsWith(".hwp")) {
                return "[HWP 바이너리 형식 - 텍스트 추출 미지원]";
            }
        } catch (Exception e) {
            return "[텍스트 추출 실패: " + e.getMessage() + "]";
        }
        return null;
    }

    private String extractExcelText(String storedPath) throws IOException {
        StringBuilder sb = new StringBuilder();
        DataFormatter formatter = new DataFormatter();
        try (Workbook wb = WorkbookFactory.create(Paths.get(storedPath).toFile())) {
            for (int si = 0; si < wb.getNumberOfSheets(); si++) {
                Sheet sheet = wb.getSheetAt(si);
                sb.append("[시트: ").append(sheet.getSheetName()).append("]\n");
                for (Row row : sheet) {
                    StringBuilder rowBuf = new StringBuilder();
                    for (Cell cell : row) {
                        String val = formatter.formatCellValue(cell).trim();
                        if (!val.isEmpty()) {
                            if (rowBuf.length() > 0) rowBuf.append("\t");
                            rowBuf.append(val);
                        }
                    }
                    if (rowBuf.length() > 0) {
                        sb.append(rowBuf).append("\n");
                    }
                }
            }
        }
        return sb.toString().trim();
    }

    private String extractHwpxText(String storedPath) {
        StringBuilder sb = new StringBuilder();
        try (ZipFile zip = new ZipFile(storedPath)) {
            SAXParserFactory factory = SAXParserFactory.newInstance();
            factory.setNamespaceAware(false);
            SAXParser parser = factory.newSAXParser();

            Enumeration<? extends ZipEntry> entries = zip.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                String name = entry.getName();
                // HWPX 본문: Contents/section*.xml
                if (name.startsWith("Contents/") && name.endsWith(".xml")) {
                    try (InputStream is = zip.getInputStream(entry)) {
                        parser.parse(is, new DefaultHandler() {
                            private boolean inText = false;

                            @Override
                            public void startElement(String uri, String localName,
                                                     String qName, Attributes attrs) {
                                inText = "hp:t".equals(qName) || "t".equals(localName);
                            }

                            @Override
                            public void characters(char[] ch, int start, int length) {
                                if (inText) sb.append(ch, start, length);
                            }

                            @Override
                            public void endElement(String uri, String localName, String qName) {
                                if (inText) {
                                    sb.append(" ");
                                    inText = false;
                                }
                            }
                        });
                    } catch (Exception ignored) { }
                }
            }
        } catch (Exception e) {
            return "[HWPX 텍스트 추출 실패: " + e.getMessage() + "]";
        }
        return sb.toString().trim();
    }
}
