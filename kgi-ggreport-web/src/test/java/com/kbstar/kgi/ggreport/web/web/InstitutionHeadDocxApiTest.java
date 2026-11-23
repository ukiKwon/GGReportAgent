package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.AppTest;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertFalse;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * NEXT 100 S1 — 기관장 정보 .docx 내려받기(GET /institutions/{id}/head/docx). 영업 역할 + 화면·버튼 식별자 → 200·attachment·no-store,
 * 응답 전 감사(HEAD_DOCX, 화면·버튼 포함). 확정 값만(후보·사번 없음, 사진은 이용 조건 허용 코드만 그림으로). 식별자 없음 400, 영업 밖 403, 사번 없음 401, 형식 밖 기관 404,
 * 기관장 없음 409 HEAD_EMPTY, 스위치 끔 404. 참고자료 번호(ref_no)는 없앴다 — 보내도 무시(11-23).
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionHeadDocxApiTest extends HeadApiTestBase {

    private static final String DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    private static String path(String inst) {
        return headPath(inst) + "/docx";
    }

    private MvcResult docx(String path, String emp, boolean ids) throws Exception {
        org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder b = as(get(path), emp);
        if (ids) {
            b = b.header("X-Screen-Id", "head_card").header("X-Button-Id", "head_docx");
        }
        return mockMvc.perform(b).andReturn();
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

    @Test
    public void 영업팀이_식별자와_함께_받으면_200_첨부_no_store이고_감사가_남고_확정_값만_담긴다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        addItemOk(INST, L1, itemDate(head, "FIRST_TAKE_OFFICE", "2018-07-01"), 201);
        insertCandidateItem(head, INST, "POSITION", "후보직위Z", T2);   // 후보 값
        long photo = photoOk(INST, L1, head);
        jdbc.update("UPDATE INST_HEAD_PHOTO SET LICENSE_CD='INST_PERMIT' WHERE PHOTO_ID=?", photo);   // KOGL1 도 11-23 부터 넣는다 — 여기서는 INST_PERMIT 로 확인
        int before = act("HEAD_DOCX", "OK");
        // ACCESS_LOG 는 REQUIRES_NEW 라 시험 롤백에 안 지워진다 — 같은 JVM의 다른 시험이 같은 기관 docx 를 먼저 받으면 쌓이므로 전후 차이로 본다
        String docxLog = "inst-head inst=" + INST + " code=HEAD_DOCX";
        int logBefore = count("SELECT COUNT(*) FROM ACCESS_LOG WHERE DETAIL=?", docxLog);

        MvcResult r = docx(path(INST), T1, true);
        assertEquals(text(r), 200, r.getResponse().getStatus());
        assertTrue(r.getResponse().getContentType(), r.getResponse().getContentType().startsWith(DOCX));
        String cd = r.getResponse().getHeader("Content-Disposition");
        assertTrue(cd, cd.startsWith("attachment;"));
        assertTrue(cd, cd.contains("filename*=UTF-8''"));
        assertEquals("no-store", r.getResponse().getHeader("Cache-Control"));
        assertEquals("nosniff", r.getResponse().getHeader("X-Content-Type-Options"));
        assertEquals("included", r.getResponse().getHeader("X-Head-Photo"));

        assertEquals("누가·어느 화면·어느 버튼", 1, count("SELECT COUNT(*) FROM INST_HEAD_ACT WHERE ACTION_CD='HEAD_DOCX' AND OUTCOME='OK'"
                + " AND INSTITUTION_ID=? AND ACTOR_EMP_NO=? AND SCREEN_ID='head_card' AND BUTTON_ID='head_docx'", INST, T1));
        assertEquals(before + 1, act("HEAD_DOCX", "OK"));
        assertEquals("감사 행에 문서에 담은 현 기관장 번호가 들어간다", 1, count("SELECT COUNT(*) FROM INST_HEAD_ACT WHERE ACTION_CD='HEAD_DOCX'"
                + " AND OUTCOME='OK' AND HEAD_ID=?", head));
        assertEquals("접근 이력은 기관·코드만", logBefore + 1, count("SELECT COUNT(*) FROM ACCESS_LOG WHERE DETAIL=?", docxLog));

        byte[] b = bytes(r);
        String xml = documentXml(b);
        String instName = jdbc.queryForObject("SELECT NAME_KO FROM INSTITUTIONS WHERE INSTITUTION_ID=?", String.class, INST);
        assertTrue(xml, xml.contains(instName + " 홍길동 구청장 Profile"));   // 참고 양식 제목(사용자 11-20)
        assertFalse("옛 제목 없음", xml.contains("참고자료"));
        assertTrue("확정 이름", xml.contains("홍길동"));
        assertTrue(xml.contains("첫 취임일 : 2018.07.01"));
        assertFalse("저장 형식은 표시에 안 나온다", xml.contains("2018-07-01"));
        assertFalse("출처·확인일·이용 조건 글자 없음(11-23)", xml.contains("출처") || xml.contains("확인일") || xml.contains("이용 조건") || xml.contains("「") || xml.contains("superscript"));
        assertFalse("후보 값 없음", xml.contains("후보직위Z"));
        assertFalse("사번 없음", xml.contains(L1) || xml.contains(T1) || xml.contains(T2));
        assertFalse("링크 없음", xml.contains("hyperlink"));
        try (XWPFDocument d = new XWPFDocument(new ByteArrayInputStream(b))) {
            assertEquals("INST_PERMIT 사진은 그림 1개", 1, d.getAllPictures().size());
        }
    }

    @Test
    public void 예전_화면이_ref_no를_보내도_무시하고_200이며_INVALID는_남지_않는다() throws Exception {
        addHeadOk(INST, L1, "홍길동", "구청장");
        for (String v : new String[]{"3", "abc", "0", "21", "-1", "100"}) {
            MvcResult r = docx(path(INST) + "?ref_no=" + v, T1, true);
            assertEquals(v, 200, r.getResponse().getStatus());
            assertFalse(documentXml(bytes(r)).contains("참고자료"));
        }
        assertEquals(0, act("HEAD_DOCX", "INVALID"));
        assertEquals(6, act("HEAD_DOCX", "OK"));
    }

    @Test
    public void 화면_버튼_식별자가_없으면_400_UI_ID_REQUIRED이고_INVALID가_남는다() throws Exception {
        addHeadOk(INST, L1, "홍길동", "구청장");
        MvcResult r = docx(path(INST), T1, false);
        assertEquals(text(r), 400, r.getResponse().getStatus());
        assertEquals("UI_ID_REQUIRED", code(json(r)));
        assertEquals(1, act("HEAD_DOCX", "INVALID"));
        assertEquals(0, act("HEAD_DOCX", "OK"));
    }

    @Test
    public void 영업_밖은_403이고_DENIED가_접근_이력과_감사_표에_남는다() throws Exception {
        int deniedBefore = count("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE='DENIED' AND REQ_PATH=?", path(INST));   // ACCESS_LOG 는 롤백되지 않는다 — 전후 차이로
        addHeadOk(INST, L1, "홍길동", "구청장");
        MvcResult r = docx(path(INST), DESIGNER, true);
        assertEquals(text(r), 403, r.getResponse().getStatus());
        assertEquals(1, act("HEAD_DOCX", "DENIED"));
        assertEquals(deniedBefore + 1, count("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE='DENIED' AND REQ_PATH=?", path(INST)));
    }

    @Test
    public void 사번이_없으면_401이고_감사_표는_그대로다() throws Exception {
        int actBefore = count("SELECT COUNT(*) FROM INST_HEAD_ACT");
        MvcResult r = docx(path(INST), null, true);
        assertEquals(text(r), 401, r.getResponse().getStatus());
        assertEquals(actBefore, count("SELECT COUNT(*) FROM INST_HEAD_ACT"));
    }

    @Test
    public void 기관_번호가_형식_밖이면_404_HIDDEN이다() throws Exception {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 65; i++) {
            sb.append('a');
        }
        MvcResult r = docx(path(sb.toString()), T1, true);
        assertEquals(text(r), 404, r.getResponse().getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_ACT WHERE ACTION_CD='HEAD_DOCX' AND OUTCOME='HIDDEN' AND INSTITUTION_ID='NONE'"));
    }

    @Test
    public void 현_기관장이_없으면_409_HEAD_EMPTY이고_BLOCKED가_남는다() throws Exception {
        MvcResult none = docx(path(INST2), T1, true);
        assertEquals(text(none), 409, none.getResponse().getStatus());
        assertEquals("HEAD_EMPTY", code(json(none)));
        assertEquals(1, act("HEAD_DOCX", "BLOCKED"));
    }

    @Test
    public void 빈_기관장도_409_HEAD_EMPTY다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        for (Long id : jdbc.queryForList("SELECT ITEM_ID FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND STATE_CD='CONFIRMED'", Long.class, head)) {
            MvcResult v = postJson(headPath(INST) + "/items/" + id + "/void", L1, reason("잘못 입력된 값"));
            assertEquals(text(v), 200, v.getResponse().getStatus());
        }
        MvcResult r = docx(path(INST), T1, true);
        assertEquals(text(r), 409, r.getResponse().getStatus());
        assertEquals("HEAD_EMPTY", code(json(r)));
    }

    @Test
    public void 사진만_있고_확정_칸이_없으면_409_HEAD_EMPTY이고_BLOCKED가_남는다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        photoOk(INST, L1, head);   // 사진이 있으면 서비스는 '빈 머리'로 보지 않지만 문서에 담을 칸은 없다
        for (Long id : jdbc.queryForList("SELECT ITEM_ID FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND STATE_CD='CONFIRMED'", Long.class, head)) {
            MvcResult v = postJson(headPath(INST) + "/items/" + id + "/void", L1, reason("잘못 입력된 값"));
            assertEquals(text(v), 200, v.getResponse().getStatus());
        }
        MvcResult r = docx(path(INST), T1, true);
        assertEquals(text(r), 409, r.getResponse().getStatus());
        assertEquals("HEAD_EMPTY", code(json(r)));
        assertEquals(1, act("HEAD_DOCX", "BLOCKED"));
        assertEquals(0, act("HEAD_DOCX", "OK"));
    }

    @Test
    public void 권한대행이_아니오면_인적_사항_어디에도_권한대행_줄이_없다() throws Exception {
        MvcResult a = postJson(headsPath(INST), L1, "{\"name\":\"홍길동\",\"position\":\"구청장\",\"acting\":false,\"source\":" + source() + "}");
        assertEquals(text(a), 201, a.getResponse().getStatus());
        MvcResult r = docx(path(INST), T1, true);
        assertEquals(text(r), 200, r.getResponse().getStatus());
        String xml = documentXml(bytes(r));
        assertTrue(xml.contains("홍길동"));
        assertFalse("권한대행 아니오는 문서에 안 나온다", xml.contains("권한대행"));
    }

    @Test
    public void 권한대행이_예면_직위_옆에만_나온다() throws Exception {
        MvcResult a = postJson(headsPath(INST), L1, "{\"name\":\"홍길동\",\"position\":\"구청장\",\"acting\":true,\"source\":" + source() + "}");
        assertEquals(text(a), 201, a.getResponse().getStatus());
        MvcResult r = docx(path(INST), T1, true);
        assertEquals(text(r), 200, r.getResponse().getStatus());
        String xml = documentXml(bytes(r));
        assertTrue(xml.contains("(권한대행)"));
        assertFalse("라벨 줄이 없다", xml.contains("권한대행: "));
        assertEquals("권한대행 글자는 직위 줄 한 곳뿐", 1, xml.split("권한대행", -1).length - 1);
    }

    @Test
    public void 후보_기관장이_있어도_그_이름은_문서에_없고_확정_기관장만_나온다() throws Exception {
        long cur = addHeadOk(INST, L1, "홍길동", "구청장");
        MvcResult c = postJson(headsPath(INST), L1, headJson("후보기관장Q", "후보직위Q"));
        assertEquals(text(c), 202, c.getResponse().getStatus());   // 현 기관장이 있으니 후보 머리
        assertEquals(cur, currentHeadId(INST).longValue());

        MvcResult r = docx(path(INST), T1, true);
        assertEquals(text(r), 200, r.getResponse().getStatus());
        String xml = documentXml(bytes(r));
        assertTrue("확정 이름", xml.contains("홍길동"));
        assertFalse("후보 기관장 이름 없음", xml.contains("후보기관장Q"));
        assertFalse("후보 기관장 직위 없음", xml.contains("후보직위Q"));
    }

    @Test
    public void 이름과_직위만_있고_학력_경력_날짜가_없어도_문서가_깨지지_않고_빈_학력_경력_절은_머리째_없다() throws Exception {
        addHeadOk(INST, L1, "홍길동", "구청장");   // 확정 칸은 NAME·POSITION 뿐

        MvcResult r = docx(path(INST), T1, true);
        assertEquals(text(r), 200, r.getResponse().getStatus());
        byte[] b = bytes(r);
        String xml = documentXml(b);
        assertTrue(xml.contains("성 명 : 홍길동"));
        assertTrue(xml.contains("■ 구청장"));
        assertFalse("값 없는 줄은 생략", xml.contains("첫 취임일"));
        assertFalse("임기 줄도 생략", xml.contains("(~") || xml.contains(" ~)"));
        assertFalse("null 글자 없음", xml.contains(">null<") || xml.contains("null ~") || xml.contains("~ null"));
        assertFalse("빈 값 안내 문구 삭제", xml.contains("확정된 값이 없습니다"));
        assertFalse("학력·경력 0건이면 절 머리째 생략", xml.contains("[ 학 력 ]") || xml.contains("[ 경 력 ]"));
        assertEquals("none", r.getResponse().getHeader("X-Head-Photo"));
        try (XWPFDocument d = new XWPFDocument(new ByteArrayInputStream(b))) {   // 열리는 문서
            assertFalse(d.getBodyElements().isEmpty());
        }
    }

    @Test
    public void 확정_학력_경력과_후보_학력_경력이_섞여_있으면_확정_것만_나온다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        addItemOk(INST, L1, itemText(head, "EDU", "확정학력행정학석사"), 201);
        addItemOk(INST, L1, itemText(head, "CAREER", "확정경력행정국장"), 201);
        insertCandidateItem(head, INST, "EDU", "후보학력Z", T2);
        insertCandidateItem(head, INST, "CAREER", "후보경력Z", T2);

        MvcResult r = docx(path(INST), T1, true);
        assertEquals(text(r), 200, r.getResponse().getStatus());
        String xml = documentXml(bytes(r));
        assertTrue(xml.contains("확정학력행정학석사"));
        assertTrue(xml.contains("확정경력행정국장"));
        assertFalse("후보 학력 없음", xml.contains("후보학력Z"));
        assertFalse("후보 경력 없음", xml.contains("후보경력Z"));
        assertFalse("사번 없음", xml.contains(T2));
    }

    @Test
    public void 스위치를_끄면_404_FEATURE_OFF이고_감사_표는_그대로다() throws Exception {
        int actBefore = count("SELECT COUNT(*) FROM INST_HEAD_ACT");
        settings.setEnabled(false);
        try {
            MvcResult r = docx(path(INST), T1, true);
            assertEquals(text(r), 404, r.getResponse().getStatus());
            assertEquals("FEATURE_OFF", code(json(r)));
            assertEquals(actBefore, count("SELECT COUNT(*) FROM INST_HEAD_ACT"));
        } finally {
            settings.setEnabled(true);
        }
    }
}
