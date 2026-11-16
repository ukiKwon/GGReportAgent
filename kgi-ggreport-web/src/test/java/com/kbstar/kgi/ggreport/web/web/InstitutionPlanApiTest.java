package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 기관 사업계획 1단계(034) — 반입(관리자만)·시드·조회(map 권한)·'자료 없음' 목록 CSV·감사 표.
 * ADMIN 8203417(전산팀), SALES 3918264(영업팀), 미등록 9000001(가상). 기관 jongno.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionPlanApiTest {

    private static final String ADMIN = "8203417";
    private static final String SALES = "3918264";
    private static final String STRANGER = "9000001";
    private static final String INST = "jongno";
    private static final String HDR = "기관ID,문서명,원천종류,대상기간시작,대상기간끝,출처URL,확인일,수집자,분야번호,분야명,사업번호,상위사업번호,"
            + "사업명,내용,예산상태,예산금액,예산단위,연차예산,원문쪽,확인상태,진행상태,이행률";
    private static final DateTimeFormatter YMD = DateTimeFormatter.ofPattern("yyyyMMdd");

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcTemplate jdbc;

    private final ObjectMapper json = new ObjectMapper();

    // ---------------------------------------------------------------- 도우미

    private static LocalDate today() {
        return LocalDate.now(ZoneId.of("Asia/Seoul"));
    }

    private static String iso(LocalDate d) {
        return d.toString();
    }

    private static String fileName(String inst, LocalDate d) {
        return inst + "_" + d.format(YMD) + "_plan.csv";
    }

    /** 한 행(22칸). 문서 칸은 인자로, 나머지는 고정. */
    private static String row(String inst, String url, String checked, String agent, String from, String to,
                              String no, String parent, String name, String bstate, String amount, String unit) {
        return String.join(",", inst, "종로 시험 계획(가상)", "4개년계획", from, to, url, checked, agent, "1", "시험 분야", no, parent, name,
                "", bstate, amount, unit, "", "", "", "", "");
    }

    private static String csv(String... rows) {
        StringBuilder sb = new StringBuilder(HDR);
        for (String r : rows) {
            sb.append('\n').append(r);
        }
        return sb.append('\n').toString();
    }

    /** 부모 1(원문에 없음) + 하위 1-1("1,200" 백만원) + 1-2(300, 두 번째 단위 지정). */
    private String sampleCsv(LocalDate checked, String secondUnit) {
        String d = iso(checked);
        String url = "https://example.kr/plan.pdf";
        String agent = "plan-collector/1.0";
        return csv(
                row(INST, url, d, agent, "2023", "2030", "1", "", "시험 사업 가", "원문에 없음", "", ""),
                row(INST, url, d, agent, "2023", "2030", "1-1", "1", "하위 하나", "금액", "\"1,200\"", "백만원"),
                row(INST, url, d, agent, "2023", "2030", "1-2", "1", "하위 둘", "금액", "300", secondUnit));
    }

    private MockHttpServletResponse upload(String inst, String name, String body, String emp) throws Exception {
        MockHttpServletResponse res = mockMvc.perform(multipart("/institutions/" + inst + "/plans/import")
                        .file(new MockMultipartFile("file", name, "text/csv", body.getBytes(StandardCharsets.UTF_8)))
                        .header("X-Emp-No", emp))
                .andReturn().getResponse();
        res.setCharacterEncoding("UTF-8");
        return res;
    }

    private MockHttpServletResponse getAs(String path, String emp) throws Exception {
        MockHttpServletResponse res = (emp == null ? mockMvc.perform(get(path)) : mockMvc.perform(get(path).header("X-Emp-No", emp)))
                .andReturn().getResponse();
        res.setCharacterEncoding("UTF-8");
        return res;
    }

    private MockHttpServletResponse seed(String inst, String emp) throws Exception {
        MockHttpServletResponse res = mockMvc.perform(post("/institutions/" + inst + "/plans/seed").header("X-Emp-No", emp))
                .andReturn().getResponse();
        res.setCharacterEncoding("UTF-8");
        return res;
    }

    private MockHttpServletResponse missing(String body, String emp) throws Exception {
        return mockMvc.perform(post("/institution-plans/missing.csv").header("X-Emp-No", emp)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andReturn().getResponse();
    }

    private JsonNode body(MockHttpServletResponse res) throws Exception {
        return json.readTree(res.getContentAsString());
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private JsonNode okUpload(String body, LocalDate checked) throws Exception {
        MockHttpServletResponse res = upload(INST, fileName(INST, checked), body, ADMIN);
        assertEquals(res.getContentAsString(), 201, res.getStatus());
        return body(res);
    }

    // ---------------------------------------------------------------- 반입·조회

    @Test
    public void 관리자_업로드는_201이고_조회는_계산값을_준다() throws Exception {
        LocalDate d = today().minusDays(1);
        JsonNode out = okUpload(sampleCsv(d, "백만원"), d);
        assertEquals(3, out.path("item_count").asInt());
        assertEquals(1, out.path("doc_count").asInt());
        assertEquals("IMPORT", out.path("origin_cd").asText());
        assertEquals(64, out.path("file_sha256").asText().length());

        MockHttpServletResponse res = getAs("/institutions/" + INST + "/plans", SALES);
        assertEquals(res.getContentAsString(), 200, res.getStatus());
        JsonNode doc = body(res).path("docs").get(0);
        JsonNode parent = doc.path("items").get(0);
        assertEquals("1", parent.path("item_no").asText());
        assertEquals("NOT_IN_SOURCE", parent.path("budget").path("state_cd").asText());
        JsonNode calc = parent.path("calculated");
        assertTrue(calc.path("is_calculated").asBoolean());
        assertEquals("AMOUNT", calc.path("state_cd").asText());
        assertEquals("1500", calc.path("amount").asText());
        assertEquals("MIL_KRW", calc.path("unit_cd").asText());
        assertEquals("4개년계획", doc.path("src_kind_name").asText());
        assertEquals(0, doc.path("check_counts").path("confirmed").asInt());
        assertEquals(3, doc.path("check_counts").path("not_checked").asInt());

        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_IMPORT WHERE INSTITUTION_ID=? AND IMPORTED_BY=? AND ORIGIN_CD='IMPORT'",
                INST, ADMIN));
        assertEquals("수집 프로그램 식별자가 문서에 남는다", 1,
                count("SELECT COUNT(*) FROM INST_PLAN_DOC WHERE INSTITUTION_ID=? AND COLLECTOR_AGENT='plan-collector/1.0'", INST));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='IMPORT' AND OUTCOME='OK' AND ACTOR_EMP_NO=?"
                + " AND SCREEN_ID='plan_import' AND BUTTON_ID='plan_upload' AND UI_VALID=1", ADMIN));
    }

    @Test
    public void 하위_단위가_섞이면_계산값은_UNVERIFIED다() throws Exception {
        LocalDate d = today().minusDays(1);
        okUpload(sampleCsv(d, "억원"), d);
        JsonNode calc = body(getAs("/institutions/" + INST + "/plans", SALES)).path("docs").get(0).path("items").get(0).path("calculated");
        assertEquals("UNVERIFIED", calc.path("state_cd").asText());
        assertTrue(calc.path("amount").isNull());
        assertTrue(calc.path("is_calculated").asBoolean());
    }

    @Test
    public void 영업팀_업로드는_403이고_DENIED만_남는다() throws Exception {
        LocalDate d = today().minusDays(1);
        MockHttpServletResponse res = upload(INST, fileName(INST, d), sampleCsv(d, "백만원"), SALES);
        assertEquals(403, res.getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='IMPORT' AND OUTCOME='DENIED' AND ACTOR_EMP_NO=?", SALES));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_PLAN_IMPORT"));
    }

    @Test
    public void 조회는_사번_없으면_401_미등록이면_403이다() throws Exception {
        assertEquals(401, getAs("/institution-plans/status", null).getStatus());
        assertEquals(403, getAs("/institution-plans/status", STRANGER).getStatus());
        assertEquals(401, getAs("/institutions/" + INST + "/plans", null).getStatus());
        assertEquals(403, getAs("/institutions/" + INST + "/plans", STRANGER).getStatus());
    }

    @Test
    public void 파일_이름이_틀리면_400이다() throws Exception {
        LocalDate d = today().minusDays(1);
        MockHttpServletResponse res = upload(INST, "plan.csv", sampleCsv(d, "백만원"), ADMIN);
        assertEquals(400, res.getStatus());
        assertTrue(res.getContentAsString(), body(res).path("detail").asText().contains("파일 이름은"));

        MockHttpServletResponse other = upload(INST, fileName("dobong", d), sampleCsv(d, "백만원"), ADMIN);
        assertEquals(400, other.getStatus());
        assertEquals(0, count("SELECT COUNT(*) FROM INST_PLAN_IMPORT"));
    }

    @Test
    public void 수집자에_사람_사번을_넣으면_400이다() throws Exception {
        LocalDate d = today().minusDays(1);
        String bad = csv(row(INST, "https://example.kr/plan.pdf", iso(d), "3918264", "2023", "2030", "1", "", "시험 사업", "원문에 없음", "", ""));
        MockHttpServletResponse res = upload(INST, fileName(INST, d), bad, ADMIN);
        assertEquals(400, res.getStatus());
        String detail = body(res).path("detail").asText();
        assertTrue(detail, detail.contains("row 1") && detail.contains("수집자"));
        assertFalse("사유에 칸 원문이 없다", detail.contains("3918264"));
    }

    @Test
    public void 한_행이_깨지면_사업은_하나도_들어가지_않고_INVALID가_남는다() throws Exception {
        LocalDate d = today().minusDays(1);
        String url = "https://example.kr/plan.pdf";
        String broken = csv(
                row(INST, url, iso(d), "plan-collector/1.0", "2023", "2030", "1", "", "시험 사업 가", "원문에 없음", "", ""),
                row(INST, url, iso(d), "plan-collector/1.0", "2023", "2030", "2", "", "시험 사업 나", "금액", "0", "백만원"));
        MockHttpServletResponse res = upload(INST, fileName(INST, d), broken, ADMIN);
        assertEquals(res.getContentAsString(), 400, res.getStatus());
        assertTrue(body(res).path("detail").asText().contains("row 2"));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_PLAN_ITEM"));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_PLAN_IMPORT"));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE OUTCOME='INVALID' AND ACTION_CD='IMPORT' AND FILE_SHA256 IS NOT NULL"));
    }

    @Test
    public void 같은_파일을_다시_올리면_409이고_판이_늘지_않는다() throws Exception {
        LocalDate d = today().minusDays(1);
        String csv = sampleCsv(d, "백만원");
        okUpload(csv, d);
        MockHttpServletResponse again = upload(INST, fileName(INST, d), csv, ADMIN);
        assertEquals(409, again.getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_IMPORT"));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE OUTCOME='BLOCKED' AND ACTION_CD='IMPORT'"));
    }

    @Test
    public void 내용을_바꿔_다시_올리면_새_판이_현재_자료다() throws Exception {
        LocalDate d = today().minusDays(1);
        long first = okUpload(sampleCsv(d, "백만원"), d).path("import_id").asLong();
        String one = csv(row(INST, "https://example.kr/plan.pdf", iso(d), "plan-collector/1.0", "2023", "2030", "1", "", "바뀐 사업", "원문에 없음", "", ""));
        JsonNode second = okUpload(one, d);
        assertTrue(second.path("import_id").asLong() > first);
        assertEquals(2, count("SELECT COUNT(*) FROM INST_PLAN_IMPORT WHERE INSTITUTION_ID=?", INST));

        JsonNode docs = body(getAs("/institutions/" + INST + "/plans", SALES)).path("docs");
        assertEquals(1, docs.size());
        assertEquals(1, docs.get(0).path("items").size());
        assertEquals("바뀐 사업", docs.get(0).path("items").get(0).path("name").asText());
    }

    @Test
    public void 오래된_확인일과_지난_기간은_status에_표시된다() throws Exception {
        LocalDate checked = today().minusMonths(13);
        int end = today().getYear() - 1;
        String csv = csv(row(INST, "https://example.kr/plan.pdf", iso(checked), "plan-collector/1.0", String.valueOf(end - 1), String.valueOf(end),
                "1", "", "옛 사업", "원문에 없음", "", ""));
        okUpload(csv, checked);

        JsonNode items = body(getAs("/institution-plans/status", SALES)).path("items");
        JsonNode mine = null;
        for (JsonNode n : items) {
            if (INST.equals(n.path("institution_id").asText())) {
                mine = n;
            }
        }
        assertTrue("status 에 jongno 가 있다", mine != null);
        assertTrue(mine.path("stale").asBoolean());
        assertTrue(mine.path("period_ended").asBoolean());
        assertEquals(1, mine.path("item_count").asInt());
    }

    @Test
    public void status는_기관_여럿_판_여럿에서_기관마다_최신_판_값을_준다() throws Exception {
        LocalDate d = today().minusDays(2);
        String url = "https://example.kr/plan.pdf";
        String agent = "plan-collector/1.0";
        okUpload(sampleCsv(d, "백만원"), d);   // jongno 1판: 문서 1개·사업 3개
        String second = csv(
                row(INST, url, iso(d), agent, "2023", "2030", "1", "", "둘째 판 사업", "원문에 없음", "", ""),
                row(INST, url, iso(d), agent, "2023", "2030", "2", "", "둘째 판 사업 둘", "원문에 없음", "", "")
                        .replace("종로 시험 계획(가상)", "종로 둘째 문서(가상)"));
        okUpload(second, d);   // jongno 2판(최신): 문서 2개·사업 2개 — 첫 행과 둘째 행의 문서명이 다르다
        String other = csv(row("dobong", url, iso(d), agent, "2023", "2030", "1", "", "도봉 사업", "원문에 없음", "", ""));
        MockHttpServletResponse res = upload("dobong", fileName("dobong", d), other, ADMIN);
        assertEquals(res.getContentAsString(), 201, res.getStatus());

        JsonNode jongno = null, dobong = null;
        int jn = 0, db = 0;
        for (JsonNode n : body(getAs("/institution-plans/status", SALES)).path("items")) {
            String id = n.path("institution_id").asText();
            if (INST.equals(id)) {
                jongno = n;
                jn++;
            } else if ("dobong".equals(id)) {
                dobong = n;
                db++;
            }
        }
        assertEquals("기관당 한 줄(최신 판만)", 1, jn);
        assertEquals(1, db);
        assertEquals(2, jongno.path("doc_count").asInt());
        assertEquals(2, jongno.path("item_count").asInt());
        assertEquals(1, dobong.path("doc_count").asInt());
        assertEquals(1, dobong.path("item_count").asInt());
        assertEquals(3, count("SELECT COUNT(*) FROM INST_PLAN_IMPORT"));
    }

    // ---------------------------------------------------------------- 예산금액 입력 검사

    @Test
    public void 금액_16자리와_쉼표_위치_오류는_400이고_판이_없다() throws Exception {
        LocalDate d = today().minusDays(1);
        String url = "https://example.kr/plan.pdf";
        String agent = "plan-collector/1.0";
        for (String amount : new String[]{"1234567890123456", "\"1,,2\""}) {
            String body = csv(row(INST, url, iso(d), agent, "2023", "2030", "1", "", "금액 시험", "금액", amount, "백만원"));
            MockHttpServletResponse res = upload(INST, fileName(INST, d), body, ADMIN);
            assertEquals(res.getContentAsString(), 400, res.getStatus());
            assertTrue(body(res).path("detail").asText().contains("row 1"));
        }
        assertEquals(0, count("SELECT COUNT(*) FROM INST_PLAN_IMPORT"));
        assertEquals(2, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE OUTCOME='INVALID' AND ACTION_CD='IMPORT'"));
    }

    // ---------------------------------------------------------------- 판 되돌림 가드(팀 결정 2026-11-16)

    @Test
    public void 수집_판이_있는_기관에_시드를_부르면_409다() throws Exception {
        LocalDate d = today().minusDays(1);
        okUpload(sampleCsv(d, "백만원"), d);
        MockHttpServletResponse res = seed(INST, ADMIN);
        assertEquals(res.getContentAsString(), 409, res.getStatus());
        assertTrue(body(res).path("detail").asText().contains("수집된 판"));
        assertEquals("시드 판이 생기지 않는다", 1, count("SELECT COUNT(*) FROM INST_PLAN_IMPORT WHERE INSTITUTION_ID=?", INST));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_PLAN_IMPORT WHERE ORIGIN_CD='SEED_TXT'"));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='SEED' AND OUTCOME='BLOCKED'"));
        JsonNode im = body(getAs("/institutions/" + INST + "/plans", SALES)).path("import");
        assertEquals("현재 자료는 수집 판 그대로", "IMPORT", im.path("origin_cd").asText());
    }

    @Test
    public void 현재_판보다_이른_날짜의_파일은_409다() throws Exception {
        LocalDate d = today().minusDays(1);
        okUpload(sampleCsv(d, "백만원"), d);
        LocalDate older = d.minusDays(5);
        MockHttpServletResponse res = upload(INST, fileName(INST, older), sampleCsv(older, "백만원"), ADMIN);
        assertEquals(res.getContentAsString(), 409, res.getStatus());
        assertTrue(body(res).path("detail").asText().contains("이전 날짜"));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_IMPORT WHERE INSTITUTION_ID=?", INST));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='IMPORT' AND OUTCOME='BLOCKED'"));

        assertEquals("같은 날짜의 바뀐 내용은 새 판으로 받는다", 201,
                upload(INST, fileName(INST, d), sampleCsv(d, "억원"), ADMIN).getStatus());
    }

    // ---------------------------------------------------------------- 시드

    @Test
    public void 관리자_시드는_URL_빈칸을_허용하고_수집_프로그램을_고정한다() throws Exception {
        MockHttpServletResponse res = seed(INST, ADMIN);
        assertEquals(res.getContentAsString(), 201, res.getStatus());
        assertEquals("SEED_TXT", body(res).path("origin_cd").asText());

        JsonNode doc = body(getAs("/institutions/" + INST + "/plans", SALES)).path("docs").get(0);
        assertTrue(doc.path("url_missing").asBoolean());
        assertTrue(doc.path("src_url").isNull());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_DOC WHERE INSTITUTION_ID=? AND COLLECTOR_AGENT='seed-txt-convert/1'", INST));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='SEED' AND OUTCOME='OK' AND SCREEN_ID='plan_seed'"));

        assertEquals("같은 시드를 다시 부르면 409", 409, seed(INST, ADMIN).getStatus());
    }

    @Test
    public void 같은_URL_빈칸_내용을_업로드하면_400이다() throws Exception {
        LocalDate d = today().minusDays(1);
        String body = csv(row(INST, "", iso(d), "plan-collector/1.0", "2023", "2030", "1", "", "시험 사업", "원문에 없음", "", ""));
        MockHttpServletResponse res = upload(INST, fileName(INST, d), body, ADMIN);
        assertEquals(400, res.getStatus());
        assertTrue(body(res).path("detail").asText().contains("출처URL"));
    }

    @Test
    public void 영업팀_시드는_403이다() throws Exception {
        assertEquals(403, seed(INST, SALES).getStatus());
        assertEquals(0, count("SELECT COUNT(*) FROM INST_PLAN_IMPORT"));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='SEED' AND OUTCOME='DENIED'"));
    }

    @Test
    public void 시드_파일이_없는_기관은_404다() throws Exception {
        assertEquals(404, seed("dobong", ADMIN).getStatus());
    }

    // ---------------------------------------------------------------- 자료 없음 목록

    @Test
    public void 자료_없음_목록은_BOM_첨부이고_자료가_있는_기관은_뺀다() throws Exception {
        LocalDate d = today().minusDays(1);
        okUpload(sampleCsv(d, "백만원"), d);

        MockHttpServletResponse res = missing("{\"institution_ids\":[\"dobong\",\"jongno\"]}", SALES);
        assertEquals(200, res.getStatus());
        assertTrue(res.getHeader("Content-Disposition").startsWith("attachment"));
        byte[] raw = res.getContentAsByteArray();
        assertEquals((byte) 0xEF, raw[0]);
        assertEquals((byte) 0xBB, raw[1]);
        assertEquals((byte) 0xBF, raw[2]);
        String text = new String(raw, StandardCharsets.UTF_8);
        assertTrue(text, text.contains("\"dobong\""));
        assertFalse(text, text.contains("\"jongno\""));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='MISSING_CSV' AND OUTCOME='OK' AND ACTOR_EMP_NO=?", SALES));
    }

    @Test
    public void 기관명이_수식으로_시작하면_작은따옴표를_붙인다() throws Exception {
        jdbc.update("INSERT INTO INSTITUTIONS (INSTITUTION_ID, NAME_KO) VALUES ('t-formula', '=HACK()')");
        MockHttpServletResponse res = missing("{\"institution_ids\":[\"t-formula\"]}", SALES);
        assertEquals(200, res.getStatus());
        String text = new String(res.getContentAsByteArray(), StandardCharsets.UTF_8);
        assertTrue(text, text.contains("\"'=HACK()\""));
    }

    @Test
    public void 자료_없음_목록_입력이_틀리면_400이다() throws Exception {
        assertEquals(400, missing("{\"institution_ids\":[\"a/b\"]}", SALES).getStatus());
        assertEquals(400, missing("{\"institution_ids\":[]}", SALES).getStatus());

        StringBuilder many = new StringBuilder("{\"institution_ids\":[");
        for (int i = 0; i <= 1000; i++) {
            if (i > 0) {
                many.append(',');
            }
            many.append("\"id").append(i).append('"');
        }
        many.append("]}");
        assertEquals(400, missing(many.toString(), SALES).getStatus());
    }
}
