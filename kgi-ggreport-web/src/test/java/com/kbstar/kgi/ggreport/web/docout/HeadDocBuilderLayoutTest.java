package com.kbstar.kgi.ggreport.web.docout;

import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.junit.Test;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTblBorders;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STBorder;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 기관장 Word 프로필 양식(사용자 참고 양식 11-20): 쪽 테두리·밑줄 제목·테두리 없는 사진+정보 표·YYYY.MM 기간·출처 맨 아래. 가상 값만 쓴다.
 * 견본 파일을 target/head-profile-sample.docx 로 남긴다(사용자 확인용, 커밋 대상 아님).
 */
public class HeadDocBuilderLayoutTest {

    private static Map<String, Object> src(String title) {
        Map<String, Object> s = new HashMap<String, Object>();
        s.put("kind", "HOMEPAGE");
        s.put("title", title);
        s.put("checked_on", "2026-11-20");
        return s;
    }

    private static Map<String, Object> srcHolder(String title) {
        Map<String, Object> m = new HashMap<String, Object>();
        m.put("source", src(title));
        return m;
    }

    private static Map<String, Object> item(String value, String from, String to) {
        Map<String, Object> m = new HashMap<String, Object>();
        m.put("value", value);
        if (from != null) {
            m.put("from", from);
        }
        if (to != null) {
            m.put("to", to);
        }
        m.put("source", src("문서A"));
        return m;
    }

    private static Map<String, Object> detail(boolean withPhoto) {
        Map<String, Object> head = new HashMap<String, Object>();
        head.put("head_id", Long.valueOf(1));
        head.put("name", "홍길동");
        head.put("position", "구청장");
        head.put("acting", Boolean.FALSE);
        head.put("first_take_office", "2018-07-01");
        head.put("term_start", "2023-12-01");
        head.put("term_end", "2027-12-31");
        head.put("birth_date", "1970-05-17");
        Map<String, Object> fields = new HashMap<String, Object>();
        for (String f : new String[]{"NAME", "POSITION", "FIRST_TAKE_OFFICE", "TERM_START", "TERM_END", "BIRTH_DATE"}) {
            fields.put(f, srcHolder("문서A"));
        }
        head.put("fields", fields);
        head.put("education", Arrays.asList(item("행정학석사", "1990-03", "1994-02"), item("대학교졸업", "1986", "1990")));
        head.put("career", Arrays.asList(item("경력옛날", "2001-01", "2005-12"), item("경력진행", "2018-07", null), item("경력연도", "2018", null)));
        if (withPhoto) {
            Map<String, Object> photo = new HashMap<String, Object>();
            photo.put("license_cd", "KOGL1");
            photo.put("photo_id", Long.valueOf(9));
            photo.put("source", src("문서A"));
            head.put("photo", photo);
        }
        Map<String, Object> d = new HashMap<String, Object>();
        d.put("head", head);
        return d;
    }

    private static byte[] jpeg() throws Exception {
        BufferedImage img = new BufferedImage(300, 400, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(new Color(220, 226, 235));
        g.fillRect(0, 0, 300, 400);
        g.setColor(new Color(150, 160, 175));
        g.fillOval(95, 70, 110, 130);
        g.fillOval(45, 220, 210, 260);
        g.dispose();
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        ImageIO.write(img, "jpg", o);
        return o.toByteArray();
    }

    private static String xml(byte[] docx) throws Exception {
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

    private static byte[] render(boolean withPhoto) throws Exception {
        DocModel m = HeadDocBuilder.build(detail(withPhoto), "서울시 가구청", 1, "2026-11-20", withPhoto ? jpeg() : null);
        return DocxKit.render(m, DocxKit.Footer.pageNumberOnly());
    }

    @Test
    public void 견본_파일을_남긴다() throws Exception {
        Files.createDirectories(Paths.get("target"));
        Files.write(Paths.get("target", "head-profile-sample.docx"), render(true));
    }

    @Test
    public void 페이지_테두리가_있고_일반_문서에는_없다() throws Exception {
        String xml = xml(render(true));
        assertTrue(xml, xml.contains("<w:pgBorders"));
        assertTrue(xml.contains("w:offsetFrom=\"text\""));
        for (String side : new String[]{"<w:top ", "<w:left ", "<w:bottom ", "<w:right "}) {
            assertTrue(side, xml.contains(side));
        }
        byte[] plain = DocxKit.render(new DocModel(Collections.<DocModel.Block>singletonList(DocModel.Para.plain("본문"))), null);
        assertFalse("기존 문서는 쪽 테두리 없음", xml(plain).contains("pgBorders"));
        try (XWPFDocument d = new XWPFDocument(new ByteArrayInputStream(render(true)))) {
            assertFalse(d.getBodyElements().isEmpty());
        }
    }

    @Test
    public void 제목은_기관_이름_직위_Profile이고_가운데_굵게_밑줄이다() throws Exception {
        String xml = xml(render(true));
        assertTrue(xml.contains("서울시 가구청 홍길동 구청장 Profile"));
        assertFalse(xml.contains("참고자료"));
        int t = xml.indexOf("서울시 가구청 홍길동 구청장 Profile");
        String before = xml.substring(Math.max(0, t - 800), t);
        assertTrue("밑줄", before.contains("<w:u w:val=\"single\"/>"));
        assertTrue("굵게", before.contains("<w:b/>"));
        assertTrue("가운데", before.contains("<w:jc w:val=\"center\"/>"));
    }

    @Test
    public void 사진과_정보_표는_테두리가_없고_경력_표도_없다() throws Exception {
        try (XWPFDocument d = new XWPFDocument(new ByteArrayInputStream(render(true)))) {
            assertEquals("사진+정보 표, 경력 표", 2, d.getTables().size());
            assertEquals("사진은 1개", 1, d.getAllPictures().size());
            for (XWPFTable t : d.getTables()) {
                CTTblBorders b = t.getCTTbl().getTblPr().getTblBorders();
                assertEquals(STBorder.NIL, b.getTop().getVal());
                assertEquals(STBorder.NIL, b.getLeft().getVal());
                assertEquals(STBorder.NIL, b.getBottom().getVal());
                assertEquals(STBorder.NIL, b.getRight().getVal());
                assertEquals(STBorder.NIL, b.getInsideH().getVal());
                assertEquals(STBorder.NIL, b.getInsideV().getVal());
            }
        }
        assertTrue("■ 글머리", xml(render(true)).contains("■ 성 명 : 홍길동"));
    }

    @Test
    public void 사진이_없으면_표_없이_줄만_나온다() throws Exception {
        try (XWPFDocument d = new XWPFDocument(new ByteArrayInputStream(render(false)))) {
            assertEquals("경력 표 하나뿐", 1, d.getTables().size());
        }
    }

    @Test
    public void 기간은_YYYY_MM이고_연도만_값은_그대로며_날짜_생년_표기는_없다() throws Exception {
        String xml = xml(render(true));
        assertTrue("경력 진행", xml.contains("2018.07 ~ 현재"));
        assertTrue("경력 끝 있음", xml.contains("2001.01 ~ 2005.12"));
        assertTrue("연도만", xml.contains("2018 ~ 현재"));
        assertTrue("학력은 내용 뒤 괄호", xml.contains("행정학석사 (1990.03~1994.02)"));
        assertTrue("학력 연도만", xml.contains("대학교졸업 (1986~1990)"));
        assertTrue("임기", xml.contains("(2023.12") && xml.contains(" ~ 2027.12"));
        assertTrue("첫 취임일", xml.contains("첫 취임일 : 2018.07.01"));
        assertFalse("저장 형식 없음", xml.contains("2018-07") || xml.contains("2023-12") || xml.contains("2027-12"));
        assertTrue("만 나이", xml.contains("만 56세"));
        assertFalse(xml.contains("1970") || xml.contains("년생") || xml.contains("생년월일") || xml.contains("출생지"));
        assertFalse("성향 및 강점 절 없음", xml.contains("성향"));
        assertTrue("최근 것부터(경력)", xml.indexOf("경력진행") < xml.indexOf("경력옛날"));
    }

    @Test
    public void 출처와_기준일_줄은_맨_아래이고_같은_출처는_한_번이다() throws Exception {
        String xml = xml(render(false));
        int src = xml.indexOf(">출처</w:t>");
        assertTrue("출처 제목", src > 0);
        assertTrue("본문 뒤", src > xml.indexOf("경력옛날"));
        assertTrue("기준일 줄은 출처 뒤", xml.indexOf("확정된 값만 담았습니다. 기준일 2026-11-20") > src);
        int count = 0;
        for (int i = xml.indexOf("「문서A」"); i >= 0; i = xml.indexOf("「문서A」", i + 1)) {
            count++;
        }
        assertEquals("같은 출처 한 번(나이 출처는 제목이 없으니 따로)", 1, count);
        assertTrue(xml.contains("기관 누리집 「문서A」"));
        assertTrue("나이 출처는 종류·확인일만", xml.contains("기관 누리집, 확인일 2026-11-20"));
    }
}
