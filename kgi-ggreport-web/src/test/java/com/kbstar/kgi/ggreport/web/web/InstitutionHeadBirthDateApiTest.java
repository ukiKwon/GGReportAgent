package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.support.Times;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * 기관장 생년월일(BIRTH_DATE, 055) — 칸 입력 API 로만 저장(상세에서만 노출), 범위 1920-01-01 ~ 서울 오늘-18년,
 * 후보 경로·대기열 충돌, 목록(A1)·Word 에 없음, 생년월일만 남은 머리는 빈 머리, 기록에 값 없음, 디자이너 403.
 * (사용자 결정 2026-11-19: 나이는 생년월일 전체 저장, 상세만·목록/엑셀 제외·열람 기록, Word 미포함)
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionHeadBirthDateApiTest extends HeadApiTestBase {

    private static final String BIRTH = "1970-05-17";
    private static final String BIRTH2 = "1971-06-18";

    private static String itemsPath() {
        return headPath(INST) + "/items";
    }

    private static String maxBirth() {
        return LocalDate.parse(Times.todayKst()).minusYears(18).toString();
    }

    private int birthRows() {
        return count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE INSTITUTION_ID=? AND FIELD_CD='BIRTH_DATE'", INST);
    }

    private MvcResult docx(String emp) throws Exception {
        MockHttpServletRequestBuilder b = as(get(headPath(INST) + "/docx"), emp)
                .header("X-Screen-Id", "head_card").header("X-Button-Id", "head_docx");
        return mockMvc.perform(b).andReturn();
    }

    private static String documentXml(byte[] docx) throws Exception {
        try (ZipInputStream z = new ZipInputStream(new ByteArrayInputStream(docx))) {
            ZipEntry e;
            while ((e = z.getNextEntry()) != null) {
                if ("word/document.xml".equals(e.getName())) {
                    ByteArrayOutputStream o = new ByteArrayOutputStream();
                    byte[] buf = new byte[4096];
                    int n;
                    while ((n = z.read(buf)) > 0) {
                        o.write(buf, 0, n);
                    }
                    return new String(o.toByteArray(), StandardCharsets.UTF_8);
                }
            }
        }
        return "";
    }

    @Test
    public void 저장하면_201이고_DB_값과_상세의_birth_date_출처가_맞다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        long item = addItemOk(INST, L1, itemDate(head, "BIRTH_DATE", BIRTH), 201);
        assertEquals("CONFIRMED", itemState(item));
        assertEquals(BIRTH, jdbc.queryForObject("SELECT VAL_DATE FROM INST_HEAD_ITEM WHERE ITEM_ID=?", String.class, item));

        MvcResult r = getAs(headPath(INST), T1);
        assertEquals(text(r), 200, r.getResponse().getStatus());
        JsonNode h = json(r).path("head");
        assertEquals(BIRTH, h.path("birth_date").asText());
        JsonNode f = h.path("fields").path("BIRTH_DATE");
        assertFalse(f.isMissingNode());
        assertEquals(BIRTH, f.path("value").asText());
        assertEquals("시험 출처 문서", f.path("source").path("title").asText());
        assertFalse("생년월일이 있어도 빈 머리 아님(이름·직위가 있다)", json(r).path("head_empty").asBoolean());
    }

    @Test
    public void 형식_오류는_400_INVALID_DATE이고_입력값이_본문에_없고_행이_안_생긴다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        String[] bad = {"1970-5-1", "19700501", "1970-02-30", ""};
        for (String d : bad) {
            MvcResult r = postJson(itemsPath(), L1, itemDate(head, "BIRTH_DATE", d));
            assertEquals("[" + d + "] " + text(r), 400, r.getResponse().getStatus());
            assertEquals(d, "INVALID_DATE", code(json(r)));
            if (!d.isEmpty()) {
                assertFalse("오류 본문에 입력값을 싣지 않는다", text(r).contains(d));
            }
        }
        MvcResult omitted = postJson(itemsPath(), L1, "{\"head_id\":" + head + ",\"field_cd\":\"BIRTH_DATE\",\"source\":" + source() + "}");
        assertEquals(text(omitted), 400, omitted.getResponse().getStatus());
        assertEquals("INVALID_DATE", code(json(omitted)));
        assertEquals("행이 안 생긴다", 0, birthRows());
    }

    @Test
    public void 범위_밖_경계는_400이고_행이_안_생긴다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        LocalDate max = LocalDate.parse(Times.todayKst()).minusYears(18);
        String[] out = {"1919-12-31", max.plusDays(1).toString(), Times.todayKst()};
        for (String d : out) {
            MvcResult r = postJson(itemsPath(), L1, itemDate(head, "BIRTH_DATE", d));
            assertEquals("[" + d + "] " + text(r), 400, r.getResponse().getStatus());
            assertEquals(d, "INVALID_DATE", code(json(r)));
            assertFalse(text(r).contains(d));
        }
        assertEquals(0, birthRows());
    }

    @Test
    public void 하한_1920_01_01은_201이다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        long item = addItemOk(INST, L1, itemDate(head, "BIRTH_DATE", "1920-01-01"), 201);
        assertEquals("1920-01-01", jdbc.queryForObject("SELECT VAL_DATE FROM INST_HEAD_ITEM WHERE ITEM_ID=?", String.class, item));
    }

    @Test
    public void 상한_오늘_빼기_18년은_201이다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        long item = addItemOk(INST, L1, itemDate(head, "BIRTH_DATE", maxBirth()), 201);
        assertEquals(maxBirth(), jdbc.queryForObject("SELECT VAL_DATE FROM INST_HEAD_ITEM WHERE ITEM_ID=?", String.class, item));
    }

    @Test
    public void 확정_뒤_다른_날짜는_충돌_후보_202이고_대기열에_BIRTH_DATE_충돌이_잡히며_범위_밖_후보는_400이다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        addItemOk(INST, L1, itemDate(head, "BIRTH_DATE", BIRTH), 201);
        MvcResult bad = postJson(itemsPath(), T1, itemDate(head, "BIRTH_DATE", "1919-12-31"));
        assertEquals(text(bad), 400, bad.getResponse().getStatus());
        assertEquals("범위 밖은 후보 행도 안 생긴다", 1, birthRows());

        long cand = addItemOk(INST, T1, itemDate(head, "BIRTH_DATE", BIRTH2), 202);
        assertEquals("CANDIDATE", itemState(cand));

        JsonNode detail = json(getAs(headPath(INST), T2));
        boolean found = false;
        for (JsonNode c : detail.path("candidates")) {
            if ("BIRTH_DATE".equals(c.path("field_cd").asText())) {
                found = true;
                assertTrue(c.toString(), c.path("conflict").asBoolean());
            }
        }
        assertTrue("상세 후보에 BIRTH_DATE 충돌이 있다", found);

        MvcResult q = getAs("/institution-heads/candidates", T1);
        assertEquals(text(q), 200, q.getResponse().getStatus());
        JsonNode row = null;
        for (JsonNode n : json(q).path("institutions")) {
            if (INST.equals(n.path("institution_id").asText())) {
                row = n;
            }
        }
        assertNotNull("대기열에 기관 행이 있다", row);
        assertEquals("대기열도 상세와 같은 충돌 기준", 1, row.path("conflict_count").asInt());
        boolean inFields = false;
        for (JsonNode fc : row.path("field_cds")) {
            if ("BIRTH_DATE".equals(fc.asText())) {
                inFields = true;
            }
        }
        assertTrue(row.toString(), inFields);
    }

    @Test
    public void 목록은_생년월일을_주지_않고_기존_키만_준다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        addItemOk(INST, L1, itemDate(head, "BIRTH_DATE", BIRTH), 201);
        MvcResult r = getAs("/institution-heads", T2);
        assertEquals(text(r), 200, r.getResponse().getStatus());
        String body = text(r);
        assertFalse(body, body.contains(BIRTH));
        assertFalse(body, body.contains("birth"));
        JsonNode row = null;
        for (JsonNode n : json(r)) {
            if (INST.equals(n.path("institution_id").asText())) {
                row = n;
            }
        }
        assertNotNull(row);
        Set<String> keys = new TreeSet<String>();
        Iterator<String> it = row.fieldNames();
        while (it.hasNext()) {
            keys.add(it.next());
        }
        assertEquals(new TreeSet<String>(Arrays.asList("institution_id", "head_id", "name_masked", "position",
                "acting", "term_end", "last_checked_on", "open_candidates", "has_photo")), keys);
    }

    @Test
    public void Word에는_만_나이만_있고_생년월일_날짜와_라벨은_없다() throws Exception {   // 사용자 11-20 '카드+Word 만 n세만'
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        String body = "{\"head_id\":" + head + ",\"field_cd\":\"BIRTH_DATE\",\"date\":\"" + BIRTH + "\",\"source\":"
                + "{\"kind\":\"HOMEPAGE\",\"title\":\"출생자료출처ZQ\",\"checked_on\":\"" + Times.todayKst() + "\"}}";
        addItemOk(INST, L1, body, 201);

        MvcResult r = docx(T1);
        assertEquals(text(r), 200, r.getResponse().getStatus());
        String xml = documentXml(r.getResponse().getContentAsByteArray());
        long age = java.time.temporal.ChronoUnit.YEARS.between(LocalDate.parse(BIRTH), LocalDate.parse(Times.todayKst()));
        assertTrue(xml.contains("홍길동"));
        assertTrue("나이 줄", xml.contains("만 " + age + "세"));
        assertFalse("날짜 없음", xml.contains(BIRTH));
        assertFalse("라벨 없음", xml.contains("생년월일"));
        assertFalse("나이 출처 제목은 문서에 없다", xml.contains("출생자료출처ZQ"));
        assertFalse("출처·확인일 글자 없음(11-23)", xml.contains("확인일") || xml.contains("출처") || xml.contains("「"));
    }

    @Test
    public void 생년월일만_남으면_빈_머리다_head_empty_목록_제외_docx_409() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        addItemOk(INST, L1, itemDate(head, "BIRTH_DATE", BIRTH), 201);
        List<Long> ids = jdbc.queryForList("SELECT ITEM_ID FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND STATE_CD='CONFIRMED'"
                + " AND FIELD_CD IN ('NAME','POSITION')", Long.class, head);
        assertEquals(2, ids.size());
        for (Long id : ids) {
            MvcResult v = postJson(headPath(INST) + "/items/" + id + "/void", L1, reason("잘못 입력된 값"));
            assertEquals(text(v), 200, v.getResponse().getStatus());
        }
        assertEquals("BIRTH_DATE 는 아직 확정", 1, count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND FIELD_CD='BIRTH_DATE'"
                + " AND STATE_CD='CONFIRMED'", head));

        MvcResult d = getAs(headPath(INST), T1);
        assertEquals(text(d), 200, d.getResponse().getStatus());
        assertTrue(text(d), json(d).path("head_empty").asBoolean());
        for (JsonNode n : json(getAs("/institution-heads", T1))) {
            assertFalse("빈 머리는 목록에 없다", INST.equals(n.path("institution_id").asText()));
        }
        MvcResult w = docx(T1);
        assertEquals(text(w), 409, w.getResponse().getStatus());
        assertEquals("HEAD_EMPTY", code(json(w)));
        assertEquals(1, act("HEAD_DOCX", "BLOCKED"));
    }

    @Test
    public void 접근_이력과_기관장_로그_감사_표에_생년월일_값이_없다() throws Exception {
        String like = "%" + BIRTH + "%";
        int logBefore = count("SELECT COUNT(*) FROM ACCESS_LOG WHERE DETAIL LIKE ? OR REQ_PATH LIKE ?", like, like);   // ACCESS_LOG 는 롤백되지 않는다 — 전후 차이로
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        addItemOk(INST, L1, itemDate(head, "BIRTH_DATE", BIRTH), 201);
        assertEquals(200, getAs(headPath(INST), T1).getResponse().getStatus());   // 상세 열람(VIEW)
        assertEquals(200, getAs("/institution-heads", T1).getResponse().getStatus());

        assertEquals(logBefore, count("SELECT COUNT(*) FROM ACCESS_LOG WHERE DETAIL LIKE ? OR REQ_PATH LIKE ?", like, like));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE REASON LIKE ? OR BATCH_ID LIKE ? OR EVENT_CD LIKE ?", like, like, like));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_HEAD_ACT WHERE ACTION_CD LIKE ? OR OUTCOME LIKE ?"
                + " OR SCREEN_ID LIKE ? OR BUTTON_ID LIKE ?", like, like, like, like));
        assertTrue("상세 열람 감사가 남는다", act("VIEW", "OK") >= 1);
    }

    @Test
    public void 디자이너가_생년월일을_넣으면_403이고_행이_안_생긴다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        MvcResult r = postJson(itemsPath(), DESIGNER, itemDate(head, "BIRTH_DATE", BIRTH));
        assertEquals(text(r), 403, r.getResponse().getStatus());
        assertEquals(0, birthRows());
        assertFalse(text(r).contains(BIRTH));
    }
}
