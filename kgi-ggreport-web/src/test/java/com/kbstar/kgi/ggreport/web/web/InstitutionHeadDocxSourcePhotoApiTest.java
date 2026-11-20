package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.support.Times;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * 기관장 Word(사용자 11-20 요청) — 같은 출처 한 번만(번호 표식), 사진(이용 조건 허용 코드만·실패해도 200), 나이 '만 n세',
 * 학력·경력 최근 것부터·기간 앞, 각주 번호 띠 → 나이 → 날짜 → 학력 → 경력.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionHeadDocxSourcePhotoApiTest extends HeadApiTestBase {

    private static final String BIRTH = "1970-05-17";

    private MvcResult docx() throws Exception {
        return mockMvc.perform(as(get(headPath(INST) + "/docx"), T1)
                .header("X-Screen-Id", "head_card").header("X-Button-Id", "head_docx")).andReturn();
    }

    private static byte[] bytes(MvcResult r) {
        return r.getResponse().getContentAsByteArray();
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

    private static int occurrences(String hay, String needle) {
        int c = 0;
        for (int i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length())) {
            c++;
        }
        return c;
    }

    private static int pictures(byte[] b) throws Exception {
        try (XWPFDocument d = new XWPFDocument(new ByteArrayInputStream(b))) {
            return d.getAllPictures().size();
        }
    }

    private static String sourceOf(String title) {
        return "{\"kind\":\"HOMEPAGE\",\"title\":\"" + title + "\",\"checked_on\":\"" + Times.todayKst() + "\"}";
    }

    private static String periodItem(long head, String field, String value, String from, String to) {
        return "{\"head_id\":" + head + ",\"field_cd\":\"" + field + "\",\"value\":\"" + value + "\","
                + "\"from\":\"" + from + "\"" + (to == null ? "" : ",\"to\":\"" + to + "\"") + ",\"source\":" + source() + "}";
    }

    @Test
    public void 같은_출처는_출처_절에_한_번만_나오고_다른_출처는_따로_나온다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        addItemOk(INST, L1, itemDate(head, "TERM_END", "2030-06-30"), 201);
        addItemOk(INST, L1, itemDate(head, "FIRST_TAKE_OFFICE", "2018-07-01"), 201);
        addItemOk(INST, L1, itemText(head, "EDU", "행정학석사"), 201);
        addItemOk(INST, L1, itemText(head, "CAREER", "행정국장"), 201);
        addItemOk(INST, L1, "{\"head_id\":" + head + ",\"field_cd\":\"CAREER\",\"value\":\"부구청장\",\"from\":\"2019-01\",\"source\":" + sourceOf("다른 출처ZZ") + "}", 201);

        MvcResult r = docx();
        assertEquals(text(r), 200, r.getResponse().getStatus());
        String xml = documentXml(bytes(r));
        assertEquals("같은 출처(시험 출처 문서)는 한 번", 1, occurrences(xml, "「시험 출처 문서」"));
        assertEquals("다른 출처는 따로 한 번", 1, occurrences(xml, "「다른 출처ZZ」"));
        assertTrue("번호 목록", xml.contains("1. 기관 누리집 「") && xml.contains("2. 기관 누리집 「"));
        assertFalse("칸 라벨이 붙은 출처 줄은 없다", xml.contains("학력: ") || xml.contains("경력: "));
        assertTrue("본문 값 옆은 위첨자 표식", xml.contains("w:val=\"superscript\""));
    }

    @Test
    public void KOGL1_사진은_그림_1개와_이용_조건_캡션이_있고_출처는_한_번만() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        photoOk(INST, L1, head);   // KOGL1, src_title "시험 출처 문서" — 칸 출처와 같다
        MvcResult r = docx();
        assertEquals(text(r), 200, r.getResponse().getStatus());
        byte[] b = bytes(r);
        String xml = documentXml(b);
        assertEquals(1, pictures(b));
        assertTrue(xml.contains("사진 이용 조건: 공공누리 제1유형(출처표시)"));
        assertEquals("사진 출처도 같은 출처면 한 번", 1, occurrences(xml, "「시험 출처 문서」"));
        assertFalse("사진 파일명은 본문에 없다", xml.contains("face.jpg"));
        assertEquals("감사 기존 한 줄", 1, act("HEAD_DOCX", "OK"));
    }

    @Test
    public void 사진_파일이_없으면_200이고_그림은_0개다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        long photo = photoOk(INST, L1, head);
        String key = jdbc.queryForObject("SELECT STORE_KEY FROM INST_HEAD_PHOTO WHERE PHOTO_ID=?", String.class, photo);
        Files.delete(Paths.get(settings.getPhotoDir()).toAbsolutePath().normalize().resolve(key));

        MvcResult r = docx();
        assertEquals(text(r), 200, r.getResponse().getStatus());
        byte[] b = bytes(r);
        assertEquals(0, pictures(b));
        assertTrue(documentXml(b).contains("사진을 불러오지 못해 넣지 않았습니다."));
        assertEquals(1, act("HEAD_DOCX", "OK"));
    }

    private void licenseNotAllowed(String lic) throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        long photo = photoOk(INST, L1, head);
        jdbc.update("UPDATE INST_HEAD_PHOTO SET LICENSE_CD=? WHERE PHOTO_ID=?", lic, photo);
        MvcResult r = docx();
        assertEquals(lic + text(r), 200, r.getResponse().getStatus());
        byte[] b = bytes(r);
        assertEquals(lic, 0, pictures(b));
        String xml = documentXml(b);
        assertTrue(lic, xml.contains("사진은 이용 조건상 이 문서에 넣지 않았습니다."));
        assertFalse("코드는 본문에 없다", xml.contains(lic));
    }

    @Test
    public void 이용_조건을_모르면_그림이_없고_안내_한_줄이다() throws Exception {
        licenseNotAllowed("LOCAL_ONLY");
    }

    @Test
    public void 이용_조건이_허용_밖이면_그림이_없고_안내_한_줄이다() throws Exception {
        licenseNotAllowed("KOGL2");
    }

    @Test
    public void 나이는_만_n세만_있고_YYYY_MM_DD_생년월일은_없다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        addItemOk(INST, L1, itemDate(head, "BIRTH_DATE", BIRTH), 201);
        long age = ChronoUnit.YEARS.between(LocalDate.parse(BIRTH), LocalDate.parse(Times.todayKst()));
        MvcResult r = docx();
        assertEquals(text(r), 200, r.getResponse().getStatus());
        String xml = documentXml(bytes(r));
        assertTrue(xml.contains("만 " + age + "세"));
        assertFalse("옛 라벨 없음", xml.contains("나이:"));
        assertFalse("YYYY년생 표기 없음", xml.contains("년생"));
        assertFalse(xml.contains(BIRTH));
        assertFalse(xml.contains("생년월일"));
        assertEquals("나이 출처도 같은 출처라 목록에 한 번", 1, occurrences(xml, "「시험 출처 문서」"));
    }

    @Test
    public void 학력과_경력은_최근_것부터_나오고_기간이_앞에_붙는다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        addItemOk(INST, L1, periodItem(head, "CAREER", "경력옛날A", "2001-01", "2005-12"), 201);
        addItemOk(INST, L1, periodItem(head, "CAREER", "경력진행중B", "2019-07", null), 201);
        addItemOk(INST, L1, periodItem(head, "CAREER", "경력최근C", "2010-03", "2018-12"), 201);
        addItemOk(INST, L1, periodItem(head, "EDU", "학력먼저E", "1990-03", "1994-02"), 201);
        addItemOk(INST, L1, periodItem(head, "EDU", "학력나중F", "1996-03", "1998-02"), 201);

        MvcResult r = docx();
        assertEquals(text(r), 200, r.getResponse().getStatus());
        String xml = documentXml(bytes(r));
        assertTrue("현재 진행이 맨 위", xml.indexOf("경력진행중B") < xml.indexOf("경력최근C"));
        assertTrue(xml.indexOf("경력최근C") < xml.indexOf("경력옛날A"));
        assertTrue(xml.indexOf("학력나중F") < xml.indexOf("학력먼저E"));
        assertTrue("진행 중은 ~ 현재", xml.contains("2019.07 ~ 현재"));
        assertTrue("기간 YYYY.MM", xml.contains("2010.03 ~ 2018.12"));
        assertTrue("학력은 내용 뒤 괄호", xml.contains("학력먼저E (1990.03~1994.02)"));
        assertTrue("기간이 값 앞(경력)", xml.indexOf("2010.03 ~ 2018.12") < xml.indexOf("경력최근C"));
        assertFalse("저장 형식 없음", xml.contains("2019-07") || xml.contains("2010-03"));
    }

    @Test
    public void 각주_번호는_띠_나이_날짜_학력_경력_순이다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        addItemOk(INST, L1, "{\"head_id\":" + head + ",\"field_cd\":\"TERM_END\",\"date\":\"2030-06-30\",\"source\":" + sourceOf("만료출처1") + "}", 201);
        addItemOk(INST, L1, "{\"head_id\":" + head + ",\"field_cd\":\"BIRTH_DATE\",\"date\":\"" + BIRTH + "\",\"source\":" + sourceOf("나이출처2") + "}", 201);
        addItemOk(INST, L1, "{\"head_id\":" + head + ",\"field_cd\":\"FIRST_TAKE_OFFICE\",\"date\":\"2018-07-01\",\"source\":" + sourceOf("날짜출처3") + "}", 201);
        addItemOk(INST, L1, "{\"head_id\":" + head + ",\"field_cd\":\"EDU\",\"value\":\"학력X\",\"from\":\"1990-03\",\"source\":" + sourceOf("학력출처4") + "}", 201);
        addItemOk(INST, L1, "{\"head_id\":" + head + ",\"field_cd\":\"CAREER\",\"value\":\"경력Y\",\"from\":\"2000-01\",\"source\":" + sourceOf("경력출처5") + "}", 201);

        MvcResult r = docx();
        assertEquals(text(r), 200, r.getResponse().getStatus());
        String xml = documentXml(bytes(r));
        String[] titles = {"만료출처1", null, "날짜출처3", "학력출처4", "경력출처5"};
        for (int i = 0; i < titles.length; i++) {
            if (titles[i] != null) {
                assertTrue(titles[i] + " → 번호 " + (i + 1), xml.contains((i + 1) + ". 기관 누리집 「" + titles[i] + "」"));
            }
        }
        assertTrue("2번은 나이 출처 — 종류·확인일만", xml.contains("2. 기관 누리집, 확인일 "));
        assertFalse("나이 출처 제목은 문서에 없다(security 11-20 S1)", xml.contains("나이출처2"));
    }

    @Test
    public void 생년월일_출처_제목에_그_날짜를_적으면_400() throws Exception {   // 카드·Word 각주로 날짜가 새지 않게(11-20)
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        for (String title : new String[]{"프로필 1970-05-17", "프로필 1970.5.17", "1970년 5월 17일 출생 보도", "인사기록 19700517"}) {
            MvcResult r = postJson(headPath(INST) + "/items", L1, "{\"head_id\":" + head + ",\"field_cd\":\"BIRTH_DATE\",\"date\":\"" + BIRTH + "\",\"source\":" + sourceOf(title) + "}");
            assertEquals(title + " " + text(r), 400, r.getResponse().getStatus());
            assertEquals("INVALID_TEXT", code(json(r)));
        }
        addItemOk(INST, L1, "{\"head_id\":" + head + ",\"field_cd\":\"BIRTH_DATE\",\"date\":\"" + BIRTH + "\",\"source\":" + sourceOf("2026-07-01 취임식 보도자료") + "}", 201);   // 다른 날짜는 통과
    }
}
