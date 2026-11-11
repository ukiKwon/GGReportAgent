package com.kbstar.kgi.ggreport.web.boarddoc;

import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class BoardDocEditTest {

    private static BoardDocSpec.TableEdit edit(String ref) {
        return new BoardDocSpec.TableEdit(ref, null, null, null);
    }

    private static BoardDocSpec.TableEdit edit(String ref, String title, String key, String text) {
        Map<String, String> cells = new LinkedHashMap<>();
        if (key != null) {
            cells.put(key, text);
        }
        return new BoardDocSpec.TableEdit(ref, title, null, cells);
    }

    private static List<BoardDocSpec.TableEdit> list(BoardDocSpec.TableEdit... e) {
        return new ArrayList<>(Arrays.asList(e));
    }

    private static BoardDocSpec.Table table(BoardDocSpec.Doc d, String ref) {
        for (BoardDocSpec.Table t : d.getTables()) {
            if (ref.equals(t.getId())) {
                return t;
            }
        }
        throw new AssertionError("table not found " + ref);
    }

    private static String rep(String s, int n) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < n; i++) {
            b.append(s);
        }
        return b.toString();
    }

    private static void expectEdit(List<BoardDocSpec.TableEdit> edits, String messagePart) {
        try {
            BoardDocSpec.build("x", "이름", edits, true);
            fail("EditException 이 나와야 한다: " + messagePart);
        } catch (BoardDocSpec.EditException e) {
            assertTrue(e.getMessage(), e.getMessage().contains(messagePart));
        }
    }

    @Test
    public void 카탈로그는_표_6개_순서_고정_버전_2() {
        assertEquals(2, BoardDocSpec.CATALOG_VER);
        String[] order = {"A", "B", "C-2", "C-3", "C-4", "C-5"};
        List<BoardDocSpec.Table> cat = BoardDocSpec.catalog(true);
        assertEquals(order.length, cat.size());
        for (int i = 0; i < order.length; i++) {
            assertEquals(order[i], cat.get(i).getId());
        }
        assertEquals(null, BoardDocSpec.catalogTable("nope", true));
    }

    @Test
    public void 칸_키는_행id_열id_매핑_칸은_편집_불가_기관명은_직접_입력이라_편집_가능() {
        Set<String> keys = BoardDocSpec.editableKeys(BoardDocSpec.catalogTable("A", true));
        assertEquals(11, keys.size());
        for (String k : new String[]{"r0_c0", "r0_c3", "r1_c0", "r1_c1", "r1_c3", "r2_c1", "r3_c1", "r4_c1", "r4_c3"}) {
            assertTrue(k, keys.contains(k));
        }
        for (String k : new String[]{"r1_c2", "r2_c2", "r3_c2", "r4_c2"}) {
            assertFalse(k, keys.contains(k));
        }
        assertEquals("r3_c2", BoardDocSpec.cellKey("r3", "c2"));
    }

    @Test
    public void 제목과_머리글_재정의가_반영되고_나머지는_카탈로그_그대로() {
        BoardDocSpec.Doc d = BoardDocSpec.build("x", "내 양식", list(
                edit("A", "새 제목", "r0_c0", "기관"), edit("C-4")), true);
        BoardDocSpec.Table a = table(d, "A");
        assertEquals("새 제목", a.getTitle());
        assertEquals("기관", a.getRows().get(0).get(0).getText());
        assertEquals("구분", a.getRows().get(0).get(1).getText());
        assertEquals("대한민국 기관", a.getRows().get(1).get(0).getText());     // 직접 입력 칸(기관명)의 카탈로그 샘플 문구 유지
        assertEquals(4, a.getRows().get(1).get(0).getRowspan());                // 구조 유지
        assertEquals("내 양식", d.getName());
        assertEquals("Ⅳ. 투자적정성 분석", table(d, "C-4").getTitle());
        assertEquals(2, table(d, "C-4").getNotes().size());
    }

    @Test
    public void 삭제와_순서_변경은_입력_순서를_따른다() {
        BoardDocSpec.Doc d = BoardDocSpec.build("x", "n", list(edit("C-4"), edit("A")), true);
        assertEquals(2, d.getTables().size());
        assertEquals("C-4", d.getTables().get(0).getId());
        assertEquals("A", d.getTables().get(1).getId());
    }

    @Test
    public void 중복_표_모르는_표_빈_목록은_거부() {
        expectEdit(list(edit("A"), edit("A")), "두 번");
        expectEdit(list(edit("ZZ")), "알 수 없는 표");
        expectEdit(list(new BoardDocSpec.TableEdit(null, null, null, null)), "알 수 없는 표");
        expectEdit(new ArrayList<BoardDocSpec.TableEdit>(), "하나 이상");
        expectEdit(null, "하나 이상");
    }

    @Test
    public void 매핑_칸_없는_칸_키_null_값은_거부() {
        expectEdit(list(edit("A", null, "r1_c2", "x")), "수정할 수 없는 칸");        // 연결 칸(기관명 r1_c0 은 직접 입력 칸이라 편집 가능)
        expectEdit(list(edit("A", null, "r9_c9", "x")), "수정할 수 없는 칸");
        expectEdit(list(edit("A", null, "r0_c0", null)), "올바르지 않습니다");
        expectEdit(list(edit("A", null, "r0c0", "x")), "수정할 수 없는 칸");        // 옛 모양 key 는 번역하지 않고 거부(낡은 화면 보호)
    }

    @Test
    public void 주석은_읽기_전용_같은_값_에코는_허용() {
        List<String> same = BoardDocSpec.catalogTable("C-4", true).getNotes();
        BoardDocSpec.build("x", "n", list(new BoardDocSpec.TableEdit("C-4", null, new ArrayList<>(same), null)), true);
        expectEdit(list(new BoardDocSpec.TableEdit("C-4", null, Arrays.asList("바꾼 주석"), null)), "주석");
    }

    @Test
    public void 길이_제어문자_빈_제목_거부와_공백_다듬기() {
        expectEdit(list(edit("A", rep("가", 101), null, null)), "100자");
        expectEdit(list(edit("A", "   ", null, null)), "표 제목을 입력");
        expectEdit(list(edit("A", "a\nb", null, null)), "쓸 수 없는 문자");
        expectEdit(list(edit("A", null, "r0_c0", rep("나", 101))), "100자");
        expectEdit(list(edit("A", null, "r0_c0", "a\tb")), "쓸 수 없는 문자");
        expectEdit(list(edit("A", null, "r0_c0", "\uD800")), "쓸 수 없는 문자");
        BoardDocSpec.Doc d = BoardDocSpec.build("x", "n", list(edit("A", "  제목  ", "r0_c0", "  ")), true);
        assertEquals("제목", table(d, "A").getTitle());
        assertEquals("", table(d, "A").getRows().get(0).get(0).getText());      // 빈 칸 허용
        assertEquals(60, BoardDocSpec.validName(rep("가", 60)).length());
        try {
            BoardDocSpec.validName(rep("가", 61));
            fail();
        } catch (BoardDocSpec.EditException expected) {
            assertTrue(expected.getMessage().contains("60자"));
        }
        try {
            BoardDocSpec.validName("  ");
            fail();
        } catch (BoardDocSpec.EditException expected) {
            assertTrue(expected.getMessage().contains("입력"));
        }
    }

    @Test
    public void 저장_JSON은_왕복해도_같고_매핑_칸을_담지_않는다() {
        BoardDocSpec.Doc d = BoardDocSpec.build("x", "n", list(
                edit("A", "새 제목", "r0_c0", "기관"), edit("C-4")), false);
        String json = BoardFormJson.toJson(d);
        assertEquals(2, BoardFormJson.catalogVer(json));                       // 저장하면 현재 카탈로그 버전으로 기록
        assertTrue(json.startsWith("{\"fmt\":2,\"catalog_ver\":2,"));
        // PR-2: 옛 모양 cells 맵(r{행}c{순번}) 병기는 없다 — 칸 문구는 행·칸 구조 안에만 있다
        assertFalse(json.contains("\"cells\":{"));
        assertFalse(json.contains("r0c0"));
        // 표 A 의 기관명 칸(r1_c0)은 직접 입력 칸이다(정식 양식 문구는 빈 문자열, i:true)
        String aPart = json.substring(json.indexOf("\"ref\":\"A\""), json.indexOf("\"ref\":\"C-4\""));
        assertTrue(aPart.contains("\"c\":\"c0\",\"t\":\"\",\"cs\":1,\"rs\":4"));
        assertTrue(aPart.contains("\"next_r\":100,\"next_c\":100"));
        assertFalse(json.contains("\"kept\""));
        BoardDocSpec.Doc again = BoardDocSpec.build("x", "n", BoardFormJson.parse(json), false);
        assertEquals(json, BoardFormJson.toJson(again));
        assertEquals("새 제목", table(again, "A").getTitle());
        assertEquals("기관", table(again, "A").getRows().get(0).get(0).getText());
    }

    private static final String LEGACY_JSON = "{\"catalog_ver\":1,\"tables\":["
            + "{\"ref\":\"A\",\"title\":\"옛 제목\",\"cells\":{\"r0c0\":\"옛 기관\",\"r2c0\":\"옛 예비비\",\"r4c0\":\"옛 합계\",\"r4c2\":\"옛 비고\"}},"
            + "{\"ref\":\"B\",\"title\":\"5. 수익성 분석\",\"cells\":{\"r0c1\":\"옛 총기대\",\"r2c0\":\"옛 현재가치\"}},"
            + "{\"ref\":\"C-4\"}]}";

    @Test
    public void 옛_포맷_JSON은_새_key로_번역돼_문구가_보존되고_눈에_보이는_구조는_같다() {
        BoardDocSpec.Doc old = BoardDocSpec.build("x", "n", BoardFormJson.parse(LEGACY_JSON), false);
        BoardDocSpec.Table a = table(old, "A");
        assertEquals("옛 제목", a.getTitle());
        assertEquals("옛 기관", a.getRows().get(0).get(0).getText());          // r0c0 → r0_c0
        assertEquals("옛 예비비", a.getRows().get(2).get(0).getText());          // 옛 r2c0(예비비 라벨) → r2_c1
        assertEquals("r2_c1", a.getRows().get(2).get(0).getKey());
        assertEquals("옛 합계", a.getRows().get(4).get(0).getText());            // 옛 r4c0 → r4_c1
        assertEquals("옛 비고", a.getRows().get(4).get(2).getText());            // 옛 r4c2 → r4_c3
        assertEquals("r4_c3", a.getRows().get(4).get(2).getKey());
        assertEquals("옛 총기대", table(old, "B").getRows().get(0).get(1).getText());    // 옛 r0c1 → r0_c2
        assertEquals("r0_c2", table(old, "B").getRows().get(0).get(1).getKey());
        assertEquals("옛 현재가치", table(old, "B").getRows().get(2).get(0).getText());  // 옛 r2c0 → r2_c1
        // 번역 안 된 칸은 카탈로그 기본 문구, 표 구조(행·열·병합)는 카탈로그와 같다
        BoardDocSpec.Doc base = BoardDocSpec.build("x", "n", list(edit("A"), edit("B"), edit("C-4")), false);
        for (String ref : new String[]{"A", "B", "C-4"}) {
            BoardDocSpec.Table o = table(old, ref);
            BoardDocSpec.Table c = table(base, ref);
            assertEquals(c.getColumns(), o.getColumns());
            assertEquals(c.getRows().size(), o.getRows().size());
            for (int r = 0; r < c.getRows().size(); r++) {
                assertEquals(c.getRows().get(r).size(), o.getRows().get(r).size());
                for (int i = 0; i < c.getRows().get(r).size(); i++) {
                    BoardDocSpec.Cell oc = o.getRows().get(r).get(i);
                    BoardDocSpec.Cell cc = c.getRows().get(r).get(i);
                    assertEquals(cc.getKey(), oc.getKey());
                    assertEquals(cc.getColspan(), oc.getColspan());
                    assertEquals(cc.getRowspan(), oc.getRowspan());
                    assertEquals(cc.isMapped(), oc.isMapped());
                    assertEquals(cc.isHeader(), oc.isHeader());
                }
            }
        }
        assertEquals("합계", table(base, "A").getRows().get(4).get(0).getText());
        // 같은 옛 JSON 은 언제나 같은 Doc → 같은 새 JSON
        BoardDocSpec.Doc old2 = BoardDocSpec.build("x", "n", BoardFormJson.parse(LEGACY_JSON), false);
        assertEquals(BoardFormJson.toJson(old), BoardFormJson.toJson(old2));
        // 다시 쓴 새 포맷도 왕복해서 같다
        String upgraded = BoardFormJson.toJson(old);
        assertTrue(upgraded.startsWith("{\"fmt\":2,"));
        assertEquals(upgraded, BoardFormJson.toJson(BoardDocSpec.build("x", "n", BoardFormJson.parse(upgraded), false)));
    }

    // ── CATALOG_VER 1 → 2 이행 (C-5 덧붙임, C-3 사업초기 열 삽입) ──

    /** 현재 모양으로 쓴 JSON 을 catalog_ver 1 로 저장됐던 모양으로 되돌린다: catalog_ver=1, C-5 제거, C-3 의 새 열(c6) 제거. */
    private static String asV1(String json) throws Exception {
        com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
        com.fasterxml.jackson.databind.node.ObjectNode root = (com.fasterxml.jackson.databind.node.ObjectNode) om.readTree(json);
        root.put("catalog_ver", 1);
        com.fasterxml.jackson.databind.node.ArrayNode tables = (com.fasterxml.jackson.databind.node.ArrayNode) root.get("tables");
        for (int i = tables.size() - 1; i >= 0; i--) {
            com.fasterxml.jackson.databind.node.ObjectNode t = (com.fasterxml.jackson.databind.node.ObjectNode) tables.get(i);
            String ref = t.get("ref").asText();
            if ("C-5".equals(ref)) {
                tables.remove(i);
            } else if ("A".equals(ref)) {
                for (com.fasterxml.jackson.databind.JsonNode row : t.get("rows")) {      // 그때는 기관명(r1_c0)이 연결 칸(i:false)이었다
                    if ("r1".equals(row.get("id").asText())) {
                        ((com.fasterxml.jackson.databind.node.ObjectNode) row.get("cells").get(0)).put("i", false);
                    }
                }
            } else if ("C-3".equals(ref)) {
                com.fasterxml.jackson.databind.node.ArrayNode cols = (com.fasterxml.jackson.databind.node.ArrayNode) t.get("cols");
                for (int j = cols.size() - 1; j >= 0; j--) {
                    if ("c6".equals(cols.get(j).asText())) {
                        cols.remove(j);
                    }
                }
                for (com.fasterxml.jackson.databind.JsonNode row : t.get("rows")) {
                    com.fasterxml.jackson.databind.node.ArrayNode cells = (com.fasterxml.jackson.databind.node.ArrayNode) row.get("cells");
                    for (int j = cells.size() - 1; j >= 0; j--) {
                        if ("c6".equals(cells.get(j).get("c").asText())) {
                            cells.remove(j);
                        }
                    }
                }
            }
        }
        return om.writeValueAsString(root);
    }

    @Test
    public void 카탈로그_1로_저장된_fmt2_양식은_C5를_맨뒤에_덧붙이고_C3에_열을_끼우며_문구를_보존한다() throws Exception {
        Map<String, String> c3Cells = new LinkedHashMap<>();
        c3Cells.put("r0_c1", "내 1년차");
        c3Cells.put("r1_c0", "내 총수익");
        c3Cells.put("r0_c5", "내 계");
        BoardDocSpec.Doc cur = BoardDocSpec.build("x", "n", list(edit("A", "내 A", "r0_c0", "내 기관명"),
                new BoardDocSpec.TableEdit("C-3", "내 C-3", null, c3Cells), edit("C-4")), false);
        String v1 = asV1(BoardFormJson.toJson(cur));
        assertEquals(1, BoardFormJson.catalogVer(v1));
        assertFalse(v1.contains("\"c6\""));                                          // v1 에는 새 열이 없다
        assertTrue(v1.startsWith("{\"fmt\":2,\"catalog_ver\":1,"));

        BoardDocSpec.Doc up = BoardDocSpec.build("x", "n", BoardFormJson.parse(v1), false);
        assertEquals(Arrays.asList("A", "C-3", "C-4", "C-5"), ids(up));              // C-5 는 맨 뒤, 사용자가 뺀 표는 그대로 없다
        assertEquals("내 A", table(up, "A").getTitle());
        assertEquals("내 기관명", table(up, "A").getRows().get(0).get(0).getText());
        BoardDocSpec.Table c3 = table(up, "C-3");
        assertEquals("내 C-3", c3.getTitle());
        assertEquals(7, c3.getColumns());
        assertEquals(Arrays.asList("c0", "c6", "c1", "c2", "c3", "c4", "c5"), c3.getColIds());
        assertEquals("사업초기", c3.getRows().get(0).get(1).getText());               // 새 열은 기본 문구
        assertEquals("r0_c6", c3.getRows().get(0).get(1).getKey());
        assertEquals("내 1년차", c3.getRows().get(0).get(2).getText());               // 기존 칸 key 는 밀리지 않고 문구 보존
        assertEquals("r0_c1", c3.getRows().get(0).get(2).getKey());
        assertEquals("내 계", c3.getRows().get(0).get(6).getText());
        assertEquals("내 총수익", c3.getRows().get(1).get(0).getText());
        assertEquals(150, BoardDocSpec.mappedKeys(table(up, "C-5")).size());
        assertEquals("Ⅴ. 세부 수익성 분석표(명목가치)", table(up, "C-5").getTitle());

        // 이행한 결과를 저장하면 catalog_ver 2 이고, 다시 읽어도 같다(C-5 는 이미 있으므로 또 붙지 않는다)
        String saved = BoardFormJson.toJson(up);
        assertTrue(saved.startsWith("{\"fmt\":2,\"catalog_ver\":2,"));
        assertEquals(saved, BoardFormJson.toJson(BoardDocSpec.build("x", "n", BoardFormJson.parse(saved), false)));
        // 같은 v1 은 언제나 같은 결과
        assertEquals(saved, BoardFormJson.toJson(BoardDocSpec.build("x", "n", BoardFormJson.parse(v1), false)));
    }

    @Test
    public void 카탈로그_1_전체_표_양식도_이행되고_빠진_열만_다시_만든다() throws Exception {
        BoardDocSpec.Doc all = BoardDocSpec.find(BoardDocSpec.DEFAULT_ID, false);
        String v1 = asV1(BoardFormJson.toJson(all));
        BoardDocSpec.Doc up = BoardDocSpec.build("x", "n", BoardFormJson.parse(v1), false);
        assertEquals(Arrays.asList("A", "B", "C-2", "C-3", "C-4", "C-5"), ids(up));
        assertEquals(BoardFormJson.toJson(all), BoardFormJson.toJson(up));          // 기본 양식과 똑같이 복원
    }

    @Test
    public void 옛_fmt_없는_JSON의_C3는_사업초기_열을_끼우고_C5를_덧붙인다() {
        String legacy = "{\"catalog_ver\":1,\"tables\":[{\"ref\":\"C-3\",\"cells\":{\"r0c1\":\"옛 1년차\",\"r1c0\":\"옛 총수익\"}}]}";
        BoardDocSpec.Doc up = BoardDocSpec.build("x", "n", BoardFormJson.parse(legacy), false);
        assertEquals(Arrays.asList("C-3", "C-5"), ids(up));
        BoardDocSpec.Table c3 = table(up, "C-3");
        assertEquals("사업초기", c3.getRows().get(0).get(1).getText());
        assertEquals("옛 1년차", c3.getRows().get(0).get(2).getText());               // 옛 r0c1 → r0_c1 (1년차)
        assertEquals("r0_c1", c3.getRows().get(0).get(2).getKey());
        assertEquals("옛 총수익", c3.getRows().get(1).get(0).getText());
    }

    @Test
    public void 카탈로그_1_저장본에_C5가_있거나_C3_구조가_다르면_닫힌_실패() throws Exception {
        String v2all = BoardFormJson.toJson(BoardDocSpec.find(BoardDocSpec.DEFAULT_ID, false));
        // v1 이라 주장하면서 C-5 를 담았다
        expectBad(v2all.replace("\"catalog_ver\":2", "\"catalog_ver\":1"));
        // v2 모양(c6 열 있음)인데 v1 이라고 주장하는 C-3
        String noC5 = asV1(v2all).replace("\"catalog_ver\":1", "\"catalog_ver\":1");
        BoardFormJson.parse(noC5);                                                    // 이건 정상
        com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
        com.fasterxml.jackson.databind.node.ObjectNode root = (com.fasterxml.jackson.databind.node.ObjectNode) om.readTree(v2all);
        com.fasterxml.jackson.databind.node.ArrayNode tables = (com.fasterxml.jackson.databind.node.ArrayNode) root.get("tables");
        tables.remove(tables.size() - 1);                                             // C-5 만 뺀 v2 모양(c6 있음)
        root.put("catalog_ver", 1);
        expectBad(om.writeValueAsString(root));
    }

    private static List<String> ids(BoardDocSpec.Doc d) {
        List<String> out = new ArrayList<>();
        for (BoardDocSpec.Table t : d.getTables()) {
            out.add(t.getId());
        }
        return out;
    }

    private static void expectBad(String json) {
        try {
            BoardFormJson.parse(json);
            fail("IllegalStateException 이 나와야 한다: " + json);
        } catch (IllegalStateException expected) {
            assertEquals("stored board form is not valid", expected.getMessage());        // 입력을 싣지 않는 고정 문구
        }
    }

    @Test
    public void 번역표_없는_버전과_어긋난_저장본은_닫힌_실패() {
        expectBad("{\"catalog_ver\":2,\"tables\":[{\"ref\":\"A\"}]}");                  // 모르는 옛 버전은 기본 구조로 대체하지 않는다
        expectBad("{\"tables\":[{\"ref\":\"A\"}]}");                                    // catalog_ver 없음
        expectBad("{\"catalog_ver\":1,\"tables\":[{\"ref\":\"A\",\"cells\":{\"r9c9\":\"x\"}}]}");   // 번역 못 하는 칸
        expectBad("{\"catalog_ver\":1,\"tables\":[{\"ref\":\"A\",\"cells\":{\"r0_c0\":\"x\"}}]}");  // 옛 포맷에 새 key 혼입
        expectBad("{\"fmt\":3,\"catalog_ver\":1,\"tables\":[]}");                       // 모르는 fmt
        expectBad("{\"fmt\":\"2\",\"catalog_ver\":1,\"tables\":[]}");
        expectBad("{\"fmt\":2,\"catalog_ver\":3,\"tables\":[]}");                       // 코드보다 새로운 카탈로그
        expectBad("{\"fmt\":2,\"catalog_ver\":0,\"tables\":[]}");
        expectBad("{\"fmt\":2,\"catalog_ver\":\"x\",\"tables\":[]}");                   // 모르는 값
        expectBad("{\"catalog_ver\":3,\"tables\":[{\"ref\":\"A\"}]}");
        // 타입이 어긋난 구조는 읽을 때 닫힌 실패
        String good = BoardFormJson.toJson(BoardDocSpec.build("x", "n", list(edit("A")), false));
        expectBad(good.replace("\"cs\":1", "\"cs\":\"1\""));
        expectBad(good.replace("\"next_r\":100", "\"next_r\":\"100\""));
        expectBad(good.replace("\"h\":true", "\"h\":1"));
        expectBad(good.replace("\"cols\":[\"c0\",\"c1\",\"c2\",\"c3\"]", "\"cols\":[\"c0\",\"c1\",\"c2\",3]"));
        expectBad(good.replace("\"rows\":[{", "\"rows\":[{\"x\":0,"  ).replace("\"id\":\"r0\"", "\"id\":0"));
    }

    private static void expectBrokenStructure(String json) {
        try {
            BoardDocSpec.build("x", "n", BoardFormJson.parse(json), false);
            fail("구조 위반이어야 한다: " + json);
        } catch (BoardDocSpec.EditException expected) {
            assertEquals(BoardDocSpec.BAD_STRUCT, expected.getMessage());   // 고정 문구
        } catch (IllegalStateException expected) {
            assertEquals("stored board form is not valid", expected.getMessage());
        }
    }

    @Test
    public void 저장본_구조_복원은_정규형_id와_카운터_범위만_허용한다() {
        String good = BoardFormJson.toJson(BoardDocSpec.build("x", "n", list(edit("A")), false));
        // 열 id 가 칸이 말한 열과 어긋남 / 병합이 어긋나 격자가 안 맞음 / 정규형 아님 / 카운터 이상의 id / 중복 id
        expectBrokenStructure(good.replace("\"cols\":[\"c0\",\"c1\",\"c2\",\"c3\"]", "\"cols\":[\"c0\",\"c1\",\"c2\",\"c9\"]"));
        expectBrokenStructure(good.replace("\"rs\":4", "\"rs\":3"));
        expectBrokenStructure(good.replace("\"id\":\"r2\"", "\"id\":\"r02\""));
        expectBrokenStructure(good.replace("\"id\":\"r2\"", "\"id\":\"r150\""));
        expectBrokenStructure(good.replace("\"id\":\"r2\"", "\"id\":\"r1\""));
        expectBrokenStructure(good.replace("\"next_r\":100", "\"next_r\":4"));
        expectBrokenStructure(good.replace("\"next_r\":100", "\"next_r\":100001"));
        // 카운터가 더 크고 id 가 그 밑이면 정상(사용자 구조 복원): r2 → r7 이름만 바뀌고 카운터는 101
        BoardDocSpec.Doc ok = BoardDocSpec.build("x", "n", BoardFormJson.parse(
                good.replace("\"id\":\"r2\"", "\"id\":\"r7\"").replace("\"next_r\":100", "\"next_r\":101")), false);
        assertEquals("r7", table(ok, "A").getRowIds().get(2));
        assertEquals(101, table(ok, "A").getNextR());
    }

    @Test
    public void 서식_문자_Cf는_칸_제목_이름에서_거부된다() {
        String[] cf = {"\u202E", "\u200B", "\u200D", "\u200C", "\uFEFF", "\u2060", "\u00AD", "\u202A", "\u2066"};
        for (String ch : cf) {
            expectEdit(list(edit("A", null, "r0_c0", "a" + ch + "b")), "쓸 수 없는 문자");
            expectEdit(list(edit("A", "제" + ch + "목", null, null)), "쓸 수 없는 문자");
            try {
                BoardDocSpec.validName("이" + ch + "름");
                fail("이름에서 거부돼야 한다");
            } catch (BoardDocSpec.EditException expected) {
                assertTrue(expected.getMessage().contains("쓸 수 없는 문자"));
                assertFalse(expected.getMessage().contains(ch));
            }
        }
        BoardDocSpec.build("x", "n", list(edit("A", "한글 English 123 ①  ※ (단위: 억원)", "r0_c0", "가나다 ABC 1,234.5%")), true);
    }

    @Test(expected = IllegalStateException.class)
    public void 깨진_저장_JSON은_예외() {
        BoardFormJson.parse("{\"tables\":123}");
    }

    @Test
    public void withValues는_매핑_칸이_아닌_키와_모르는_표를_거부한다() {
        BoardDocSpec.Doc base = BoardDocSpec.find(BoardDocSpec.DEFAULT_ID, false);
        Map<String, Map<String, String>> v = new LinkedHashMap<>();
        Map<String, String> cells = new LinkedHashMap<>();
        cells.put("r0_c0", "x");                                      // 머리글(비매핑) 칸
        v.put("A", cells);
        try {
            BoardDocSpec.withValues(base, v);
            fail("EditException 이 나와야 한다");
        } catch (BoardDocSpec.EditException e) {
            assertTrue(e.getMessage(), e.getMessage().contains("값을 넣을 수 없는 칸"));
        }
        Map<String, Map<String, String>> unknown = new LinkedHashMap<>();
        unknown.put("ZZ", new LinkedHashMap<String, String>());
        try {
            BoardDocSpec.withValues(base, unknown);
            fail("EditException 이 나와야 한다");
        } catch (BoardDocSpec.EditException e) {
            assertTrue(e.getMessage(), e.getMessage().contains("알 수 없는 표"));
        }
    }

    @Test
    public void withValues는_보낸_매핑_칸만_채우고_보내지_않은_매핑_칸은_빈칸() {
        BoardDocSpec.Doc sample = BoardDocSpec.find(BoardDocSpec.DEFAULT_ID, true);
        Map<String, Map<String, String>> v = new LinkedHashMap<>();
        Map<String, String> cells = new LinkedHashMap<>();
        cells.put("r1_c2", "  500  ");
        v.put("A", cells);
        BoardDocSpec.Doc d = BoardDocSpec.withValues(sample, v);
        BoardDocSpec.Table a = table(d, "A");
        assertEquals("500.00", a.getRows().get(1).get(2).getText());           // trim 뒤 억원 칸(dec=2)은 소수 둘째 자리 고정
        assertEquals("", a.getRows().get(1).get(0).getText());                 // 샘플 "대한민국 기관" → 빈칸
        assertEquals("", a.getRows().get(4).get(1).getText());
        assertEquals("출연금", a.getRows().get(1).get(1).getText());            // 비매핑 라벨 유지
        assertEquals("", table(d, "C-4").getRows().get(1).get(1).getText());   // 값을 보내지 않은 표도 빈칸
        assertEquals(6, d.getTables().size());
        assertEquals(sample.getName(), d.getName());
    }

    @Test
    public void 편집한_Doc도_docx로_만들어진다() throws Exception {
        BoardDocSpec.Doc d = BoardDocSpec.build("x", "편집한 양식", list(edit("C-4", "바꾼 제목", "r0_c0", "항목")), true);
        XWPFDocument x = new XWPFDocument(new ByteArrayInputStream(BoardDocDocx.build(d)));
        try {
            assertEquals("편집한 양식", x.getParagraphs().get(0).getText());
            assertEquals("바꾼 제목", x.getParagraphs().get(1).getText());
            assertEquals(1, x.getTables().size());
            assertEquals("항목", x.getTables().get(0).getRow(0).getCell(0).getText());
        } finally {
            x.close();
        }
    }
}
