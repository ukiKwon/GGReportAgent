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
    public void 카탈로그는_표_5개_순서_고정_버전_1() {
        assertEquals(1, BoardDocSpec.CATALOG_VER);
        String[] order = {"A", "B", "C-2", "C-3", "C-4"};
        List<BoardDocSpec.Table> cat = BoardDocSpec.catalog(true);
        assertEquals(order.length, cat.size());
        for (int i = 0; i < order.length; i++) {
            assertEquals(order[i], cat.get(i).getId());
        }
        assertEquals(null, BoardDocSpec.catalogTable("nope", true));
    }

    @Test
    public void 칸_키는_행id_열id_매핑_칸은_편집_불가() {
        Set<String> keys = BoardDocSpec.editableKeys(BoardDocSpec.catalogTable("A", true));
        assertEquals(10, keys.size());
        for (String k : new String[]{"r0_c0", "r0_c3", "r1_c1", "r1_c3", "r2_c1", "r3_c1", "r4_c1", "r4_c3"}) {
            assertTrue(k, keys.contains(k));
        }
        for (String k : new String[]{"r1_c0", "r1_c2", "r2_c2", "r3_c2", "r4_c2"}) {
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
        assertEquals("대한민국 기관", a.getRows().get(1).get(0).getText());     // 매핑 칸(샘플) 유지
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
        expectEdit(list(edit("A", null, "r1_c0", "x")), "수정할 수 없는 칸");
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
        assertEquals(1, BoardFormJson.catalogVer(json));
        assertTrue(json.startsWith("{\"fmt\":2,\"catalog_ver\":1,"));
        // 롤백 안전용으로 옛 모양 cells 맵(r{행}c{순번})을 병기한다
        assertTrue(json.contains("\"cells\":{\"r0c0\":\"기관\""));
        // 표 A 의 기관명 값 칸(r1_c0, 옛 r1c0)은 매핑 칸이라 문구를 담지 않는다. (C-4 의 r1c0 은 고정 라벨이라 담는 게 맞다)
        String aPart = json.substring(json.indexOf("\"ref\":\"A\""), json.indexOf("\"ref\":\"C-4\""));
        String aLegacy = aPart.substring(aPart.indexOf("\"cells\":{\"r0c0\""));
        assertFalse(aLegacy.contains("r1c0"));
        assertTrue(json.substring(json.indexOf("\"ref\":\"C-4\"")).contains("\"r1c0\""));
        assertTrue(aPart.contains("\"next_r\":100,\"next_c\":100"));
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
        expectBad("{\"fmt\":2,\"catalog_ver\":2,\"tables\":[]}");                       // 코드보다 새로운 카탈로그
        // fmt 2 인데 구조가 카탈로그와 다르다 (열 id 하나를 바꾼다)
        String good = BoardFormJson.toJson(BoardDocSpec.build("x", "n", list(edit("A")), false));
        expectBad(good.replace("\"cols\":[\"c0\",\"c1\",\"c2\",\"c3\"]", "\"cols\":[\"c0\",\"c1\",\"c2\",\"c9\"]"));
        expectBad(good.replace("\"next_r\":100", "\"next_r\":101"));
        expectBad(good.replace("\"id\":\"r2\"", "\"id\":\"r7\""));
        expectBad(good.replace("\"rs\":4", "\"rs\":3"));
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
        assertEquals("500", a.getRows().get(1).get(2).getText());              // trim
        assertEquals("", a.getRows().get(1).get(0).getText());                 // 샘플 "대한민국 기관" → 빈칸
        assertEquals("", a.getRows().get(4).get(1).getText());
        assertEquals("출연금", a.getRows().get(1).get(1).getText());            // 비매핑 라벨 유지
        assertEquals("", table(d, "C-4").getRows().get(1).get(1).getText());   // 값을 보내지 않은 표도 빈칸
        assertEquals(5, d.getTables().size());
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
