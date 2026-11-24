package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.config.MinutesSettings;
import com.kbstar.kgi.ggreport.web.domain.BoardMinutes;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.BoardMinutesIn;
import com.kbstar.kgi.ggreport.web.mapper.BoardMinutesMapper;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.service.BoardMinutesAccess;
import com.kbstar.kgi.ggreport.web.service.BoardMinutesService;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * 이사회 회의록(047) 4~5단계 — 권한(020 비상속)·업로드(미리보기·확정)·수정·할 일·공개범위·삭제·이력·감사·관문.
 * ⚠️ X-Emp-No·X-Screen-Id·X-Button-Id 는 자기신고다 — 여기서 고정하는 것은 업무 규칙·기록 형식이지 사칭 방지가 아니다.
 * 시험 데이터는 모두 가상이다(시드 가상 인물 이름만 쓴다). 컨텍스트를 쪼개지 않으려고 설정 스위치는 런타임에 바꿨다가 finally 에서 되돌린다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class BoardMinutesApiTest {

    /** 회의록 화면의 X-Screen-Id — 탭 안 쓰기 화면 id를 board_write로 통일(mn.UI.VIEW, 11-23 qa P3-D). 바뀌면 이 한 줄만 고친다. */
    private static final String MINUTES_SCREEN = "board_write";

    private static final Charset UTF8 = StandardCharsets.UTF_8;
    private static final String LEAD = "5047192";      // 영업팀장(담당 배정자 역할로 배정 신청)
    private static final String LEAD2 = "5640327";     // 비담당 영업팀장
    private static final String MEMBER = "3918264";    // 영업팀(담당)
    private static final String MEMBER2 = "3361829";   // 영업팀(같은 건 담당, 등록자 아님)
    private static final String HEAD = "2674805";      // 영업부장(DEPT_HEAD)
    private static final String EXEC = "1473958";      // 영업부장(EXECUTIVE)
    private static final String DESIGNER = "7130526";
    private static final String IT_LEAD = "6295038";   // 전산팀장
    private static final String ADMIN = "8203417";
    private static final String SEED_NAME = "김영업";    // 시드 사용자 이름 — 가려져야 한다
    private static final String SEED_NAME2 = "박영업";

    private static final String TL = "00:00 ~ 00:30\n안건, 설명\n- 안건을 설명했다\n\n00:30 ~ 01:00\n논의, 결정\n- 다음 안건을 논의했다";
    private static final String SUM = "주요 주제\n- " + SEED_NAME + "님 안건 논의\n\n다음 할 일\n- 자료 정리\n- 일정 확인";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private MinutesSettings settings;
    private final ObjectMapper om = new ObjectMapper();

    // ── 도우미 ───────────────────────────────────────────────────────

    private String newCase() throws Exception {
        String res = mockMvc.perform(post("/bidcases").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"institution_id\":\"nowon\"}").header("X-User-Id", "dave"))
                .andReturn().getResponse().getContentAsString(UTF8);
        return om.readTree(res).path("bid_case_id").asText();
    }

    /** MyBatis 쓰기 한 번으로 1차 캐시를 비운다(JdbcTemplate 으로 행을 바꾼 뒤 호출). */
    private void flushCache() throws Exception {
        newCase();
    }

    private static MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder b, String emp) {
        return emp == null ? b : b.header("X-Emp-No", emp);
    }

    private static MockHttpServletRequestBuilder ui(MockHttpServletRequestBuilder b, String button) {
        return button == null ? b : b.header("X-Screen-Id", MINUTES_SCREEN).header("X-Button-Id", button);
    }

    private String text(MvcResult r) throws Exception {
        return r.getResponse().getContentAsString(UTF8);
    }

    private JsonNode json(MvcResult r) throws Exception {
        return om.readTree(text(r));
    }

    private int status(MvcResult r) {
        return r.getResponse().getStatus();
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private static String kst(int plusDays) {
        return LocalDate.now(ZoneId.of("Asia/Seoul")).plusDays(plusDays).toString();
    }

    private String js(Object... kv) throws Exception {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return om.writeValueAsString(m);
    }

    /** 입찰 건 + MEMBER 담당 + 이사회 자료. {입찰 건, 자료 번호}. */
    private String[] fixture(String... assignees) throws Exception {
        String bc = newCase();
        String[] as = assignees.length == 0 ? new String[]{MEMBER} : assignees;
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < as.length; i++) {
            sb.append(i == 0 ? "" : ",").append('"').append(as[i]).append('"');
        }
        sb.append("]");
        MvcResult a = mockMvc.perform(as(post("/bidcases/" + bc + "/assignments").contentType(MediaType.APPLICATION_JSON)
                .content("{\"emp_nos\":" + sb + "}"), LEAD)).andReturn();
        assertEquals(text(a), 201, status(a));
        MvcResult c = mockMvc.perform(as(post("/board-materials").contentType(MediaType.APPLICATION_JSON)
                .header("X-Screen-Id", "board_write").header("X-Button-Id", "create")
                .content("{\"bid_case_id\":\"" + bc + "\",\"year\":2026}"), MEMBER)).andReturn();
        assertEquals(text(c), 201, status(c));
        return new String[]{bc, String.valueOf(json(c).path("material_id").asLong())};
    }

    private static String tx(String tag) {
        return "참석자 1 / 00:05\n안녕하세요 " + SEED_NAME + "님 회의를 시작합니다 " + tag
                + "\n\n참석자 2 / 00:20\n네 알겠습니다 안건을 보겠습니다\n\n참석자 1 / 00:40\n다음 안건으로 넘어가겠습니다";
    }

    private String opts(String title, String digest, String... release) throws Exception {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("meeting_date", "2026-01-15");
        if (title != null) {
            m.put("title", title);
        }
        if (digest != null) {
            m.put("preview_digest", digest);
            m.put("rules_ack", true);   // 저장 때만 필수(미리보기에는 요구하지 않는다)
        }
        if (release.length > 0) {
            m.put("release", Arrays.asList(release));
        }
        return om.writeValueAsString(m);
    }

    private MvcResult multi(String path, String emp, String button, String tName, byte[] t, byte[] tl, byte[] sm,
                            String options, String... extraParts) throws Exception {
        MockMultipartHttpServletRequestBuilder b = multipart(path);
        if (t != null) {
            b.file(new MockMultipartFile("transcript", tName, "text/plain", t));
        }
        if (tl != null) {
            b.file(new MockMultipartFile("timeline", "tl.txt", "text/plain", tl));
        }
        if (sm != null) {
            b.file(new MockMultipartFile("summary", "sm.txt", "text/plain", sm));
        }
        if (options != null) {
            b.file(new MockMultipartFile("options", "blob", "application/json", options.getBytes(UTF8)));
        }
        for (String e : extraParts) {
            b.file(new MockMultipartFile(e, "x.txt", "text/plain", "x".getBytes(UTF8)));
        }
        b.header("X-Screen-Id", "board_minutes_upload").header("X-Button-Id", button);
        return mockMvc.perform(as(b, emp)).andReturn();
    }

    private MvcResult preview(String mid, String emp, String transcript, String options) throws Exception {
        return multi("/board-materials/" + mid + "/minutes/preview", emp, "minutes_preview", "t.txt",
                transcript.getBytes(UTF8), TL.getBytes(UTF8), SUM.getBytes(UTF8), options);
    }

    private MvcResult upload(String mid, String emp, String transcript, String options) throws Exception {
        return multi("/board-materials/" + mid + "/minutes", emp, "minutes_upload", "t.txt",
                transcript.getBytes(UTF8), TL.getBytes(UTF8), SUM.getBytes(UTF8), options);
    }

    /** 미리보기 → 확정. 새 회의록 번호. */
    private long uploadOk(String mid, String emp, String tag, String... release) throws Exception {
        MvcResult pv = preview(mid, emp, tx(tag), opts(null, null, release));
        assertEquals(text(pv), 200, status(pv));
        String digest = json(pv).path("preview_digest").asText();
        MvcResult r = upload(mid, emp, tx(tag), opts("가상 회의록 " + tag, digest, release));
        assertEquals(text(r), 201, status(r));
        return json(r).path("minutes_id").asLong();
    }

    private MvcResult read(String path, String emp, String button) throws Exception {
        return mockMvc.perform(as(ui(get(path), button), emp)).andReturn();
    }

    private MvcResult view(long id, String emp) throws Exception {
        return read("/board-minutes/" + id, emp, "minutes_open");
    }

    private MvcResult sendPut(String path, String emp, String body) throws Exception {
        return mockMvc.perform(as(ui(put(path).contentType(MediaType.APPLICATION_JSON).content(body), "minutes_edit"), emp)).andReturn();
    }

    private MvcResult sendPost(String path, String emp, String body) throws Exception {
        return mockMvc.perform(as(ui(post(path).contentType(MediaType.APPLICATION_JSON).content(body), "minutes_scope_add"), emp)).andReturn();
    }

    private MvcResult scopeAdd(long id, String emp, String target, String until) throws Exception {
        return sendPost("/board-minutes/" + id + "/scope/add", emp, js("emp_no", target, "grant_until", until));
    }

    private MvcResult scopeRemove(long id, String emp, String target) throws Exception {
        return sendPost("/board-minutes/" + id + "/scope/remove", emp, js("emp_no", target));
    }

    private MvcResult editUtter(long id, String emp, int seq, String body, int rev) throws Exception {
        return sendPut("/board-minutes/" + id + "/utterances/" + seq, emp, js("text", body, "rev_no", rev));
    }

    // ── 권한 ─────────────────────────────────────────────────────────

    @Test
    public void 등록자는_올리고_영업팀장은_020_권한_없이도_회의록을_본다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "a");
        MvcResult v = view(id, LEAD2);
        assertEquals(text(v), 200, status(v));
        assertEquals("DEFAULT", json(v).path("viewer").path("via").asText());
        assertFalse(json(v).path("viewer").path("can_view_material").asBoolean());   // 020 값은 화면이 그리지 않는다
        int m = status(mockMvc.perform(as(get("/board-materials/" + fx[1]), LEAD2)).andReturn());
        assertTrue("020 규칙 그대로 거부: " + m, m == 403 || m == 404);
        assertEquals(200, status(view(id, EXEC)));
        assertEquals("HEAD", json(view(id, EXEC)).path("viewer").path("via").asText());
        assertEquals(200, status(view(id, HEAD)));
    }

    @Test
    public void 등록자는_올린_뒤_담당이_해제되거나_기간이_0이면_볼_수_없다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "b");
        assertEquals(200, status(view(id, MEMBER)));
        Object days = ReflectionTestUtils.getField(settings, "uploaderDays");
        try {
            ReflectionTestUtils.setField(settings, "uploaderDays", 0);
            assertEquals(404, status(view(id, MEMBER)));
        } finally {
            ReflectionTestUtils.setField(settings, "uploaderDays", days);
        }
        assertEquals(200, status(view(id, MEMBER)));
        jdbc.update("UPDATE BID_ASSIGNMENT SET ACTIVE_YN=0 WHERE BID_CASE_ID=? AND EMP_NO=?", fx[0], MEMBER);
        flushCache();
        assertEquals(404, status(view(id, MEMBER)));
    }

    @Test
    public void 같은_건_담당자라도_등록자가_아니면_404다() throws Exception {
        String[] fx = fixture(MEMBER, MEMBER2);
        long id = uploadOk(fx[1], MEMBER, "c");
        assertEquals(404, status(view(id, MEMBER2)));
    }

    @Test
    public void 공개범위로_연_사람은_보기만_하고_거두거나_기간이_지나면_404다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "d");
        assertEquals(404, status(view(id, DESIGNER)));
        MvcResult add = scopeAdd(id, HEAD, DESIGNER, kst(1));
        assertEquals(text(add), 200, status(add));
        assertTrue(json(add).path("changed").asBoolean());
        assertEquals(200, status(view(id, DESIGNER)));
        assertEquals(403, status(editUtter(id, DESIGNER, 1, "가상 본문", 0)));   // 볼 수는 있으나 수정은 못 한다
        assertEquals(200, status(scopeRemove(id, HEAD, DESIGNER)));
        assertEquals(404, status(view(id, DESIGNER)));
        assertEquals(200, status(scopeAdd(id, HEAD, DESIGNER, kst(1))));
        jdbc.update("UPDATE BOARD_MINUTES_SCOPE SET GRANT_UNTIL=? WHERE MINUTES_ID=?", kst(-1), id);
        flushCache();
        assertEquals(404, status(view(id, DESIGNER)));
    }

    @Test
    public void 전산팀장은_결재_등급만으로는_열리지_않는다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "e");
        assertEquals(404, status(view(id, IT_LEAD)));
    }

    @Test
    public void 관리자는_상세는_404이고_감사_열람만_된다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "f");
        assertEquals(404, status(view(id, ADMIN)));
        MvcResult acts = read("/board-minutes/" + id + "/acts", ADMIN, "minutes_acts");
        assertEquals(text(acts), 200, status(acts));
        assertEquals(403, status(read("/board-minutes/" + id + "/acts", LEAD2, "minutes_acts")));   // 볼 수 있어도 감사 열람은 부장급·관리자만
    }

    @Test
    public void 자료_탭_목록은_없거나_권한이_없어도_같은_빈_응답이다() throws Exception {
        String[] fx = fixture();
        String[] none = fixture();
        long id = uploadOk(fx[1], MEMBER, "g");
        MvcResult noPerm = read("/board-materials/" + fx[1] + "/minutes", DESIGNER, "minutes_tab");
        MvcResult noMat = read("/board-materials/99999999/minutes", DESIGNER, "minutes_tab");
        assertEquals(200, status(noPerm));
        assertEquals(text(noPerm), text(noMat));
        assertEquals(0, json(noPerm).path("items").size());
        assertFalse(json(noPerm).path("can_upload").asBoolean());
        MvcResult zero = read("/board-materials/" + none[1] + "/minutes", MEMBER, "minutes_tab");   // 권한은 있으나 0건
        assertEquals(0, json(zero).path("items").size());
        assertTrue(json(zero).path("can_upload").asBoolean());
        MvcResult mine = read("/board-materials/" + fx[1] + "/minutes", LEAD2, "minutes_tab");
        assertEquals(id, json(mine).path("items").get(0).path("minutes_id").asLong());
        assertFalse(json(mine).path("items").get(0).has("_via"));
        assertFalse(json(mine).path("can_upload").asBoolean());
    }

    // ── 업로드 ───────────────────────────────────────────────────────

    @Test
    public void 비담당_영업팀장의_업로드는_403이고_거부가_남는다() throws Exception {
        String[] fx = fixture();
        MvcResult r = upload(fx[1], LEAD2, tx("h"), opts("제목", "0000000000000000000000000000000000000000000000000000000000000000"));
        assertEquals(403, status(r));
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MINUTES WHERE MATERIAL_ID=?", Long.parseLong(fx[1])));
        assertTrue(count("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE='DENIED' AND REQ_PATH=?",
                "/board-materials/" + fx[1] + "/minutes") >= 1);
        assertEquals(1, count("SELECT COUNT(*) FROM BOARD_MINUTES_ACT WHERE MATERIAL_ID=? AND ACTION_CD='UPLOAD' AND OUTCOME='DENIED'",
                Long.parseLong(fx[1])));
    }

    @Test
    public void 미리보기는_저장하지_않고_이름_후보를_보여_주고_확정은_이름을_남기지_않는다() throws Exception {
        String[] fx = fixture();
        long mid = Long.parseLong(fx[1]);
        MvcResult pv = preview(fx[1], MEMBER, tx("i"), opts(null, null));
        assertEquals(text(pv), 200, status(pv));
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MINUTES WHERE MATERIAL_ID=?", mid));
        assertEquals(1, count("SELECT COUNT(*) FROM BOARD_MINUTES_ACT WHERE MATERIAL_ID=? AND ACTION_CD='PREVIEW' AND OUTCOME='OK'", mid));
        boolean found = false;
        for (JsonNode n : json(pv).path("name_candidates")) {
            found |= SEED_NAME.equals(n.path("term").asText());
        }
        assertTrue(found);
        assertFalse(text(pv).contains(SEED_NAME + "님"));   // 미리보기 글도 이미 가려져 있다
        long id = uploadOk(fx[1], MEMBER, "i");
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MINUTES_UTTER WHERE MINUTES_ID=? AND BODY LIKE ?", id, "%" + SEED_NAME + "%"));
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MINUTES_ITEM WHERE MINUTES_ID=? AND BODY LIKE ?", id, "%" + SEED_NAME + "%"));
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MINUTES WHERE MINUTES_ID=? AND TITLE LIKE ?", id, "%" + SEED_NAME + "%"));
        assertTrue(count("SELECT COUNT(*) FROM BOARD_MINUTES_UTTER WHERE MINUTES_ID=? AND BODY LIKE ?", id, "%[이름]%") >= 1);
    }

    @Test
    public void 확인값이_다르면_409_PREVIEW_CHANGED_같은_파일_다시는_ALREADY_UPLOADED_열한_번째는_MINUTES_CAP() throws Exception {
        String[] fx = fixture();
        String digestA = json(preview(fx[1], MEMBER, tx("j1"), opts(null, null))).path("preview_digest").asText();
        MvcResult changed = upload(fx[1], MEMBER, tx("j2"), opts("제목", digestA));
        assertEquals(text(changed), 409, status(changed));
        assertEquals("PREVIEW_CHANGED", json(changed).path("detail").path("code").asText());
        long first = uploadOk(fx[1], MEMBER, "j1");
        MvcResult dup = upload(fx[1], MEMBER, tx("j1"), opts("제목", digestA));
        assertEquals(409, status(dup));
        assertEquals("ALREADY_UPLOADED", json(dup).path("detail").path("code").asText());
        assertEquals(first, json(dup).path("detail").path("minutes_id").asLong());   // 볼 수 있는 사람에게만 번호를 준다
        for (int i = 2; i <= 10; i++) {
            uploadOk(fx[1], MEMBER, "j" + (i + 10));
        }
        MvcResult cap = upload(fx[1], MEMBER, tx("j99"),
                opts("제목", json(preview(fx[1], MEMBER, tx("j99"), opts(null, null))).path("preview_digest").asText()));
        assertEquals(text(cap), 409, status(cap));
        assertEquals("MINUTES_CAP", json(cap).path("detail").path("code").asText());
    }

    @Test
    public void 입력이_규칙에_맞지_않으면_422다() throws Exception {
        String[] fx = fixture();
        String zero = "0000000000000000000000000000000000000000000000000000000000000000";
        MvcResult hwp = multi("/board-materials/" + fx[1] + "/minutes", MEMBER, "minutes_upload", "t.hwp",
                tx("k").getBytes(UTF8), null, null, opts("제목", zero));
        assertEquals(text(hwp), 422, status(hwp));
        assertEquals("NOT_TXT", json(hwp).path("detail").path("code").asText());
        MvcResult empty = multi("/board-materials/" + fx[1] + "/minutes", MEMBER, "minutes_upload", "t.txt",
                new byte[0], null, null, opts("제목", zero));
        assertEquals(422, status(empty));
        assertEquals("EMPTY_FILE", json(empty).path("detail").path("code").asText());
        Map<String, Object> future = new LinkedHashMap<String, Object>();
        future.put("meeting_date", kst(2));
        future.put("title", "제목");
        future.put("preview_digest", zero);
        MvcResult fut = upload(fx[1], MEMBER, tx("k"), om.writeValueAsString(future));
        assertEquals(422, status(fut));
        MvcResult noTitle = upload(fx[1], MEMBER, tx("k"), opts(null, zero));
        assertEquals(422, status(noTitle));
        assertEquals("TITLE_REQUIRED", json(noTitle).path("detail").path("code").asText());
        MvcResult noTx = multi("/board-materials/" + fx[1] + "/minutes", MEMBER, "minutes_upload", "t.txt",
                null, null, null, opts("제목", zero));
        assertEquals(422, status(noTx));
        assertEquals("TRANSCRIPT_REQUIRED", json(noTx).path("detail").path("code").asText());
    }

    @Test
    public void 모르는_파트와_깨진_옵션은_400이고_원문을_돌려주지_않는다() throws Exception {
        String[] fx = fixture();
        MvcResult evil = multi("/board-materials/" + fx[1] + "/minutes/preview", MEMBER, "minutes_preview", "t.txt",
                tx("l").getBytes(UTF8), null, null, opts(null, null), "evil");
        assertEquals(text(evil), 400, status(evil));
        assertEquals("TOO_MANY_PARTS", json(evil).path("detail").path("code").asText());
        MvcResult broken = multi("/board-materials/" + fx[1] + "/minutes/preview", MEMBER, "minutes_preview", "t.txt",
                tx("l").getBytes(UTF8), null, null, "ZQRAW{{not json");
        assertEquals(400, status(broken));
        assertEquals("OPTIONS_INVALID", json(broken).path("detail").path("code").asText());
        assertFalse(text(broken).contains("ZQRAW"));
    }

    @Test
    public void 파일_하나가_상한을_넘으면_413_FILE_TOO_LARGE() throws Exception {
        String[] fx = fixture();
        byte[] big = new byte[2 * 1024 * 1024 + 1];
        Arrays.fill(big, (byte) 'a');
        MvcResult r = multi("/board-materials/" + fx[1] + "/minutes/preview", MEMBER, "minutes_preview", "t.txt",
                big, null, null, opts(null, null));
        assertEquals(413, status(r));
        assertEquals("FILE_TOO_LARGE", json(r).path("detail").path("code").asText());
    }

    // ── 수정 ─────────────────────────────────────────────────────────

    @Test
    public void 낡은_rev_no는_409_REV_CHANGED와_현재_버전을_준다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "m");
        // 발언 2는 가린 자리가 없다(발언 1에는 [이름]이 있어 통째로 바꾸면 EDIT_MASK_REMOVED)
        MvcResult r = editUtter(id, HEAD, 2, "가상 수정 본문", 5);
        assertEquals(text(r), 409, status(r));
        assertEquals("REV_CHANGED", json(r).path("detail").path("code").asText());
        assertEquals(0, json(r).path("detail").path("current_rev").asInt());
        MvcResult ok = editUtter(id, HEAD, 2, "가상 수정 본문", 0);
        assertEquals(text(ok), 200, status(ok));
        assertTrue(json(ok).path("changed").asBoolean());
        assertEquals(1, json(ok).path("rev_no").asInt());
        assertFalse(json(editUtter(id, HEAD, 2, "가상 수정 본문", 1)).path("changed").asBoolean());   // 같은 글은 버전을 올리지 않는다
    }

    @Test
    public void 이름이_든_수정은_422_MASK_REQUIRED이고_이름을_되돌려_주지_않는다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "n");
        MvcResult r = editUtter(id, HEAD, 1, "내용에 " + SEED_NAME2 + " 이름이 들어 있다", 0);
        assertEquals(text(r), 422, status(r));
        assertEquals("MASK_REQUIRED", json(r).path("detail").path("code").asText());
        assertTrue(json(r).path("detail").path("kinds").has("name"));
        assertFalse(text(r).contains(SEED_NAME2));
    }

    @Test
    public void 보이지_않는_문자를_섞어도_저장된_글에는_남지_않는다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "o");
        String zwsp = new String(Character.toChars(0x200B));
        MvcResult r = editUtter(id, HEAD, 2, "수정" + zwsp + "된 본문", 0);
        assertEquals(text(r), 200, status(r));
        String body = jdbc.queryForObject("SELECT BODY FROM BOARD_MINUTES_UTTER WHERE MINUTES_ID=? AND SEQ_NO=2", String.class, id);
        assertFalse(body.contains(zwsp));
        assertTrue(body.contains("수정"));
    }

    @Test
    public void 등록_때_해제한_이름은_수정_이력의_이전_글에서_다시_가려진다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "p", SEED_NAME);
        String before = jdbc.queryForObject("SELECT BODY FROM BOARD_MINUTES_UTTER WHERE MINUTES_ID=? AND SEQ_NO=1", String.class, id);
        assertTrue(before.contains(SEED_NAME));   // 해제했으니 남아 있다
        assertEquals(200, status(editUtter(id, HEAD, 1, "가상 수정 본문", 0)));
        String old = jdbc.queryForObject("SELECT OLD_TEXT FROM BOARD_MINUTES_REV WHERE MINUTES_ID=? AND REV_NO=1", String.class, id);
        assertFalse(old.contains(SEED_NAME));
        assertTrue(old.contains("[이름]"));
    }

    @Test
    public void 할_일은_체크하고_멱등이며_주제_항목은_NOT_TODO다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "q");
        JsonNode d = json(view(id, HEAD));
        int todoNo = d.path("summary").path("todos").get(0).path("item_no").asInt();
        int topicNo = d.path("summary").path("topics").get(0).path("item_no").asInt();
        MvcResult on = sendPost("/board-minutes/" + id + "/items/" + todoNo + "/done", HEAD, "{\"done\":true}");
        assertEquals(text(on), 200, status(on));
        assertTrue(json(on).path("changed").asBoolean());
        assertEquals(HEAD, jdbc.queryForObject("SELECT DONE_BY FROM BOARD_MINUTES_ITEM WHERE MINUTES_ID=? AND ITEM_NO=?", String.class, id, todoNo));
        assertFalse(json(sendPost("/board-minutes/" + id + "/items/" + todoNo + "/done", HEAD, "{\"done\":true}")).path("changed").asBoolean());
        assertEquals(0, jdbc.queryForObject("SELECT REV_NO FROM BOARD_MINUTES WHERE MINUTES_ID=?", Integer.class, id).intValue());   // 버전은 그대로
        MvcResult nt = sendPost("/board-minutes/" + id + "/items/" + topicNo + "/done", HEAD, "{\"done\":true}");
        assertEquals(400, status(nt));
        assertEquals("NOT_TODO", json(nt).path("detail").path("code").asText());
    }

    @Test
    public void 제목_수정은_이력에_TITLE로_남는다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "r");
        MvcResult r = sendPut("/board-minutes/" + id + "/meta", HEAD, js("field", "title", "value", "새 가상 제목", "rev_no", 0));
        assertEquals(text(r), 200, status(r));
        assertEquals("TITLE", jdbc.queryForObject("SELECT FIELD_CD FROM BOARD_MINUTES_REV WHERE MINUTES_ID=? AND REV_NO=1", String.class, id));
        assertEquals("새 가상 제목", json(view(id, HEAD)).path("title").asText());
        MvcResult d = sendPut("/board-minutes/" + id + "/meta", HEAD, js("field", "meeting_date", "value", "2026-02-01", "rev_no", 1));
        assertEquals(text(d), 200, status(d));
        assertEquals("MEETING_DATE", jdbc.queryForObject("SELECT FIELD_CD FROM BOARD_MINUTES_REV WHERE MINUTES_ID=? AND REV_NO=2", String.class, id));
    }

    // ── 이력·공개범위·삭제 ───────────────────────────────────────────

    @Test
    public void 이력은_부장급과_등록자만_본다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "s");
        assertEquals(200, status(editUtter(id, HEAD, 2, "가상 수정 본문", 0)));
        assertEquals(200, status(scopeAdd(id, HEAD, DESIGNER, kst(1))));
        MvcResult head = read("/board-minutes/" + id + "/history", HEAD, "minutes_history");
        assertEquals(text(head), 200, status(head));
        assertTrue(json(head).path("revs").size() >= 1);
        assertEquals(200, status(read("/board-minutes/" + id + "/history", MEMBER, "minutes_history")));
        assertEquals(403, status(read("/board-minutes/" + id + "/history", LEAD2, "minutes_history")));
        assertEquals(403, status(read("/board-minutes/" + id + "/history", DESIGNER, "minutes_history")));
        assertEquals(404, status(read("/board-minutes/" + id + "/history", IT_LEAD, "minutes_history")));
    }

    @Test
    public void 공개범위는_부장급만_바꾸고_이력에는_사번만_남는다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "t");
        assertEquals(403, status(scopeAdd(id, LEAD2, DESIGNER, kst(1))));
        assertEquals(200, status(scopeAdd(id, HEAD, DESIGNER, kst(1))));
        Map<String, Object> log = jdbc.queryForMap("SELECT SCOPE_BEFORE, SCOPE_AFTER FROM BOARD_MINUTES_LOG WHERE MINUTES_ID=? AND EVENT_CD='SCOPE_ADD'", id);
        String before = (String) log.get("SCOPE_BEFORE");
        assertTrue(before == null || before.isEmpty());
        assertEquals(DESIGNER, log.get("SCOPE_AFTER"));
        assertFalse(json(scopeAdd(id, HEAD, DESIGNER, kst(1))).path("changed").asBoolean());
        MvcResult ext = scopeAdd(id, HEAD, DESIGNER, kst(5));
        assertTrue(json(ext).path("changed").asBoolean());
        assertEquals("SCOPE_EXTEND", json(ext).path("event").asText());
        assertEquals(1, count("SELECT COUNT(*) FROM BOARD_MINUTES_LOG WHERE MINUTES_ID=? AND EVENT_CD='SCOPE_EXTEND'", id));
        JsonNode list = json(read("/board-minutes/" + id + "/scope", HEAD, "minutes_scope_open"));
        assertEquals(1, list.size());
        assertEquals(DESIGNER, list.get(0).path("emp_no").asText());
    }

    @Test
    public void 공개_대상이_올바르지_않으면_400_상한은_422_기본_열람자는_변경_없음이다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "u");
        MvcResult none = scopeAdd(id, HEAD, "0000000", kst(1));
        assertEquals(400, status(none));
        assertEquals("SCOPE_TARGET_INVALID", json(none).path("detail").path("code").asText());
        assertFalse(text(none).contains("0000000"));
        jdbc.update("UPDATE USERS SET STATUS='LOCKED' WHERE EMP_NO='6086214'");
        flushCache();
        assertEquals(400, status(scopeAdd(id, HEAD, "6086214", kst(1))));
        MvcResult far = scopeAdd(id, HEAD, DESIGNER, kst(366));
        assertEquals(400, status(far));
        assertEquals("GRANT_UNTIL_INVALID", json(far).path("detail").path("code").asText());
        MvcResult def = scopeAdd(id, HEAD, LEAD2, kst(1));
        assertEquals(200, status(def));
        assertFalse(json(def).path("changed").asBoolean());
        assertEquals("ALREADY_DEFAULT", json(def).path("reason").asText());
        for (int i = 0; i < 30; i++) {
            jdbc.update("INSERT INTO BOARD_MINUTES_SCOPE (MINUTES_ID, GRANT_TYPE, GRANT_VALUE, GRANT_UNTIL, GRANTED_BY, GRANTED_AT) VALUES (?,?,?,?,?,?)",
                    id, "EMP", String.format("90000%02d", i), kst(1), HEAD, "2026-11-19T00:00:00.000000+00:00");
        }
        MvcResult cap = scopeAdd(id, HEAD, DESIGNER, kst(1));
        assertEquals(text(cap), 422, status(cap));
        assertEquals("SCOPE_CAP", json(cap).path("detail").path("code").asText());
    }

    @Test
    public void 삭제는_부장급만_하고_본문이_사라지며_감사_열람은_남는다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "v");
        assertEquals(200, status(scopeAdd(id, HEAD, DESIGNER, kst(1))));
        assertEquals(200, status(editUtter(id, HEAD, 2, "가상 수정 본문", 0)));
        assertEquals(403, status(sendPost("/board-minutes/" + id + "/delete", LEAD2, "{\"rev_no\":1}")));
        MvcResult del = sendPost("/board-minutes/" + id + "/delete", HEAD, "{\"rev_no\":1}");
        assertEquals(text(del), 200, status(del));
        for (String t : new String[]{"BOARD_MINUTES_UTTER", "BOARD_MINUTES_ITEM", "BOARD_MINUTES_SEG", "BOARD_MINUTES_SCOPE", "BOARD_MINUTES_REV"}) {
            assertEquals(t, 0, count("SELECT COUNT(*) FROM " + t + " WHERE MINUTES_ID=?", id));
        }
        assertEquals(404, status(view(id, HEAD)));
        assertEquals(404, status(view(id, LEAD2)));
        assertEquals(200, status(read("/board-minutes/" + id + "/acts", HEAD, "minutes_acts")));
        assertEquals(1, count("SELECT COUNT(*) FROM BOARD_MINUTES_LOG WHERE MINUTES_ID=? AND EVENT_CD='DELETE'", id));
    }

    // ── 감사·관문 ────────────────────────────────────────────────────

    @Test
    public void 모든_호출이_누가_어느_화면_버튼_어떤_경로로_남는다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "w");
        assertEquals(200, status(view(id, LEAD2)));
        assertEquals(200, status(read("/board-minutes/" + id + "/transcript", LEAD2, "minutes_transcript")));
        assertEquals(404, status(view(id, DESIGNER)));
        assertEquals(403, status(read("/board-minutes/" + id + "/history", LEAD2, "minutes_history")));
        assertEquals(200, status(read("/board-minutes?year=2026", HEAD, "minutes_list")));
        List<Map<String, Object>> acts = jdbc.queryForList(
                "SELECT ACTION_CD, OUTCOME, VIA_CD, ACTOR_EMP_NO, SCREEN_ID, BUTTON_ID, UI_VALID FROM BOARD_MINUTES_ACT "
                        + "WHERE MINUTES_ID=? AND ACTOR_EMP_NO IN (?,?,?) ORDER BY ACT_ID", id, LEAD2, DESIGNER, HEAD);
        assertEquals(5, acts.size());
        assertEquals("VIEW_SUMMARY", acts.get(0).get("ACTION_CD"));
        assertEquals("OK", acts.get(0).get("OUTCOME"));
        assertEquals("DEFAULT", acts.get(0).get("VIA_CD"));
        assertEquals(MINUTES_SCREEN, acts.get(0).get("SCREEN_ID"));
        assertEquals("minutes_open", acts.get(0).get("BUTTON_ID"));
        assertEquals("VIEW_TRANSCRIPT", acts.get(1).get("ACTION_CD"));
        assertEquals("HIDDEN", acts.get(2).get("OUTCOME"));
        assertEquals("DENIED", acts.get(3).get("OUTCOME"));
        assertEquals("LIST", acts.get(4).get("ACTION_CD"));
        assertEquals("HEAD", acts.get(4).get("VIA_CD"));
    }

    @Test
    public void 접근_이력에는_본문과_가림_단어가_없다() throws Exception {
        String[] fx = fixture();
        MvcResult pv = multi("/board-materials/" + fx[1] + "/minutes/preview", MEMBER, "minutes_preview", "t.txt",
                (tx("x") + " ZQ가림토큰").getBytes(UTF8), TL.getBytes(UTF8), SUM.getBytes(UTF8),
                "{\"meeting_date\":\"2026-01-15\",\"title\":\"제목 ZQ가림토큰\",\"terms\":[\"ZQ가림토큰\"]}");
        assertEquals(text(pv), 200, status(pv));
        assertFalse(text(pv).contains("ZQ가림토큰"));
        assertEquals(0, count("SELECT COUNT(*) FROM ACCESS_LOG WHERE DETAIL LIKE ?", "%가림토큰%"));
        assertEquals(0, count("SELECT COUNT(*) FROM ACCESS_LOG WHERE REQ_PATH LIKE ?", "%가림토큰%"));
    }

    @Test
    public void 기능이_꺼져_있으면_모든_회의록_경로가_404이고_기록이_없다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "y");
        int before = count("SELECT COUNT(*) FROM BOARD_MINUTES_ACT");
        Object enabled = ReflectionTestUtils.getField(settings, "enabled");
        try {
            ReflectionTestUtils.setField(settings, "enabled", false);
            assertEquals(404, status(view(id, HEAD)));
            assertEquals(404, status(read("/board-minutes", HEAD, "minutes_list")));
            assertEquals(404, status(read("/board-materials/" + fx[1] + "/minutes", MEMBER, "minutes_tab")));
            assertEquals(404, status(preview(fx[1], MEMBER, tx("y2"), opts(null, null))));
            assertEquals(404, status(editUtter(id, HEAD, 1, "가상 수정 본문", 0)));
        } finally {
            ReflectionTestUtils.setField(settings, "enabled", enabled);
        }
        assertEquals(before, count("SELECT COUNT(*) FROM BOARD_MINUTES_ACT"));
    }

    @Test
    public void 앞단_인증을_요구하면_자기신고_사번은_403_VERIFIED_REQUIRED다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "z");
        Object verified = ReflectionTestUtils.getField(settings, "requireVerified");
        try {
            ReflectionTestUtils.setField(settings, "requireVerified", true);
            MvcResult r = view(id, HEAD);
            assertEquals(text(r), 403, status(r));
            assertEquals("VERIFIED_REQUIRED", json(r).path("detail").path("code").asText());
            MvcResult ok = mockMvc.perform(ui(get("/board-minutes/" + id), "minutes_open")
                    .with(req -> {
                        req.setRemoteUser(HEAD);
                        return req;
                    })).andReturn();
            assertEquals(text(ok), 200, status(ok));
        } finally {
            ReflectionTestUtils.setField(settings, "requireVerified", verified);
        }
    }

    @Test
    public void 사번이_없으면_401_원문과_쓰기에_화면_식별자가_없으면_400이다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "aa");
        assertEquals(401, status(view(id, null)));
        MvcResult noUi = mockMvc.perform(as(get("/board-minutes/" + id + "/transcript"), HEAD)).andReturn();
        assertEquals(400, status(noUi));
        assertEquals("UI_ID_REQUIRED", json(noUi).path("detail").path("code").asText());
        MvcResult noUiPut = mockMvc.perform(as(put("/board-minutes/" + id + "/utterances/1").contentType(MediaType.APPLICATION_JSON)
                .content(js("text", "가상 수정 본문", "rev_no", 0)), HEAD)).andReturn();
        assertEquals(400, status(noUiPut));
        assertEquals("UI_ID_REQUIRED", json(noUiPut).path("detail").path("code").asText());
        assertEquals(200, status(mockMvc.perform(as(get("/board-minutes/" + id), HEAD)).andReturn()));   // 상세 읽기는 식별자가 없어도 된다
    }

    @Test
    public void 모든_응답에_no_store가_붙는다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "bb");
        assertEquals("no-store", view(id, HEAD).getResponse().getHeader("Cache-Control"));            // 200
        assertEquals("no-store", view(id, DESIGNER).getResponse().getHeader("Cache-Control"));        // 404
        assertEquals("no-store", read("/board-minutes/" + id + "/history", LEAD2, "minutes_history").getResponse().getHeader("Cache-Control"));   // 403
        assertEquals("no-store", view(id, null).getResponse().getHeader("Cache-Control"));            // 401
        assertNotNull(read("/board-minutes", HEAD, "minutes_list").getResponse().getHeader("Cache-Control"));
        assertEquals("no-store", read("/board-materials/" + fx[1] + "/minutes", MEMBER, "minutes_tab").getResponse().getHeader("Cache-Control"));
    }

    // ── 저장 전후 발언 수정·발화자 역할 라벨(058) ─────────────────────

    private static final String ZERO64 = "0000000000000000000000000000000000000000000000000000000000000000";
    private static final String EDITS = "{\"speaker_labels\":{\"1\":\"은행 측\"},\"utter_edits\":[{\"seq_no\":2,\"text\":\"네 "
            + SEED_NAME + " 님 010-1234-5678 확인\"}]}";

    private MvcResult multiE(String path, String emp, String button, String transcript, String options, String edits) throws Exception {
        MockMultipartHttpServletRequestBuilder b = multipart(path);
        b.file(new MockMultipartFile("transcript", "t.txt", "text/plain", transcript.getBytes(UTF8)));
        b.file(new MockMultipartFile("timeline", "tl.txt", "text/plain", TL.getBytes(UTF8)));
        b.file(new MockMultipartFile("summary", "sm.txt", "text/plain", SUM.getBytes(UTF8)));
        if (options != null) {
            b.file(new MockMultipartFile("options", "blob", "application/json", options.getBytes(UTF8)));
        }
        if (edits != null) {
            b.file(new MockMultipartFile("edits", "blob", "application/json", edits.getBytes(UTF8)));
        }
        b.header("X-Screen-Id", "board_minutes_upload").header("X-Button-Id", button);
        return mockMvc.perform(as(b, emp)).andReturn();
    }

    private MvcResult previewE(String mid, String emp, String tag, String options, String edits) throws Exception {
        return multiE("/board-materials/" + mid + "/minutes/preview", emp, "minutes_preview", tx(tag), options, edits);
    }

    private MvcResult uploadE(String mid, String emp, String tag, String options, String edits) throws Exception {
        return multiE("/board-materials/" + mid + "/minutes", emp, "minutes_upload", tx(tag), options, edits);
    }

    private String optsE(String title, String digest, String editsDigest, String termsJson) throws Exception {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("meeting_date", "2026-01-15");
        if (title != null) {
            m.put("title", title);
        }
        if (digest != null) {
            m.put("preview_digest", digest);
            m.put("rules_ack", true);
        }
        if (editsDigest != null) {
            m.put("edits_digest", editsDigest);
        }
        if (termsJson != null) {
            m.put("terms", om.readTree(termsJson));
        }
        return om.writeValueAsString(m);
    }

    private MvcResult putLabel(long id, String emp, int no, String label, int rev) throws Exception {
        return mockMvc.perform(as(ui(put("/board-minutes/" + id + "/speakers/" + no).contentType(MediaType.APPLICATION_JSON)
                .content(js("label", label, "rev_no", rev)), "minutes_label"), emp)).andReturn();
    }

    @Test
    public void 미리보기에_고친_발언과_라벨을_실으면_가린_결과와_edits_digest를_준다() throws Exception {
        String[] fx = fixture();
        MvcResult plain = preview(fx[1], MEMBER, tx("e1"), opts(null, null));
        MvcResult pv = previewE(fx[1], MEMBER, "e1", opts(null, null), EDITS);
        assertEquals(text(pv), 200, status(pv));
        JsonNode t = json(pv).path("transcript");
        assertTrue(t.get(1).path("text").asText().contains("[이름]"));
        assertTrue(t.get(1).path("text").asText().contains("[가림]"));
        assertFalse(text(pv).contains("5678"));
        assertTrue(t.get(1).path("edited").asBoolean());
        assertEquals("은행 측", t.get(0).path("speaker_label").asText());
        assertEquals("참석자 1", t.get(0).path("speaker").asText());
        assertEquals("은행 측", json(pv).path("speakers").get(0).path("label").asText());
        assertTrue(json(pv).path("edits_digest").asText().matches("[0-9a-f]{64}"));
        assertEquals(json(plain).path("preview_digest").asText(), json(pv).path("preview_digest").asText());
        assertEquals(1, json(pv).path("edited_cnt").asInt());
    }

    @Test
    public void 저장_때_edits_digest가_다르거나_빠지면_409_PREVIEW_CHANGED() throws Exception {
        String[] fx = fixture();
        JsonNode pv = json(previewE(fx[1], MEMBER, "e2", opts(null, null), EDITS));
        String d = pv.path("preview_digest").asText();
        String ed = pv.path("edits_digest").asText();
        MvcResult missing = uploadE(fx[1], MEMBER, "e2", optsE("제목", d, null, null), EDITS);
        assertEquals(text(missing), 409, status(missing));
        assertEquals("PREVIEW_CHANGED", json(missing).path("detail").path("code").asText());
        assertEquals(409, status(uploadE(fx[1], MEMBER, "e2", optsE("제목", d, ZERO64, null), EDITS)));
        assertEquals(409, status(uploadE(fx[1], MEMBER, "e2", optsE("제목", d, ed, null), null)));   // 수정 없이 digest 만
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MINUTES WHERE MATERIAL_ID=?", Long.parseLong(fx[1])));
    }

    @Test
    public void 고친_발언과_라벨은_가린_채_저장되고_수정_표시가_남는다() throws Exception {
        String[] fx = fixture();
        JsonNode pv = json(previewE(fx[1], MEMBER, "e3", opts(null, null), EDITS));
        MvcResult r = uploadE(fx[1], MEMBER, "e3", optsE("가상 회의록 e3", pv.path("preview_digest").asText(),
                pv.path("edits_digest").asText(), null), EDITS);
        assertEquals(text(r), 201, status(r));
        long id = json(r).path("minutes_id").asLong();
        assertEquals(1, json(r).path("edited_cnt").asInt());
        assertEquals(1, json(r).path("label_cnt").asInt());
        JsonNode items = json(read("/board-minutes/" + id + "/transcript", HEAD, "minutes_transcript")).path("items");
        assertTrue(items.get(1).path("edited").asBoolean());
        assertEquals("은행 측", items.get(0).path("speaker_label").asText());
        assertEquals(1, count("SELECT COUNT(*) FROM BOARD_MINUTES_SPEAKER WHERE MINUTES_ID=?", id));
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MINUTES_UTTER WHERE MINUTES_ID=? AND BODY LIKE ?", id, "%" + SEED_NAME + "%"));
        assertEquals(1, count("SELECT COUNT(*) FROM BOARD_MINUTES_UTTER WHERE MINUTES_ID=? AND EDITED_YN=1", id));
    }

    @Test
    public void 실명_라벨은_422_LABEL_INVALID이고_값을_돌려주지_않는다() throws Exception {
        String[] fx = fixture();
        MvcResult a = previewE(fx[1], MEMBER, "e4", opts(null, null), "{\"speaker_labels\":{\"1\":\"" + SEED_NAME + "\"}}");
        assertEquals(text(a), 422, status(a));
        assertEquals("LABEL_INVALID", json(a).path("detail").path("code").asText());
        assertTrue(json(a).path("detail").path("kinds").has("form"));
        assertFalse(text(a).contains(SEED_NAME));
        MvcResult b = previewE(fx[1], MEMBER, "e4", opts(null, null), "{\"speaker_labels\":{\"1\":\"측\"}}");
        assertEquals(422, status(b));
        assertTrue(json(b).path("detail").path("kinds").has("form"));
    }

    @Test
    public void 추가_가림_단어와_겹치는_라벨은_422() throws Exception {
        String[] fx = fixture();
        MvcResult r = previewE(fx[1], MEMBER, "e5", optsE(null, null, null, "[\"은행\"]"), "{\"speaker_labels\":{\"1\":\"은행 측\"}}");
        assertEquals(text(r), 422, status(r));
        assertTrue(json(r).path("detail").path("kinds").has("term"));
    }

    @Test
    public void 없는_참석자_라벨과_없는_발언_수정은_422이고_번호를_싣는다() throws Exception {
        String[] fx = fixture();
        MvcResult a = previewE(fx[1], MEMBER, "e6", opts(null, null), "{\"speaker_labels\":{\"7\":\"기관 측\"}}");
        assertEquals(422, status(a));
        assertEquals("LABEL_SPEAKER_UNKNOWN", json(a).path("detail").path("code").asText());
        assertEquals(7, json(a).path("detail").path("target_no").asInt());
        MvcResult b = previewE(fx[1], MEMBER, "e6", opts(null, null), "{\"utter_edits\":[{\"seq_no\":99,\"text\":\"가상\"}]}");
        assertEquals(422, status(b));
        assertEquals("EDIT_SEQ_UNKNOWN", json(b).path("detail").path("code").asText());
        assertEquals(99, json(b).path("detail").path("target_no").asInt());
    }

    @Test
    public void 고친_내용_파트가_깨졌거나_너무_많으면_400_EDITS_INVALID_권한이_없으면_403이_먼저다() throws Exception {
        String[] fx = fixture();
        MvcResult broken = previewE(fx[1], MEMBER, "e7", opts(null, null), "ZQRAW{{not json");
        assertEquals(400, status(broken));
        assertEquals("EDITS_INVALID", json(broken).path("detail").path("code").asText());
        assertFalse(text(broken).contains("ZQRAW"));
        StringBuilder many = new StringBuilder("{\"utter_edits\":[");
        for (int i = 0; i < 2001; i++) {
            many.append(i == 0 ? "" : ",").append("{\"seq_no\":").append(i % 4 + 1).append(",\"text\":\"가\"}");
        }
        many.append("]}");
        assertEquals(400, status(previewE(fx[1], MEMBER, "e7", opts(null, null), many.toString())));
        MvcResult dup = previewE(fx[1], MEMBER, "e7", opts(null, null),
                "{\"utter_edits\":[{\"seq_no\":2,\"text\":\"가\"},{\"seq_no\":2,\"text\":\"나\"}]}");
        assertEquals(400, status(dup));
        assertEquals(403, status(previewE(fx[1], LEAD2, "e7", opts(null, null), "ZQRAW{{not json")));   // 파싱은 자격 확인 뒤
    }

    @Test
    public void 저장_전_가린_자리를_지우면_422_EDIT_MASK_REMOVED다() throws Exception {
        String[] fx = fixture();
        MvcResult r = previewE(fx[1], MEMBER, "e8", opts(null, null), "{\"utter_edits\":[{\"seq_no\":1,\"text\":\"안녕하세요 박외부 위원장님\"}]}");
        assertEquals(text(r), 422, status(r));
        assertEquals("EDIT_MASK_REMOVED", json(r).path("detail").path("code").asText());
        assertEquals("edit", json(r).path("detail").path("slot").asText());
        assertEquals(1, json(r).path("detail").path("target_no").asInt());
        assertEquals(1, json(r).path("detail").path("kinds").path("name").asInt());
        assertFalse(text(r).contains("박외부"));
    }

    @Test
    public void 저장_후_가린_자리를_지우면_422_EDIT_MASK_REMOVED이고_남기면_통과한다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "e9");
        MvcResult r = editUtter(id, HEAD, 1, "가상 수정 본문", 0);   // 발언 1에는 [이름] 한 자리가 있다
        assertEquals(text(r), 422, status(r));
        assertEquals("EDIT_MASK_REMOVED", json(r).path("detail").path("code").asText());
        assertEquals(1, json(r).path("detail").path("target_no").asInt());
        assertEquals(1, json(r).path("detail").path("kinds").path("name").asInt());
        assertEquals(0, jdbc.queryForObject("SELECT REV_NO FROM BOARD_MINUTES WHERE MINUTES_ID=?", Integer.class, id).intValue());
        assertEquals(200, status(editUtter(id, HEAD, 1, "안녕하세요 [이름]님 수정한 본문", 0)));
    }

    @Test
    public void 저장_후_항목에서_가린_이름을_지우면_422_EDIT_MASK_REMOVED다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "e9b");
        // 요약 첫 줄("김영업님 안건 논의")이 [이름]으로 가려진 항목을 찾는다
        Integer no = jdbc.queryForObject("SELECT MIN(ITEM_NO) FROM BOARD_MINUTES_ITEM WHERE MINUTES_ID=? AND BODY LIKE ?",
                Integer.class, id, "%[이름]%");
        assertNotNull(no);
        MvcResult r = sendPut("/board-minutes/" + id + "/items/" + no, HEAD, js("text", "가상 수정 본문", "rev_no", 0));
        assertEquals(text(r), 422, status(r));
        assertEquals("EDIT_MASK_REMOVED", json(r).path("detail").path("code").asText());
        assertEquals(no.intValue(), json(r).path("detail").path("target_no").asInt());
        assertEquals(1, json(r).path("detail").path("kinds").path("name").asInt());
        assertEquals(0, jdbc.queryForObject("SELECT REV_NO FROM BOARD_MINUTES WHERE MINUTES_ID=?", Integer.class, id).intValue());
    }

    @Test
    public void 저장_경로에서_고친_발언의_가린_자리를_지우면_확인값이_틀려도_422가_409보다_먼저다() throws Exception {
        String[] fx = fixture();
        // 확인값(preview_digest·edits_digest)이 둘 다 틀렸지만, 고친 내용을 읽는 단계(parse)가 확인값 비교보다 앞서 422 로 끝난다
        MvcResult r = uploadE(fx[1], MEMBER, "e9c", optsE("가상 회의록 e9c", ZERO64, ZERO64, null),
                "{\"utter_edits\":[{\"seq_no\":1,\"text\":\"안녕하세요 박외부 위원장님\"}]}");
        assertEquals(text(r), 422, status(r));
        assertEquals("EDIT_MASK_REMOVED", json(r).path("detail").path("code").asText());
        assertEquals("edit", json(r).path("detail").path("slot").asText());
        assertEquals(1, json(r).path("detail").path("target_no").asInt());
        assertFalse(text(r).contains("박외부"));
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MINUTES WHERE MATERIAL_ID=?", Long.parseLong(fx[1])));
    }

    @Test
    public void 저장_후_제목에서_가린_이름을_지우면_422_EDIT_MASK_REMOVED이고_slot은_title이다() throws Exception {
        String[] fx = fixture();
        MvcResult pv = preview(fx[1], MEMBER, tx("e9d"), opts(null, null));
        assertEquals(text(pv), 200, status(pv));
        MvcResult up = upload(fx[1], MEMBER, tx("e9d"), opts("가상 " + SEED_NAME + " 점검 회의", json(pv).path("preview_digest").asText()));
        assertEquals(text(up), 201, status(up));
        long id = json(up).path("minutes_id").asLong();
        assertTrue(json(view(id, HEAD)).path("title").asText().contains("[이름]"));
        MvcResult r = sendPut("/board-minutes/" + id + "/meta", HEAD, js("field", "title", "value", "가상 점검 회의", "rev_no", 0));
        assertEquals(text(r), 422, status(r));
        assertEquals("EDIT_MASK_REMOVED", json(r).path("detail").path("code").asText());
        assertEquals("title", json(r).path("detail").path("slot").asText());
        assertEquals(1, json(r).path("detail").path("kinds").path("name").asInt());
        assertFalse(text(r).contains(SEED_NAME));
        assertEquals(0, jdbc.queryForObject("SELECT REV_NO FROM BOARD_MINUTES WHERE MINUTES_ID=?", Integer.class, id).intValue());
        // 가린 자리를 남기면 통과
        assertEquals(200, status(sendPut("/board-minutes/" + id + "/meta", HEAD, js("field", "title", "value", "가상 [이름] 점검 회의 수정", "rev_no", 0))));
    }

    @Test
    public void 저장_후_라벨_변경은_can_edit만_되고_이력에_이전_이후가_남는다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "e10");
        MvcResult ok = putLabel(id, HEAD, 1, "구청장", 0);
        assertEquals(text(ok), 200, status(ok));
        assertTrue(json(ok).path("changed").asBoolean());
        assertEquals(1, json(ok).path("rev_no").asInt());
        JsonNode rev = json(read("/board-minutes/" + id + "/history", HEAD, "minutes_history")).path("revs").get(0);
        assertEquals("SPEAKER", rev.path("target_kind").asText());
        assertEquals("LABEL", rev.path("field").asText());
        assertEquals("구청장", rev.path("new_text").asText());
        JsonNode d = json(view(id, HEAD));
        assertEquals("구청장", d.path("speakers").get(0).path("label").asText());
        assertTrue(d.has("speaker_label_rules"));
        assertFalse(json(putLabel(id, HEAD, 1, "구청장", 1)).path("changed").asBoolean());
        assertEquals(200, status(scopeAdd(id, HEAD, DESIGNER, kst(1))));
        assertEquals(403, status(putLabel(id, DESIGNER, 1, "기관 측", 2)));
        assertTrue(count("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE='DENIED' AND REQ_PATH=?", "/board-minutes/" + id + "/speakers/1") >= 1);
        assertEquals(404, status(putLabel(id, IT_LEAD, 1, "기관 측", 2)));
        assertTrue(count("SELECT COUNT(*) FROM BOARD_MINUTES_ACT WHERE MINUTES_ID=? AND ACTION_CD='EDIT_LABEL' AND SCREEN_ID=? AND BUTTON_ID='minutes_label' AND OUTCOME='OK'", id, MINUTES_SCREEN) >= 1);
        assertEquals(409, status(putLabel(id, HEAD, 1, "기관 측", 0)));
        assertEquals(404, status(putLabel(id, HEAD, 99, "기관 측", 1)));
        MvcResult real = putLabel(id, HEAD, 1, SEED_NAME, 1);
        assertEquals(422, status(real));
        assertFalse(text(real).contains(SEED_NAME));
        MvcResult noUi = mockMvc.perform(as(put("/board-minutes/" + id + "/speakers/1").contentType(MediaType.APPLICATION_JSON)
                .content(js("label", "기관 측", "rev_no", 1)), HEAD)).andReturn();
        assertEquals(400, status(noUi));
        MvcResult clear = putLabel(id, HEAD, 1, "", 1);
        assertEquals(text(clear), 200, status(clear));
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MINUTES_SPEAKER WHERE MINUTES_ID=?", id));
        assertEquals(2, json(clear).path("rev_no").asInt());
    }

    @Test
    public void 삭제하면_라벨도_지워진다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "e11");
        assertEquals(200, status(putLabel(id, HEAD, 1, "기관 측", 0)));
        assertEquals(1, count("SELECT COUNT(*) FROM BOARD_MINUTES_SPEAKER WHERE MINUTES_ID=?", id));
        assertEquals(200, status(sendPost("/board-minutes/" + id + "/delete", HEAD, "{\"rev_no\":1}")));
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MINUTES_SPEAKER WHERE MINUTES_ID=?", id));
    }

    @Test
    public void 접근_이력에_라벨과_고친_글이_없고_건수만_있다() throws Exception {
        String[] fx = fixture();
        JsonNode pv = json(previewE(fx[1], MEMBER, "e12", opts(null, null), EDITS));
        MvcResult r = uploadE(fx[1], MEMBER, "e12", optsE("가상 회의록 e12", pv.path("preview_digest").asText(),
                pv.path("edits_digest").asText(), null), EDITS);
        assertEquals(text(r), 201, status(r));
        assertEquals(0, count("SELECT COUNT(*) FROM ACCESS_LOG WHERE DETAIL LIKE ?", "%은행 측%"));
        assertEquals(0, count("SELECT COUNT(*) FROM ACCESS_LOG WHERE DETAIL LIKE ?", "%확인%"));
        assertEquals(1, count("SELECT COUNT(*) FROM ACCESS_LOG WHERE DETAIL LIKE ?", "%edit=1 label=1%"));
    }

    @Test
    public void 라벨_변경_본문이_16KB를_넘으면_413() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "e13");
        StringBuilder big = new StringBuilder();
        for (int i = 0; i < 17000; i++) {
            big.append('a');
        }
        assertEquals(413, status(putLabel(id, HEAD, 1, big.toString(), 0)));
    }

    // ── NEXT 99 서버 이관 묶음 — 후보 API·수칙 확인·확인값·기한·재판정 ─────────────────

    private static JsonNode byEmp(JsonNode items, String emp) {
        for (JsonNode n : items) {
            if (emp.equals(n.path("emp_no").asText())) {
                return n;
            }
        }
        return null;
    }

    private void insertUser(String emp, String name, String role, String position, String grade) {
        jdbc.update("INSERT INTO USERS (EMP_NO, NAME, ROLE, POSITION_TITLE, APPROVAL_GRADE, STATUS, FAILED_LOGINS, CREATED_AT, UPDATED_AT) "
                + "VALUES (?,?,?,?,?,'ACTIVE',0,'2026-11-24T00:00:00.000000+00:00','2026-11-24T00:00:00.000000+00:00')",
                emp, name, role, position, grade);
    }

    @Test
    public void 공개범위_후보는_부장급만_받고_영업부서와_임원급만_나오며_공개된_사람은_표시된다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "n1");
        assertEquals(200, status(scopeAdd(id, HEAD, DESIGNER, kst(1))));
        String path = "/board-minutes/" + id + "/scope/candidates";
        MvcResult r = read(path, HEAD, "minutes_scope_open");
        assertEquals(text(r), 200, status(r));
        JsonNode items = json(r).path("items");
        JsonNode des = byEmp(items, DESIGNER);
        assertNotNull(des);                                      // 디자이너(영업팀 소속)는 후보
        assertTrue(des.path("granted").asBoolean());
        assertEquals(kst(1), des.path("grant_until").asText());
        JsonNode mem = byEmp(items, MEMBER);
        assertNotNull(mem);                                      // 영업팀 사용자는 후보
        assertFalse(mem.path("granted").asBoolean());
        assertNull(byEmp(items, LEAD2));                         // 기본 열람자(영업팀장·영업부장)는 후보가 아니다
        assertNull(byEmp(items, HEAD));
        assertNull(byEmp(items, EXEC));
        assertNull(byEmp(items, IT_LEAD));                       // 전산(관리자 겸임)은 영업·임원이 아니다
        assertNull(byEmp(items, ADMIN));
        assertEquals(30, json(r).path("scope_max").asInt());
        // 관리자는 임원 등급이어도 후보가 아니고 scopeAdd 도 거부한다(관리자는 감사 전용 — 본문을 보게 하지 않는다)
        jdbc.update("UPDATE USERS SET APPROVAL_GRADE='EXECUTIVE' WHERE EMP_NO=?", ADMIN);
        jdbc.update("UPDATE USERS SET STATUS='LOCKED' WHERE EMP_NO=?", MEMBER2);
        flushCache();
        JsonNode again = json(read(path, HEAD, "minutes_scope_open")).path("items");
        assertNull(byEmp(again, ADMIN));
        assertNull(byEmp(again, MEMBER2));                       // 비활성은 빠진다
        MvcResult addAdmin = scopeAdd(id, HEAD, ADMIN, kst(1));
        assertEquals(text(addAdmin), 400, status(addAdmin));
        assertEquals("SCOPE_TARGET_NOT_ELIGIBLE", json(addAdmin).path("detail").path("code").asText());
        MvcResult addIt = scopeAdd(id, HEAD, IT_LEAD, kst(1));
        assertEquals(400, status(addIt));
        assertEquals("SCOPE_TARGET_NOT_ELIGIBLE", json(addIt).path("detail").path("code").asText());
        assertTrue(text(addIt).contains("영업부서와 임원급에게만"));
        assertFalse(text(addIt).contains(IT_LEAD));   // 사번은 오류에 싣지 않는다
        // 권한·관문
        assertEquals(403, status(read(path, LEAD2, "minutes_scope_open")));
        assertEquals(403, status(read(path, DESIGNER, "minutes_scope_open")));   // 공개 대상
        assertEquals(404, status(read(path, IT_LEAD, "minutes_scope_open")));
        assertEquals(404, status(read(path, ADMIN, "minutes_scope_open")));
        MvcResult noUi = mockMvc.perform(as(get(path), HEAD)).andReturn();
        assertEquals(400, status(noUi));
        assertEquals("UI_ID_REQUIRED", json(noUi).path("detail").path("code").asText());
        assertTrue(count("SELECT COUNT(*) FROM BOARD_MINUTES_ACT WHERE MINUTES_ID=? AND ACTION_CD='SCOPE_CANDIDATES' "
                + "AND OUTCOME='OK' AND ACTOR_EMP_NO=?", id, HEAD) >= 2);   // 위에서 HEAD 가 두 번 불렀다
        assertEquals(0, count("SELECT COUNT(*) FROM ACCESS_LOG WHERE REQ_PATH LIKE ? AND DETAIL LIKE ?", "%/scope/candidates", "%" + SEED_NAME + "%"));
    }

    @Test
    public void 임원_등급과_본부장_직위는_후보이고_일반_타_부서는_후보가_아니다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "n2");
        insertUser("9100001", "가상임원", "예산팀", "과장", "EXECUTIVE");
        insertUser("9100002", "가상본부", "예산팀", "본부장", "NONE");
        insertUser("9100003", "가상예산", "예산팀", "과장", "NONE");
        flushCache();
        JsonNode items = json(read("/board-minutes/" + id + "/scope/candidates", HEAD, "minutes_scope_open")).path("items");
        assertNotNull(byEmp(items, "9100001"));
        assertNotNull(byEmp(items, "9100002"));
        assertNull(byEmp(items, "9100003"));
        assertEquals(200, status(scopeAdd(id, HEAD, "9100001", kst(1))));
        assertEquals(200, status(scopeAdd(id, HEAD, "9100002", kst(1))));
        assertEquals(400, status(scopeAdd(id, HEAD, "9100003", kst(1))));
    }

    @Test
    public void 저장은_수칙_확인이_없으면_422이고_확인하면_LOG에_RULES_ACK가_남는다() throws Exception {
        String[] fx = fixture();
        MvcResult pv = preview(fx[1], MEMBER, tx("n3"), opts(null, null));   // 미리보기는 rules_ack 없이 200
        assertEquals(text(pv), 200, status(pv));
        String digest = json(pv).path("preview_digest").asText();
        MvcResult no = upload(fx[1], MEMBER, tx("n3"), js("meeting_date", "2026-01-15", "title", "제목", "preview_digest", digest));
        assertEquals(text(no), 422, status(no));
        assertEquals("RULES_ACK_REQUIRED", json(no).path("detail").path("code").asText());
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MINUTES WHERE MATERIAL_ID=?", Long.parseLong(fx[1])));
        MvcResult falseAck = upload(fx[1], MEMBER, tx("n3"),
                js("meeting_date", "2026-01-15", "title", "제목", "preview_digest", digest, "rules_ack", Boolean.FALSE));
        assertEquals(422, status(falseAck));
        long id = uploadOk(fx[1], MEMBER, "n3");
        assertEquals(1, count("SELECT COUNT(*) FROM BOARD_MINUTES_LOG WHERE MINUTES_ID=? AND EVENT_CD='RULES_ACK' "
                + "AND TARGET_KIND='RULES' AND TARGET_NO=1 AND ACTOR_EMP_NO=?", id, MEMBER));
        assertTrue(count("SELECT COUNT(*) FROM ACCESS_LOG WHERE DETAIL LIKE ?", "%code=UPLOAD%ack=1%") >= 1);
    }

    @Test
    public void 미리보기_뒤_가림_단어가_바뀌면_409이고_같은_단어는_순서와_대소문자가_달라도_통과한다() throws Exception {
        String[] fx = fixture();
        String plain = json(previewE(fx[1], MEMBER, "n4", opts(null, null), null)).path("preview_digest").asText();
        MvcResult changed = uploadE(fx[1], MEMBER, "n4", optsE("제목", plain, null, "[\"안건\"]"), null);
        assertEquals(text(changed), 409, status(changed));
        assertEquals("PREVIEW_CHANGED", json(changed).path("detail").path("code").asText());
        String withTerm = json(previewE(fx[1], MEMBER, "n4", optsE(null, null, null, "[\"안건\"]"), null)).path("preview_digest").asText();
        assertFalse(plain.equals(withTerm));
        String ab = json(previewE(fx[1], MEMBER, "n4", optsE(null, null, null, "[\"안건\",\"회의\"]"), null)).path("preview_digest").asText();
        String ba = json(previewE(fx[1], MEMBER, "n4", optsE(null, null, null, "[\"회의\",\"안건\"]"), null)).path("preview_digest").asText();
        assertEquals(ab, ba);
        MvcResult ok = uploadE(fx[1], MEMBER, "n4", optsE("제목", withTerm, null, "[\"안건\"]"), null);
        assertEquals(text(ok), 201, status(ok));
    }

    @Test
    public void 가림_단어의_대소문자만_달라도_마스커와_같게_보아_저장이_통과한다() throws Exception {
        String[] fx = fixture();
        String d = json(previewE(fx[1], MEMBER, "n5", optsE(null, null, null, "[\"ABC\"]"), null)).path("preview_digest").asText();
        MvcResult ok = uploadE(fx[1], MEMBER, "n5", optsE("제목", d, null, "[\"abc\"]"), null);
        assertEquals(text(ok), 201, status(ok));
    }

    @Test
    public void 상세_viewer에_본인_열람_기한이_실린다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "n6");
        int days = settings.getUploaderDays();
        JsonNode mv = json(view(id, MEMBER)).path("viewer");
        assertEquals("UPLOADER", mv.path("via").asText());
        String until = mv.path("view_until").asText();
        assertTrue(until, until.compareTo(kst(days - 1)) >= 0 && until.compareTo(kst(days + 1)) <= 0);
        assertFalse(mv.path("view_until_at").isNull());
        assertEquals(200, status(scopeAdd(id, HEAD, DESIGNER, kst(5))));
        JsonNode dv = json(view(id, DESIGNER)).path("viewer");
        assertEquals("GRANTEE", dv.path("via").asText());
        assertEquals(kst(5), dv.path("view_until").asText());
        assertTrue(dv.path("view_until_at").isNull());
        JsonNode hv = json(view(id, HEAD)).path("viewer");
        assertTrue(hv.path("view_until").isNull());
        assertTrue(hv.path("view_until_at").isNull());
    }

    @Test
    public void 상세_speakers에_first_seq가_있다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "n7");
        JsonNode sp = json(view(id, HEAD)).path("speakers");
        assertEquals(1, sp.get(0).path("first_seq").asInt());
        assertEquals(2, sp.get(1).path("first_seq").asInt());
    }

    @Test
    public void board_review_화면으로_연_호출도_ui_valid로_남는다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "n8");
        MvcResult r = mockMvc.perform(as(get("/board-minutes/" + id).header("X-Screen-Id", "board_review")
                .header("X-Button-Id", "minutes_open"), LEAD2)).andReturn();
        assertEquals(text(r), 200, status(r));
        assertEquals(1, count("SELECT COUNT(*) FROM BOARD_MINUTES_ACT WHERE MINUTES_ID=? AND SCREEN_ID='board_review' AND UI_VALID=1", id));
    }

    @Test
    public void UI_ID_REQUIRED_문구에_헤더_이름이_없다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "n9");
        MvcResult noUi = mockMvc.perform(as(get("/board-minutes/" + id + "/transcript"), HEAD)).andReturn();
        assertEquals(400, status(noUi));
        assertFalse(text(noUi).contains("X-Screen-Id"));
        assertFalse(text(noUi).contains("X-Button-Id"));
    }

    @Test
    public void 기능이_꺼져_있으면_쓰기_요청은_필터에서_바로_404다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "n10");
        Object enabled = ReflectionTestUtils.getField(settings, "enabled");
        try {
            ReflectionTestUtils.setField(settings, "enabled", false);
            MvcResult r = sendPost("/board-minutes/" + id + "/delete", HEAD, "{\"rev_no\":0}");
            assertEquals(404, status(r));
            assertTrue(text(r), text(r).contains("찾을 수 없습니다"));
            assertEquals("no-store", r.getResponse().getHeader("Cache-Control"));
        } finally {
            ReflectionTestUtils.setField(settings, "enabled", enabled);
        }
        assertEquals(200, status(view(id, HEAD)));   // 되돌린 뒤 지워지지 않았다
    }

    @Autowired private BoardMinutesService minutesService;
    @Autowired private BoardMinutesAccess minutesAccess;
    @Autowired private BoardMinutesMapper minutesMapper;
    @Autowired private SysUserMapper sysUsers;

    @Test
    public void 쓰기_트랜잭션_안_재판정은_권한을_잃었으면_403_볼_수_없으면_404이고_새_판정의_경로를_싣는다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "n11");
        assertEquals(200, status(scopeAdd(id, HEAD, MEMBER, kst(3))));
        BoardMinutes head = minutesMapper.selectHead(id);
        // (403) 요청 시작 때는 등록자(고칠 수 있음)였는데, 그 사이 담당이 해제됐다 — 공개 대상으로만 남아 볼 수는 있으나 고칠 수 없다
        SysUser member = sysUsers.selectByEmpNo(MEMBER);
        BoardMinutesAccess.Decision stale = minutesAccess.decide(member, head);
        assertEquals(BoardMinutesAccess.Via.UPLOADER, stale.via);
        assertTrue(stale.edit);
        jdbc.update("UPDATE BID_ASSIGNMENT SET ACTIVE_YN=0 WHERE BID_CASE_ID=? AND EMP_NO=?", fx[0], MEMBER);
        flushCache();
        BoardMinutesIn.MetaIn meta = new BoardMinutesIn.MetaIn();
        meta.setField("title");
        meta.setValue("가상 새 제목");
        meta.setRevNo(Integer.valueOf(0));
        try {
            minutesService.editMeta(member, null, head, stale, meta);
            fail("재판정이 거부해야 한다");
        } catch (BoardMinutesService.RecheckException e) {
            assertEquals(403, e.getStatus());
            assertEquals(BoardMinutesAccess.Via.GRANTEE, e.getVia());
        }
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MINUTES_REV WHERE MINUTES_ID=?", id));
        // (404) 요청 시작 때는 기본 열람자였는데 그 사이 비활성이 됐다 — 볼 수 없다
        SysUser lead2 = sysUsers.selectByEmpNo(LEAD2);
        BoardMinutesAccess.Decision staleLead = minutesAccess.decide(lead2, head);
        assertEquals(BoardMinutesAccess.Via.DEFAULT, staleLead.via);
        jdbc.update("UPDATE USERS SET STATUS='LOCKED' WHERE EMP_NO=?", LEAD2);
        flushCache();
        Integer todo = jdbc.queryForObject("SELECT MIN(ITEM_NO) FROM BOARD_MINUTES_ITEM WHERE MINUTES_ID=? AND KIND_CD='TODO'", Integer.class, id);
        assertNotNull(todo);
        BoardMinutesIn.TodoIn in = new BoardMinutesIn.TodoIn();
        in.setDone(Boolean.TRUE);
        try {
            minutesService.todo(lead2, null, head, staleLead, String.valueOf(todo), in);
            fail("재판정이 거부해야 한다");
        } catch (BoardMinutesService.RecheckException e) {
            assertEquals(404, e.getStatus());
            assertEquals(BoardMinutesAccess.Via.NONE, e.getVia());
        }
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MINUTES_ITEM WHERE MINUTES_ID=? AND DONE_YN=1", id));
    }

    @Test
    public void 공개_대상이_활성인데_후보가_아니면_NOT_ELIGIBLE_없거나_비활성이면_INVALID이다() throws Exception {
        String[] fx = fixture();
        long id = uploadOk(fx[1], MEMBER, "u");
        MvcResult it = scopeAdd(id, HEAD, IT_LEAD, kst(1));
        assertEquals(text(it), 400, status(it));
        assertEquals("SCOPE_TARGET_NOT_ELIGIBLE", json(it).path("detail").path("code").asText());
        MvcResult none = scopeAdd(id, HEAD, "0000000", kst(1));
        assertEquals(400, status(none));
        assertEquals("SCOPE_TARGET_INVALID", json(none).path("detail").path("code").asText());
        jdbc.update("UPDATE USERS SET STATUS='LOCKED' WHERE EMP_NO=?", MEMBER2);
        flushCache();
        MvcResult locked = scopeAdd(id, HEAD, MEMBER2, kst(1));
        assertEquals(400, status(locked));
        assertEquals("SCOPE_TARGET_INVALID", json(locked).path("detail").path("code").asText());
        MvcResult def = scopeAdd(id, HEAD, LEAD2, kst(1));
        assertEquals(text(def), 200, status(def));
        assertEquals("ALREADY_DEFAULT", json(def).path("reason").asText());
    }
}
