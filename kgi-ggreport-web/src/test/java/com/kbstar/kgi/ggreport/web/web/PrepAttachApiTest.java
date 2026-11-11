package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.support.Times;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionJavaScript;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * NEXT 71 사전준비 첨부 원본 보관(025) + T3 확정본 지정 + NEXT 70 N1(중단 시 담당 해제를 한 문장으로, 중단된 건의 담당자 변경 승인 409).
 * 시드: 영업팀 김영업 3918264·윤서준 3361829, 영업팀장 이영업 5047192, 영업부장 박영업 2674805, 디자이너 7130526, 관리자 8203417.
 * 테스트 파일은 실행 중에 만든다(POI·pdfbox). 저장 폴더는 target/prep-attach-test — 트랜잭션이 되돌아가면 서비스가 파일도 지운다.
 * 테스트 트랜잭션이 하나라 서비스가 던진 오류 앞에서 쓴 행은 롤백되지 않는다 — 실패 케이스는 그 앞에서 쓴 것이 없는 순서로만 단언한다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class PrepAttachApiTest {

    private static final String LEAD = "5047192";
    private static final String HEAD = "2674805";
    private static final String MEMBER = "3918264";
    private static final String MEMBER2 = "3361829";
    private static final String M3 = "7742059";
    private static final String DESIGNER = "7130526";
    private static final String INST = "nowon";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    private final ObjectMapper om = new ObjectMapper();

    // ── 도우미 ───────────────────────────────────────────────────────

    private static MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder b, String emp) {
        return emp == null ? b : b.header("X-Emp-No", emp);
    }

    private JsonNode json(MvcResult r) throws Exception {
        return om.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private static String text(MvcResult r) throws Exception {
        return r.getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    private static String arr(String... x) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < x.length; i++) {
            sb.append(i == 0 ? "" : ",").append('"').append(x[i]).append('"');
        }
        return sb.append("]").toString();
    }

    private MvcResult postJson(String path, String emp, String body) throws Exception {
        return mockMvc.perform(as(post(path).contentType(MediaType.APPLICATION_JSON).content(body), emp)).andReturn();
    }

    private MvcResult getAs(String path, String emp) throws Exception {
        return mockMvc.perform(as(get(path), emp)).andReturn();
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private String state(String bid) {
        return jdbc.queryForObject("SELECT STATE_CD FROM BID_PREP WHERE BID_CASE_ID=?", String.class, bid);
    }

    /** JdbcTemplate 으로 값을 바꾼 뒤 MyBatis 1차 캐시를 비운다(MyBatis 쓰기 한 번). */
    private void flushCache() throws Exception {
        mockMvc.perform(post("/bidcases").contentType(MediaType.APPLICATION_JSON)
                .content("{\"institution_id\":\"dobong\"}").header("X-User-Id", "dave")).andReturn();
    }

    private String confirm(String emp, String inst) throws Exception {
        MvcResult r = postJson("/preps", emp, "{\"institution_id\":\"" + inst + "\"}");
        assertEquals(text(r), 201, r.getResponse().getStatus());
        return json(r).path("bid_case_id").asText();
    }

    private long openReq(String bid, String emp, String... nominees) throws Exception {
        MvcResult r = postJson("/bidcases/" + bid + "/prep/open-requests", emp, "{\"emp_nos\":" + arr(nominees) + "}");
        assertEquals(text(r), 201, r.getResponse().getStatus());
        return json(r).path("req_id").asLong();
    }

    private MvcResult decide(String emp, long id, String decision) throws Exception {
        return postJson("/approval-requests/" + id + "/decide", emp, "{\"decision\":\"" + decision + "\",\"comment\":null}");
    }

    /** 확정(김영업) → 개설 신청(윤서준 지명) → 영업팀장 승인. 담당자는 윤서준이다. */
    private String opened() throws Exception {
        String bid = confirm(MEMBER, INST);
        long req = openReq(bid, MEMBER, MEMBER2);
        assertEquals(200, decide(LEAD, req, "APPROVE").getResponse().getStatus());
        assertEquals("IN_PROGRESS", state(bid));
        return bid;
    }

    private MvcResult upload(String bid, String emp, String task, String name, byte[] data) throws Exception {
        MockHttpServletRequestBuilder b = multipart("/bidcases/" + bid + "/prep/attachments")
                .file(new MockMultipartFile("file", name, "application/octet-stream", data));
        if (task != null) {
            b = b.param("task_cd", task);
        }
        return mockMvc.perform(as(b, emp)).andReturn();
    }

    private long uploaded(String bid, String emp, String task, String name, byte[] data) throws Exception {
        MvcResult r = upload(bid, emp, task, name, data);
        assertEquals(text(r), 201, r.getResponse().getStatus());
        return json(r).path("attach_id").asLong();
    }

    private static String code(JsonNode body) {
        return body.path("detail").path("code").asText();
    }

    private static String contentPath(String bid, Object id) {
        return "/bidcases/" + bid + "/prep/attachments/" + id + "/content";
    }

    private static JsonNode task(JsonNode view, String cd) {
        for (JsonNode t : view.path("tasks")) {
            if (cd.equals(t.path("task_cd").asText())) {
                return t;
            }
        }
        return null;
    }

    // ── 테스트 파일(실행 중 생성) ────────────────────────────────────

    private static byte[] xlsx(String cellText) throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            wb.createSheet("분석").createRow(0).createCell(0).setCellValue(cellText);
            wb.write(out);
            return out.toByteArray();
        }
    }

    private static byte[] docx(String paragraph) throws Exception {
        try (XWPFDocument d = new XWPFDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            d.createParagraph().createRun().setText(paragraph);
            d.write(out);
            return out.toByteArray();
        }
    }

    /** 글자가 든 PDF(영문 — 기본 글꼴). text 가 null 이면 글자 없는 빈 쪽(스캔 PDF 대용). */
    private static byte[] pdf(String text, boolean withJs) throws Exception {
        try (PDDocument doc = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDPage page = new PDPage();
            doc.addPage(page);
            if (text != null) {
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.beginText();
                    cs.setFont(PDType1Font.HELVETICA, 12);
                    cs.newLineAtOffset(50, 700);
                    cs.showText(text);
                    cs.endText();
                }
            }
            if (withJs) {
                doc.getDocumentCatalog().setOpenAction(new PDActionJavaScript("app.alert('x');"));
            }
            doc.save(out);
            return out.toByteArray();
        }
    }

    private static byte[] zip(String[] names, String[] contents) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        try (ZipOutputStream z = new ZipOutputStream(bo)) {
            for (int i = 0; i < names.length; i++) {
                z.putNextEntry(new ZipEntry(names[i]));
                z.write(contents[i].getBytes(StandardCharsets.UTF_8));
                z.closeEntry();
            }
        }
        return bo.toByteArray();
    }

    private static byte[] hwpx(String body) throws Exception {
        return zip(new String[]{"mimetype", "Contents/section0.xml"},
                new String[]{"application/hwp+zip", "<?xml version=\"1.0\" encoding=\"UTF-8\"?><sec><p>" + body + "</p></sec>"});
    }

    // ── 올리기 ───────────────────────────────────────────────────────

    @Test
    public void 업로드_성공_xlsx_pdf_hwpx는_서버_키_이름으로_저장되고_목록에_보인다() throws Exception {
        String bid = opened();
        byte[] sheet = xlsx("수익성 분석 가상 값 100");
        MvcResult r = upload(bid, MEMBER2, "T3", "수익성 분석표.xlsx", sheet);
        assertEquals(text(r), 201, r.getResponse().getStatus());
        JsonNode v = json(r);
        long id = v.path("attach_id").asLong();
        assertEquals("T3", v.path("task_cd").asText());
        assertEquals("xlsx", v.path("ext").asText());
        assertEquals(sheet.length, v.path("size_bytes").asLong());
        assertEquals(64, v.path("sha256").asText().length());
        assertFalse(v.path("pii").path("blocked").asBoolean());
        assertTrue(v.path("pii").path("checked").asBoolean());
        assertEquals(0, v.path("pii").path("warnings").size());

        String key = jdbc.queryForObject("SELECT STORE_KEY FROM BID_PREP_ATTACH WHERE ATTACH_ID=?", String.class, id);
        assertTrue(key, key.matches("[0-9a-f]{32}"));   // 서버가 만든 이름 — 원래 이름·기관명이 없다
        assertTrue(Files.isRegularFile(Paths.get("target/prep-attach-test").toAbsolutePath().resolve(key)));
        assertEquals("수익성 분석표.xlsx", jdbc.queryForObject("SELECT ORIG_NAME FROM BID_PREP_ATTACH WHERE ATTACH_ID=?", String.class, id));
        assertEquals(MEMBER2, jdbc.queryForObject("SELECT UPLOADED_BY FROM BID_PREP_ATTACH WHERE ATTACH_ID=?", String.class, id));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='ATTACH_ADD' AND ATTACH_ID=?", bid, id));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='ATTACH_UPLOAD' AND OUTCOME='OK' AND ATTACH_ID=?", bid, id));

        long pdfId = uploaded(bid, MEMBER2, "T4", "붙임서류.pdf", pdf("Attached document for the proposal review", false));
        long hwpxId = uploaded(bid, MEMBER2, "T4", "공고문.hwpx", hwpx("가상 공고 내용"));
        long docxId = uploaded(bid, MEMBER2, "T4", "설명서.docx", docx("가상 설명"));

        for (String emp : new String[]{MEMBER2, HEAD}) {
            MvcResult list = getAs("/bidcases/" + bid + "/prep/attachments", emp);
            assertEquals(200, list.getResponse().getStatus());
            assertEquals(4, json(list).size());
            assertEquals(id, json(list).get(0).path("attach_id").asLong());
            assertEquals("수익성 분석표.xlsx", json(list).get(0).path("name").asText());
            assertTrue(json(list).get(0).path("valid").asBoolean());
            assertFalse(json(list).get(0).path("confirmed").asBoolean());
            assertEquals(MEMBER2, json(list).get(0).path("uploaded_by").path("emp_no").asText());
            assertFalse(json(list).get(0).path("emp_verified").asBoolean());   // 헤더 자기신고
            assertEquals(Arrays.asList(id, pdfId, hwpxId, docxId),
                    Arrays.asList(json(list).get(0).path("attach_id").asLong(), json(list).get(1).path("attach_id").asLong(),
                            json(list).get(2).path("attach_id").asLong(), json(list).get(3).path("attach_id").asLong()));
        }
        // 상세의 can_upload 는 활성 담당자에게만 켜진다
        assertTrue(json(getAs("/bidcases/" + bid + "/prep", MEMBER2)).path("viewer").path("can_upload").asBoolean());
        assertFalse(json(getAs("/bidcases/" + bid + "/prep", HEAD)).path("viewer").path("can_upload").asBoolean());
    }

    @Test
    public void HWP는_거부한다_확장자든_머리말이든() throws Exception {
        String bid = opened();
        byte[] ole = new byte[]{(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0, (byte) 0xA1, (byte) 0xB1, 0x1A, (byte) 0xE1, 0, 0, 0, 0};
        MvcResult byExt = upload(bid, MEMBER2, "T4", "공고.hwp", ole);
        assertEquals(400, byExt.getResponse().getStatus());
        assertEquals("UNSUPPORTED_FORMAT", code(json(byExt)));
        MvcResult byMagic = upload(bid, MEMBER2, "T4", "공고.docx", ole);   // 확장자만 바꾼 HWP
        assertEquals(400, byMagic.getResponse().getStatus());
        assertEquals("UNSUPPORTED_FORMAT", code(json(byMagic)));
        for (String name : new String[]{"a.xlsm", "a.docm", "a.xls", "a.doc", "a.zip", "a.exe", "noext"}) {
            MvcResult r = upload(bid, MEMBER2, "T4", name, xlsx("x"));
            assertEquals(name, 400, r.getResponse().getStatus());
            assertEquals(name, "UNSUPPORTED_FORMAT", code(json(r)));
        }
        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP_ATTACH WHERE BID_CASE_ID=?", bid));
    }

    @Test
    public void 확장자_위장은_400() throws Exception {
        String bid = opened();
        MvcResult pdfAsXlsx = upload(bid, MEMBER2, "T3", "a.xlsx", pdf("Hello proposal", false));
        assertEquals(400, pdfAsXlsx.getResponse().getStatus());
        assertEquals("FORMAT_MISMATCH", code(json(pdfAsXlsx)));
        MvcResult xlsxAsPdf = upload(bid, MEMBER2, "T3", "a.pdf", xlsx("x"));
        assertEquals(400, xlsxAsPdf.getResponse().getStatus());
        assertEquals("FORMAT_MISMATCH", code(json(xlsxAsPdf)));
        MvcResult docxAsXlsx = upload(bid, MEMBER2, "T3", "a.xlsx", docx("x"));   // zip 이지만 통합문서 구조가 아님
        assertEquals(400, docxAsXlsx.getResponse().getStatus());
        assertEquals("FORMAT_MISMATCH", code(json(docxAsXlsx)));
        MvcResult textAsDocx = upload(bid, MEMBER2, "T3", "a.docx", "그냥 글자".getBytes(StandardCharsets.UTF_8));
        assertEquals(400, textAsDocx.getResponse().getStatus());
        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP_ATTACH WHERE BID_CASE_ID=?", bid));
    }

    @Test
    public void 매크로_ActiveX_PDF_스크립트는_400() throws Exception {
        String bid = opened();
        MvcResult vba = upload(bid, MEMBER2, "T3", "a.docx",
                zip(new String[]{"word/document.xml", "word/vbaProject.bin"}, new String[]{"<w:document xmlns:w=\"x\"/>", "binary"}));
        assertEquals(400, vba.getResponse().getStatus());
        assertEquals("ACTIVE_CONTENT", code(json(vba)));
        MvcResult activex = upload(bid, MEMBER2, "T3", "a.xlsx",
                zip(new String[]{"xl/workbook.xml", "xl/activeX/activeX1.xml"}, new String[]{"<workbook/>", "<ax/>"}));
        assertEquals(400, activex.getResponse().getStatus());
        assertEquals("ACTIVE_CONTENT", code(json(activex)));
        MvcResult macroType = upload(bid, MEMBER2, "T3", "a.docx",
                zip(new String[]{"[Content_Types].xml", "word/document.xml"},
                        new String[]{"<Types><Override ContentType=\"application/vnd.ms-word.document.macroEnabled.main+xml\"/></Types>", "<d/>"}));
        assertEquals(400, macroType.getResponse().getStatus());
        assertEquals("ACTIVE_CONTENT", code(json(macroType)));
        MvcResult js = upload(bid, MEMBER2, "T4", "a.pdf", pdf("Contract summary page", true));
        assertEquals(400, js.getResponse().getStatus());
        assertEquals("ACTIVE_CONTENT", code(json(js)));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP_ATTACH WHERE BID_CASE_ID=?", bid));
    }

    @Test
    public void 주민번호_외국인등록_카드번호는_422이고_종류와_건수만_알린다() throws Exception {
        String bid = opened();
        MvcResult rrn = upload(bid, MEMBER2, "T3", "a.xlsx", xlsx("담당 900101-1234567"));
        assertEquals(422, rrn.getResponse().getStatus());
        assertEquals("PII_BLOCKED", code(json(rrn)));
        assertEquals("주민등록번호", json(rrn).path("detail").path("kinds").get(0).path("kind").asText());
        assertEquals(1, json(rrn).path("detail").path("kinds").get(0).path("count").asInt());
        assertFalse(text(rrn), text(rrn).contains("1234567"));   // 값은 응답에 없다

        MvcResult both = upload(bid, MEMBER2, "T3", "b.xlsx", xlsx("900101-1234567 / 4111-1111-1111-1111"));
        assertEquals(422, both.getResponse().getStatus());
        assertEquals(2, json(both).path("detail").path("kinds").size());
        assertFalse(text(both), text(both).contains("4111"));

        MvcResult foreign = upload(bid, MEMBER2, "T3", "c.docx", docx("외국인 900101-5234567"));
        assertEquals(422, foreign.getResponse().getStatus());
        assertEquals("외국인등록번호", json(foreign).path("detail").path("kinds").get(0).path("kind").asText());

        MvcResult inPdf = upload(bid, MEMBER2, "T4", "d.pdf", pdf("Resident 900101-1234567", false));
        assertEquals(422, inPdf.getResponse().getStatus());
        MvcResult inHwpx = upload(bid, MEMBER2, "T4", "e.hwpx", hwpx("주민 900101-1234567"));
        assertEquals(422, inHwpx.getResponse().getStatus());
        MvcResult inName = upload(bid, MEMBER2, "T3", "900101-1234567.xlsx", xlsx("x"));   // 이름도 DB 에 남으므로 같은 검사
        assertEquals(422, inName.getResponse().getStatus());

        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP_ATTACH WHERE BID_CASE_ID=?", bid));   // 저장하지 않았다
        assertEquals(6, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='ATTACH_UPLOAD' AND OUTCOME='INVALID'", bid));
    }

    @Test
    public void 이메일_전화는_경고하고_저장하며_종류_건수만_남긴다() throws Exception {
        String bid = opened();
        MvcResult r = upload(bid, MEMBER2, "T3", "연락처.xlsx", xlsx("담당 kim@example.com, 010-2345-6789"));
        assertEquals(text(r), 201, r.getResponse().getStatus());
        JsonNode w = json(r).path("pii").path("warnings");
        assertEquals(2, w.size());
        String kinds = w.toString();
        assertTrue(kinds, kinds.contains("이메일") && kinds.contains("휴대폰"));
        assertFalse(text(r), text(r).contains("kim@example.com"));
        assertFalse(text(r), text(r).contains("2345-6789"));
        long id = json(r).path("attach_id").asLong();
        String note = jdbc.queryForObject("SELECT PII_NOTE FROM BID_PREP_ATTACH WHERE ATTACH_ID=?", String.class, id);
        assertTrue(note, note.contains("이메일 1") && note.contains("휴대폰 1"));
        assertFalse(note, note.contains("kim"));
        assertEquals("CHECKED", jdbc.queryForObject("SELECT PII_STATE FROM BID_PREP_ATTACH WHERE ATTACH_ID=?", String.class, id));
        MvcResult list = getAs("/bidcases/" + bid + "/prep/attachments", MEMBER2);
        assertTrue(json(list).get(0).path("pii_note").asText().contains("이메일 1"));
    }

    @Test
    public void 글자가_없는_스캔_PDF는_검사_못_함으로_저장된다() throws Exception {
        String bid = opened();
        MvcResult r = upload(bid, MEMBER2, "T4", "스캔본.pdf", pdf(null, false));
        assertEquals(text(r), 201, r.getResponse().getStatus());
        assertFalse(json(r).path("pii").path("checked").asBoolean());
        long id = json(r).path("attach_id").asLong();
        assertEquals("UNCHECKED", jdbc.queryForObject("SELECT PII_STATE FROM BID_PREP_ATTACH WHERE ATTACH_ID=?", String.class, id));
        assertEquals("UNCHECKED", json(getAs("/bidcases/" + bid + "/prep/attachments", HEAD)).get(0).path("pii_state").asText());
    }

    @Test
    public void 업로드_입력_검사_과제_코드_파일_없음_이름() throws Exception {
        String bid = opened();
        byte[] sheet = xlsx("x");
        assertEquals(400, upload(bid, MEMBER2, "T1", "a.xlsx", sheet).getResponse().getStatus());   // T3·T4 만
        assertEquals(400, upload(bid, MEMBER2, null, "a.xlsx", sheet).getResponse().getStatus());
        assertEquals(400, upload(bid, MEMBER2, "T3", ".hidden.xlsx", sheet).getResponse().getStatus());
        assertEquals(400, upload(bid, MEMBER2, "T3", "긴이름" + new String(new char[201]).replace('\0', 'a') + ".xlsx", sheet).getResponse().getStatus());
        MvcResult noFile = mockMvc.perform(as(multipart("/bidcases/" + bid + "/prep/attachments").param("task_cd", "T3"), MEMBER2)).andReturn();
        assertEquals(400, noFile.getResponse().getStatus());
        // 경로 부분은 떼고 이름만 남긴다
        long id = uploaded(bid, MEMBER2, "T3", "C:\\폴더\\..\\내표.xlsx", sheet);
        assertEquals("내표.xlsx", jdbc.queryForObject("SELECT ORIG_NAME FROM BID_PREP_ATTACH WHERE ATTACH_ID=?", String.class, id));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ATTACH WHERE BID_CASE_ID=?", bid));
    }

    @Test
    public void 건당_50개를_넘으면_409_ATTACH_LIMIT() throws Exception {
        String bid = opened();
        for (int i = 0; i < 50; i++) {
            jdbc.update("INSERT INTO BID_PREP_ATTACH (BID_CASE_ID, TASK_CD, ORIG_NAME, EXT_CD, SIZE_BYTES, SHA256, STORE_KEY, PII_STATE,"
                            + " VALID_YN, UPLOADED_BY, UPLOADED_AT, UPLOADED_VERIFIED) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    bid, "T4", "가상" + i + ".pdf", "pdf", 10, "0000000000000000000000000000000000000000000000000000000000000000",
                    String.format("%032x", i + 1), "CHECKED", i % 2, MEMBER2, Times.nowIso(), 0);   // 무효 처리된 것도 센다
        }
        flushCache();
        MvcResult r = upload(bid, MEMBER2, "T3", "a.xlsx", xlsx("x"));
        assertEquals(409, r.getResponse().getStatus());
        assertEquals("ATTACH_LIMIT", code(json(r)));
        assertEquals(50, count("SELECT COUNT(*) FROM BID_PREP_ATTACH WHERE BID_CASE_ID=?", bid));
    }

    @Test
    public void 건당_합계_300MB를_넘으면_409() throws Exception {
        String bid = opened();
        jdbc.update("INSERT INTO BID_PREP_ATTACH (BID_CASE_ID, TASK_CD, ORIG_NAME, EXT_CD, SIZE_BYTES, SHA256, STORE_KEY, PII_STATE,"
                        + " VALID_YN, UPLOADED_BY, UPLOADED_AT, UPLOADED_VERIFIED) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                bid, "T4", "큰파일.pdf", "pdf", 300L * 1024 * 1024, "0000000000000000000000000000000000000000000000000000000000000000",
                String.format("%032x", 999), "CHECKED", 1, MEMBER2, Times.nowIso(), 0);
        flushCache();
        MvcResult r = upload(bid, MEMBER2, "T3", "a.xlsx", xlsx("x"));
        assertEquals(409, r.getResponse().getStatus());
        assertEquals("ATTACH_LIMIT", code(json(r)));
    }

    // ── 권한·감사·내려받기 ───────────────────────────────────────────

    @Test
    public void 비담당은_업로드_403_내려받기와_목록은_404이고_감사가_남는다() throws Exception {
        String bid = opened();
        byte[] sheet = xlsx("비공개 분석");
        long id = uploaded(bid, MEMBER2, "T3", "분석.xlsx", sheet);

        MvcResult up = upload(bid, MEMBER, "T3", "x.xlsx", sheet);   // 담당이 아닌 영업팀원
        assertEquals(403, up.getResponse().getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTOR_EMP_NO=? AND ACTION_CD='ATTACH_UPLOAD' AND OUTCOME='DENIED'", bid, MEMBER));
        assertEquals(403, upload(bid, HEAD, "T3", "x.xlsx", sheet).getResponse().getStatus());   // 영업부장은 읽기 전용
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ATTACH WHERE BID_CASE_ID=?", bid));

        MvcResult hidden = getAs(contentPath(bid, id), MEMBER);
        MvcResult none = getAs(contentPath("no-such-case", id), MEMBER);
        assertEquals(404, hidden.getResponse().getStatus());
        assertEquals(404, none.getResponse().getStatus());
        assertEquals(text(none), text(hidden));   // 없는 건과 같은 응답 바이트
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTOR_EMP_NO=? AND ACTION_CD='ATTACH_DOWNLOAD' AND OUTCOME='HIDDEN' AND ATTACH_ID=?", bid, MEMBER, id));
        assertEquals(404, getAs(contentPath(bid, id), DESIGNER).getResponse().getStatus());
        assertEquals(404, getAs(contentPath(bid, id), LEAD).getResponse().getStatus());   // 영업팀장도 담당이 아니면 열람 불가
        assertEquals(404, getAs("/bidcases/" + bid + "/prep/attachments", MEMBER).getResponse().getStatus());
        assertEquals(401, getAs(contentPath(bid, id), null).getResponse().getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTOR_EMP_NO=? AND ACTION_CD='ATTACH_LIST' AND OUTCOME='HIDDEN'", bid, MEMBER));
    }

    @Test
    public void 영업부장과_담당자는_내려받기_200이고_no_store_헤더와_감사_기록이_있다() throws Exception {
        String bid = opened();
        byte[] sheet = xlsx("수익성 분석 가상 값 200");
        long id = uploaded(bid, MEMBER2, "T3", "수익성 분석표 2차.xlsx", sheet);
        for (String emp : new String[]{HEAD, MEMBER2}) {
            MvcResult r = getAs(contentPath(bid, id), emp);
            assertEquals(200, r.getResponse().getStatus());
            assertArrayEquals(sheet, r.getResponse().getContentAsByteArray());
            assertEquals("no-store", r.getResponse().getHeader("Cache-Control"));
            assertEquals("application/octet-stream", r.getResponse().getContentType());
            String cd = r.getResponse().getHeader("Content-Disposition");
            assertNotNull(cd);
            assertTrue(cd, cd.startsWith("attachment; filename*=UTF-8''"));
            assertTrue(cd, cd.contains(URLEncoder.encode("수익성", "UTF-8")));
            assertTrue(cd, cd.contains("%20"));   // 공백
            assertFalse(cd, cd.contains("수익성"));   // 원문 한글이 헤더에 그대로 나가지 않는다
            assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTOR_EMP_NO=? AND ACTION_CD='ATTACH_DOWNLOAD' AND OUTCOME='OK' AND ATTACH_ID=?", bid, emp, id));
        }
        // 숫자가 아닌 번호·없는 번호는 담당자에게도 404, 감사에는 번호 없이 HIDDEN
        assertEquals(404, getAs(contentPath(bid, "abc"), MEMBER2).getResponse().getStatus());
        assertEquals(404, getAs(contentPath(bid, id + 1000), MEMBER2).getResponse().getStatus());
        assertEquals(2, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTOR_EMP_NO=? AND ACTION_CD='ATTACH_DOWNLOAD' AND OUTCOME='HIDDEN'", bid, MEMBER2));
    }

    @Test
    public void 디스크_파일이_바뀌면_내려받기는_500이고_내용을_내보내지_않는다() throws Exception {
        String bid = opened();
        long id = uploaded(bid, MEMBER2, "T3", "분석.xlsx", xlsx("원본"));
        String key = jdbc.queryForObject("SELECT STORE_KEY FROM BID_PREP_ATTACH WHERE ATTACH_ID=?", String.class, id);
        Files.write(Paths.get("target/prep-attach-test").toAbsolutePath().resolve(key), "tampered".getBytes(StandardCharsets.UTF_8));
        MvcResult r = getAs(contentPath(bid, id), HEAD);
        assertEquals(500, r.getResponse().getStatus());
        assertFalse(text(r), text(r).contains("tampered"));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='ATTACH_DOWNLOAD' AND OUTCOME='ERROR'", bid));
    }

    // ── T3 확정본 지정·해제·무효 처리 ────────────────────────────────

    @Test
    public void 확정본_지정이면_T3가_완료되고_무효_처리는_409이며_해제하면_미완료로_돌아온다() throws Exception {
        String bid = opened();
        byte[] sheet = xlsx("수익성 분석 확정본");
        long id = uploaded(bid, MEMBER2, "T3", "확정본.xlsx", sheet);
        long t4 = uploaded(bid, MEMBER2, "T4", "붙임.pdf", pdf("Attached pages for the proposal", false));
        String path = "/bidcases/" + bid + "/prep/tasks/T3/confirmed-file";

        JsonNode before = json(getAs("/bidcases/" + bid + "/prep", MEMBER2));
        assertEquals("TODO", task(before, "T3").path("state").asText());

        // 지정 권한·대상 검사
        assertEquals(403, mockMvc.perform(as(put(path).contentType(MediaType.APPLICATION_JSON).content("{\"attach_id\":" + id + "}"), MEMBER))
                .andReturn().getResponse().getStatus());
        assertEquals(403, mockMvc.perform(as(put(path).contentType(MediaType.APPLICATION_JSON).content("{\"attach_id\":" + id + "}"), HEAD))
                .andReturn().getResponse().getStatus());
        MvcResult wrongTask = mockMvc.perform(as(put(path).contentType(MediaType.APPLICATION_JSON).content("{\"attach_id\":" + t4 + "}"), MEMBER2)).andReturn();
        assertEquals(409, wrongTask.getResponse().getStatus());
        assertEquals("ATTACH_NOT_ELIGIBLE", code(json(wrongTask)));
        assertEquals(409, mockMvc.perform(as(put(path).contentType(MediaType.APPLICATION_JSON).content("{\"attach_id\":" + (id + 5000) + "}"), MEMBER2))
                .andReturn().getResponse().getStatus());
        assertEquals(400, mockMvc.perform(as(put(path).contentType(MediaType.APPLICATION_JSON).content("{}"), MEMBER2))
                .andReturn().getResponse().getStatus());

        MvcResult set = mockMvc.perform(as(put(path).contentType(MediaType.APPLICATION_JSON).content("{\"attach_id\":" + id + "}"), MEMBER2)).andReturn();
        assertEquals(text(set), 200, set.getResponse().getStatus());
        JsonNode t3 = task(json(set), "T3");
        assertEquals("DONE", t3.path("state").asText());   // 확정본 지정 = T3 완료
        assertEquals(id, t3.path("confirmed_attach_id").asLong());
        assertTrue(t3.path("done_by").isNull());           // 시스템 판정
        assertEquals("TODO", task(json(set), "T5").path("state").asText());   // 선행 T3 이 끝나 T5 가 열린다
        assertEquals(64, jdbc.queryForObject("SELECT REF_SHA256 FROM BID_PREP_TASK WHERE BID_CASE_ID=? AND TASK_CD='T3'", String.class, bid).length());
        assertEquals(jdbc.queryForObject("SELECT SHA256 FROM BID_PREP_ATTACH WHERE ATTACH_ID=?", String.class, id),
                jdbc.queryForObject("SELECT REF_SHA256 FROM BID_PREP_TASK WHERE BID_CASE_ID=? AND TASK_CD='T3'", String.class, bid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='T3_SET' AND ATTACH_ID=? AND FROM_ATTACH_ID IS NULL", bid, id));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='AUTO_DONE' AND TASK_CD='T3'", bid));
        assertTrue(json(getAs("/bidcases/" + bid + "/prep/attachments", HEAD)).get(0).path("confirmed").asBoolean());

        // 확정본은 무효 처리할 수 없다
        MvcResult inUse = postJson("/bidcases/" + bid + "/prep/attachments/" + id + "/void", MEMBER2, "{\"reason\":\"잘못 올림\"}");
        assertEquals(409, inUse.getResponse().getStatus());
        assertEquals("ATTACH_IN_USE", code(json(inUse)));
        assertEquals(1, count("SELECT VALID_YN FROM BID_PREP_ATTACH WHERE ATTACH_ID=?", id));

        // 해제하면 T3 는 미완료
        MvcResult clear = mockMvc.perform(as(delete(path), MEMBER2)).andReturn();
        assertEquals(text(clear), 200, clear.getResponse().getStatus());
        assertEquals("TODO", task(json(clear), "T3").path("state").asText());
        assertTrue(task(json(clear), "T3").path("confirmed_attach_id").isNull());
        assertEquals(0, count("SELECT DONE_YN FROM BID_PREP_TASK WHERE BID_CASE_ID=? AND TASK_CD='T3'", bid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='T3_CLEAR' AND FROM_ATTACH_ID=?", bid, id));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='AUTO_UNDONE' AND TASK_CD='T3'", bid));
        assertEquals(409, mockMvc.perform(as(delete(path), MEMBER2)).andReturn().getResponse().getStatus());   // 이미 해제됨

        // 해제된 뒤에는 무효 처리 가능(올린 사람만), 무효가 된 첨부는 다시 지정할 수 없다
        assertEquals(403, postJson("/bidcases/" + bid + "/prep/attachments/" + id + "/void", MEMBER, "{\"reason\":\"x\"}").getResponse().getStatus());
        assertEquals(400, postJson("/bidcases/" + bid + "/prep/attachments/" + id + "/void", MEMBER2, "{\"reason\":\"\"}").getResponse().getStatus());
        assertEquals(422, postJson("/bidcases/" + bid + "/prep/attachments/" + id + "/void", MEMBER2, "{\"reason\":\"연락처 010-1234-5678\"}").getResponse().getStatus());
        MvcResult voided = postJson("/bidcases/" + bid + "/prep/attachments/" + id + "/void", MEMBER2, "{\"reason\":\"잘못 올림\"}");
        assertEquals(text(voided), 200, voided.getResponse().getStatus());
        assertEquals(0, count("SELECT VALID_YN FROM BID_PREP_ATTACH WHERE ATTACH_ID=?", id));
        assertEquals(MEMBER2, jdbc.queryForObject("SELECT VOIDED_BY FROM BID_PREP_ATTACH WHERE ATTACH_ID=?", String.class, id));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='ATTACH_VOID' AND ATTACH_ID=?", bid, id));
        assertEquals(409, postJson("/bidcases/" + bid + "/prep/attachments/" + id + "/void", MEMBER2, "{\"reason\":\"또\"}").getResponse().getStatus());
        MvcResult reuse = mockMvc.perform(as(put(path).contentType(MediaType.APPLICATION_JSON).content("{\"attach_id\":" + id + "}"), MEMBER2)).andReturn();
        assertEquals(409, reuse.getResponse().getStatus());
        assertEquals("ATTACH_NOT_ELIGIBLE", code(json(reuse)));
        // 원본은 남는다 — 무효 처리된 파일도 내려받을 수 있다(물리 삭제 없음)
        assertArrayEquals(sheet, getAs(contentPath(bid, id), HEAD).getResponse().getContentAsByteArray());
        assertFalse(json(getAs("/bidcases/" + bid + "/prep/attachments", HEAD)).get(0).path("valid").asBoolean());
        // 지정·해제·무효 처리 모두 감사 표에 첨부 번호와 함께 남았다
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='T3_SET' AND OUTCOME='OK' AND ATTACH_ID=?", bid, id));
        assertEquals(2, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='ATTACH_VOID' AND OUTCOME='BLOCKED' AND ATTACH_ID=?", bid, id));   // 확정본 거부 + 이미 무효
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='ATTACH_VOID' AND OUTCOME='OK' AND ATTACH_ID=?", bid, id));
    }

    @Test
    public void 확정본_첨부가_나중에_무효가_되면_T3는_읽을_때_자동_미완료() throws Exception {
        String bid = opened();
        long id = uploaded(bid, MEMBER2, "T3", "확정본.xlsx", xlsx("분석"));
        MvcResult set = mockMvc.perform(as(put("/bidcases/" + bid + "/prep/tasks/T3/confirmed-file")
                .contentType(MediaType.APPLICATION_JSON).content("{\"attach_id\":" + id + "}"), MEMBER2)).andReturn();
        assertEquals(200, set.getResponse().getStatus());
        jdbc.update("UPDATE BID_PREP_ATTACH SET VALID_YN = 0, VOIDED_BY = ?, VOIDED_AT = ? WHERE ATTACH_ID = ?", MEMBER2, Times.nowIso(), id);
        flushCache();
        JsonNode v = json(getAs("/bidcases/" + bid + "/prep", MEMBER2));
        assertEquals("TODO", task(v, "T3").path("state").asText());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_LOG WHERE BID_CASE_ID=? AND EVENT_CD='AUTO_UNDONE' AND TASK_CD='T3'", bid));
    }

    @Test
    public void 개설_전에는_담당자가_없어_확정본_지정과_업로드는_403() throws Exception {
        String bid = confirm(MEMBER, INST);   // 개설 전 — 담당자도 과제 행도 없다
        assertEquals(403, mockMvc.perform(as(put("/bidcases/" + bid + "/prep/tasks/T3/confirmed-file")
                .contentType(MediaType.APPLICATION_JSON).content("{\"attach_id\":1}"), MEMBER2)).andReturn().getResponse().getStatus());
        assertEquals(403, upload(bid, MEMBER2, "T3", "a.xlsx", xlsx("x")).getResponse().getStatus());
    }

    // ── N1 ───────────────────────────────────────────────────────────

    @Test
    public void 중단은_담당자를_한_문장으로_전부_해제하고_중단된_건의_담당자_변경_승인은_409_PREP_CANCELLED() throws Exception {
        String bid = confirm(MEMBER, INST);
        long open = openReq(bid, MEMBER, MEMBER2, M3);
        assertEquals(200, decide(LEAD, open, "APPROVE").getResponse().getStatus());
        assertEquals(2, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=? AND ACTIVE_YN=1", bid));

        // 담당자 변경 신청(영업팀장 상신 → 영업부장 결재)이 대기 중일 때 중단된다
        MvcResult change = postJson("/approval-requests/assignee-change", LEAD,
                "{\"bid_case_id\":\"" + bid + "\",\"add_emp_nos\":" + arr(MEMBER) + ",\"remove_emp_nos\":[],\"reason\":\"인력 조정\"}");
        assertEquals(text(change), 201, change.getResponse().getStatus());
        long changeReq = json(change).path("req_id").asLong();

        MvcResult abort = postJson("/bidcases/" + bid + "/prep/cancel", LEAD, "{\"reason\":\"미참여 결정\"}");
        assertEquals(text(abort), 200, abort.getResponse().getStatus());
        assertEquals("CANCELLED", state(bid));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=? AND ACTIVE_YN=1", bid));
        assertEquals(2, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=? AND ACTIVE_YN=0 AND RELEASED_BY=?", bid, LEAD));
        assertEquals(2, count("SELECT COUNT(*) FROM BID_ASSIGN_LOG WHERE BID_CASE_ID=? AND ACTION_CD='RELEASE' AND ACTOR_EMP_NO=? AND REASON='중단으로 담당 해제'", bid, LEAD));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_ASSIGN_LOG WHERE BID_CASE_ID=? AND ACTION_CD='RELEASE' AND TARGET_EMP_NO=?", bid, MEMBER2));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_ASSIGN_LOG WHERE BID_CASE_ID=? AND ACTION_CD='RELEASE' AND TARGET_EMP_NO=?", bid, M3));

        // 그 뒤의 변경 승인은 승인째 거부된다 — 배정이 다시 생기지 않는다
        MvcResult approve = decide(HEAD, changeReq, "APPROVE");
        assertEquals(text(approve), 409, approve.getResponse().getStatus());
        assertEquals("PREP_CANCELLED", code(json(approve)));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=? AND ACTIVE_YN=1", bid));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGNMENT WHERE BID_CASE_ID=? AND EMP_NO=?", bid, MEMBER));
    }
}
