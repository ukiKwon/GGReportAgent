package com.kbstar.kgi.ggreport.web.docout;

import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 기관장 Word 프로필 양식(사용자 참고 양식 11-20·11-23): 쪽 테두리·밑줄 제목·테두리 없는 사진+정보 표(사진 4단계 상자 78~88mm, 1장 맞춤)·학력·경력 같은 2열 표·연도만 기간(사용자 11-24)·글자 22/14/16/12pt·출처·멘트 없음(웹 화면에서만). 가상 값만 쓴다.
 * 견본 파일을 target/head-profile-sample.docx(사진 S3)·head-profile-sample-many.docx(경력 많음) 로 남긴다(사용자 확인용, 커밋 대상 아님).
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
            photo.put("license_cd", "INST_PERMIT");   // KOGL1 도 11-23 부터 넣는다
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
        DocModel m = HeadDocBuilder.build(detail(withPhoto), "서울시 가구청", "2026-11-20", withPhoto ? jpeg() : null);
        return DocxKit.render(m, DocxKit.Footer.pageNumberOnly());
    }

    private static Map<String, Object> manyRows(int n) {
        Map<String, Object> d = detail(true);
        @SuppressWarnings("unchecked")
        Map<String, Object> head = (Map<String, Object>) d.get("head");
        List<Map<String, Object>> career = new ArrayList<Map<String, Object>>();
        for (int i = 0; i < n; i++) {
            career.add(item("가상경력" + i, (2000 + i) + "-01", (2000 + i) + "-12"));
        }
        head.put("career", career);
        return d;
    }

    @Test
    public void 견본_파일을_남긴다() throws Exception {
        Files.createDirectories(Paths.get("target"));
        Files.write(Paths.get("target", "head-profile-sample.docx"), render(true));   // 학력·경력 적음 → 사진 S3
        Files.write(Paths.get("target", "head-profile-sample-many.docx"), DocxKit.render(
                HeadDocBuilder.build(manyRows(14), "서울시 가구청", "2026-11-20", jpeg()), DocxKit.Footer.pageNumberOnly()));   // 많음 → 작은 단계
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

    /** 글자 바로 앞 runPr 안의 크기(반 pt). */
    private static String runSizeBefore(String xml, String text) {
        int t = xml.indexOf(text);
        assertTrue(text, t > 0);
        String before = xml.substring(Math.max(0, t - 600), t);
        Matcher m = Pattern.compile("<w:sz w:val=\"(\\d+)\"/>").matcher(before);
        String last = null;
        while (m.find()) {
            last = m.group(1);
        }
        return last;
    }

    @Test
    public void 글자_크기는_제목22_정보14_절제목16_내용12pt다() throws Exception {
        String xml = xml(render(true));
        assertEquals("제목 22pt", "44", runSizeBefore(xml, "서울시 가구청 홍길동 구청장 Profile"));
        assertEquals("정보 줄 14pt", "28", runSizeBefore(xml, "성 명 : 홍길동"));
        assertEquals("절 제목 16pt", "32", runSizeBefore(xml, "[ 학 력 ]"));
        assertEquals("학력·경력 줄 12pt", "24", runSizeBefore(xml, "행정학석사"));
    }

    @Test
    public void 사진_정보_학력_경력_표는_테두리가_없다() throws Exception {
        try (XWPFDocument d = new XWPFDocument(new ByteArrayInputStream(render(true)))) {
            assertEquals("사진+정보 표 하나(학력·경력은 표 없이 한 줄씩 — 사용자 11-24)", 1, d.getTables().size());
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
        assertTrue("■ 글머리(탭)", squareLine(xml(render(true)), "성 명 : 홍길동"));
    }

    @Test
    public void 사진이_없으면_표가_없다() throws Exception {
        try (XWPFDocument d = new XWPFDocument(new ByteArrayInputStream(render(false)))) {
            assertEquals("학력·경력도 표 없이 한 줄씩(사용자 11-24)", 0, d.getTables().size());
        }
    }

    @Test
    public void 요약본_기본은_학력_경력에_날짜가_없고_네모_뒤_한_칸이며_날짜_생년_표기는_없다() throws Exception {
        String xml = xml(render(true));
        assertTrue("■ + 탭 + 내용", squareLine(xml, "경력진행") && squareLine(xml, "행정학석사") && squareLine(xml, "대학교졸업"));
        assertTrue("내어쓰기 312twip(12pt) + 탭 위치 명시", xml.contains("w:hanging=\"312\"") && xml.contains("w:left=\"312\"")
                && xml.contains("<w:tab w:val=\"left\" w:pos=\"312\"/>"));
        assertTrue("정보 줄 14pt 는 364twip", xml.contains("w:hanging=\"364\"") && xml.contains("<w:tab w:val=\"left\" w:pos=\"364\"/>"));
        assertFalse("요약본: 학력·경력 날짜 없음(사용자 11-24)", xml.contains("2018 ~ 현재") || xml.contains("2001 ~ 2005") || xml.contains("1990 ~ 1994")
                || xml.contains("1986 ~ 1990") || xml.contains("1990.03") || xml.contains("2001.01"));
        assertTrue("임기", xml.contains("(2023.12") && xml.contains(" ~ 2027.12"));
        assertTrue("첫 취임일", xml.contains("첫 취임일 : 2018.07.01"));
        assertFalse("저장 형식 없음", xml.contains("2018-07") || xml.contains("2023-12") || xml.contains("2027-12"));
        assertTrue("만 나이", xml.contains("만 56세"));
        assertFalse(xml.contains("1970") || xml.contains("년생") || xml.contains("생년월일") || xml.contains("출생지"));
        assertFalse("성향 및 강점 절 없음", xml.contains("성향"));
        assertTrue("최근 것부터(경력)", xml.indexOf("경력진행") < xml.indexOf("경력옛날"));
    }

    @Test
    public void 문서에_출처_이용_조건_기준일_안내_멘트가_없다() throws Exception {
        for (boolean withPhoto : new boolean[]{false, true}) {
            String xml = xml(render(withPhoto));
            assertFalse("출처 글자 전체", xml.contains("출처"));
            assertFalse("「", xml.contains("「"));
            assertFalse("확인일", xml.contains("확인일"));
            assertFalse("이용 조건", xml.contains("이용 조건"));
            assertFalse("위첨자", xml.contains("w:val=\"superscript\"") || xml.contains("vertAlign"));
            assertFalse("출처 제목·종류", xml.contains("문서A") || xml.contains("기관 누리집"));
            assertFalse("공공누리", xml.contains("공공누리"));
            assertFalse("끝 멘트 삭제", xml.contains("확정된 값만 담았습니다") || xml.contains("기준일") || xml.contains("2026-11-20") || xml.contains("2026.11.20"));
            assertFalse("빈 값 멘트 삭제", xml.contains("확정된 값이 없습니다"));
        }
    }

    @Test
    public void 학력_경력이_없으면_절_머리째_없다() throws Exception {
        Map<String, Object> d = detail(false);
        @SuppressWarnings("unchecked")
        Map<String, Object> head = (Map<String, Object>) d.get("head");
        head.put("education", Collections.emptyList());
        head.put("career", Collections.emptyList());
        String xml = xml(DocxKit.render(HeadDocBuilder.build(d, "서울시 가구청", "2026-11-20", null), DocxKit.Footer.pageNumberOnly()));
        assertFalse(xml.contains("[ 학 력 ]") || xml.contains("[ 경 력 ]") || xml.contains("확정된 값이 없습니다"));
    }

    private static final int BOX_W = 88 * 36000;   // 학력·경력이 적으면 S3(88×92.3mm)
    private static final int BOX_H = (int) Math.round(92.3 * 36000);

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

    private static Map<String, Object> withLicense(String license) {
        Map<String, Object> d = detail(true);
        @SuppressWarnings("unchecked")
        Map<String, Object> head = (Map<String, Object>) d.get("head");
        @SuppressWarnings("unchecked")
        Map<String, Object> photo = (Map<String, Object>) head.get("photo");
        photo.put("license_cd", license);
        return d;
    }

    private static byte[] render(String license, byte[] jpeg) throws Exception {
        return DocxKit.render(HeadDocBuilder.build(withLicense(license), "서울시 가구청", "2026-11-20", jpeg), DocxKit.Footer.pageNumberOnly());
    }

    /** '■' run → 탭 run → 본문 run 순서(디자인 11-25: ■ 뒤 공백 대신 탭). text 는 본문 run 의 앞부분. */
    static boolean squareLine(String xml, String text) {
        return Pattern.compile("■</w:t></w:r><w:r><w:rPr>(?:(?!</w:rPr>).)*</w:rPr><w:tab/></w:r><w:r><w:rPr>(?:(?!</w:rPr>).)*</w:rPr><w:t[^>]*>"
                + Pattern.quote(text)).matcher(xml).find();
    }

    private static int[] extent(String xml) {
        Matcher m = Pattern.compile("extent cx=\"(\\d+)\" cy=\"(\\d+)\"").matcher(xml);
        assertTrue(xml, m.find());
        return new int[]{Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2))};
    }

    @Test
    public void 학력_경력이_적으면_사진은_S3_88x92_3mm_상자를_꽉_채운다_세로_가로_정사각_모두() throws Exception {
        for (int[] wh : new int[][]{{300, 400}, {400, 300}, {500, 500}}) {
            int[] e = extent(xml(render("INST_PERMIT", jpeg(wh[0], wh[1]))));
            assertEquals(wh[0] + "x" + wh[1] + " 폭", BOX_W, e[0], 36);
            assertEquals(wh[0] + "x" + wh[1] + " 높이", BOX_H, e[1], 36);
        }
    }

    /** word/document.xml 의 srcRect 속성(없으면 0). srcRect 요소 자체가 없으면 -1. */
    private static int crop(String xml, String attr) {
        Matcher e = Pattern.compile("<[A-Za-z]*:?srcRect\\b[^>]*>").matcher(xml);
        if (!e.find()) {
            return -1;
        }
        Matcher a = Pattern.compile("\\s" + attr + "=\"(\\d+)\"").matcher(e.group());
        return a.find() ? Integer.parseInt(a.group(1)) : 0;
    }

    @Test
    public void 세로_3대4_사진은_위30_아래70으로_잘라_상자를_채운다() throws Exception {
        String xml = xml(render("INST_PERMIT", jpeg(300, 400)));   // 적으면 S3
        int[] e = extent(xml);
        assertEquals(BOX_W, e[0], 36);
        assertEquals(BOX_H, e[1], 36);
        assertEquals(0, crop(xml, "l"));
        assertEquals(0, crop(xml, "r"));
        assertEquals("위 약 6.4%", 6402, crop(xml, "t"), 100);
        assertEquals("아래 약 14.9%", 14937, crop(xml, "b"), 100);
    }

    @Test
    public void 가로_4대3_사진은_좌우_가운데를_잘라_상자를_채운다() throws Exception {
        String xml = xml(render("INST_PERMIT", jpeg(400, 300)));
        int[] e = extent(xml);
        assertEquals(BOX_W, e[0], 36);
        assertEquals(BOX_H, e[1], 36);
        assertEquals(14247, crop(xml, "l"), 100);
        assertEquals(14247, crop(xml, "r"), 100);
        assertEquals(0, crop(xml, "t"));
        assertEquals(0, crop(xml, "b"));
    }

    @Test
    public void 행이_많아_S0이면_세로_사진도_78x81_8mm를_채운다() throws Exception {
        String xml = xml(DocxKit.render(HeadDocBuilder.build(manyRows(40), "서울시 가구청", "2026-11-20", jpeg(300, 400)), DocxKit.Footer.pageNumberOnly()));
        int[] e = extent(xml);
        assertEquals(78 * 36000, e[0], 36);   // 사용자 11-23 '최소 78×81.8' — 이전엔 61.4mm
        assertEquals((int) Math.round(81.8 * 36000), e[1], 36);
        assertTrue(crop(xml, "t") > 0);
    }

    @Test
    public void 극단_비율은_자르지_않고_상자_안에_비율대로_넣는다() throws Exception {
        String tallXml = xml(render("INST_PERMIT", jpeg(200, 600)));   // 1:3 → 잘림 65% 라 contain
        assertEquals("srcRect 없음", -1, crop(tallXml, "t"));
        int[] t = extent(tallXml);
        assertTrue("폭은 상자보다 작다", t[0] < BOX_W - 36000);
        assertEquals(BOX_H, t[1], 36);
        assertEquals(1d / 3d, (double) t[0] / t[1], 0.002);
        String wideXml = xml(render("INST_PERMIT", jpeg(900, 300)));   // 3:1
        assertEquals(-1, crop(wideXml, "l"));
        int[] w = extent(wideXml);
        assertEquals(BOX_W, w[0], 36);
        assertTrue(w[1] < BOX_H - 36000);
    }

    @Test
    public void 사진_모양은_1장_맞춤_결과에_영향이_없다() throws Exception {
        HeadDocBuilder.Built tall = HeadDocBuilder.buildDoc(manyRows(40), "서울시 가구청", "2026-11-20", jpeg(300, 400));
        HeadDocBuilder.Built sq = HeadDocBuilder.buildDoc(manyRows(40), "서울시 가구청", "2026-11-20", jpeg(500, 500));
        HeadDocBuilder.Built wide = HeadDocBuilder.buildDoc(manyRows(40), "서울시 가구청", "2026-11-20", jpeg(900, 300));
        assertEquals(sq.careerDropped(), tall.careerDropped());
        assertEquals(sq.careerDropped(), wide.careerDropped());
        assertEquals(sq.eduDropped(), tall.eduDropped());
    }

    @Test
    public void cropFor_순수_계산() {
        double[] c = HeadDocBuilder.cropFor(78, 81.8, 300, 400);
        assertEquals(0, c[0], 1e-9);
        assertEquals(0.0640, c[1], 0.001);
        assertEquals(0, c[2], 1e-9);
        assertEquals(0.1494, c[3], 0.001);
        double[] w = HeadDocBuilder.cropFor(78, 81.8, 400, 300);
        assertEquals(0.1424, w[0], 0.001);
        assertEquals(w[0], w[2], 1e-9);
        assertEquals(0, w[1], 1e-9);
        assertNull("같은 비율이면 자를 것 없음", HeadDocBuilder.cropFor(80, 100, 400, 500));
        assertNull("극단 세로", HeadDocBuilder.cropFor(78, 81.8, 200, 600));
        assertNull("극단 가로", HeadDocBuilder.cropFor(78, 81.8, 900, 300));
    }

    @Test(expected = IllegalArgumentException.class)
    public void 자르기_값이_범위를_벗어나면_거절한다() throws Exception {
        DocModel.Picture.jpeg(jpeg(), 10, 10, "x").withCrop(0.6, 0, 0.5, 0);
    }

    @Test
    public void 행이_많아_넘치면_사진은_최소_S0_78mm이고_글자는_그대로다() throws Exception {
        String xml = xml(DocxKit.render(HeadDocBuilder.build(manyRows(40), "서울시 가구청", "2026-11-20", jpeg(500, 500)), DocxKit.Footer.pageNumberOnly()));
        int[] sq = extent(xml);
        assertEquals(78 * 36000, sq[0], 36);
        assertEquals("표 내용 12pt 그대로", "24", runSizeBefore(xml, "가상경력39"));
    }

    @Test
    public void 넘치면_경력을_오래된_것부터_빼서_1장에_맞추고_뺀_줄_수를_알린다() throws Exception {
        HeadDocBuilder.Built b = HeadDocBuilder.buildDoc(manyRows(40), "서울시 가구청", "2026-11-20", jpeg(500, 500));
        assertTrue("40줄이면 뺀다", b.careerDropped() > 0);
        assertEquals("학력은 그대로", 0, b.eduDropped());
        String xml = xml(DocxKit.render(b.model(), DocxKit.Footer.pageNumberOnly()));
        assertTrue("가장 최근 경력은 남는다", xml.contains("가상경력39"));
        assertFalse("가장 오래된 경력은 빠진다", xml.contains("가상경력0<") || xml.contains(">가상경력0<"));
        int kept = 40 - b.careerDropped();
        assertTrue("남은 가장 오래된 줄(" + (40 - kept) + ")", xml.contains("가상경력" + (40 - kept)));
        assertFalse("그 바로 앞 줄은 빠진다", xml.contains(">가상경력" + (39 - kept) + "<"));

        HeadDocBuilder.Built few = HeadDocBuilder.buildDoc(manyRows(3), "서울시 가구청", "2026-11-20", jpeg(500, 500));
        assertEquals("여유 있으면 빼지 않는다", 0, few.careerDropped());
        assertEquals(0, few.eduDropped());
    }

    @Test
    public void 뺄_줄은_표_맨_아래_줄_현직은_남고_날짜_없으면_먼저_같으면_아래_줄() {
        assertEquals(1, HeadDocBuilder.oldestIndex(Arrays.asList(item("a", "2010-03", null), item("b", "2010", null))));
        assertEquals("시작 없으면 끝으로", 0, HeadDocBuilder.oldestIndex(Arrays.asList(item("a", null, "2005-01"), item("b", "2010-01", null))));
        assertEquals("날짜 없는 줄 먼저", 2, HeadDocBuilder.oldestIndex(Arrays.asList(item("a", "2001-01", null), item("b", "2000-01", null), item("c", null, null))));
        assertEquals("같으면 아래 줄", 1, HeadDocBuilder.oldestIndex(Arrays.asList(item("a", "2000-01", null), item("b", "2000-01", null))));
        assertEquals("오래전에 시작한 현직(끝 없음)은 남고 끝난 경력이 먼저(qa P2-1)", 1, HeadDocBuilder.oldestIndex(Arrays.asList(item("현 OO위원", "1995-03", null), item("b", "2015-01", "2020-12"))));
    }

    @Test
    public void KOGL1_사진도_출처_없이_넣는다() throws Exception {
        byte[] docx = render("KOGL1", jpeg());
        try (XWPFDocument d = new XWPFDocument(new ByteArrayInputStream(docx))) {
            assertEquals("사진+정보 표 하나", 1, d.getTables().size());
            assertEquals(1, d.getAllPictures().size());
        }
        String xml = xml(docx);
        assertFalse(xml.contains("출처") || xml.contains("이용 조건") || xml.contains("공공누리") || xml.contains("넣지 않았"));
    }

    @Test
    public void 이용_조건과_관계없이_사진은_들어가고_상태는_included다() throws Exception {   // 사용자 11-24 "무조건 넣어"
        for (String lic : new String[]{"LOCAL_ONLY", "KOGL2", "PRESS_PERMIT", "XYZ"}) {
            byte[] docx = render(lic, jpeg());
            try (XWPFDocument d = new XWPFDocument(new ByteArrayInputStream(docx))) {
                assertEquals(lic, 1, d.getTables().size());   // 사진+정보 표 하나(학력·경력은 표 없이 한 줄씩)
                assertEquals(lic, 1, d.getAllPictures().size());
            }
            assertFalse(lic, xml(docx).contains("넣지 않았") || xml(docx).contains("이용 조건") || xml(docx).contains(lic));
            assertEquals(lic, HeadDocBuilder.PHOTO_INCLUDED, HeadDocBuilder.buildDoc(withLicense(lic), "서울시 가구청", "2026-11-20", jpeg()).photoStatus());
        }
    }

    @Test
    public void 허용_조건인데_그림을_못_읽으면_문서에_안내가_없고_상태는_failed다() throws Exception {
        byte[] bad = new byte[]{1, 2, 3};
        assertEquals(HeadDocBuilder.PHOTO_FAILED, HeadDocBuilder.buildDoc(detail(true), "서울시 가구청", "2026-11-20", bad).photoStatus());
        assertEquals(HeadDocBuilder.PHOTO_INCLUDED, HeadDocBuilder.buildDoc(detail(true), "서울시 가구청", "2026-11-20", jpeg()).photoStatus());
        assertEquals(HeadDocBuilder.PHOTO_NONE, HeadDocBuilder.buildDoc(detail(false), "서울시 가구청", "2026-11-20", null).photoStatus());
        byte[] docx = render("INST_PERMIT", bad);
        assertFalse(xml(docx).contains("넣지 않았") || xml(docx).contains("불러오지"));
        try (XWPFDocument d = new XWPFDocument(new ByteArrayInputStream(docx))) {
            assertEquals("사진을 못 읽으면 표 없음", 0, d.getTables().size());
            assertEquals(0, d.getAllPictures().size());
        }
    }
}
