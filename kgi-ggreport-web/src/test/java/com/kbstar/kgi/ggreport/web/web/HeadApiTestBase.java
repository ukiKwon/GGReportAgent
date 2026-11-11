package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.config.InstHeadSettings;
import com.kbstar.kgi.ggreport.web.support.Times;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import org.springframework.mock.web.MockMultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 기관장 정보(NEXT 72·77, 026) API 테스트 공용 도우미. 하위 클래스가 {@code @RunWith(SpringRunner.class) @AppTest @Transactional} 을 붙인다
 * (컨텍스트는 {@code @AppTest} 하나를 공유한다). 시드 계정(009): 영업팀 T1 김영업·T2 윤서준, 영업팀장 L1 이영업·L2 안재원, 영업부장 D1 박영업, 디자이너.
 * 기관은 시드 기관(nowon·dobong·gwangjin·dongdaemun·dongjak)을 쓰고, 테스트 트랜잭션이 끝나면 쓴 행이 함께 사라진다.
 * 테스트 트랜잭션이 하나라 서비스가 던진 오류는 앞에서 쓴 행을 되돌리지 않는다 — 실패 케이스는 그 앞에서 쓴 것이 없는 순서로만 단언한다.
 */
public abstract class HeadApiTestBase {

    protected static final String T1 = "3918264";
    protected static final String T2 = "3361829";
    protected static final String L1 = "5047192";
    protected static final String L2 = "5640327";
    protected static final String D1 = "2674805";
    protected static final String DESIGNER = "7130526";

    protected static final String INST = "nowon";
    protected static final String INST2 = "dobong";

    @Autowired protected MockMvc mockMvc;
    @Autowired protected JdbcTemplate jdbc;
    @Autowired protected InstHeadSettings settings;
    protected final ObjectMapper om = new ObjectMapper();

    protected static MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder b, String emp) {
        return emp == null ? b : b.header("X-Emp-No", emp);
    }

    protected JsonNode json(MvcResult r) throws Exception {
        return om.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    protected static String text(MvcResult r) throws Exception {
        return r.getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    protected static String code(JsonNode body) {
        return body.path("detail").path("code").asText();
    }

    protected MvcResult postJson(String path, String emp, String body) throws Exception {
        return mockMvc.perform(as(post(path).contentType(MediaType.APPLICATION_JSON).content(body), emp)).andReturn();
    }

    protected MvcResult getAs(String path, String emp) throws Exception {
        return mockMvc.perform(as(get(path), emp)).andReturn();
    }

    protected int count(String sql, Object... args) {
        Integer n = jdbc.queryForObject(sql, Integer.class, args);
        return n == null ? 0 : n;
    }

    protected int act(String action, String outcome) {
        return count("SELECT COUNT(*) FROM INST_HEAD_ACT WHERE ACTION_CD=? AND OUTCOME=?", action, outcome);
    }

    // ── 요청 본문 ────────────────────────────────────────────────────────

    protected static String source() {
        return "{\"kind\":\"HOMEPAGE\",\"title\":\"시험 출처 문서\",\"checked_on\":\"" + Times.todayKst() + "\"}";
    }

    protected static String headJson(String name, String position) {
        return "{\"name\":\"" + name + "\",\"position\":\"" + position + "\",\"source\":" + source() + "}";
    }

    protected static String itemText(long headId, String field, String value) {
        return "{\"head_id\":" + headId + ",\"field_cd\":\"" + field + "\",\"value\":\"" + value + "\",\"source\":" + source() + "}";
    }

    protected static String itemDate(long headId, String field, String date) {
        return "{\"head_id\":" + headId + ",\"field_cd\":\"" + field + "\",\"date\":\"" + date + "\",\"source\":" + source() + "}";
    }

    protected static String reason(String r) {
        return "{\"reason\":\"" + r + "\"}";
    }

    protected static String headsPath(String inst) {
        return "/institutions/" + inst + "/heads";
    }

    protected static String headPath(String inst) {
        return "/institutions/" + inst + "/head";
    }

    // ── 상태 만들기 ──────────────────────────────────────────────────────

    /** 기관장 등록(A4)을 부르고 201·202 를 확인한 뒤 head_id 를 돌려준다. */
    protected long addHeadOk(String inst, String emp, String name, String position) throws Exception {
        MvcResult r = postJson(headsPath(inst), emp, headJson(name, position));
        int s = r.getResponse().getStatus();
        assertEquals(text(r), true, s == 201 || s == 202);
        return json(r).path("head_id").asLong();
    }

    protected long addItemOk(String inst, String emp, String body, int expectStatus) throws Exception {
        MvcResult r = postJson(headPath(inst) + "/items", emp, body);
        assertEquals(text(r), expectStatus, r.getResponse().getStatus());
        return json(r).path("item_id").asLong();
    }

    protected Long currentHeadId(String inst) {
        return jdbc.queryForObject("SELECT HEAD_ID FROM INST_HEAD WHERE INSTITUTION_ID=? AND STATUS_CD='CURRENT'", Long.class, inst);
    }

    protected String itemState(long itemId) {
        return jdbc.queryForObject("SELECT STATE_CD FROM INST_HEAD_ITEM WHERE ITEM_ID=?", String.class, itemId);
    }

    protected String headStatus(long headId) {
        return jdbc.queryForObject("SELECT STATUS_CD FROM INST_HEAD WHERE HEAD_ID=?", String.class, headId);
    }

    /** JdbcTemplate 으로 후보 칸을 직접 넣는다(반입 후보 흉내). CREATED_BY 와 ORIGIN 을 고를 수 있다. */
    protected long insertCandidateItem(long headId, String inst, String field, String valText, String by) {
        jdbc.update("INSERT INTO INST_HEAD_ITEM (HEAD_ID, INSTITUTION_ID, FIELD_CD, STATE_CD, ORIGIN_CD, VAL_TEXT, SRC_KIND_CD, SRC_TITLE,"
                        + " CHECKED_ON, CREATED_BY, CREATED_AT, CREATED_VERIFIED) VALUES (?, ?, ?, 'CANDIDATE', 'IMPORT', ?, 'OTHER', '반입 시험', ?, ?, ?, 0)",
                headId, inst, field, valText, Times.todayKst(), by, Times.nowIso());
        return jdbc.queryForObject("SELECT MAX(ITEM_ID) FROM INST_HEAD_ITEM WHERE HEAD_ID=?", Long.class, headId);
    }

    // ── 사진 ─────────────────────────────────────────────────────────────

    /** 시험용 JPEG — 테스트 코드가 그 자리에서 만든다(바이너리 파일 없음). */
    protected static byte[] jpeg(int w, int h) throws Exception {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                img.setRGB(x, y, ((x * 255 / w) << 16) | ((y * 255 / h) << 8) | 0x80);
            }
        }
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        ImageIO.write(img, "jpg", bos);
        return bos.toByteArray();
    }

    protected static byte[] png(int w, int h) throws Exception {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        ImageIO.write(img, "png", bos);
        return bos.toByteArray();
    }

    /** A11 사진 올리기 — head_id 가 null 이면 보내지 않는다. 이용 조건은 license 로 고른다. */
    protected MvcResult upload(String inst, String emp, Long headId, String filename, byte[] data, String license) throws Exception {
        MockHttpServletRequestBuilder b = multipart(headPath(inst) + "/photos")
                .file(new MockMultipartFile("file", filename, "application/octet-stream", data))
                .param("license_cd", license).param("src_kind", "HOMEPAGE").param("src_title", "시험 출처 문서")
                .param("checked_on", Times.todayKst());
        if (headId != null) {
            b = b.param("head_id", String.valueOf(headId));
        }
        return mockMvc.perform(as(b, emp)).andReturn();
    }

    /** 사진을 KOGL1 로 올리고 201 을 확인한 뒤 photo_id 를 돌려준다. */
    protected long photoOk(String inst, String emp, long headId) throws Exception {
        MvcResult r = upload(inst, emp, headId, "face.jpg", jpeg(300, 400), "KOGL1");
        assertEquals(text(r), 201, r.getResponse().getStatus());
        return json(r).path("photo_id").asLong();
    }

    protected String photoState(long photoId) {
        return jdbc.queryForObject("SELECT STATE_CD FROM INST_HEAD_PHOTO WHERE PHOTO_ID=?", String.class, photoId);
    }

    /** 매칭 대기 후보 머리(INSTITUTION_ID 없음)를 직접 넣는다 — NAME·POSITION 후보 칸 포함. 머리 번호를 돌려준다. */
    protected long insertUnmatchedHead(String name, String by) {
        jdbc.update("INSERT INTO INST_HEAD (INSTITUTION_ID, SRC_ORG_CD, SRC_ORG_NAME, STATUS_CD, ORIGIN_CD, BATCH_ID, CREATED_BY, CREATED_AT,"
                + " CREATED_VERIFIED) VALUES (NULL, 'ORG-1', '시험 기관', 'CANDIDATE', 'IMPORT', 'B1', ?, ?, 0)", by, Times.nowIso());
        long id = jdbc.queryForObject("SELECT MAX(HEAD_ID) FROM INST_HEAD", Long.class);
        insertCandidateItem(id, null, "NAME", name, by);
        insertCandidateItem(id, null, "POSITION", "구청장", by);
        return id;
    }
}
