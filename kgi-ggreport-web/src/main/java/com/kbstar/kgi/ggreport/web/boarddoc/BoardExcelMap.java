package com.kbstar.kgi.ggreport.web.boarddoc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardExcelResolve.Area;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardExcelResolve.RowDef;
import com.kbstar.kgi.ggreport.web.docfill.XlsxBook;
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
    static final int MAX_ALIASES = 10;
    static final int MAX_LABEL_LEN = 100;
    static final int MAX_AREAS = 8, MAX_AREA_ROWS_DEF = 60, MAX_AREA_COLS = 10, MAX_PARTS = 4, MAX_NAMED_CELLS = 1000;
    /** 환산(eok)이 허용하는 원본 단위. 다른 단위를 지도에 적으면 기동 실패. */
    static final String UNIT_SOURCE = "백만원";

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
        private final Map<String, List<String>> labels;
        private final Map<String, CellReference> cells;
        private final List<Sum> sums;
        private final boolean named;
        private final Set<String> areaIds;
        private final Map<String, CellSpec> specs;

        TableMap(String ref, String sheet, CellRangeAddress range, Map<String, List<String>> labels,
                 Map<String, CellReference> cells, List<Sum> sums) {
            this.ref = ref; this.sheet = sheet; this.range = range;
            this.labels = labels; this.cells = cells; this.sums = sums;
            this.named = false; this.areaIds = Collections.emptySet(); this.specs = Collections.emptyMap();
        }

        /** 이름·구역 형식 — range 는 null, sheet 는 첫 구역의 첫 시트 이름. */
        TableMap(String ref, String sheet, Set<String> areaIds, Map<String, CellSpec> specs, List<Sum> sums) {
            this.ref = ref; this.sheet = sheet; this.range = null;
            this.labels = Collections.emptyMap(); this.cells = Collections.emptyMap();
            this.sums = sums; this.named = true; this.areaIds = areaIds; this.specs = specs;
        }

        public boolean isNamed() { return named; }
        public Set<String> getAreaIds() { return areaIds; }
        public Map<String, CellSpec> getSpecs() { return specs; }
        public String getRef() { return ref; }
        public String getSheet() { return sheet; }
        /** 이름 형식 표는 null. */
        public CellRangeAddress getRange() { return range; }
        /** 머리글 칸 → 허용 별칭 목록(첫 번째가 대표). 별칭 중 어느 하나와 같으면 일치. */
        public Map<String, List<String>> getLabels() { return labels; }
        public Map<String, CellReference> getCells() { return cells; }
        public List<Sum> getSums() { return sums; }
    }

    private final int mappingVer;
    /** 지도 파일이 선언한 catalog_ver(= CATALOG_VER 여야 기동). 옛 key 번역표를 고르는 데 쓴다. */
    private final int mapCatalogVer;
    private final Map<String, TableMap> tables = new LinkedHashMap<>();
    private final Map<String, AreaDef> areas = new LinkedHashMap<>();

    public BoardExcelMap() {
        this(RESOURCE);
    }

    /** 클래스패스 자원 이름으로 읽는다(테스트에서 옛 지도를 읽는 용도). 요청 입력과 무관. */
    public BoardExcelMap(String resource) {
        this(read(resource));
    }

    BoardExcelMap(JsonNode root) {
        mappingVer = root.path("mapping_ver").asInt(0);
        mapCatalogVer = root.path("catalog_ver").asInt(-1);
        if (mappingVer < 1 || mapCatalogVer != BoardDocSpec.CATALOG_VER) {
            bad("version");
        }
        readAreas(root.path("areas"));
        int rangeCells = 0, namedCells = 0;
        for (JsonNode t : root.path("tables")) {
            String ref = t.path("ref").asText();
            BoardDocSpec.Table cat = BoardDocSpec.catalogTable(ref, false);
            if (t.has("lines")) {                                   // 이름·구역 형식(mapping_ver 2)
                if (cat == null || tables.containsKey(ref) || mappingVer < 2) {
                    bad("table " + ref);
                }
                onlyKeys(t, "table " + ref, "ref", "lines");        // range·cells·labels 등 옛 키 병기·오타 거부
                TableMap nt = named(t, ref, cat);
                namedCells += nt.getSpecs().size();
                tables.put(ref, nt);
                continue;
            }
            String sheet = t.path("sheet").asText();
            if (cat == null || tables.containsKey(ref) || sheet.isEmpty() || sheet.length() > 31) {
                bad("table " + ref);
            }
            CellRangeAddress range = CellRangeAddress.valueOf(t.path("range").asText());
            rangeCells += range.getNumberOfCells();
            Map<String, CellReference> cells = new LinkedHashMap<>();
            Iterator<Map.Entry<String, JsonNode>> it = t.path("cells").fields();
            while (it.hasNext()) {                                  // 옛 key(r{행}c{순번}) → 새 key. 번역 못 하면 기동 실패
                Map.Entry<String, JsonNode> e = it.next();
                put(cells, newKey(ref, e.getKey()), new CellReference(e.getValue().asText()), range, ref);
            }
            for (JsonNode b : t.path("blocks")) {
                CellReference from = new CellReference(b.path("from").asText());
                for (int i = 0; i < b.path("rows").asInt(); i++) {
                    for (int j = 0; j < b.path("cols").asInt(); j++) {
                        String old = BoardLegacyKeys.legacyKey(b.path("key_row").asInt() + i, b.path("seq").asInt() + j);
                        put(cells, newKey(ref, old),
                                new CellReference(from.getRow() + i, from.getCol() + j), range, ref);
                    }
                }
            }
            if (!BoardDocSpec.mappedKeys(cat).equals(cells.keySet())) {
                bad("cells " + ref);
            }
            Set<String> addrs = new HashSet<>();
            for (CellReference c : cells.values()) {
                addrs.add(c.formatAsString());
            }
            Map<String, List<String>> labels = new LinkedHashMap<>();
            it = t.path("labels").fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                CellReference c = new CellReference(e.getKey());
                if (!range.isInRange(c.getRow(), c.getCol()) || addrs.contains(c.formatAsString())) {
                    bad("label " + ref);
                }
                labels.put(c.formatAsString(), aliases(e.getValue(), ref));
            }
            if (labels.isEmpty()) {
                bad("labels " + ref);                          // C5: 머리글이 없는 표는 어느 엑셀이든 통과하므로 금지
            }
            List<Sum> sums = new ArrayList<>();
            for (JsonNode s : t.path("sums")) {
                List<String> of = new ArrayList<>();
                for (JsonNode k : s.path("of")) {
                    of.add(newKey(ref, k.asText()));
                }
                String total = newKey(ref, s.path("total").asText());
                if (of.isEmpty() || !cells.keySet().containsAll(of) || !cells.containsKey(total)) {
                    bad("sum " + ref);
                }
                sums.add(new Sum(of, total));
            }
            tables.put(ref, new TableMap(ref, sheet, range, labels, cells, sums));
        }
        if (tables.isEmpty() || rangeCells > MAX_RANGE_CELLS || namedCells > MAX_NAMED_CELLS) {
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
            if (t.named) {                                        // range 가 없다 → 그 시트 전체가 응답 범위(더 엄격)
                if (row < 0) {
                    continue;
                }
                for (String id : t.areaIds) {
                    for (String s : areas.get(id).getSheets()) {
                        if (s.equalsIgnoreCase(sheet)) {
                            return true;
                        }
                    }
                }
            } else if (t.sheet.equalsIgnoreCase(sheet) && row >= 0 && t.range.isInRange(row, col)) {
                return true;
            }
        }
        return false;
    }

    public AreaDef area(String id) { return areas.get(id); }

    /** 라벨 값 = 문자열 하나 또는 문자열 배열. 공백 정규화 뒤 비면(C5)·한도 초과·비문자열이면 기동 실패. */
    private static List<String> aliases(JsonNode v, String ref) {
        List<String> out = new ArrayList<>();
        if (v.isTextual()) {
            out.add(v.asText());
        } else if (v.isArray()) {
            for (JsonNode a : v) {
                if (!a.isTextual()) {
                    bad("label " + ref);
                }
                out.add(a.asText());
            }
        }
        if (out.isEmpty() || out.size() > MAX_ALIASES) {
            bad("label " + ref);
        }
        for (String a : out) {
            if (norm(a).isEmpty() || a.length() > MAX_LABEL_LEN) {
                bad("label " + ref);
            }
        }
        return Collections.unmodifiableList(out);
    }

    /** 앞뒤 공백 제거 + 연속 공백을 하나로. 머리글 비교의 유일한 정규화. */
    static String norm(String s) {
        return s == null ? "" : s.trim().replaceAll("\\s+", " ");
    }

    private static void put(Map<String, CellReference> cells, String key, CellReference c,
                            CellRangeAddress range, String ref) {
        if (!range.isInRange(c.getRow(), c.getCol()) || cells.put(key, c) != null) {
            bad("cell " + ref + " " + key);
        }
    }

    /** 지도 파일의 key(옛 r{행}c{순번} 또는 새 정규형)를 새 key 로. 번역 못 하면 기동 실패(내용은 싣지 않는다). */
    private String newKey(String ref, String key) {
        // 옛 모양(r{행}c{순번})은 정의상 CATALOG_VER 1 의 위치다 — 지도가 선언한 catalog_ver(현재 버전)와 무관하게 얼린 v1 표로 옮긴다.
        // C-3 사업초기(c6)처럼 v2 에서 생긴 칸은 옛 모양으로 적을 수 없고 새 모양(r1_c6)으로 적는다.
        String k = BoardDocSpec.resolveKey(1, ref, key);
        if (k == null) {
            bad("key " + ref);
        }
        return k;
    }

    /** 구역 정의 + 시트 별칭 + 단위. 업로드 글자는 담지 않는다(모두 서버 지도에서 온 상수). */
    public static final class AreaDef {
        private final Area area;
        private final List<String> sheets;
        private final String unit;
        private final boolean unitAssumed, unitInTitle;
        private final Map<String, String> rowText;

        AreaDef(Area area, List<String> sheets, String unit, boolean unitAssumed, boolean unitInTitle,
                Map<String, String> rowText) {
            this.area = area; this.sheets = sheets; this.unit = unit; this.unitAssumed = unitAssumed;
            this.unitInTitle = unitInTitle; this.rowText = rowText;
        }

        public Area area() { return area; }
        public List<String> getSheets() { return sheets; }
        public String getUnit() { return unit; }
        /** true 면 단위가 아직 사용자 확인 전의 가정. 확정(사용자 2026-11-05)된 구역은 지도에서 false. */
        public boolean isUnitAssumed() { return unitAssumed; }
        public boolean isUnitInTitle() { return unitInTitle; }
        public String rowText(String id) { String t = rowText.get(id); return t == null ? "" : t; }

        /** 통합문서에 실제로 있는 시트 이름(별칭 순서대로 첫째). 없으면 null. */
        public String resolveSheet(XlsxBook b) {
            for (String s : sheets) {
                if (b.sheet(s) != null) {
                    return s;
                }
            }
            return null;
        }
    }

    public static final class Part {
        public final String area, row, col;

        Part(String area, String row, String col) { this.area = area; this.row = row; this.col = col; }
    }

    /** 칸 하나의 규칙. op: manual | plain | eok | paren | derive_sum. main/sub = 합산할 원본 행(구역.행 id)과 열 id. */
    public static final class CellSpec {
        public final String key, op;
        public final List<Part> main, sub;
        public final List<String> of;

        CellSpec(String key, String op, List<Part> main, List<Part> sub, List<String> of) {
            this.key = key; this.op = op; this.main = main; this.sub = sub; this.of = of;
        }
    }

    /** 허용 키 밖이면 기동 실패 — 오타로 검증(예: unit_in_title)이 조용히 꺼지는 것을 막는다. */
    private static void onlyKeys(JsonNode n, String why, String... allowed) {
        if (!n.isObject()) {
            bad(why);
        }
        Iterator<String> it = n.fieldNames();
        while (it.hasNext()) {
            String k = it.next();
            boolean ok = false;
            for (String a : allowed) {
                ok |= a.equals(k);
            }
            if (!ok) {
                bad(why);
            }
        }
    }

    private void readAreas(JsonNode node) {
        if (node.size() > MAX_AREAS || !(node.isMissingNode() || node.isNull() || node.isObject())) {
            bad("areas");
        }
        Iterator<Map.Entry<String, JsonNode>> it = node.fields();
        while (it.hasNext()) {
            Map.Entry<String, JsonNode> e = it.next();
            String id = e.getKey();
            JsonNode a = e.getValue();
            if (!validId(id) || !a.isObject() || areas.containsKey(id)) {
                bad("area");
            }
            onlyKeys(a, "area " + id, "sheet", "title", "until", "header_has", "cols", "unit", "unit_assumed",
                    "unit_in_title", "rows");
            for (String flag : new String[]{"unit_assumed", "unit_in_title"}) {
                if (a.has(flag) && !a.get(flag).isBoolean()) {
                    bad("area " + id);
                }
            }
            if (a.has("until") && !a.get("until").isTextual()) {
                bad("area " + id);
            }
            try {
                List<String> sheets = texts(a.path("sheet"), 1, 5, 31, "area " + id);
                List<String> hh = a.has("header_has") ? texts(a.get("header_has"), 1, 6, 100, "area " + id)
                        : Collections.<String>emptyList();
                JsonNode cn = a.path("cols");
                if (!cn.isObject() || cn.size() < 1 || cn.size() > MAX_AREA_COLS) {
                    bad("area cols " + id);
                }
                Map<String, String> cols = new LinkedHashMap<>();
                Iterator<Map.Entry<String, JsonNode>> ci = cn.fields();
                while (ci.hasNext()) {
                    Map.Entry<String, JsonNode> c = ci.next();
                    if (!validId(c.getKey()) || !c.getValue().isTextual()) {
                        bad("area cols " + id);
                    }
                    cols.put(c.getKey(), c.getValue().asText());
                }
                JsonNode rn = a.path("rows");
                if (!rn.isObject() || rn.size() < 1 || rn.size() > MAX_AREA_ROWS_DEF) {
                    bad("area rows " + id);
                }
                List<RowDef> rows = new ArrayList<>();
                Map<String, String> text = new LinkedHashMap<>();
                Iterator<Map.Entry<String, JsonNode>> ri = rn.fields();
                while (ri.hasNext()) {
                    Map.Entry<String, JsonNode> r = ri.next();
                    JsonNode rv = r.getValue();
                    if (!validId(r.getKey()) || !rv.isObject()) {
                        bad("area rows " + id);
                    }
                    if (rv.has("below")) {
                        onlyKeys(rv, "area rows " + id, "below");
                        if (!rv.get("below").isInt()) {
                            bad("area rows " + id);
                        }
                        rows.add(RowDef.below(r.getKey(), rv.get("below").asInt()));
                    } else {
                        onlyKeys(rv, "area rows " + id, "path", "count");
                        if (rv.has("count") && !rv.get("count").isInt()) {
                            bad("area rows " + id);
                        }
                        List<String> segs = texts(rv.path("path"), 1, 4, 100, "area rows " + id);
                        rows.add(RowDef.of(r.getKey(), rv.path("count").asInt(1), segs.toArray(new String[0])));
                        text.put(r.getKey(), String.join(" > ", segs));
                    }
                }
                String unit = a.path("unit").asText();
                if (unit.isEmpty() || unit.length() > 10 || !a.path("title").isTextual()) {
                    bad("area " + id);
                }
                Area area = new Area(id, sheets.get(0), a.path("title").asText(),
                        a.has("until") ? a.get("until").asText() : null, hh, cols, rows);
                areas.put(id, new AreaDef(area, sheets, unit, a.path("unit_assumed").asBoolean(true),
                        a.path("unit_in_title").asBoolean(false), text));
            } catch (IllegalArgumentException ex) {                // BoardLabel·RowDef 가 거부 — 내용은 싣지 않는다
                bad("area " + id);
            }
        }
        if (!areas.isEmpty() && mappingVer < 2) {
            bad("areas");
        }
    }

    private TableMap named(JsonNode t, String ref, BoardDocSpec.Table cat) {
        Map<String, CellSpec> specs = new LinkedHashMap<>();
        if (!t.path("lines").isArray()) {
            bad("lines " + ref);
        }
        for (JsonNode ln : t.path("lines")) {
            onlyKeys(ln, "line " + ref, "row", "cells", "cols", "spec");
            if (!ln.path("row").isInt()) {
                bad("line " + ref);
            }
            int row = ln.path("row").asInt();
            List<Integer> idx = mappedIdx(cat, row);
            List<JsonNode> list = new ArrayList<>();
            if (ln.has("cells")) {
                if (ln.has("cols") || ln.has("spec") || !ln.get("cells").isArray() || ln.get("cells").size() != idx.size()) {
                    bad("line " + ref);
                }
                for (JsonNode c : ln.get("cells")) {
                    list.add(c);
                }
            } else if (ln.path("spec").isObject() && ln.path("cols").isArray() && ln.path("cols").size() == idx.size()) {
                onlyKeys(ln.get("spec"), "line spec " + ref, "op", "parts", "sub", "of");   // col 은 cols 에서 채운다
                for (JsonNode col : ln.get("cols")) {               // cols 마다 같은 규칙, col 만 바꿔 펼친다
                    if (!col.isTextual()) {
                        bad("line " + ref);
                    }
                    ObjectNode c = ((ObjectNode) ln.get("spec")).deepCopy();
                    c.put("col", col.asText());
                    list.add(c);
                }
            }
            if (idx.isEmpty() || list.size() != idx.size()) {
                bad("line " + ref);
            }
            for (int i = 0; i < idx.size(); i++) {
                // lines.row·cells 의 위치(행 번호, 그 행에서 연결 칸의 순서)는 카탈로그(=지도의 catalog_ver)의 위치 — 새 key 로 옮긴다
                String key = cat.getRows().get(row).get(idx.get(i)).getKey();
                if (specs.put(key, spec(list.get(i), key, ref)) != null) {
                    bad("cell " + ref + " " + key);
                }
            }
        }
        if (!BoardDocSpec.mappedKeys(cat).equals(specs.keySet())) {
            bad("cells " + ref);
        }
        List<Sum> sums = new ArrayList<>();
        Set<String> areaIds = new LinkedHashSet<>();
        for (CellSpec sp : specs.values()) {
            if ("derive_sum".equals(sp.op)) {
                for (String k : sp.of) {
                    CellSpec o = specs.get(k);
                    if (o == null || o == sp || !("eok".equals(o.op) || "paren".equals(o.op))) {
                        bad("derive " + ref);
                    }
                }
                sums.add(new Sum(sp.of, sp.key));
            }
            for (Part p : sp.main) {
                areaIds.add(p.area);
            }
            for (Part p : sp.sub) {
                areaIds.add(p.area);
            }
        }
        if (areaIds.isEmpty()) {
            bad("table " + ref);
        }
        return new TableMap(ref, areas.get(areaIds.iterator().next()).getSheets().get(0), areaIds, specs, sums);
    }

    private CellSpec spec(JsonNode n, String key, String ref) {
        onlyKeys(n, "spec " + ref, "op", "col", "parts", "sub", "of");
        String op = n.path("op").asText();
        String col = n.path("col").asText();
        List<Part> main = Collections.emptyList();
        List<Part> sub = Collections.emptyList();
        List<String> of = Collections.emptyList();
        switch (op) {
            case "manual":
                if (n.has("parts") || n.has("sub") || n.has("of") || n.has("col")) {
                    bad("spec " + ref);
                }
                break;
            case "derive_sum":
                if (n.has("parts") || n.has("sub") || n.has("col")) {
                    bad("spec " + ref);
                }
                List<String> oldOf = texts(n.path("of"), 2, 8, 20, "spec " + ref);
                of = new ArrayList<>();
                for (String k : oldOf) {                            // 지도의 옛 key(r1c2 …)를 새 key 로 옮긴다
                    of.add(newKey(ref, k));
                }
                if (of.contains(key)) {
                    bad("spec " + ref);
                }
                break;
            case "plain":
                if (n.has("sub") || n.has("of")) {
                    bad("spec " + ref);
                }
                main = parts(n.path("parts"), col, false);
                if (main.size() != 1) {
                    bad("spec " + ref);
                }
                break;
            case "eok":
                if (n.has("sub") || n.has("of")) {
                    bad("spec " + ref);
                }
                main = parts(n.path("parts"), col, true);
                break;
            case "paren":
                if (n.has("of")) {
                    bad("spec " + ref);
                }
                main = parts(n.path("parts"), col, true);
                sub = parts(n.path("sub"), col, true);
                break;
            default:
                bad("op " + ref);
        }
        return new CellSpec(key, op, main, sub, of);
    }

    private List<Part> parts(JsonNode v, String col, boolean needMillion) {
        List<Part> out = new ArrayList<>();
        for (String r : texts(v, 1, MAX_PARTS, 80, "parts")) {
            int dot = r.indexOf('.');
            AreaDef a = dot < 0 ? null : areas.get(r.substring(0, dot));
            String row = dot < 0 ? "" : r.substring(dot + 1);
            if (a == null || !a.area().hasRow(row) || !a.area().hasCol(col)
                    || (needMillion && !UNIT_SOURCE.equals(a.getUnit()))) {
                bad("part");
            }
            out.add(new Part(a.area().getId(), row, col));
        }
        return out;
    }

    private static List<Integer> mappedIdx(BoardDocSpec.Table t, int r) {
        List<Integer> out = new ArrayList<>();
        if (r >= 0 && r < t.getRows().size()) {
            for (int i = 0; i < t.getRows().get(r).size(); i++) {
                if (t.getRows().get(r).get(i).isMapped()) {
                    out.add(i);
                }
            }
        }
        return out;
    }

    private static List<String> texts(JsonNode v, int min, int max, int maxLen, String why) {
        List<String> out = new ArrayList<>();
        if (v.isTextual()) {
            out.add(v.asText());
        } else if (v.isArray()) {
            for (JsonNode x : v) {
                if (!x.isTextual()) {
                    bad(why);
                }
                out.add(x.asText());
            }
        }
        if (out.size() < min || out.size() > max) {
            bad(why);
        }
        for (String s : out) {
            if (s.trim().isEmpty() || s.length() > maxLen) {
                bad(why);
            }
        }
        return out;
    }

    private static boolean validId(String s) {
        if (s == null || s.isEmpty() || s.length() > 31 || s.charAt(0) < 'a' || s.charAt(0) > 'z') {
            return false;
        }
        for (int i = 1; i < s.length(); i++) {
            char c = s.charAt(i);
            if (!((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_')) {
                return false;
            }
        }
        return true;
    }

    private static JsonNode read(String resource) {
        try (InputStream in = new ClassPathResource(resource).getInputStream()) {
            return new ObjectMapper().readTree(in);
        } catch (IOException e) {
            throw new IllegalStateException("excel-map missing");
        }
    }

    private static void bad(String why) {
        throw new IllegalStateException("excel-map invalid: " + why);
    }
}
