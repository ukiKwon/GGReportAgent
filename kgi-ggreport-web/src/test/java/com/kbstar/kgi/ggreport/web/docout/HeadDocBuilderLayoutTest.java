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
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 기관장 Word 프로필 양식(사용자 참고 양식 11-20·11-23): 쪽 테두리·밑줄 제목·테두리 없는 사진+정보 표(사진 78×81.8mm 상자)·YYYY.MM 기간·출처 없음(웹 화면에서만). 가상 값만 쓴다.
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
            photo.put("license_cd", "INST_PERMIT");   // KOGL1 은 Word 에 안 넣는다(11-23 기본값)
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
    public void 문서에_출처_번호_이용_조건_글자가_없고_기준일_줄은_맨_아래다() throws Exception {
        for (boolean withPhoto : new boolean[]{false, true}) {
            String xml = xml(render(withPhoto));
            assertFalse("출처 글자 전체", xml.contains("출처"));
            assertFalse("「", xml.contains("「"));
            assertFalse("확인일", xml.contains("확인일"));
            assertFalse("이용 조건", xml.contains("이용 조건"));
            assertFalse("위첨자", xml.contains("w:val=\"superscript\"") || xml.contains("vertAlign"));
            assertFalse("출처 제목·종류", xml.contains("문서A") || xml.contains("기관 누리집"));
            assertFalse("공공누리", xml.contains("공공누리"));
            int base = xml.indexOf("확정된 값만 담았습니다. 기준일 2026-11-20");
            assertTrue("기준일 줄", base > xml.indexOf("경력옛날"));
        }
    }

    private static final int BOX_W = 78 * 36000;
    private static final int BOX_H = (int) Math.round(81.8 * 36000);

    private static byte[] jpeg(int w, int h) throws Exception {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(new Color(220, 226, 235));
        g.fillRect(0, 0, w, h);
        g.dispose();
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        ImageIO.write(img, "jpg", o);
        return o.toByteArray();
    }

    private static byte[] render(String license, byte[] jpeg) throws Exception {
        Map<String, Object> d = detail(true);
        @SuppressWarnings("unchecked")
        Map<String, Object> head = (Map<String, Object>) d.get("head");
        @SuppressWarnings("unchecked")
        Map<String, Object> photo = (Map<String, Object>) head.get("photo");
        photo.put("license_cd", license);
        return DocxKit.render(HeadDocBuilder.build(d, "서울시 가구청", 1, "2026-11-20", jpeg), DocxKit.Footer.pageNumberOnly());
    }

    private static int[] extent(String xml) {
        Matcher m = Pattern.compile("extent cx=\"(\\d+)\" cy=\"(\\d+)\"").matcher(xml);
        assertTrue(xml, m.find());
        return new int[]{Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2))};
    }

    @Test
    public void 사진은_78x81_8mm_상자_안에_비율을_지켜_맞춘다() throws Exception {
        int tol = 36;
        int[] tall = extent(xml(render("INST_PERMIT", jpeg(300, 400))));
        assertTrue(tall[0] <= BOX_W && tall[1] <= BOX_H + tol);
        assertEquals(BOX_H, tall[1], tol);
        assertEquals(300d / 400d, (double) tall[0] / tall[1], 0.001);
        int[] wide = extent(xml(render("INST_PERMIT", jpeg(400, 300))));
        assertTrue(wide[0] <= BOX_W && wide[1] <= BOX_H);
        assertEquals(BOX_W, wide[0], tol);
        assertEquals(400d / 300d, (double) wide[0] / wide[1], 0.001);
        int[] sq = extent(xml(render("INST_PERMIT", jpeg(500, 500))));
        assertEquals(BOX_W, sq[0], tol);
        assertEquals(sq[0], sq[1], tol);
    }

    @Test
    public void KOGL1_사진은_기본값에서_넣지_않고_표와_안내도_없다() throws Exception {
        byte[] docx = render("KOGL1", jpeg());
        try (XWPFDocument d = new XWPFDocument(new ByteArrayInputStream(docx))) {
            assertEquals("경력 표 하나뿐", 1, d.getTables().size());
            assertEquals(0, d.getAllPictures().size());
        }
        String xml = xml(docx);
        assertFalse(xml.contains("이용 조건") || xml.contains("넣지 않았") || xml.contains("공공누리"));
    }

    @Test
    public void 허용_밖_이용_조건도_조용히_사진이_없다() throws Exception {
        for (String lic : new String[]{"LOCAL_ONLY", "KOGL2", "PRESS_PERMIT", "XYZ"}) {
            byte[] docx = render(lic, jpeg());
            try (XWPFDocument d = new XWPFDocument(new ByteArrayInputStream(docx))) {
                assertEquals(lic, 1, d.getTables().size());
                assertEquals(lic, 0, d.getAllPictures().size());
            }
            assertFalse(lic, xml(docx).contains("넣지 않았") || xml(docx).contains("이용 조건"));
        }
    }

    @Test
    public void 허용_조건인데_그림을_못_읽으면_안내_한_줄만_있다() throws Exception {
        byte[] docx = render("INST_PERMIT", new byte[]{1, 2, 3});
        assertTrue(xml(docx).contains("사진을 불러오지 못해 넣지 않았습니다."));
        try (XWPFDocument d = new XWPFDocument(new ByteArrayInputStream(docx))) {
            assertEquals(1, d.getTables().size());
        }
    }
}
