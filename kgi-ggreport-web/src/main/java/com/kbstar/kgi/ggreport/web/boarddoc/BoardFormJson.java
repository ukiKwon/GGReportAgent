package com.kbstar.kgi.ggreport.web.boarddoc;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 저장용 JSON(BOARD_FORM_VER.SPEC_JSON) ↔ Doc.
 *
 * <p><b>저장(fmt 2)</b>: 표마다 ref·제목·열 id 목록(cols)·행(id + 칸[c,t,cs,rs,h,i,a])·다음 id 카운터(next_r, next_c)를 담는다.
 * 사용자가 고친 구조(행·열 삽입/삭제, 병합)가 그대로 저장되고 읽을 때 그대로 복원된다.
 * 엑셀 연결 여부(mapped)는 저장하지 않고 (표, 행id, 열id)를 카탈로그와 대조해 읽을 때 매번 계산한다 — 연결 칸의 t 는 항상 "".
 * 양식에서 빠진 표의 카운터는 루트의 kept([{ref,next_r,next_c}])에 보관해, 표를 다시 넣어도 지운 id 를 재사용하지 않는다.
 * 옛 모양 cells 맵(롤백 안전용 병기)은 PR-2 부터 쓰지 않는다 — 읽을 때도 무시한다.
 * <pre>{"fmt":2,"catalog_ver":2,"tables":[{"ref":"A","title":"…","cols":["c0",…],
 *  "rows":[{"id":"r0","cells":[{"c":"c0","t":"…","cs":1,"rs":1,"h":true,"i":false,"a":"center"}]}],
 *  "next_r":100,"next_c":100}],"kept":[{"ref":"B","next_r":103,"next_c":100}]}</pre>
 *
 * <p><b>읽기</b>: fmt 가 없는 옛 JSON 은 catalog_ver 별로 얼려 둔 번역표({@link BoardLegacyKeys})로 새 key 로 옮긴다 —
 * 같은 옛 버전은 항상 같은 결과다. 번역표가 없는 catalog_ver, 알 수 없는 fmt, 깨진 구조는
 * <b>모두 IllegalStateException(닫힌 실패)</b>이다 — 기본 구조로 조용히 되돌려 보여 주지도, 저장하지도 않는다.
 * 저장 JSON 의 id 는 정규형이고 카운터(next_r/next_c)보다 작으면 임의의 값을 허용한다(사용자 구조 복원).
 *
 * <p><b>카탈로그 이행(catalog_ver 1 → 2)</b>: catalog_ver 1 로 저장된 양식(fmt 없음 포함)은 읽을 때 C-5 를 맨 뒤에 덧붙이고
 * C-3 의 새 열(사업초기, id c6)은 기본 문구로 채운다 — 사용자가 고친 문구(기존 칸 key)는 그대로다. 저장하면 catalog_ver 2 로 기록된다.
 * catalog_ver 1 의 구조는 사용자가 고칠 수 없었으므로(구조 편집 이전) 카탈로그 v1 모양과 같아야 한다.
 * catalog_ver 가 코드보다 크거나 0 이하이면 닫힌 실패다.
 */
public final class BoardFormJson {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String BAD = "stored board form is not valid";

    private BoardFormJson() {
    }

    public static String toJson(BoardDocSpec.Doc doc) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("fmt", BoardDocSpec.FORM_FMT);
        root.put("catalog_ver", BoardDocSpec.CATALOG_VER);
        List<Map<String, Object>> tables = new ArrayList<>();
        for (BoardDocSpec.Table t : doc.getTables()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ref", t.getId());
            m.put("title", t.getTitle());
            m.put("cols", new ArrayList<>(t.getColIds()));
            List<Map<String, Object>> rows = new ArrayList<>();
            for (int r = 0; r < t.getRows().size(); r++) {
                List<BoardDocSpec.Cell> row = t.getRows().get(r);
                List<Map<String, Object>> cells = new ArrayList<>();
                for (BoardDocSpec.Cell c : row) {
                    Map<String, Object> cm = new LinkedHashMap<>();
                    cm.put("c", c.getColId());
                    cm.put("t", c.isMapped() ? "" : c.getText());
                    cm.put("cs", c.getColspan());
                    cm.put("rs", c.getRowspan());
                    cm.put("h", c.isHeader());
                    cm.put("i", c.isInput());
                    cm.put("a", c.getAlign());
                    cells.add(cm);
                }
                Map<String, Object> rm = new LinkedHashMap<>();
                rm.put("id", t.getRowIds().get(r));
                rm.put("cells", cells);
                rows.add(rm);
            }
            m.put("rows", rows);
            m.put("next_r", t.getNextR());
            m.put("next_c", t.getNextC());
            tables.add(m);
        }
        root.put("tables", tables);
        if (!doc.getKept().isEmpty()) {
            List<Map<String, Object>> kept = new ArrayList<>();
            for (Map.Entry<String, int[]> e : doc.getKept().entrySet()) {
                Map<String, Object> k = new LinkedHashMap<>();
                k.put("ref", e.getKey());
                k.put("next_r", e.getValue()[0]);
                k.put("next_c", e.getValue()[1]);
                kept.add(k);
            }
            root.put("kept", kept);
        }
        try {
            return MAPPER.writeValueAsString(root);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(BAD);
        }
    }

    public static List<BoardDocSpec.TableEdit> parse(String json) {
        try {
            JsonNode root = MAPPER.readTree(json);
            JsonNode tables = root == null ? null : root.get("tables");
            if (tables == null || !tables.isArray()) {
                throw new IllegalStateException(BAD);
            }
            boolean v2 = root.has("fmt");
            if (v2 && !(root.get("fmt").isInt() && root.get("fmt").asInt() == BoardDocSpec.FORM_FMT)) {
                throw new IllegalStateException(BAD);               // 모르는 fmt — 읽지 않는다
            }
            int ver = root.path("catalog_ver").asInt(0);
            if (v2 ? (ver < 1 || ver > BoardDocSpec.CATALOG_VER) : !BoardLegacyKeys.supports(ver)) {
                throw new IllegalStateException(BAD);               // 번역표가 없는 버전 — 닫힌 실패
            }
            List<BoardDocSpec.TableEdit> out = new ArrayList<>();
            for (JsonNode t : tables) {
                String ref = t.hasNonNull("ref") ? t.get("ref").asText() : null;
                String title = t.hasNonNull("title") ? t.get("title").asText() : null;
                if (ver < 2 && BoardDocSpec.C5_REF.equals(ref)) {
                    throw new IllegalStateException(BAD);           // C-5 는 카탈로그 2 에서 생긴 표 — 1 로 저장된 것이 있을 수 없다
                }
                if (v2 && ver >= 2) {
                    out.add(BoardDocSpec.catalogTable(ref, false) == null
                            ? new BoardDocSpec.TableEdit(ref, title, null, null)   // 모르는 표 — build 가 거부
                            : readStored(t, ref, title));
                    continue;
                }
                Map<String, String> cells = v2 ? readV1Structure(t, ref, ver) : readLegacy(t, ver, ref);
                out.add(new BoardDocSpec.TableEdit(ref, title, null, cells));
            }
            if (v2 && ver >= 2 && root.has("kept")) {
                readKept(root.get("kept"), out);
            }
            if (ver < 2) {
                // 이행: CATALOG_VER 1 로 저장된 양식을 읽을 때 붙임 5(C-5)를 맨 뒤에 덧붙인다(C-3 사업초기 열은 build 가 기본 문구로 채운다).
                out.add(new BoardDocSpec.TableEdit(BoardDocSpec.C5_REF, null, null, null));
            }
            return out;
        } catch (IOException e) {
            throw new IllegalStateException(BAD);
        }
    }

    /** fmt 없는 옛 JSON: cells 의 옛 key 를 얼린 번역표로 새 key 로 옮긴다. 번역 못 하면 닫힌 실패. */
    private static Map<String, String> readLegacy(JsonNode t, int ver, String ref) {
        Map<String, String> cells = new LinkedHashMap<>();
        JsonNode c = t.get("cells");
        if (c != null && c.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> it = c.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                String key = BoardDocSpec.legacyToKey(ver, ref, e.getKey());
                if (key == null || cells.put(key, e.getValue().asText()) != null) {
                    throw new IllegalStateException(BAD);
                }
            }
        }
        return cells;
    }

    /** fmt 2 + catalog_ver 2: 저장된 구조를 그대로 복원 입력으로 바꾼다(타입이 어긋나면 닫힌 실패). 값 검증은 build 가 한다. */
    private static BoardDocSpec.TableEdit readStored(JsonNode t, String ref, String title) {
        JsonNode cols = t.get("cols");
        JsonNode rows = t.get("rows");
        if (cols == null || !cols.isArray() || rows == null || !rows.isArray()
                || !t.path("next_r").isInt() || !t.path("next_c").isInt()) {
            throw new IllegalStateException(BAD);
        }
        List<BoardDocSpec.ColEdit> cl = new ArrayList<>();
        for (JsonNode c : cols) {
            if (!c.isTextual()) {
                throw new IllegalStateException(BAD);
            }
            cl.add(new BoardDocSpec.ColEdit(c.asText()));
        }
        List<BoardDocSpec.RowEdit> rl = new ArrayList<>();
        for (JsonNode row : rows) {
            JsonNode rc = row.get("cells");
            if (!row.path("id").isTextual() || rc == null || !rc.isArray()) {
                throw new IllegalStateException(BAD);
            }
            List<BoardDocSpec.CellEdit> cells = new ArrayList<>();
            for (JsonNode n : rc) {
                if (!n.path("c").isTextual() || !n.path("t").isTextual() || !n.path("cs").isInt() || !n.path("rs").isInt()
                        || !n.path("h").isBoolean() || !n.path("i").isBoolean() || !n.path("a").isTextual()) {
                    throw new IllegalStateException(BAD);
                }
                cells.add(new BoardDocSpec.CellEdit(n.get("c").asText(), n.get("t").asText(), n.get("cs").asInt(),
                        n.get("rs").asInt(), n.get("h").asBoolean(), n.get("i").asBoolean(), n.get("a").asText()));
            }
            rl.add(new BoardDocSpec.RowEdit(row.get("id").asText(), cells));
        }
        return BoardDocSpec.TableEdit.stored(ref, title, cl, rl, t.get("next_r").asInt(), t.get("next_c").asInt());
    }

    private static void readKept(JsonNode kept, List<BoardDocSpec.TableEdit> out) {
        if (!kept.isArray()) {
            throw new IllegalStateException(BAD);
        }
        for (JsonNode k : kept) {
            if (!k.path("ref").isTextual() || !k.path("next_r").isInt() || !k.path("next_c").isInt()) {
                throw new IllegalStateException(BAD);
            }
            out.add(BoardDocSpec.TableEdit.kept(k.get("ref").asText(), k.get("next_r").asInt(), k.get("next_c").asInt()));
        }
    }

    /**
     * fmt 2 인데 catalog_ver 1(구조 편집 이전에 저장된 것): 구조(cols·행 id·칸 속성·카운터)가 카탈로그 v1 모양과 같은지 확인하고
     * 편집 가능한 칸의 문구만 꺼낸다. 모르는 ref 는 구조를 비교할 수 없으므로 빈 맵으로 넘기고, build 가 "알 수 없는 표"로 거부한다.
     */
    private static Map<String, String> readV1Structure(JsonNode t, String ref, int ver) {
        Map<String, String> cells = new LinkedHashMap<>();
        BoardDocSpec.Table base = BoardDocSpec.catalogTable(ref, false);
        if (base == null) {
            return cells;
        }
        // CATALOG_VER 1 로 저장된 C-3 에는 사업초기 열(c6)이 없었다 — 그 열을 뺀 얼린 모양과 비교한다. 나머지 id·위치는 그대로다.
        String skipCol = ver < 2 && "C-3".equals(ref) ? BoardDocSpec.C3_INIT_COL : null;
        List<String> baseCols = new ArrayList<>(base.getColIds());
        if (skipCol != null) {
            baseCols.remove(skipCol);
        }
        JsonNode cols = t.get("cols");
        JsonNode rows = t.get("rows");
        if (cols == null || !cols.isArray() || cols.size() != baseCols.size()
                || rows == null || !rows.isArray() || rows.size() != base.getRows().size()
                || t.path("next_r").asInt(-1) != base.getNextR() || t.path("next_c").asInt(-1) != base.getNextC()) {
            throw new IllegalStateException(BAD);
        }
        for (int i = 0; i < cols.size(); i++) {
            if (!cols.get(i).isTextual() || !cols.get(i).asText().equals(baseCols.get(i))) {
                throw new IllegalStateException(BAD);
            }
        }
        for (int r = 0; r < rows.size(); r++) {
            JsonNode row = rows.get(r);
            List<BoardDocSpec.Cell> bc = new ArrayList<>();
            for (BoardDocSpec.Cell c : base.getRows().get(r)) {
                if (skipCol == null || !skipCol.equals(c.getColId())) {
                    bc.add(c);
                }
            }
            JsonNode rc = row.get("cells");
            if (!row.path("id").isTextual() || !row.get("id").asText().equals(base.getRowIds().get(r))
                    || rc == null || !rc.isArray() || rc.size() != bc.size()) {
                throw new IllegalStateException(BAD);
            }
            for (int i = 0; i < bc.size(); i++) {
                JsonNode n = rc.get(i);
                BoardDocSpec.Cell b = bc.get(i);
                if (!n.path("c").isTextual() || !n.get("c").asText().equals(b.getColId())
                        || n.path("cs").asInt(-1) != b.getColspan() || n.path("rs").asInt(-1) != b.getRowspan()
                        || !n.path("h").isBoolean() || n.get("h").asBoolean() != b.isHeader()
                        || !n.path("i").isBoolean() || n.get("i").asBoolean() != b.isInput()
                        || !n.path("a").isTextual() || !n.get("a").asText().equals(b.getAlign())
                        || !n.path("t").isTextual()) {
                    throw new IllegalStateException(BAD);
                }
                if (!b.isMapped()) {
                    cells.put(b.getKey(), n.get("t").asText());
                }
            }
        }
        return cells;
    }

    public static int catalogVer(String json) {
        try {
            JsonNode root = MAPPER.readTree(json);
            return root == null ? 0 : root.path("catalog_ver").asInt(0);
        } catch (IOException e) {
            throw new IllegalStateException(BAD);
        }
    }
}
