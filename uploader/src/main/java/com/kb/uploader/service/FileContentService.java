package com.kb.uploader.service;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

/**
 * 파일에서 본문 텍스트를 뽑는다.
 *
 * <p>⚠️ <b>못 뽑으면 언제나 {@code null} 이다</b>(2026-08-27 사용자 승인).
 * 종전에는 실패를 대괄호 안내 문자열로 돌려줬다
 * ({@code "[HWP 바이너리 형식 - 텍스트 추출 미지원]"} ·
 * {@code "[텍스트 추출 실패: <서버 경로>]"}). 두 가지가 문제였다:
 *
 * <ol>
 *   <li><b>호출부가 실패를 판정할 방법이 문자열 대조뿐이었다.</b> 문구를 한 글자만
 *       고쳐도 조용히 깨진다. JSON API 재정의로 들어오는 {@code parseDoc} 은
 *       "실패하면 .md 를 만들지 않고 null 을 반환"해야 해서 이 판정이 꼭 필요하다.</li>
 *   <li><b>실패 메시지에 서버 파일 경로가 담겼다</b> — 응답으로 그대로 나갔다.</li>
 * </ol>
 *
 * <p>그동안 이 동작을 바꾸지 못한 이유는 {@code /api/files/search} 응답의
 * {@code content} 가 그 문자열을 그대로 싣고 있었기 때문이다. 그 API 가 재정의로
 * <b>삭제</b>되면서(운영 호출부 0건) 계약이 사라졌다.
 *
 * <p>실패 사유는 <b>로그에만</b> 남긴다 — 응답·파일에는 싣지 않는다.
 */
@Service
public class FileContentService {

    private static final Logger log = LoggerFactory.getLogger(FileContentService.class);

    /** 본문. 지원하지 않는 확장자이거나 추출에 실패하면 {@code null}. */
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
                // HWP 바이너리는 아직 지원하지 않는다(.hwpx 는 위에서 처리한다).
                log.debug("HWP 바이너리는 텍스트 추출을 지원하지 않는다: {}", storedPath);
                return null;
            }
        } catch (Exception e) {
            // ⚠️ 경로·예외 메시지를 **반환값에 싣지 않는다**(서버 경로 노출).
            log.warn("텍스트 추출 실패: {}", storedPath, e);
            return null;
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
