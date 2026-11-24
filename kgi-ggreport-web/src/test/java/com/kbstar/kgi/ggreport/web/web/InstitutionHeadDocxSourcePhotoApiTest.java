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
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * 기관장 Word(사용자 11-20 요청·11-23 수정) — 문서에는 출처·번호·이용 조건 글자가 없다(웹 화면에서만 표기). 사진은 INST_PERMIT·KOGL1 만 넣고(KOGL1 은 출처 없이 — 사용자 11-23, 그 밖은 조용히 뺌, 실패해도 200, 상태는 응답 머리 X-Head-Photo),
 * 나이 '만 n세', 학력·경력 최근 것부터·기간 앞.
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

    private static final String[] FORBIDDEN = {"출처", "「", "확인일", "이용 조건", "공공누리", "w:val=\"superscript\"", "vertAlign"};

    /** 문서에는 출처·번호·이용 조건 글자가 없다(사용자 11-23: 웹 화면에서만 표기). */
    private static void assertNoSourceText(String xml) {
        for (String s : FORBIDDEN) {
            assertFalse(s, xml.contains(s));
        }
        assertFalse("시험 출처 문서", xml.contains("시험 출처 문서"));
    }

    private void useLicense(long photo, String lic) {
        jdbc.update("UPDATE INST_HEAD_PHOTO SET LICENSE_CD=? WHERE PHOTO_ID=?", lic, photo);
    }

    private static int[] extent(String xml) {
        Matcher m = Pattern.compile("extent cx=\"(\\d+)\" cy=\"(\\d+)\"").matcher(xml);
        assertTrue(xml, m.find());
        return new int[]{Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2))};
    }

    @Test
    public void 문서에는_출처_번호가_없다_같은_출처든_다른_출처든() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        addItemOk(INST, L1, itemDate(head, "TERM_END", "2030-06-30"), 201);
        addItemOk(INST, L1, itemDate(head, "FIRST_TAKE_OFFICE", "2018-07-01"), 201);
        addItemOk(INST, L1, itemText(head, "EDU", "행정학석사"), 201);
        addItemOk(INST, L1, itemText(head, "CAREER", "행정국장"), 201);
        addItemOk(INST, L1, "{\"head_id\":" + head + ",\"field_cd\":\"CAREER\",\"value\":\"부구청장\",\"from\":\"2019-01\",\"source\":" + sourceOf("다른 출처ZZ") + "}", 201);

        MvcResult r = docx();
        assertEquals(text(r), 200, r.getResponse().getStatus());
        String xml = documentXml(bytes(r));
        assertNoSourceText(xml);
        assertFalse("다른 출처 제목도 없다", xml.contains("다른 출처ZZ"));
        assertFalse("칸 라벨이 붙은 줄은 없다", xml.contains("학력: ") || xml.contains("경력: "));
        assertTrue(xml.contains("행정학석사") && xml.contains("부구청장"));
    }

    @Test
    public void INST_PERMIT_사진은_그림_1개가_상자_안에_있고_캡션과_출처가_없다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        useLicense(photoOk(INST, L1, head), "INST_PERMIT");
        MvcResult r = docx();
        assertEquals(text(r), 200, r.getResponse().getStatus());
        byte[] b = bytes(r);
        String xml = documentXml(b);
        assertEquals(1, pictures(b));
        assertNoSourceText(xml);
        assertFalse("사진 파일명은 본문에 없다", xml.contains("face.jpg"));
        int[] e = extent(xml);   // 학력·경력이 없어 S3(88×92.3mm) — 상자 안, 한 변은 상자에 맞는다
        int boxW = 88 * 36000;
        int boxH = (int) Math.round(92.3 * 36000);
        assertTrue(e[0] <= boxW && e[1] <= boxH + 36);
        assertTrue("한 변은 상자에 맞는다", Math.abs(e[0] - boxW) <= 36 || Math.abs(e[1] - boxH) <= 36);
        assertEquals("included", r.getResponse().getHeader("X-Head-Photo"));
        assertEquals("감사 기존 한 줄", 1, act("HEAD_DOCX", "OK"));
    }

    @Test
    public void KOGL1_사진도_넣고_출처_글자는_없다() throws Exception {   // 사용자 11-23 'ⓒ 출처 없이 넣기'
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        photoOk(INST, L1, head);   // KOGL1 그대로
        MvcResult r = docx();
        assertEquals(text(r), 200, r.getResponse().getStatus());
        byte[] b = bytes(r);
        assertEquals(1, pictures(b));
        String xml = documentXml(b);
        assertNoSourceText(xml);
        assertEquals("included", r.getResponse().getHeader("X-Head-Photo"));
        assertEquals(1, act("HEAD_DOCX", "OK"));
    }

    @Test
    public void 사진_파일이_없으면_200이고_그림은_0개이며_상태는_failed다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        long photo = photoOk(INST, L1, head);
        useLicense(photo, "INST_PERMIT");   // 허용 조건이어야 파일을 읽는다
        String key = jdbc.queryForObject("SELECT STORE_KEY FROM INST_HEAD_PHOTO WHERE PHOTO_ID=?", String.class, photo);
        Files.delete(Paths.get(settings.getPhotoDir()).toAbsolutePath().normalize().resolve(key));

        MvcResult r = docx();
        assertEquals(text(r), 200, r.getResponse().getStatus());
        byte[] b = bytes(r);
        assertEquals(0, pictures(b));
        assertFalse(documentXml(b).contains("불러오지") || documentXml(b).contains("넣지 않았"));
        assertEquals("failed", r.getResponse().getHeader("X-Head-Photo"));
        assertEquals(1, act("HEAD_DOCX", "OK"));
    }

    private void licenseAnyIncluded(String lic) throws Exception {   // 사용자 11-24 "무조건 넣어" — 이용 조건과 관계없이 사진을 넣는다
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        useLicense(photoOk(INST, L1, head), lic);
        MvcResult r = docx();
        assertEquals(lic + text(r), 200, r.getResponse().getStatus());
        byte[] b = bytes(r);
        assertEquals(lic, 1, pictures(b));
        String xml = documentXml(b);
        assertFalse(lic, xml.contains("넣지 않았") || xml.contains("이용 조건"));
        assertFalse("코드는 본문에 없다", xml.contains(lic));
        assertEquals(lic, "included", r.getResponse().getHeader("X-Head-Photo"));
        assertEquals(lic, 1, act("HEAD_DOCX", "OK"));
    }

    @Test
    public void 로컬_작업용_사진도_Word에_들어간다() throws Exception {
        licenseAnyIncluded("LOCAL_ONLY");
    }

    @Test
    public void 공공누리_2유형_사진도_Word에_들어간다() throws Exception {
        licenseAnyIncluded("KOGL2");
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
        assertNoSourceText(xml);
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
        assertTrue("진행 중은 ~ 현재", xml.contains("2019 ~ 현재"));   // 사용자 11-24: Word 기간은 연도만
        assertTrue("기간은 연도만", xml.contains("2010 ~ 2018"));
        assertTrue("학력도 A ~ B 기간 표", xml.contains("1990 ~ 1994"));
        assertTrue("기간이 값 앞(학력)", xml.indexOf("1990 ~ 1994") < xml.indexOf("학력먼저E"));
        assertFalse("월 표기 없음", xml.contains("1990.03") || xml.contains("2010.03") || xml.contains("2019.07"));
        assertTrue("기간이 값 앞(경력)", xml.indexOf("2010 ~ 2018") < xml.indexOf("경력최근C"));
        assertFalse("저장 형식 없음", xml.contains("2019-07") || xml.contains("2010-03"));
    }

    @Test
    public void 경력_연도만_시작과_연월_끝은_받고_Word에는_연도만_나온다() throws Exception {   // 사용자 11-24
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        addItemOk(INST, L1, periodItem(head, "CAREER", "경력연도만P", "2018", "2020-06"), 201);
        addItemOk(INST, L1, periodItem(head, "CAREER", "경력같은해Q", "2018-07", "2018"), 201);   // 시작 2018-07, 끝 2018 허용
        MvcResult bad = postJson(headPath(INST) + "/items", L1, periodItem(head, "CAREER", "경력역순R", "2019", "2018-12"));
        assertEquals(400, bad.getResponse().getStatus());
        assertEquals("INVALID_DATE", code(json(bad)));
        MvcResult r = docx();
        assertEquals(text(r), 200, r.getResponse().getStatus());
        String xml = documentXml(bytes(r));
        assertTrue(xml.contains("2018 ~ 2020"));
        assertFalse(xml.contains("2020-06") || xml.contains("2020.06"));
    }

    @Test
    public void 출처_제목과_번호가_문서에_없다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        addItemOk(INST, L1, "{\"head_id\":" + head + ",\"field_cd\":\"TERM_END\",\"date\":\"2030-06-30\",\"source\":" + sourceOf("만료출처1") + "}", 201);
        addItemOk(INST, L1, "{\"head_id\":" + head + ",\"field_cd\":\"BIRTH_DATE\",\"date\":\"" + BIRTH + "\",\"source\":" + sourceOf("나이출처2") + "}", 201);
        addItemOk(INST, L1, "{\"head_id\":" + head + ",\"field_cd\":\"FIRST_TAKE_OFFICE\",\"date\":\"2018-07-01\",\"source\":" + sourceOf("날짜출처3") + "}", 201);
        addItemOk(INST, L1, "{\"head_id\":" + head + ",\"field_cd\":\"EDU\",\"value\":\"학력X\",\"from\":\"1990-03\",\"source\":" + sourceOf("학력출처4") + "}", 201);
        addItemOk(INST, L1, "{\"head_id\":" + head + ",\"field_cd\":\"CAREER\",\"value\":\"경력Y\",\"from\":\"2000-01\",\"source\":" + sourceOf("경력출처5") + "}", 201);

        MvcResult r = docx();
        assertEquals(text(r), 200, r.getResponse().getStatus());
        String xml = documentXml(bytes(r));
        assertNoSourceText(xml);
        for (String t : new String[]{"만료출처1", "나이출처2", "날짜출처3", "학력출처4", "경력출처5"}) {
            assertFalse(t, xml.contains(t));
        }
        assertTrue("값은 그대로", xml.contains("학력X") && xml.contains("경력Y") && xml.contains("첫 취임일 : 2018.07.01"));
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
