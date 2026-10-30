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
 * 저장용 JSON(BOARD_FORM_VER.SPEC_JSON) ↔ Doc. 구조·매핑·주석은 저장하지 않고 ref·제목·편집 가능한 칸의 문구만 둔다.
 * {"catalog_ver":1,"tables":[{"ref":"A","title":"…","cells":{"r0c0":"…"}}]}
 */
public final class BoardFormJson {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String BAD = "stored board form is not valid";

    private BoardFormJson() {
    }

    public static String toJson(BoardDocSpec.Doc doc) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("catalog_ver", BoardDocSpec.CATALOG_VER);
        List<Map<String, Object>> tables = new ArrayList<>();
        for (BoardDocSpec.Table t : doc.getTables()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ref", t.getId());
            m.put("title", t.getTitle());
            Map<String, String> cells = new LinkedHashMap<>();
            for (int r = 0; r < t.getRows().size(); r++) {
                List<BoardDocSpec.Cell> row = t.getRows().get(r);
                for (int i = 0; i < row.size(); i++) {
                    if (!row.get(i).isMapped()) {
                        cells.put(BoardDocSpec.cellKey(r, i), row.get(i).getText());
                    }
                }
            }
            m.put("cells", cells);
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
            List<BoardDocSpec.TableEdit> out = new ArrayList<>();
            for (JsonNode t : tables) {
                Map<String, String> cells = new LinkedHashMap<>();
                JsonNode c = t.get("cells");
                if (c != null && c.isObject()) {
                    Iterator<Map.Entry<String, JsonNode>> it = c.fields();
                    while (it.hasNext()) {
                        Map.Entry<String, JsonNode> e = it.next();
                        cells.put(e.getKey(), e.getValue().asText());
                    }
                }
                String ref = t.hasNonNull("ref") ? t.get("ref").asText() : null;
                String title = t.hasNonNull("title") ? t.get("title").asText() : null;
                out.add(new BoardDocSpec.TableEdit(ref, title, null, cells));
            }
            return out;
        } catch (IOException e) {
            throw new IllegalStateException(BAD);
        }
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
