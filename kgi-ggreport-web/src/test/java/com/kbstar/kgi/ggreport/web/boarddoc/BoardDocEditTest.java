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
    public void 칸_키는_행_열순번_매핑_칸은_편집_불가() {
        Set<String> keys = BoardDocSpec.editableKeys(BoardDocSpec.catalogTable("A", true));
        assertEquals(10, keys.size());
        for (String k : new String[]{"r0c0", "r0c3", "r1c1", "r1c3", "r2c0", "r3c0", "r4c0", "r4c2"}) {
            assertTrue(k, keys.contains(k));
        }
        for (String k : new String[]{"r1c0", "r1c2", "r2c1", "r3c1", "r4c1"}) {
            assertFalse(k, keys.contains(k));
        }
        assertEquals("r3c2", BoardDocSpec.cellKey(3, 2));
    }

    @Test
    public void 제목과_머리글_재정의가_반영되고_나머지는_카탈로그_그대로() {
        BoardDocSpec.Doc d = BoardDocSpec.build("x", "내 양식", list(
                edit("A", "새 제목", "r0c0", "기관"), edit("C-4")), true);
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
        expectEdit(list(edit("A", null, "r1c0", "x")), "수정할 수 없는 칸");
        expectEdit(list(edit("A", null, "r9c9", "x")), "수정할 수 없는 칸");
        expectEdit(list(edit("A", null, "r0c0", null)), "올바르지 않습니다");
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
        expectEdit(list(edit("A", null, "r0c0", rep("나", 101))), "100자");
        expectEdit(list(edit("A", null, "r0c0", "a\tb")), "쓸 수 없는 문자");
        expectEdit(list(edit("A", null, "r0c0", "\uD800")), "쓸 수 없는 문자");
        BoardDocSpec.Doc d = BoardDocSpec.build("x", "n", list(edit("A", "  제목  ", "r0c0", "  ")), true);
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
                edit("A", "새 제목", "r0c0", "기관"), edit("C-4")), false);
        String json = BoardFormJson.toJson(d);
        assertEquals(1, BoardFormJson.catalogVer(json));
        assertTrue(json.contains("\"r0c0\":\"기관\""));
        // 표 A 의 r1c0(기관명 값 칸)은 매핑 칸이라 담지 않는다. (C-4 의 r1c0 은 고정 라벨이라 담는 게 맞다)
        String aPart = json.substring(json.indexOf("\"ref\":\"A\""), json.indexOf("\"ref\":\"C-4\""));
        assertFalse(aPart.contains("r1c0"));
        assertTrue(json.substring(json.indexOf("\"ref\":\"C-4\"")).contains("r1c0"));
        BoardDocSpec.Doc again = BoardDocSpec.build("x", "n", BoardFormJson.parse(json), false);
        assertEquals(json, BoardFormJson.toJson(again));
        assertEquals("새 제목", table(again, "A").getTitle());
    }

    @Test(expected = IllegalStateException.class)
    public void 깨진_저장_JSON은_예외() {
        BoardFormJson.parse("{\"tables\":123}");
    }

    @Test
    public void 편집한_Doc도_docx로_만들어진다() throws Exception {
        BoardDocSpec.Doc d = BoardDocSpec.build("x", "편집한 양식", list(edit("C-4", "바꾼 제목", "r0c0", "항목")), true);
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
