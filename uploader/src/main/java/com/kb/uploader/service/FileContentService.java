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

import javax.xml.XMLConstants;
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

    /**
     * XXE 방어 SAX 팩토리(NEXT 39 S1). DOCTYPE 거부는 필수라 실패하면 예외를 던진다(= 추출 포기).
     * 나머지는 파서가 지원하지 않으면 건너뛴다(DOCTYPE 거부만으로도 외부 엔티티는 불가).
     */
    static SAXParserFactory newSecureSaxFactory() throws Exception {
        SAXParserFactory factory = SAXParserFactory.newInstance();
        factory.setNamespaceAware(false);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        trySetFeature(factory, XMLConstants.FEATURE_SECURE_PROCESSING, true);
        trySetFeature(factory, "http://xml.org/sax/features/external-general-entities", false);
        trySetFeature(factory, "http://xml.org/sax/features/external-parameter-entities", false);
        trySetFeature(factory, "http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
        return factory;
    }

    private static void trySetFeature(SAXParserFactory factory, String feature, boolean value) {
        try {
            factory.setFeature(feature, value);
        } catch (Exception e) {
            log.debug("XML 파서가 기능을 지원하지 않아 건너뜀: {}", feature);
        }
    }

    private String extractHwpxText(String storedPath) {
        StringBuilder sb = new StringBuilder();
        boolean rejected = false;
        try (ZipFile zip = new ZipFile(storedPath)) {
            SAXParserFactory factory = newSecureSaxFactory();

            Enumeration<? extends ZipEntry> entries = zip.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                String name = entry.getName();
                // HWPX 본문: Contents/section*.xml
                if (name.startsWith("Contents/") && name.endsWith(".xml")) {
                    try (InputStream is = zip.getInputStream(entry)) {
                        SAXParser parser = factory.newSAXParser(); // 예외 뒤 재사용 방지: 엔트리마다 새로
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
                    } catch (org.xml.sax.SAXParseException e) {
                        // DOCTYPE 거부 포함. 공격 의심 파일이므로 일부만 쓰지 않고 전체를 버린다(아래 null).
                        rejected = true;
                        log.warn("HWPX 섹션 파싱 거부: {}", name);
                        log.debug("HWPX 섹션 파싱 예외", e);
                    } catch (Exception e) {
                        log.warn("HWPX 섹션 읽기 실패: {}", name);
                        log.debug("HWPX 섹션 읽기 예외", e);
                    }
                }
            }
        } catch (Exception e) {
            // 반환값에 사유·경로를 싣지 않는다(31행 계약: 실패는 null).
            log.warn("HWPX 텍스트 추출 실패: {}", storedPath, e);
            return null;
        }
        if (rejected) return null;
        return sb.toString().trim();
    }
}
