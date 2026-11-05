package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardDocSpec;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardExcelFixture;
import com.kbstar.kgi.ggreport.web.boarddoc.LegacyBoardMapConfig;
import com.kbstar.kgi.ggreport.web.domain.AccessLogEntry;
import com.kbstar.kgi.ggreport.web.service.AccessLogService;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.util.CellReference;
import org.apache.poi.xssf.usermodel.XSSFCell;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.function.Consumer;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 이사회 자료 작성 API(엑셀 업로드·초안 docx). 시드: 김영업 3918264(영업팀, tasks 조회만),
 * 마스터 8203417(전산팀·관리자), 백수아 1473958(tasks 꺼짐). 모든 엑셀·번호는 가상이다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Import(LegacyBoardMapConfig.class)
// 옛 지도 컨텍스트는 다른 테스트와 컨텍스트가 갈라지므로 H2 이름을 따로 줘야 스키마가 두 번 만들어지지 않는다
@org.springframework.test.context.TestPropertySource(properties = "spring.datasource.url=jdbc:h2:mem:kgi-ggreport-test-legacymap;DB_CLOSE_DELAY=-1;MODE=Oracle")
@Transactional
public class BoardWriteApiTest {

    private static final String MEMBER = "3918264";
    private static final String ADMIN = "8203417";
    private static final String HEAD = "1473958";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    private static final String EXCEL = "/board-forms/default_doc/excel";
    private static final String DRAFT = "/board-forms/default_doc/draft-docx";
    private static final int MB = 1024 * 1024;

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private AccessLogService accessLog;

    // ── 도우미 ──

    private static final class Res {
        final String text;
        final JsonNode json;

        Res(String text) throws Exception {
            this.text = text;
            this.json = text.isEmpty() ? null : JSON.readTree(text);
        }

        JsonNode detail() {
            return json.get("detail");
        }
    }

    private Res call(String emp, MockHttpServletRequestBuilder b, Object body, int expect) throws Exception {
        MockHttpServletRequestBuilder r = b;
        if (emp != null) {
            r = r.header(Actor.HEADER, emp);
        }
        if (body != null) {
            r = r.contentType(MediaType.APPLICATION_JSON).content(body.toString());
        }
        return new Res(mockMvc.perform(r).andExpect(status().is(expect)).andReturn().getResponse()
                .getContentAsString(StandardCharsets.UTF_8));
    }

    private void perms(String emp, boolean write, boolean edit) throws Exception {
        call(ADMIN, put("/sysadmin/perms/" + emp), "{\"changes\":[{\"menu\":\"tasks\",\"view\":true,\"write\":"
                + write + ",\"edit\":" + edit + ",\"approve\":false}]}", 200);
    }

    private Res upload(String emp, String path, String name, byte[] data, String version, int expect) throws Exception {
        MockMultipartHttpServletRequestBuilder b = multipart(path).file(new MockMultipartFile("file", name, XLSX, data));
        if (version != null) {
            b.param("version", version);
        }
        return call(emp, b, null, expect);
    }

    private Res upload(String emp, byte[] data, int expect) throws Exception {
        return upload(emp, EXCEL, "가상.xlsx", data, null, expect);
    }

    private static byte[] fixture() throws Exception {
        return BoardExcelFixture.xlsx(null);
    }

    private static byte[] fixture(Consumer<XSSFWorkbook> tweak) throws Exception {
        return BoardExcelFixture.xlsx(tweak);
    }

    private static JsonNode cellOf(JsonNode out, String ref, String key) {
        for (JsonNode t : out.get("tables")) {
            if (ref.equals(t.get("ref").asText())) {
                for (JsonNode c : t.get("cells")) {
                    if (key.equals(c.get("key").asText())) {
                        return c;
                    }
                }
            }
        }
        throw new AssertionError("cell not found " + ref + " " + key);
    }

    private static boolean hasCode(JsonNode warnings, String code) {
        for (JsonNode w : warnings) {
            if (code.equals(w.get("code").asText())) {
                return true;
            }
        }
        return false;
    }

    private static JsonNode warning(JsonNode warnings, String code) {
        for (JsonNode w : warnings) {
            if (code.equals(w.get("code").asText())) {
                return w;
            }
        }
        throw new AssertionError("warning not found " + code);
    }

    private static byte[] withBody(byte[] head, int extra, byte fill) {
        byte[] b = new byte[head.length + extra];
        System.arraycopy(head, 0, b, 0, head.length);
        for (int i = head.length; i < b.length; i++) {
            b[i] = fill;
        }
        return b;
    }

    private static void noInternals(String text) {
        for (String bad : new String[]{"java.", "Exception", "tmp", "poi"}) {
            assertFalse(bad + " 가 응답에 있다: " + text, text.contains(bad));
        }
    }

    private static ObjectNode draftBody(String ref, String key, String value) {
        ObjectNode b = JSON.createObjectNode();
        ObjectNode t = b.putArray("tables").addObject();
        t.put("ref", ref);
        t.putObject("cells").put(key, value);
        return b;
    }

    private MvcResult draftOk(String emp, ObjectNode body) throws Exception {
        return mockMvc.perform(post(DRAFT).header(Actor.HEADER, emp)
                .contentType(MediaType.APPLICATION_JSON).content(body.toString()))
                .andExpect(status().isOk()).andReturn();
    }

    private long copyForm(String emp, String name) throws Exception {
        ObjectNode b = JSON.createObjectNode();
        b.put("source", "default_doc");
        b.put("name", name);
        return call(emp, post("/board-forms/copy"), b, 200).json.get("form_id").asLong();
    }

    // ── 권한 (#1~#5) ──

    @Test
    public void 헤더가_없으면_401() throws Exception {
        upload(null, fixture(), 401);
    }

    @Test
    public void 조회만_있는_팀원은_403이고_DENIED로_남는다() throws Exception {
        Res r = upload(MEMBER, fixture(), 403);
        assertEquals("이사회 자료를 작성할 권한이 없습니다.", r.detail().get("message").asText());
        assertEquals("FORBIDDEN", r.detail().get("code").asText());
        boolean found = false;
        for (AccessLogEntry e : accessLog.search(null, null, MEMBER, "DENIED", 0, 50).getItems()) {
            if (EXCEL.equals(e.getReqPath()) && Integer.valueOf(403).equals(e.getStatusCode())) {
                found = true;
            }
        }
        assertTrue("DENIED 이력이 없다", found);
        upload(HEAD, fixture(), 403);
    }

    @Test
    public void 수정만_부여하면_작성은_403() throws Exception {
        perms(MEMBER, false, true);
        upload(MEMBER, fixture(), 403);
        call(MEMBER, post(DRAFT), draftBody("A", "r1c2", "500"), 403);
    }

    @Test
    public void 작성_부여_후_정상_엑셀은_95칸이_샘플과_같다() throws Exception {
        perms(MEMBER, true, false);
        JsonNode out = upload(MEMBER, fixture(), 200).json;
        assertEquals(95, out.get("summary").get("total").asInt());
        assertEquals(95, out.get("summary").get("filled").asInt());
        assertEquals(0, out.get("summary").get("failed").asInt());
        assertEquals(0, out.get("warnings").size());
        assertEquals(1, out.get("mapping_ver").asInt());
        assertEquals("default_doc", out.get("form").get("id").asText());
        int checked = 0;
        for (JsonNode t : out.get("tables")) {
            BoardDocSpec.Table st = BoardDocSpec.catalogTable(t.get("ref").asText(), true);
            for (JsonNode c : t.get("cells")) {
                assertEquals(t.get("ref").asText() + " " + c.get("key").asText(),
                        BoardExcelFixture.sample(st, c.get("key").asText()), c.get("value").asText());
                checked++;
            }
        }
        assertEquals(95, checked);
        assertEquals("900", cellOf(out, "A", "r4c1").get("value").asText());     // 수식 캐시
        assertEquals("C5", cellOf(out, "A", "r4c1").get("source").get("cell").asText());
        assertEquals(5, out.get("sources").size());
        assertEquals(0, out.get("unmapped_tables").size());
    }

    @Test
    public void 관리자는_부여_없이_작성할_수_있다() throws Exception {
        upload(ADMIN, fixture(), 200);
    }

    // ── 값·구조 (#6~#8) ──

    @Test
    public void 캐시값이_없는_수식은_NO_CACHED_VALUE() throws Exception {
        perms(MEMBER, true, false);
        byte[] x = fixture(wb -> ((XSSFCell) wb.getSheet("기부금").getRow(4).getCell(2)).getCTCell().unsetV());
        JsonNode c = cellOf(upload(MEMBER, x, 200).json, "A", "r4c1");
        assertEquals("failed", c.get("status").asText());
        assertEquals("NO_CACHED_VALUE", c.get("reason").asText());
        assertEquals("", c.get("value").asText());
    }

    @Test
    public void 숨은_행은_HIDDEN_ROW_합계가_다르면_SUM_MISMATCH() throws Exception {
        perms(MEMBER, true, false);
        JsonNode hidden = upload(MEMBER, fixture(wb -> wb.getSheet("기부금").getRow(2).setZeroHeight(true)), 200).json;
        assertTrue(hasCode(cellOf(hidden, "A", "r2c1").get("warnings"), "HIDDEN_ROW"));
        JsonNode sum = upload(MEMBER, fixture(wb -> wb.getSheet("기부금").getRow(2).getCell(2).setCellValue(400)), 200).json;
        JsonNode w = warning(cellOf(sum, "A", "r4c1").get("warnings"), "SUM_MISMATCH");
        assertEquals("1200", w.get("expected").asText());                         // 500 + 400 + 300 (총계 캐시는 900)
        assertEquals("display", w.get("basis").asText());
        assertEquals("900", w.get("actual").asText());
        assertEquals("-300", w.get("diff").asText());
        assertEquals("filled", cellOf(sum, "A", "r4c1").get("status").asText());
        assertEquals("900", cellOf(sum, "A", "r4c1").get("value").asText());     // 재계산 없이 캐시값 그대로
    }

    /** 표 A(머리글 7칸: A1·B1·C1·B2~B5) 중 지정한 칸의 머리글을 바꾼다. */
    private static Consumer<XSSFWorkbook> labelsChanged(String... addrs) {
        return wb -> {
            for (String a : addrs) {
                BoardExcelFixture.cell(wb.getSheet("기부금"), new CellReference(a)).setCellValue("다름");
            }
        };
    }

    private static JsonNode tableOf(JsonNode out, String ref) {
        for (JsonNode t : out.get("tables")) {
            if (ref.equals(t.get("ref").asText())) {
                return t;
            }
        }
        throw new AssertionError("table not found " + ref);
    }

    @Test
    public void 머리글_일부가_다르면_200이고_그_표는_review로_채운다() throws Exception {
        perms(MEMBER, true, false);
        JsonNode out = upload(MEMBER, fixture(wb -> wb.getSheet("기부금").getRow(4).getCell(1).setCellValue("총계")), 200).json;
        JsonNode a = tableOf(out, "A");
        assertEquals("partial", a.get("label_state").asText());
        assertTrue(a.get("needs_review").asBoolean());
        assertEquals("B5", a.get("label_mismatches").get(0).get("cell").asText());
        assertEquals("합계", a.get("label_mismatches").get(0).get("expected").asText());
        assertEquals("총계", a.get("label_mismatches").get(0).get("actual").asText());
        for (JsonNode c : a.get("cells")) {
            assertEquals("review", c.get("status").asText());
            assertTrue(hasCode(c.get("warnings"), "LABEL_MISMATCH"));
            assertFalse(c.get("value").asText().isEmpty());
        }
        JsonNode b = tableOf(out, "B");
        assertEquals("ok", b.get("label_state").asText());
        assertFalse(b.get("needs_review").asBoolean());
        assertEquals(1, out.get("summary").get("label_mismatch_tables").asInt());
        assertEquals(90, out.get("summary").get("filled").asInt());
        assertEquals(5, out.get("summary").get("review").asInt());
        assertEquals(0, out.get("summary").get("failed").asInt());
        JsonNode w = warning(out.get("warnings"), "LABEL_MISMATCH");
        assertEquals("A", w.get("tables").get(0).asText());
        assertEquals(1, w.get("tables").size());
        assertFalse(w.get("message").asText().isEmpty());
    }

    @Test
    public void 머리글_절반_이상이_다르면_그_표는_failed로_값을_싣지_않는다() throws Exception {
        perms(MEMBER, true, false);
        Res r = upload(MEMBER, fixture(labelsChanged("B2", "B3", "B4", "B5")), 200);
        JsonNode a = tableOf(r.json, "A");
        assertEquals("failed", a.get("label_state").asText());
        assertTrue(a.get("needs_review").asBoolean());
        assertEquals(4, a.get("label_mismatches").size());
        for (JsonNode c : a.get("cells")) {
            assertEquals("failed", c.get("status").asText());
            assertEquals("LABEL_MISMATCH", c.get("reason").asText());
            assertEquals("", c.get("value").asText());
            assertEquals("", c.get("source").get("display").asText());
            assertTrue(c.get("source").get("raw").isNull());
            assertTrue(hasCode(c.get("warnings"), "LABEL_MISMATCH"));
        }
        assertEquals(90, r.json.get("summary").get("filled").asInt());
        assertEquals(5, r.json.get("summary").get("failed").asInt());
        assertEquals("A", warning(r.json.get("warnings"), "LABEL_MISMATCH").get("tables").get(0).asText());
    }

    @Test
    public void 시트가_없으면_422_STRUCTURE_MISMATCH_SHEET_MISSING() throws Exception {
        perms(MEMBER, true, false);
        Res r = upload(MEMBER, fixture(wb -> wb.removeSheetAt(wb.getSheetIndex("기부금"))), 422);
        assertEquals("STRUCTURE_MISMATCH", r.detail().get("code").asText());
        assertFalse(r.detail().get("message").asText().isEmpty());
        assertEquals("A", r.detail().get("reasons").get(0).get("ref").asText());
        assertEquals("SHEET_MISSING", r.detail().get("reasons").get(0).get("code").asText());
        assertEquals("기부금", r.detail().get("reasons").get(0).get("sheet").asText());
    }

    // ── raw·합계 (표시값 기준) ──

    @Test
    public void 숫자_칸은_raw와_rounded를_싣는다() throws Exception {
        perms(MEMBER, true, false);
        JsonNode out = upload(MEMBER, fixture(wb -> wb.getSheet("기부금").getRow(2).getCell(2).setCellValue(1234.5678919)),
                200).json;
        JsonNode c = cellOf(out, "A", "r2c1");
        assertEquals("1,235", c.get("value").asText());
        assertEquals("1234.567892", c.get("source").get("raw").asText());
        assertTrue(c.get("source").get("rounded").asBoolean());
        JsonNode whole = cellOf(out, "A", "r1c2");
        assertEquals("500", whole.get("source").get("raw").asText());
        assertFalse(whole.get("source").get("rounded").asBoolean());
        assertEquals("900", cellOf(out, "A", "r4c1").get("source").get("raw").asText());   // 수식 캐시
    }

    @Test
    public void 읽지_못한_칸은_raw가_null() throws Exception {
        perms(MEMBER, true, false);
        byte[] x = fixture(wb -> ((XSSFCell) wb.getSheet("기부금").getRow(4).getCell(2)).getCTCell().unsetV());
        JsonNode c = cellOf(upload(MEMBER, x, 200).json, "A", "r4c1");
        assertTrue(c.get("source").get("raw").isNull());
        assertTrue(c.get("source").get("rounded").isNull());
    }

    @Test
    public void 표시값_합이_맞으면_원래_값이_달라도_경고_없음() throws Exception {
        perms(MEMBER, true, false);
        JsonNode out = upload(MEMBER, fixture(wb -> {
            wb.getSheet("기부금").getRow(1).getCell(2).setCellValue(100.2);
            wb.getSheet("기부금").getRow(2).getCell(2).setCellValue(200.2);
            wb.getSheet("기부금").getRow(3).getCell(2).setCellValue(0);
            wb.getSheet("기부금").getRow(4).getCell(2).setCellValue(300);
        }), 200).json;
        assertFalse(hasCode(cellOf(out, "A", "r4c1").get("warnings"), "SUM_MISMATCH"));
    }

    // ── 오류 형식 통일 (작성 API 한정) ──

    private static void assertErr(Res r, String code) {
        assertTrue(r.text, r.json.get("detail").isObject());
        if (code != null) {
            assertEquals(code, r.detail().get("code").asText());
        }
        assertFalse(r.text, r.detail().get("message").asText().isEmpty());
    }

    @Test
    public void 오류는_모두_detail_객체_code_message() throws Exception {
        assertErr(upload(null, fixture(), 401), "UNAUTHENTICATED");
        assertErr(upload(MEMBER, fixture(), 403), "FORBIDDEN");                       // 작성 권한 없음
        assertErr(call(MEMBER, post(DRAFT), draftBody("A", "r1c2", "500"), 403), "FORBIDDEN");
        perms(MEMBER, true, true);
        long other = copyForm(ADMIN, "전산 양식");
        assertErr(upload(MEMBER, "/board-forms/" + other + "/excel", "가상.xlsx", fixture(), null, 404), "NOT_FOUND");
        assertErr(upload(MEMBER, EXCEL, "가상.xlsx", fixture(), "1", 400), "BAD_REQUEST");
        Res broken = call(MEMBER, post(DRAFT), "{\"tables\":", 400);                  // 깨진 JSON
        assertErr(broken, "BAD_REQUEST");
        for (String parser : new String[]{"Unexpected", "line:", "JsonParse", "com.fasterxml"}) {
            assertFalse(parser + " 가 응답에 있다: " + broken.text, broken.text.contains(parser));
        }
    }

    @Test
    public void 초안_요청_형식이_JSON이_아니면_415_객체이고_요청_헤더를_되돌려주지_않는다() throws Exception {
        perms(MEMBER, true, false);
        String marker = "application/x-marker-9f3";
        Res r = new Res(mockMvc.perform(post(DRAFT).header(Actor.HEADER, MEMBER).contentType(marker).content("x"))
                .andExpect(status().is(415)).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
        assertErr(r, "UNSUPPORTED_MEDIA_TYPE");
        assertFalse(r.text, r.text.contains("marker-9f3"));
    }

    @Test
    public void 다른_화면_오류는_여전히_문자열_detail() throws Exception {
        Res r = call(null, get("/board-forms"), null, 401);
        assertTrue(r.text, r.detail().isTextual());
    }

    // ── 형식·크기 (#9~#11) ──

    @Test
    public void 확장자_xls는_415_xlsm은_422_MACRO() throws Exception {
        perms(MEMBER, true, false);
        assertEquals("NOT_XLSX", upload(MEMBER, EXCEL, "가상.xls", fixture(), null, 415).detail().get("code").asText());
        assertEquals("MACRO", upload(MEMBER, EXCEL, "가상.xlsm", fixture(), null, 422).detail().get("code").asText());
    }

    @Test
    public void 이름이_xlsx여도_vbaProject가_있으면_MACRO() throws Exception {
        perms(MEMBER, true, false);
        byte[] x = BoardExcelFixture.withEntry(fixture(), "xl/vbaProject.bin", new byte[]{1, 2, 3});
        assertEquals("MACRO", upload(MEMBER, x, 422).detail().get("code").asText());
    }

    @Test
    public void 한도를_넘는_파일은_413_FILE_TOO_LARGE() throws Exception {
        perms(MEMBER, true, false);
        Res r = upload(MEMBER, new byte[6 * MB], 413);
        assertEquals("FILE_TOO_LARGE", r.detail().get("code").asText());
        assertEquals(5, r.detail().get("max_mb").asInt());
    }

    // ── 대상 양식 (#12~#13) ──

    @Test
    public void 남의_팀_양식_404_보관_양식_400_기본_양식에_version은_400() throws Exception {
        perms(MEMBER, true, true);
        long other = copyForm(ADMIN, "전산 양식");
        upload(MEMBER, "/board-forms/" + other + "/excel", "가상.xlsx", fixture(), null, 404);
        long mine = copyForm(MEMBER, "보관할 양식");
        call(MEMBER, post("/board-forms/" + mine + "/archive"), null, 200);
        upload(MEMBER, "/board-forms/" + mine + "/excel", "가상.xlsx", fixture(), null, 400);
        upload(MEMBER, EXCEL, "가상.xlsx", fixture(), "1", 400);
    }

    @Test
    public void 복제_양식도_버전을_골라_작성할_수_있다() throws Exception {
        perms(MEMBER, true, true);
        long id = copyForm(MEMBER, "우리 양식");
        JsonNode out = upload(MEMBER, "/board-forms/" + id + "/excel", "가상.xlsx", fixture(), "1", 200).json;
        assertEquals(1, out.get("form").get("version").asInt());
        assertEquals(id, out.get("form").get("id").asLong());
        assertEquals("우리 양식", out.get("form").get("name").asText());
    }

    // ── 초안 docx (#14~#15) ──

    @Test
    public void 초안_docx는_보낸_값을_담고_캐시하지_않는다() throws Exception {
        perms(MEMBER, true, false);
        MvcResult r = draftOk(MEMBER, draftBody("A", "r1c2", "500"));
        assertEquals("no-store", r.getResponse().getHeader("Cache-Control"));
        assertEquals("application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                r.getResponse().getContentType());
        assertTrue(docxTableHas(r.getResponse().getContentAsByteArray(), 0, "500"));
    }

    @Test
    public void 초안에_비매핑_키나_모르는_표는_400_BAD_VALUE() throws Exception {
        perms(MEMBER, true, false);
        assertEquals("BAD_VALUE", call(MEMBER, post(DRAFT), draftBody("A", "r0c0", "x"), 400)
                .detail().get("code").asText());
        assertEquals("BAD_VALUE", call(MEMBER, post(DRAFT), draftBody("ZZ", "r1c2", "x"), 400)
                .detail().get("code").asText());
    }

    // ── 목록·지도 (#16~#17) ──

    @Test
    public void 목록의_can_write는_부여자만_true() throws Exception {
        assertFalse(call(MEMBER, get("/board-forms"), null, 200).json.get("can_write").asBoolean());
        perms(MEMBER, true, false);
        assertTrue(call(MEMBER, get("/board-forms"), null, 200).json.get("can_write").asBoolean());
        assertTrue(call(ADMIN, get("/board-forms"), null, 200).json.get("can_write").asBoolean());
    }

    @Test
    public void 지도는_버전_한도_표_5개() throws Exception {
        JsonNode m = call(MEMBER, get("/board-forms/excel-map"), null, 200).json;
        assertEquals(1, m.get("mapping_ver").asInt());
        assertEquals(5, m.get("max_mb").asInt());
        assertEquals(5, m.get("tables").size());
        assertErr(call(null, get("/board-forms/excel-map"), null, 401), "UNAUTHENTICATED");   // 헤더 없이도 객체 형식
        call(HEAD, get("/board-forms/excel-map"), null, 403);
    }

    // ── security (S2~S15) ──

    @Test
    public void S2_S10_압축_폭탄은_TOO_LARGE_UNPACKED이고_내부_정보가_없다() throws Exception {
        perms(MEMBER, true, false);
        byte[] bomb = BoardExcelFixture.withEntry(fixture(), "xl/media/zero.bin", new byte[25 * MB]);
        assertTrue("압축 후에는 한도 아래여야 한다", bomb.length < MB);
        Res r = upload(MEMBER, bomb, 422);
        assertEquals("TOO_LARGE_UNPACKED", r.detail().get("code").asText());
        noInternals(r.text);
    }

    @Test
    public void S4_중복_entry는_DUPLICATE_ENTRY() throws Exception {
        perms(MEMBER, true, false);
        Res r = upload(MEMBER, BoardExcelFixture.duplicateEntry(fixture()), 422);
        assertEquals("DUPLICATE_ENTRY", r.detail().get("code").asText());
    }

    @Test
    public void S5_S10_zip_머리만_있는_쓰레기는_BROKEN이고_내부_정보가_없다() throws Exception {
        perms(MEMBER, true, false);
        Res r = upload(MEMBER, withBody(new byte[]{'P', 'K', 3, 4}, 1024, (byte) 0), 422);
        assertEquals("BROKEN", r.detail().get("code").asText());
        noInternals(r.text);
    }

    @Test
    public void S6_OLE2_시그니처는_415_NOT_XLSX() throws Exception {
        perms(MEMBER, true, false);
        byte[] ole = withBody(new byte[]{(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0, (byte) 0xA1, (byte) 0xB1, 0x1A,
                (byte) 0xE1}, 1024, (byte) 7);
        assertEquals("NOT_XLSX", upload(MEMBER, ole, 415).detail().get("code").asText());
    }

    @Test
    public void S7_숨은_시트의_개인정보는_범위_밖_경고이고_값이_없다() throws Exception {
        perms(MEMBER, true, false);
        byte[] x = fixture(wb -> {
            Sheet memo = wb.createSheet("메모");
            CellStyle plain = wb.createCellStyle();
            plain.setDataFormat(wb.createDataFormat().getFormat("0"));
            org.apache.poi.ss.usermodel.Cell c = BoardExcelFixture.cell(memo, new CellReference("A1"));
            c.setCellValue(Double.parseDouble(BoardExcelFixture.FAKE_RRN));
            c.setCellStyle(plain);
            wb.setSheetHidden(wb.getSheetIndex(memo), true);
        });
        Res r = upload(MEMBER, x, 200);
        JsonNode w = warning(r.json.get("warnings"), "PII_OUTSIDE_RANGE");
        assertEquals(1, w.get("kinds").size());
        assertEquals("주민등록번호", w.get("kinds").get(0).get("kind").asText());
        assertEquals(1, w.get("kinds").get(0).get("count").asInt());
        assertEquals(1, w.get("count").asInt());
        assertEquals("메모!A1", w.get("cells").get(0).asText());
        assertFalse(r.text.contains(BoardExcelFixture.FAKE_RRN));
        assertFalse(r.text.contains("1234567"));
    }

    @Test
    public void S8_매핑_칸의_서식에_가려진_개인정보는_422_PII_DETECTED() throws Exception {
        perms(MEMBER, true, false);
        Res r = upload(MEMBER, fixture(S8), 422);
        assertEquals("PII_DETECTED", r.detail().get("code").asText());
        assertEquals("기부금!C3", r.detail().get("cells").get(0).asText());
        assertEquals(1, r.detail().get("cells").size());
        assertFalse(r.text.contains(BoardExcelFixture.FAKE_RRN));
        assertFalse(r.text.contains("9,001,011"));
    }

    /** 매핑 칸 C3(#,##0 서식)에 가상 주민번호 모양 숫자. */
    private static final Consumer<XSSFWorkbook> S8 = wb -> wb.getSheet("기부금").getRow(2).getCell(2)
            .setCellValue(Double.parseDouble(BoardExcelFixture.FAKE_RRN));

    @Test
    public void S9_시트_이름의_개인정보는_순번으로_가린다() throws Exception {
        perms(MEMBER, true, false);
        String name = "x" + BoardExcelFixture.FAKE_RRN;
        Res r = upload(MEMBER, fixture(wb -> wb.createSheet(name)), 200);
        JsonNode w = warning(r.json.get("warnings"), "PII_OUTSIDE_RANGE");
        boolean found = false;
        for (JsonNode c : w.get("cells")) {
            found |= "#3!(시트 이름)".equals(c.asText());
        }
        assertTrue(r.text, found);
        assertFalse(r.text.contains(name));
    }

    @Test
    public void S11_초안_값은_일반_텍스트로만_들어간다() throws Exception {
        perms(MEMBER, true, false);
        String v = "=1+1 <b>&\"'";
        byte[] docx = draftOk(MEMBER, draftBody("A", "r1c2", v)).getResponse().getContentAsByteArray();
        assertTrue(docxTableHas(docx, 0, v));
        String xml = entry(docx, "word/document.xml");
        assertFalse(xml.contains("fldSimple"));
        assertFalse(xml.contains("instrText"));
    }

    @Test
    public void S12_초안_파일명_헤더() throws Exception {
        perms(MEMBER, true, false);
        String cd = draftOk(MEMBER, draftBody("A", "r1c2", "500")).getResponse().getHeader("Content-Disposition");
        String encoded = URLEncoder.encode(BoardDocSpec.DEFAULT_NAME + "_초안.docx", "UTF-8").replace("+", "%20");
        assertTrue(cd, cd.contains("filename=\"board_draft.docx\""));
        assertTrue(cd, cd.contains("filename*=UTF-8''" + encoded));
    }

    @Test
    public void S13b_본문_크기는_권한_판정_전에_413() throws Exception {
        Res big = new Res(mockMvc.perform(post(EXCEL).contentType("multipart/form-data; boundary=x")
                .content(new byte[7 * MB])).andExpect(status().is(413)).andReturn().getResponse()
                .getContentAsString(StandardCharsets.UTF_8));
        assertEquals("FILE_TOO_LARGE", big.detail().get("code").asText());
        assertEquals(5, big.detail().get("max_mb").asInt());
        assertTrue(big.json.isObject());                              // 본문이 JSON 으로 파싱된다(Res 생성자)
        assertTrue(big.detail().get("message").asText(), big.detail().get("message").asText().contains("5MB"));
        StringBuilder s = new StringBuilder("{\"tables\":[],\"pad\":\"");
        while (s.length() < 300 * 1024) {
            s.append("aaaaaaaaaa");
        }
        s.append("\"}");
        Res body = new Res(mockMvc.perform(post(DRAFT).contentType(MediaType.APPLICATION_JSON).content(s.toString()))
                .andExpect(status().is(413)).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
        assertEquals("BODY_TOO_LARGE", body.detail().get("code").asText());
        assertEquals(256, body.detail().get("max_kb").asInt());
        assertTrue(body.detail().get("message").asText(), body.detail().get("message").asText().contains("256KB"));
    }

    /** 원시 경로 그대로 보낸다 — post(String) 은 '%' 를 다시 인코딩하므로 URI 로 넘긴다. */
    private Res rawPost(String rawPath, String contentType, byte[] body, int expect) throws Exception {
        MockHttpServletRequestBuilder b = post(new URI(rawPath));
        if (contentType != null) {
            b = b.contentType(contentType);
        }
        if (body != null) {
            b = b.content(body);
        }
        return new Res(mockMvc.perform(b).andExpect(status().is(expect)).andReturn().getResponse()
                .getContentAsString(StandardCharsets.UTF_8));
    }

    private static byte[] bigJson() {
        StringBuilder s = new StringBuilder("{\"tables\":[],\"pad\":\"");
        while (s.length() < 300 * 1024) {
            s.append("aaaaaaaaaa");
        }
        return s.append("\"}").toString().getBytes(StandardCharsets.UTF_8);
    }

    @Test
    public void S13c_경로_변형_끝_슬래시_경로매개변수_퍼센트_인코딩도_413() throws Exception {
        byte[] big = new byte[7 * MB];
        String mp = "multipart/form-data; boundary=x";
        for (String p : new String[]{EXCEL + "/", EXCEL + ";x=1", "/board-forms/default_doc/%65xcel",
                "/board-forms/default_doc;a=b/excel"}) {
            assertEquals(p, "FILE_TOO_LARGE", rawPost(p, mp, big, 413).detail().get("code").asText());
        }
        byte[] json = bigJson();
        for (String p : new String[]{DRAFT + "/", DRAFT + ";x=1", "/board-forms/default_doc/%64raft-docx",
                "/board-forms/default_doc/draft-docx;jsessionid=1/"}) {
            assertEquals(p, "BODY_TOO_LARGE", rawPost(p, "application/json", json, 413).detail().get("code").asText());
        }
    }

    @Test
    public void S13d_본문_길이가_없으면_411_LENGTH_REQUIRED() throws Exception {
        Res d = rawPost(DRAFT, "application/json", null, 411);
        assertEquals("LENGTH_REQUIRED", d.detail().get("code").asText());
        assertFalse(d.detail().get("message").asText().isEmpty());     // 본문이 JSON 으로 파싱된다(Res 생성자)
        Res e = rawPost(EXCEL, "multipart/form-data; boundary=x", null, 411);
        assertEquals("LENGTH_REQUIRED", e.detail().get("code").asText());
        assertFalse(e.detail().get("message").asText().isEmpty());
    }

    @Test
    public void 빈_파일은_400_EMPTY_FILE() throws Exception {
        perms(MEMBER, true, false);
        assertEquals("EMPTY_FILE", upload(MEMBER, new byte[0], 400).detail().get("code").asText());
    }

    @Test
    public void 한_칸에_주민번호와_휴대폰이_함께_있어도_count는_1() throws Exception {
        perms(MEMBER, true, false);
        String v = "900101-1234567 010-0000-0000";
        Res r = upload(MEMBER, fixture(wb -> BoardExcelFixture.cell(wb.createSheet("메모"), new CellReference("B2"))
                .setCellValue(v)), 200);
        JsonNode w = warning(r.json.get("warnings"), "PII_OUTSIDE_RANGE");
        assertEquals(2, w.get("kinds").size());
        assertEquals(1, w.get("count").asInt());
        assertEquals(1, w.get("cells").size());
        assertEquals("메모!B2", w.get("cells").get(0).asText());
        assertFalse(w.has("sheet_name_count"));
        assertFalse(r.text.contains("1234567"));
        assertFalse(r.text.contains("0000-0000"));
    }

    @Test
    public void S14_접근_이력에는_결과_코드만_남고_파일명과_값이_없다() throws Exception {
        perms(MEMBER, true, false);
        upload(MEMBER, EXCEL, "홍길동_비밀.xlsx", fixture(S8), null, 422);
        boolean found = false;
        for (AccessLogEntry e : accessLog.search(null, null, MEMBER, "API", 0, 50).getItems()) {
            if (EXCEL.equals(e.getReqPath())) {
                String d = String.valueOf(e.getDetail());
                if (d.contains("code=PII_DETECTED")) {
                    found = true;
                }
                assertFalse(d, d.contains("홍길동"));
                assertFalse(d, d.contains(BoardExcelFixture.FAKE_RRN));
            }
        }
        assertTrue("접근 이력에 결과 코드가 없다", found);
    }

    @Test
    public void S15_초안_값의_개인정보는_422_종류만() throws Exception {
        perms(MEMBER, true, false);
        Res r = call(MEMBER, post(DRAFT), draftBody("A", "r1c2", "010-0000-0000"), 422);
        assertEquals("PII_DETECTED", r.detail().get("code").asText());
        assertEquals("휴대폰", r.detail().get("kinds").get(0).get("kind").asText());
        assertFalse(r.text.contains("010-0000-0000"));
        assertFalse(r.detail().has("cells"));
    }

    // ── docx 도우미 ──

    private static boolean docxTableHas(byte[] docx, int tableIndex, String text) throws Exception {
        try (XWPFDocument d = new XWPFDocument(new ByteArrayInputStream(docx))) {
            XWPFTable t = d.getTables().get(tableIndex);
            for (XWPFTableRow row : t.getRows()) {
                for (XWPFTableCell c : row.getTableCells()) {
                    if (text.equals(c.getText())) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private static String entry(byte[] zip, String name) throws Exception {
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zip))) {
            ZipEntry e;
            while ((e = in.getNextEntry()) != null) {
                if (name.equals(e.getName())) {
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                    }
                    return new String(out.toByteArray(), StandardCharsets.UTF_8);
                }
            }
        }
        throw new AssertionError("entry not found " + name);
    }
}
