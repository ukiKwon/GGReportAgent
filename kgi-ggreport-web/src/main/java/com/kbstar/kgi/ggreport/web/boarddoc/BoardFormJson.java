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
 * 엑셀 연결 여부(mapped)는 저장하지 않고 (표, 행id, 열id)를 카탈로그와 대조해 읽을 때 매번 계산한다 — 연결 칸의 t 는 항상 "".
 * 롤백 안전용으로 옛 모양의 cells 맵({@code "r{행}c{순번}":"문구"})을 표마다 병기한다(이전 버전 코드는 ref·title·cells 만 읽는다).
 * <pre>{"fmt":2,"catalog_ver":1,"tables":[{"ref":"A","title":"…","cols":["c0",…],
 *  "rows":[{"id":"r0","cells":[{"c":"c0","t":"…","cs":1,"rs":1,"h":true,"i":false,"a":"center"}]}],
 *  "next_r":100,"next_c":100,"cells":{"r0c0":"…"}}]}</pre>
 *
 * <p><b>읽기</b>: fmt 가 없는 옛 JSON 은 catalog_ver 별로 얼려 둔 번역표({@link BoardLegacyKeys})로 새 key 로 옮긴다 —
 * 같은 옛 버전은 항상 같은 결과다. 번역표가 없는 catalog_ver, 알 수 없는 fmt, 카탈로그와 어긋난 구조는
 * <b>모두 IllegalStateException(닫힌 실패)</b>이다 — 기본 구조로 조용히 되돌려 보여 주지도, 저장하지도 않는다.
 * (PR-1 은 구조 편집이 없으므로 fmt 2 의 구조는 카탈로그와 같아야 한다. 구조 편집이 들어오면 이 검증이 구조 복원으로 바뀐다.)
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
            Map<String, String> legacy = new LinkedHashMap<>();
            for (int r = 0; r < t.getRows().size(); r++) {
                List<BoardDocSpec.Cell> row = t.getRows().get(r);
                List<Map<String, Object>> cells = new ArrayList<>();
                for (int i = 0; i < row.size(); i++) {
                    BoardDocSpec.Cell c = row.get(i);
                    Map<String, Object> cm = new LinkedHashMap<>();
                    cm.put("c", c.getColId());
                    cm.put("t", c.isMapped() ? "" : c.getText());
                    cm.put("cs", c.getColspan());
                    cm.put("rs", c.getRowspan());
                    cm.put("h", c.isHeader());
                    cm.put("i", c.isInput());
                    cm.put("a", c.getAlign());
                    cells.add(cm);
                    if (!c.isMapped()) {
                        legacy.put(BoardLegacyKeys.legacyKey(r, i), c.getText());
                    }
                }
                Map<String, Object> rm = new LinkedHashMap<>();
                rm.put("id", t.getRowIds().get(r));
                rm.put("cells", cells);
                rows.add(rm);
            }
            m.put("rows", rows);
            m.put("next_r", t.getNextR());
            m.put("next_c", t.getNextC());
            m.put("cells", legacy);
            tables.add(m);
        }
        root.put("tables", tables);
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
                Map<String, String> cells = v2 ? readV2(t, ref) : readLegacy(t, ver, ref);
                out.add(new BoardDocSpec.TableEdit(ref, title, null, cells));
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

    /**
     * fmt 2: 구조(cols·행 id·칸 속성·카운터)가 카탈로그와 같은지 확인하고 편집 가능한 칸의 문구만 꺼낸다.
     * 모르는 ref 는 구조를 비교할 수 없으므로 빈 맵으로 넘기고, build 가 "알 수 없는 표"로 거부한다.
     */
    private static Map<String, String> readV2(JsonNode t, String ref) {
        Map<String, String> cells = new LinkedHashMap<>();
        BoardDocSpec.Table base = BoardDocSpec.catalogTable(ref, false);
        if (base == null) {
            return cells;
        }
        JsonNode cols = t.get("cols");
        JsonNode rows = t.get("rows");
        if (cols == null || !cols.isArray() || cols.size() != base.getColIds().size()
                || rows == null || !rows.isArray() || rows.size() != base.getRows().size()
                || t.path("next_r").asInt(-1) != base.getNextR() || t.path("next_c").asInt(-1) != base.getNextC()) {
            throw new IllegalStateException(BAD);
        }
        for (int i = 0; i < cols.size(); i++) {
            if (!cols.get(i).isTextual() || !cols.get(i).asText().equals(base.getColIds().get(i))) {
                throw new IllegalStateException(BAD);
            }
        }
        for (int r = 0; r < rows.size(); r++) {
            JsonNode row = rows.get(r);
            List<BoardDocSpec.Cell> bc = base.getRows().get(r);
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
