package com.kbstar.kgi.ggreport.web.boarddoc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.ss.util.CellReference;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.util.*;

/** 엑셀→양식 매핑. 기동 시 검증(카탈로그 매핑 칸 집합과 정확히 일치·범위 안·범위 합 2,000칸 이하) — 실패면 기동 실패. */
@Component
public class BoardExcelMap {

    public static final String RESOURCE = "boarddoc/excel-map.json";
    public static final int MAX_RANGE_CELLS = 2000;

    public static final class Sum {
        private final List<String> of;
        private final String total;

        Sum(List<String> of, String total) { this.of = of; this.total = total; }

        public List<String> getOf() { return of; }
        public String getTotal() { return total; }
    }

    public static final class TableMap {
        private final String ref;
        private final String sheet;
        private final CellRangeAddress range;
        private final Map<String, String> labels;
        private final Map<String, CellReference> cells;
        private final List<Sum> sums;

        TableMap(String ref, String sheet, CellRangeAddress range, Map<String, String> labels,
                 Map<String, CellReference> cells, List<Sum> sums) {
            this.ref = ref; this.sheet = sheet; this.range = range;
            this.labels = labels; this.cells = cells; this.sums = sums;
        }

        public String getRef() { return ref; }
        public String getSheet() { return sheet; }
        public CellRangeAddress getRange() { return range; }
        public Map<String, String> getLabels() { return labels; }
        public Map<String, CellReference> getCells() { return cells; }
        public List<Sum> getSums() { return sums; }
    }

    private final int mappingVer;
    private final Map<String, TableMap> tables = new LinkedHashMap<>();

    public BoardExcelMap() {
        this(read());
    }

    BoardExcelMap(JsonNode root) {
        mappingVer = root.path("mapping_ver").asInt(0);
        if (mappingVer < 1 || root.path("catalog_ver").asInt(-1) != BoardDocSpec.CATALOG_VER) {
            bad("version");
        }
        int rangeCells = 0;
        for (JsonNode t : root.path("tables")) {
            String ref = t.path("ref").asText();
            BoardDocSpec.Table cat = BoardDocSpec.catalogTable(ref, false);
            String sheet = t.path("sheet").asText();
            if (cat == null || tables.containsKey(ref) || sheet.isEmpty() || sheet.length() > 31) {
                bad("table " + ref);
            }
            CellRangeAddress range = CellRangeAddress.valueOf(t.path("range").asText());
            rangeCells += range.getNumberOfCells();
            Map<String, CellReference> cells = new LinkedHashMap<>();
            Iterator<Map.Entry<String, JsonNode>> it = t.path("cells").fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                put(cells, e.getKey(), new CellReference(e.getValue().asText()), range, ref);
            }
            for (JsonNode b : t.path("blocks")) {
                CellReference from = new CellReference(b.path("from").asText());
                for (int i = 0; i < b.path("rows").asInt(); i++) {
                    for (int j = 0; j < b.path("cols").asInt(); j++) {
                        put(cells, BoardDocSpec.cellKey(b.path("key_row").asInt() + i, b.path("seq").asInt() + j),
                                new CellReference(from.getRow() + i, from.getCol() + j), range, ref);
                    }
                }
            }
            if (!mappedKeys(cat).equals(cells.keySet())) {
                bad("cells " + ref);
            }
            Set<String> addrs = new HashSet<>();
            for (CellReference c : cells.values()) {
                addrs.add(c.formatAsString());
            }
            Map<String, String> labels = new LinkedHashMap<>();
            it = t.path("labels").fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                CellReference c = new CellReference(e.getKey());
                if (!range.isInRange(c.getRow(), c.getCol()) || addrs.contains(c.formatAsString())) {
                    bad("label " + ref);
                }
                labels.put(c.formatAsString(), e.getValue().asText());
            }
            List<Sum> sums = new ArrayList<>();
            for (JsonNode s : t.path("sums")) {
                List<String> of = new ArrayList<>();
                for (JsonNode k : s.path("of")) {
                    of.add(k.asText());
                }
                String total = s.path("total").asText();
                if (of.isEmpty() || !cells.keySet().containsAll(of) || !cells.containsKey(total)) {
                    bad("sum " + ref);
                }
                sums.add(new Sum(of, total));
            }
            tables.put(ref, new TableMap(ref, sheet, range, labels, cells, sums));
        }
        if (tables.isEmpty() || rangeCells > MAX_RANGE_CELLS) {
            bad("size");
        }
    }

    public int getMappingVer() { return mappingVer; }
    public TableMap table(String ref) { return tables.get(ref); }
    public Collection<TableMap> tables() { return tables.values(); }

    /**
     * 응답에 실리는 범위(어느 표의 range 든) 안인가. 시트 이름은 대소문자를 무시한다 — 값을 읽는
     * {@code XlsxBook.sheet}(POI getSheet)와 같은 기준이어야 개인정보 범위 판정이 같은 시트를 본다.
     */
    public boolean covers(String sheet, int row, int col) {
        for (TableMap t : tables.values()) {
            if (t.sheet.equalsIgnoreCase(sheet) && row >= 0 && t.range.isInRange(row, col)) {
                return true;
            }
        }
        return false;
    }

    private static void put(Map<String, CellReference> cells, String key, CellReference c,
                            CellRangeAddress range, String ref) {
        if (!range.isInRange(c.getRow(), c.getCol()) || cells.put(key, c) != null) {
            bad("cell " + ref + " " + key);
        }
    }

    private static Set<String> mappedKeys(BoardDocSpec.Table t) {
        Set<String> out = new LinkedHashSet<>();
        for (int r = 0; r < t.getRows().size(); r++) {
            for (int i = 0; i < t.getRows().get(r).size(); i++) {
                if (t.getRows().get(r).get(i).isMapped()) {
                    out.add(BoardDocSpec.cellKey(r, i));
                }
            }
        }
        return out;
    }

    private static JsonNode read() {
        try (InputStream in = new ClassPathResource(RESOURCE).getInputStream()) {
            return new ObjectMapper().readTree(in);
        } catch (IOException e) {
            throw new IllegalStateException("excel-map missing");
        }
    }

    private static void bad(String why) {
        throw new IllegalStateException("excel-map invalid: " + why);
    }
}
