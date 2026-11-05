package com.kbstar.kgi.ggreport.web.boarddoc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.ss.util.CellReference;
import org.apache.poi.xssf.usermodel.XSSFFormulaEvaluator;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.core.io.ClassPathResource;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/** 가상 엑셀 — excel-map.json 위치에 카탈로그 샘플 값(가상)을 넣는다. 합계 C5 는 수식(캐시 채움). 실제 인물·번호 없음. */
public final class BoardExcelFixture {

    /** 형식만 맞춘 가상 주민번호 모양 숫자. */
    public static final String FAKE_RRN = "9001011234567";

    /** 옛 형식(range+labels+A1) 지도 — 가상 엑셀 생성과 옛 형식 시험용. 실제 지도(excel-map.json)는 이름·구역 형식(v2). */
    public static final String LEGACY = "boarddoc/excel-map-legacy.json";

    private BoardExcelFixture() {
    }

    public static BoardExcelMap legacyMap() {
        return new BoardExcelMap(LEGACY);
    }

    public static byte[] xlsx(Consumer<XSSFWorkbook> tweak) throws IOException {
        BoardExcelMap map = legacyMap();
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            CellStyle num = wb.createCellStyle();
            num.setDataFormat(wb.createDataFormat().getFormat("#,##0"));
            for (BoardExcelMap.TableMap t : map.tables()) {
                Sheet s = wb.getSheet(t.getSheet()) != null ? wb.getSheet(t.getSheet()) : wb.createSheet(t.getSheet());
                for (Map.Entry<String, List<String>> l : t.getLabels().entrySet()) {
                    cell(s, new CellReference(l.getKey())).setCellValue(l.getValue().get(0));
                }
                BoardDocSpec.Table st = BoardDocSpec.catalogTable(t.getRef(), true);
                for (Map.Entry<String, CellReference> e : t.getCells().entrySet()) {
                    String text = sample(st, e.getKey());
                    Cell c = cell(s, e.getValue());
                    String n = text.replace(",", "");
                    if (n.matches("-?\\d+")) {
                        c.setCellValue(Long.parseLong(n));
                        c.setCellStyle(num);
                    } else {
                        c.setCellValue(text);
                    }
                }
            }
            wb.getSheet("기부금").getRow(4).getCell(2).setCellFormula("SUM(C2:C4)");
            wb.getSheet("기부금").addMergedRegion(CellRangeAddress.valueOf("A2:A5"));
            wb.getSheet("수익성분석").addMergedRegion(CellRangeAddress.valueOf("A1:B1"));
            XSSFFormulaEvaluator.evaluateAllFormulaCells(wb);
            if (tweak != null) {
                tweak.accept(wb);
            }
            wb.write(out);
            return out.toByteArray();
        }
    }

    /** 실제 지도에서 ref 표의 시트 이름만 바꾼 지도 — 시트 이름 대소문자 판정 시험용(service 패키지에서 쓴다). */
    public static BoardExcelMap mapWithSheet(String ref, String sheet) throws IOException {
        ObjectNode root;
        try (InputStream in = new ClassPathResource(LEGACY).getInputStream()) {
            root = (ObjectNode) new ObjectMapper().readTree(in);
        }
        for (JsonNode t : root.get("tables")) {
            if (ref.equals(t.get("ref").asText())) {
                ((ObjectNode) t).put("sheet", sheet);
            }
        }
        return new BoardExcelMap(root);
    }

    /** 실제 지도에서 ref 표의 머리글 한 칸을 주어진 값(문자열 또는 배열)으로 바꾼 지도 — 별칭 시험용. */
    public static BoardExcelMap mapWithLabel(String ref, String cell, JsonNode value) throws IOException {
        ObjectNode root;
        try (InputStream in = new ClassPathResource(LEGACY).getInputStream()) {
            root = (ObjectNode) new ObjectMapper().readTree(in);
        }
        for (JsonNode t : root.get("tables")) {
            if (ref.equals(t.get("ref").asText())) {
                ((ObjectNode) t.get("labels")).set(cell, value);
            }
        }
        return new BoardExcelMap(root);
    }

    public static Cell cell(Sheet s, CellReference at) {
        Row r = s.getRow(at.getRow()) != null ? s.getRow(at.getRow()) : s.createRow(at.getRow());
        return r.getCell(at.getCol()) != null ? r.getCell(at.getCol()) : r.createCell(at.getCol());
    }

    /** 칸 key("r{행id}_c{열id}") → 카탈로그 샘플 문구. */
    public static String sample(BoardDocSpec.Table t, String key) {
        for (List<BoardDocSpec.Cell> row : t.getRows()) {
            for (BoardDocSpec.Cell c : row) {
                if (key.equals(c.getKey())) {
                    return c.getText();
                }
            }
        }
        throw new AssertionError("cell not found " + key);
    }

    /** zip 에 entry 를 더한다(매크로·폭탄 변형용). */
    public static byte[] withEntry(byte[] zip, String name, byte[] body) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipInputStream in = new ZipInputStream(new java.io.ByteArrayInputStream(zip));
             ZipOutputStream z = new ZipOutputStream(out)) {
            ZipEntry e;
            byte[] buf = new byte[8192];
            while ((e = in.getNextEntry()) != null) {
                z.putNextEntry(new ZipEntry(e.getName()));
                int n;
                while ((n = in.read(buf)) > 0) {
                    z.write(buf, 0, n);
                }
            }
            z.putNextEntry(new ZipEntry(name));
            z.write(body);
        }
        return out.toByteArray();
    }

    /** 정확히 같은 이름 entry 두 개 — ZipOutputStream 이 막으므로 같은 길이 이름으로 쓴 뒤 바이트를 바꾼다. */
    public static byte[] duplicateEntry(byte[] zip) throws IOException {
        byte[] b = withEntry(zip, "xl/workbook.xmZ", "<x/>".getBytes("UTF-8"));
        byte[] from = "xl/workbook.xmZ".getBytes("UTF-8");
        for (int i = 0; i + from.length <= b.length; i++) {
            boolean hit = true;
            for (int j = 0; j < from.length && hit; j++) {
                hit = b[i + j] == from[j];
            }
            if (hit) {
                b[i + from.length - 1] = 'l';
            }
        }
        return b;
    }
}
