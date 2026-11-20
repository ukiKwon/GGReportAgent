package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 작업함 파일 점검(057, NEXT 106) — 업로드 뒤 점검·표시·해제·잠김·삭제·제출 감사·권한. 디자이너 작업 하나를 건마다 직접 만든다(롤백).
 * 시드: 현재 기관 nowon(노원구), 다른 기관 dobong(도봉구), 디자이너 7130526(최디자이너)·1625983, 영업 3918264.
 * ⚠️ X-Emp-No 는 자기신고다 — 여기서 고정하는 것은 업무 규칙이지 사칭 방지가 아니다(EMP_VERIFIED=0 이 정상).
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class DocCheckApiTest {

    private static final String DESIGNER = "7130526";
    private static final String DESIGNER2 = "1625983";
    private static final String SALES = "3918264";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private com.kbstar.kgi.ggreport.web.config.AppProperties properties;
    private final ObjectMapper json = new ObjectMapper();

    private String bid;
    private String tid;

    @Before
    public void newCase() {
        String k = UUID.randomUUID().toString().substring(0, 8);
        bid = "bc-dc-" + k;
        tid = "task-dc-d-" + k;
        jdbc.update("INSERT INTO BID_CASES (BID_CASE_ID, INSTITUTION_ID) VALUES (?, ?)", bid, "nowon");
        jdbc.update("INSERT INTO TASKS (TASK_ID, BID_CASE_ID, TEAM, STATUS, ASSIGNEE) VALUES (?,?,?,?,?)",
                tid, bid, "디자이너", "작성중", "최디자이너");
        // [디자인 작업 완료]·디자이너 제출은 세 팀 작업이 모두 2차완료여야 하고(TEAMS_NOT_DONE) 받을 사람이 있어야 한다(NO_REVIEWERS) — DesignReviewTxTest 와 같은 준비
        jdbc.update("INSERT INTO TASKS (TASK_ID, BID_CASE_ID, TEAM, STATUS, ASSIGNEE) VALUES (?,?,?,?,?)", "task-dc-s-" + k, bid, "영업", "2차완료", "김영업");
        jdbc.update("INSERT INTO TASKS (TASK_ID, BID_CASE_ID, TEAM, STATUS, ASSIGNEE) VALUES (?,?,?,?,?)", "task-dc-i-" + k, bid, "전산", "2차완료", "오전산");
        jdbc.update("INSERT INTO TASKS (TASK_ID, BID_CASE_ID, TEAM, STATUS, ASSIGNEE) VALUES (?,?,?,?,?)", "task-dc-b-" + k, bid, "예산", "2차완료", "한예산");
    }

    // ── 도우미 ───────────────────────────────────────────────────────────

    private static byte[] pptx(String slideText) throws Exception {
        String ns = "xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" "
                + "xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"";
        String[] kv = {
                "[Content_Types].xml", "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"/>",
                "ppt/presentation.xml", "<p:presentation " + ns + "/>",
                "ppt/slides/slide1.xml", "<p:sld " + ns + "><a:p><a:r><a:t>" + slideText + "</a:t></a:r></a:p></p:sld>"};
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try (ZipOutputStream z = new ZipOutputStream(bos)) {
            for (int i = 0; i < kv.length; i += 2) {
                z.putNextEntry(new ZipEntry(kv[i]));
                z.write(kv[i + 1].getBytes(StandardCharsets.UTF_8));
                z.closeEntry();
            }
        }
        return bos.toByteArray();
    }

    private MockHttpServletResponse upload(String name, byte[] data, String emp) throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", name, MediaType.APPLICATION_OCTET_STREAM_VALUE, data);
        MockHttpServletRequestBuilder b = MockMvcRequestBuilders.multipart("/tasks/" + tid + "/files").file(file)
                .header("X-User-Id", "web-user");
        if (emp != null) {
            b.header("X-Emp-No", emp);
        }
        return mockMvc.perform(b).andReturn().getResponse();
    }

    private MockHttpServletResponse get(String path, String emp) throws Exception {
        MockHttpServletRequestBuilder b = MockMvcRequestBuilders.get(path);
        if (emp != null) {
            b.header("X-Emp-No", emp);
        }
        return mockMvc.perform(b).andReturn().getResponse();
    }

    private MockHttpServletResponse post(String path, String emp, String body, String button) throws Exception {
        MockHttpServletRequestBuilder b = MockMvcRequestBuilders.post(path).header("X-User-Id", "web-user")
                .contentType(MediaType.APPLICATION_JSON).content(body == null ? "" : body);
        if (emp != null) {
            b.header("X-Emp-No", emp);
        }
        if (button != null) {
            b.header("X-Screen-Id", "design_work").header("X-Button-Id", button);
        }
        return mockMvc.perform(b).andReturn().getResponse();
    }

    private JsonNode body(MockHttpServletResponse r) throws Exception {
        return json.readTree(r.getContentAsString(StandardCharsets.UTF_8));
    }

    private int count(String sql, Object... a) {
        return jdbc.queryForObject(sql, Integer.class, a);
    }

    private String ackBody(boolean acked, String sha) {
        return "{\"acked\":" + acked + ",\"sha256\":\"" + sha + "\",\"items\":[{\"inst_id\":\"dobong\",\"loc_kind\":\"SLIDE\",\"loc_no\":1}]}";
    }

    private String detailSha() throws Exception {
        return body(get("/tasks/" + tid + "/files/a.pptx/doc-check", null)).path("sha256").asText();
    }

    private void uploadDobong() throws Exception {
        MockHttpServletResponse up = upload("a.pptx", pptx("도봉구 사례를 참고했다"), DESIGNER);
        assertEquals(201, up.getStatus());
        JsonNode u = body(up);
        // 업로드 응답 계약은 그대로 — replaced 는 덮어쓸 때만 실린다(TaskFileEntry NON_DEFAULT)
        assertEquals("업로드 응답 키는 그대로", u.has("replaced") ? 4 : 3, u.size());
        assertTrue(u.has("name") && u.has("size") && u.has("uploaded_at"));
    }

    // ── 시험 ─────────────────────────────────────────────────────────────

    @Test
    public void 업로드하면_다른_기관명을_점검해_요약과_상세로_보여_준다() throws Exception {
        uploadDobong();
        MockHttpServletResponse sum = get("/tasks/" + tid + "/doc-check", null);
        assertEquals(200, sum.getStatus());
        JsonNode s = body(sum);
        assertEquals(1, s.path("unconfirmed_count").asInt());
        assertEquals("DONE", s.path("files").get(0).path("state").asText());
        assertFalse(s.path("clean").asBoolean());
        assertFalse("사번을 싣지 않는다", sum.getContentAsString(StandardCharsets.UTF_8).contains("emp_no"));

        JsonNode d = body(get("/tasks/" + tid + "/files/a.pptx/doc-check", null));
        JsonNode h = d.path("hits").get(0);
        assertEquals("dobong", h.path("inst_id").asText());
        assertEquals("SLIDE", h.path("loc_kind").asText());
        assertEquals(1, h.path("loc_no").asInt());
        assertFalse(h.path("acked").asBoolean());
        assertFalse("문맥은 요청하지 않으면 없다", h.has("contexts"));
    }

    @Test
    public void 문맥_보기는_활성_사용자만_하고_글_앞뒤만_짧게_준다() throws Exception {
        uploadDobong();
        assertEquals(401, get("/tasks/" + tid + "/files/a.pptx/doc-check?with_context=true", null).getStatus());
        MockHttpServletResponse ok = get("/tasks/" + tid + "/files/a.pptx/doc-check?with_context=true", DESIGNER);
        assertEquals(200, ok.getStatus());
        String c = body(ok).path("hits").get(0).path("contexts").get(0).asText();
        assertTrue(c, c.contains("도봉구") && c.length() <= 80);
    }

    @Test
    public void 담당_디자이너만_표시하고_해제하며_기록은_덧붙이기만_한다() throws Exception {
        uploadDobong();
        String path = "/tasks/" + tid + "/files/a.pptx/doc-check/ack";
        String sha = detailSha();
        assertEquals("사번 없이는 401", 401, post(path, null, ackBody(true, sha), "doc_check_ack").getStatus());
        assertEquals("영업 사번은 403", 403, post(path, SALES, ackBody(true, sha), "doc_check_ack").getStatus());
        assertEquals("다른 디자이너는 403", 403, post(path, DESIGNER2, ackBody(true, sha), "doc_check_ack").getStatus());

        MockHttpServletResponse ok = post(path, DESIGNER, ackBody(true, sha), "doc_check_ack");
        assertEquals(200, ok.getStatus());
        JsonNode h = body(ok).path("hits").get(0);
        assertTrue(h.path("acked").asBoolean());
        assertEquals("최디자이너", h.path("acked_by_name").asText());
        assertEquals(1, count("SELECT COUNT(*) FROM DOC_CHECK_LOG WHERE TASK_ID=? AND EVENT_CD='ACK' AND EMP_VERIFIED=0 AND UI_VALID=1", tid));

        assertEquals(200, post(path, DESIGNER, ackBody(true, sha), "doc_check_ack").getStatus());
        assertEquals("같은 표시를 반복해도 이력이 늘지 않는다", 1, count("SELECT COUNT(*) FROM DOC_CHECK_LOG WHERE TASK_ID=?", tid));

        MockHttpServletResponse un = post(path, DESIGNER, ackBody(false, sha), "doc_check_unack");
        assertFalse(body(un).path("hits").get(0).path("acked").asBoolean());
        assertEquals("해제는 덮어쓰지 않고 줄을 더한다", 2, count("SELECT COUNT(*) FROM DOC_CHECK_LOG WHERE TASK_ID=?", tid));
    }

    @Test
    public void 잘못된_표시_요청은_400이고_이력이_늘지_않는다() throws Exception {
        uploadDobong();
        String path = "/tasks/" + tid + "/files/a.pptx/doc-check/ack";
        String sha = detailSha();
        assertEquals(400, post(path, DESIGNER, ackBody(true, "abc"), "doc_check_ack").getStatus());
        assertEquals(400, post(path, DESIGNER, ackBody(true, sha).replace("SLIDE", "X"), "doc_check_ack").getStatus());
        assertEquals("없는 줄", 400, post(path, DESIGNER, ackBody(true, sha).replace("dobong", "gwangjin"), "doc_check_ack").getStatus());
        assertEquals(0, count("SELECT COUNT(*) FROM DOC_CHECK_LOG WHERE TASK_ID=?", tid));
    }

    @Test
    public void 다른_내용으로_다시_올리면_표시가_풀리고_옛_결과로_표시하면_409다() throws Exception {
        uploadDobong();
        String path = "/tasks/" + tid + "/files/a.pptx/doc-check/ack";
        String oldSha = detailSha();
        assertEquals(200, post(path, DESIGNER, ackBody(true, oldSha), "doc_check_ack").getStatus());
        assertEquals(201, upload("a.pptx", pptx("도봉구 그리고 또 도봉구"), DESIGNER).getStatus());
        assertEquals("표시는 옛 내용에 묶여 풀린다", 1, body(get("/tasks/" + tid + "/doc-check", null)).path("unconfirmed_count").asInt());
        MockHttpServletResponse stale = post(path, DESIGNER, ackBody(true, oldSha), "doc_check_ack");
        assertEquals(409, stale.getStatus());
        assertEquals("DOC_CHECK_STALE", body(stale).path("detail").path("code").asText());
    }

    @Test
    public void 의견을_받는_중이면_표시할_수_없다_409_TASK_LOCKED() throws Exception {
        uploadDobong();
        String sha = detailSha();
        assertEquals(200, post("/tasks/" + tid + "/design/complete", DESIGNER, null, null).getStatus());
        MockHttpServletResponse r = post("/tasks/" + tid + "/files/a.pptx/doc-check/ack", DESIGNER, ackBody(true, sha), "doc_check_ack");
        assertEquals(409, r.getStatus());
        assertEquals("TASK_LOCKED", body(r).path("detail").path("code").asText());
    }

    @Test
    public void 파일을_지우면_점검_기록은_사라지고_표시_이력은_남는다() throws Exception {
        uploadDobong();
        String sha = detailSha();
        assertEquals(200, post("/tasks/" + tid + "/files/a.pptx/doc-check/ack", DESIGNER, ackBody(true, sha), "doc_check_ack").getStatus());
        MockHttpServletRequestBuilder del = MockMvcRequestBuilders.delete("/tasks/" + tid + "/files/a.pptx")
                .header("X-User-Id", "web-user").header("X-Emp-No", DESIGNER);
        assertEquals(204, mockMvc.perform(del).andReturn().getResponse().getStatus());
        assertEquals(0, body(get("/tasks/" + tid + "/doc-check", null)).path("file_count").asInt());
        assertEquals(0, count("SELECT COUNT(*) FROM DOC_CHECK WHERE TASK_ID=?", tid));
        assertEquals(0, count("SELECT COUNT(*) FROM DOC_CHECK_HIT WHERE TASK_ID=?", tid));
        assertEquals(1, count("SELECT COUNT(*) FROM DOC_CHECK_LOG WHERE TASK_ID=?", tid));
    }

    @Test
    public void 점검하지_못하는_형식은_점검_못_함이고_깨끗하지_않다() throws Exception {
        assertEquals(201, upload("p.png", new byte[]{1, 2, 3}, DESIGNER).getStatus());
        JsonNode s = body(get("/tasks/" + tid + "/doc-check", null));
        assertTrue(s.path("not_checked_count").asInt() >= 1);
        assertFalse(s.path("clean").asBoolean());
        assertEquals("IMAGE_ONLY", s.path("files").get(0).path("reason").asText());
    }

    @Test
    public void 미확인이_남은_채_제출하면_제출은_되고_감사_줄이_남는다() throws Exception {
        uploadDobong();
        MockHttpServletResponse r = post("/tasks/" + tid + "/submit", DESIGNER, null, "doc_check_submit_anyway");
        assertEquals(200, r.getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM DOC_CHECK_LOG WHERE TASK_ID=? AND EVENT_CD='SUBMIT_OPEN' AND OPEN_COUNT=1"
                + " AND BUTTON_ID='doc_check_submit_anyway' AND UI_VALID=1 AND EMP_NO=?", tid, DESIGNER));
    }

    @Test
    public void 점검_못_함만_남은_채_제출하면_감사_줄이_없다() throws Exception {
        assertEquals(201, upload("p.png", new byte[]{1, 2, 3}, DESIGNER).getStatus());
        JsonNode s = body(get("/tasks/" + tid + "/doc-check", null));
        assertFalse("미확인 검출이 없으니 확인창 대상이 아니다", s.path("submit_confirm_needed").asBoolean());
        assertEquals(200, post("/tasks/" + tid + "/submit", DESIGNER, null, "doc_check_submit_anyway").getStatus());
        assertEquals(0, count("SELECT COUNT(*) FROM DOC_CHECK_LOG WHERE TASK_ID=? AND EVENT_CD='SUBMIT_OPEN'", tid));
    }

    @Test
    public void 올리기_규칙_밖_파일이_폴더에_있어도_요약은_200이고_제출_감사가_남는다() throws Exception {
        uploadDobong();
        String inst = jdbc.queryForObject("SELECT NAME_KO FROM INSTITUTIONS WHERE INSTITUTION_ID = ?", String.class, "nowon");
        java.io.File dir = com.kbstar.kgi.ggreport.web.support.TaskFiles.taskDir(properties.getOutputRoot(), inst, tid);
        java.nio.file.Files.write(new java.io.File(dir, "Thumbs.db").toPath(), new byte[]{1});
        java.nio.file.Files.write(new java.io.File(dir, "desktop.ini").toPath(), new byte[]{1});
        MockHttpServletResponse sum = get("/tasks/" + tid + "/doc-check", null);
        assertEquals(200, sum.getStatus());
        assertEquals("점검 대상은 올릴 수 있는 형식뿐", 1, body(sum).path("file_count").asInt());
        assertEquals(200, post("/tasks/" + tid + "/submit", DESIGNER, null, "doc_check_submit_anyway").getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM DOC_CHECK_LOG WHERE TASK_ID=? AND EVENT_CD='SUBMIT_OPEN'", tid));
    }

    @Test
    public void 표시_이력에_파일_이름_해시가_남는다() throws Exception {
        uploadDobong();
        String sha = detailSha();
        assertEquals(200, post("/tasks/" + tid + "/files/a.pptx/doc-check/ack", DESIGNER, ackBody(true, sha), "doc_check_ack").getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM DOC_CHECK_LOG WHERE TASK_ID=? AND EVENT_CD='ACK' AND NAME_KEY IS NOT NULL AND LENGTH(NAME_KEY)=64", tid));
    }

    @Test
    public void 의견을_받는_중에는_업로드가_409다() throws Exception {
        uploadDobong();
        assertEquals(200, post("/tasks/" + tid + "/design/complete", DESIGNER, null, null).getStatus());
        MockHttpServletResponse r = upload("b.pptx", pptx("도봉구"), DESIGNER);
        assertEquals(409, r.getStatus());
        assertEquals("TASK_LOCKED", body(r).path("detail").path("code").asText());
    }

    @Test
    public void 다시_점검은_활성_사용자만_하고_파일이_없으면_404다() throws Exception {
        uploadDobong();
        String path = "/tasks/" + tid + "/files/a.pptx/doc-check";
        assertEquals(401, post(path, null, null, null).getStatus());
        assertEquals(200, post(path, DESIGNER, null, "doc_check_recheck").getStatus());
        assertEquals(404, post("/tasks/" + tid + "/files/none.pptx/doc-check", DESIGNER, null, null).getStatus());
    }
}
