package com.kbstar.kgi.ggreport.web.docout;

import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.Test;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** 기관장 Word 학력·경력: '■ 내용' 한 줄(■ 뒤 탭 하나)·요약본(기본)/날짜정보 포함 괄호 규칙(사용자 11-24). 가상 값만. */
public class HeadDocBuilderDatesTest {

    private static Map<String, Object> item(String value, String from, String to) {
        Map<String, Object> m = new HashMap<String, Object>();
        m.put("value", value);
        if (from != null) {
            m.put("from", from);
        }
        if (to != null) {
            m.put("to", to);
        }
        return m;
    }

    private static Map<String, Object> detail(List<Map<String, Object>> edu, List<Map<String, Object>> career) {
        Map<String, Object> head = new HashMap<String, Object>();
        head.put("head_id", Long.valueOf(1));
        head.put("name", "홍길동");
        head.put("position", "구청장");
        head.put("acting", Boolean.FALSE);
        Map<String, Object> fields = new HashMap<String, Object>();
        fields.put("NAME", new HashMap<String, Object>());
        head.put("fields", fields);
        head.put("education", edu);
        head.put("career", career);
        Map<String, Object> d = new HashMap<String, Object>();
        d.put("head", head);
        return d;
    }

    private static Map<String, Object> cur(Map<String, Object> m) {
        m.put("current", Boolean.TRUE);
        return m;
    }

    private static Map<String, Object> sample() {
        return detail(
                new ArrayList<Map<String, Object>>(Arrays.asList(item("마산공업고등학교 졸업", null, "2026-01"), item("행정학석사", "1990-03", "1994-02"))),
                new ArrayList<Map<String, Object>>(Arrays.asList(item("경력옛날", "2001-01", "2005-12"), cur(item("경력진행", "2018-07", null)), item("경력무기간", null, null))));
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

    /** '■' run → 탭 run → 본문 run 순서(디자인 11-25: ■ 뒤 공백 대신 탭). text 는 본문 run 의 앞부분(끝 조각 포함 가능). */
    static boolean squareLine(String xml, String text) {
        return Pattern.compile("■</w:t></w:r><w:r><w:rPr>(?:(?!</w:rPr>).)*</w:rPr><w:tab/></w:r><w:r><w:rPr>(?:(?!</w:rPr>).)*</w:rPr><w:t[^>]*>"
                + Pattern.quote(text)).matcher(xml).find();
    }

    private static int count(String s, String sub) {
        int n = 0;
        for (int i = s.indexOf(sub); i >= 0; i = s.indexOf(sub, i + sub.length())) {
            n++;
        }
        return n;
    }

    private static String render(Map<String, Object> d, boolean dated) throws Exception {
        return xml(DocxKit.render(HeadDocBuilder.buildDoc(d, "서울시 가구청", "2026-11-20", null, dated).model(), DocxKit.Footer.pageNumberOnly()));
    }

    @Test
    public void 날짜_괄호_규칙() {
        assertEquals("둘 다 다름", "A(2018.07 ~ 2022.06)", HeadDocBuilder.lineText(item("A", "2018-07", "2022-06"), true));
        assertEquals("같으면 하나(연도)", "A(2018)", HeadDocBuilder.lineText(item("A", "2018", "2018"), true));
        assertEquals("같으면 하나(연월)", "A(2018.07)", HeadDocBuilder.lineText(item("A", "2018-07", "2018-07"), true));
        assertEquals("시작만·현직 아님 → 미상", "A(2018.07 ~ 미상)", HeadDocBuilder.lineText(item("A", "2018-07", null), true));
        assertEquals("시작만·연도·현직 아님", "A(2018 ~ 미상)", HeadDocBuilder.lineText(item("A", "2018", null), true));
        assertEquals("현직", "A(2026.07 ~ 현재)", HeadDocBuilder.lineText(cur(item("A", "2026-07", null)), true));
        assertEquals("현직인데 끝이 있으면(옛 행) 끝 그대로", "A(2018 ~ 2020)", HeadDocBuilder.lineText(cur(item("A", "2018", "2020")), true));
        assertEquals("현직 요약본은 내용만", "A", HeadDocBuilder.lineText(cur(item("A", "2026-07", null)), false));
        assertEquals("끝만 · 괄호 앞 공백 없음", "마산공업고등학교 졸업(2026.01)", HeadDocBuilder.lineText(item("마산공업고등학교 졸업", null, "2026-01"), true));
        assertEquals("둘 다 없음 → 괄호 없음", "A", HeadDocBuilder.lineText(item("A", null, null), true));
        assertEquals("연도만+연월 섞임", "A(2018 ~ 2020.06)", HeadDocBuilder.lineText(item("A", "2018", "2020-06"), true));
        assertEquals("형식 밖 값은 적지 않는다", "A(2020)", HeadDocBuilder.lineText(item("A", "재직중?", "2020"), true));
        assertEquals("빈 문자열도 없음 취급", "A", HeadDocBuilder.lineText(item("A", " ", ""), true));
        assertEquals("요약본은 내용만", "A", HeadDocBuilder.lineText(item("A", "2018-07", "2022-06"), false));
    }

    @Test
    public void 요약본은_날짜가_전혀_없다() throws Exception {
        String x = render(sample(), false);
        assertTrue(squareLine(x, "마산공업고등학교 졸업") && squareLine(x, "행정학석사") && squareLine(x, "경력진행"));
        assertFalse(x.contains("졸업(") || x.contains("행정학석사(") || x.contains("경력진행(") || x.contains("경력옛날("));
        assertFalse(x.contains("1990.03") || x.contains("2018.07") || x.contains("2026.01") || x.contains("~ 현재"));
        assertTrue("최근 것부터", x.indexOf("경력진행") < x.indexOf("경력옛날") && x.indexOf("경력옛날") < x.indexOf("경력무기간"));
    }

    @Test
    public void 날짜_포함은_내용_뒤_괄호이고_순서는_같다() throws Exception {
        String x = render(sample(), true);
        assertTrue(squareLine(x, "마산공업고등학교 졸업(2026.01)"));
        assertTrue(squareLine(x, "행정학석사(1990.03 ~ 1994.02)"));
        assertTrue(squareLine(x, "경력옛날(2001.01 ~ 2005.12)"));
        assertTrue(squareLine(x, "경력진행(2018.07 ~ 현재)"));
        assertTrue("기간 없는 줄은 괄호 없음", squareLine(x, "경력무기간</w:t>"));
        assertTrue(x.indexOf("경력진행") < x.indexOf("경력옛날") && x.indexOf("경력옛날") < x.indexOf("경력무기간"));
        assertFalse("저장 형식 없음", x.contains("2018-07") || x.contains("1990-03"));
    }

    @Test
    public void 기본은_요약본이고_표_없이_한_줄씩_네모_뒤_한_칸이다() throws Exception {
        Map<String, Object> d = sample();
        byte[] def = DocxKit.render(HeadDocBuilder.buildDoc(d, "서울시 가구청", "2026-11-20", null).model(), DocxKit.Footer.pageNumberOnly());
        String x = xml(def);
        assertEquals("4인자 = 요약본", render(sample(), false), x);
        assertFalse("■ 뒤 공백 없음(탭 하나로 대체)", x.contains("■ "));
        assertEquals("■ 하나당 탭 하나", count(x, "■"), count(x, "<w:tab/>"));
        try (XWPFDocument doc = new XWPFDocument(new ByteArrayInputStream(def))) {
            assertEquals("사진이 없으면 표 없음", 0, doc.getTables().size());
        }
    }

    @Test
    public void 사진이_있으면_표는_사진_정보_표_하나뿐이다() throws Exception {
        BufferedImage img = new BufferedImage(300, 400, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        ImageIO.write(img, "jpg", o);
        Map<String, Object> d = sample();
        @SuppressWarnings("unchecked")
        Map<String, Object> head = (Map<String, Object>) d.get("head");
        Map<String, Object> photo = new HashMap<String, Object>();
        photo.put("license_cd", "INST_PERMIT");
        photo.put("photo_id", Long.valueOf(9));
        head.put("photo", photo);
        try (XWPFDocument doc = new XWPFDocument(new ByteArrayInputStream(DocxKit.render(
                HeadDocBuilder.buildDoc(d, "서울시 가구청", "2026-11-20", o.toByteArray(), true).model(), DocxKit.Footer.pageNumberOnly())))) {
            assertEquals(1, doc.getTables().size());
            assertEquals(1, doc.getAllPictures().size());
        }
    }

    private static List<Map<String, Object>> manyCareer(int n, String pad) {
        List<Map<String, Object>> l = new ArrayList<Map<String, Object>>();
        for (int i = 0; i < n; i++) {
            l.add(item("가상경력" + i + pad, (2000 + i) + "-01", (2000 + i) + "-12"));
        }
        return l;
    }

    @Test
    public void 많으면_오래된_줄부터_빼고_날짜_포함은_같거나_더_뺀다() throws Exception {
        HeadDocBuilder.Built s = HeadDocBuilder.buildDoc(detail(new ArrayList<Map<String, Object>>(), manyCareer(60, "")), "서울시 가구청", "2026-11-20", null, false);
        HeadDocBuilder.Built t = HeadDocBuilder.buildDoc(detail(new ArrayList<Map<String, Object>>(), manyCareer(60, "")), "서울시 가구청", "2026-11-20", null, true);
        assertTrue("60줄이면 요약본도 뺀다", s.careerDropped() > 0);
        assertTrue("날짜 포함은 같거나 더 뺀다", t.careerDropped() >= s.careerDropped());
        assertEquals(0, s.eduDropped());
        String x = xml(DocxKit.render(t.model(), DocxKit.Footer.pageNumberOnly()));
        assertTrue("가장 최근은 남는다", x.contains("가상경력59"));
        assertFalse("가장 오래된 줄은 빠진다", x.contains("가상경력0("));
        assertEquals(0, HeadDocBuilder.buildDoc(detail(new ArrayList<Map<String, Object>>(), manyCareer(3, "")), "서울시 가구청", "2026-11-20", null, true).careerDropped());
    }

    @Test
    public void 현직은_맨_위_미상은_시작_연월로_끝난_줄과_섞이고_빼는_순서도_같다() throws Exception {
        List<Map<String, Object>> career = new ArrayList<Map<String, Object>>(Arrays.asList(
                item("경력끝2010", "2005-01", "2010-06"), item("경력미상2018", "2018-03", null), cur(item("경력현직1995", "1995-03", null)),
                item("경력끝2020", "2016-01", "2020-12"), item("경력무기간", null, null)));
        String x = render(detail(new ArrayList<Map<String, Object>>(Arrays.asList(item("학력시작만", "2010", null))), career), true);
        assertTrue(x.indexOf("경력현직1995") < x.indexOf("경력끝2020") && x.indexOf("경력끝2020") < x.indexOf("경력미상2018")
                && x.indexOf("경력미상2018") < x.indexOf("경력끝2010") && x.indexOf("경력끝2010") < x.indexOf("경력무기간"));
        assertTrue(squareLine(x, "경력현직1995(1995.03 ~ 현재)"));
        assertTrue(squareLine(x, "경력미상2018(2018.03 ~ 미상)"));
        assertTrue("학력 시작만은 미상", squareLine(x, "학력시작만(2010 ~ 미상)"));
        List<Map<String, Object>> l = new ArrayList<Map<String, Object>>(Arrays.asList(
                cur(item("현", "1995-03", null)), item("끝2020", "2016-01", "2020-12"), item("미상2018", "2018-03", null), item("끝2010", "2005-01", "2010-06")));
        assertEquals("끝2010 먼저", 3, HeadDocBuilder.oldestIndex(l));
        l.remove(3);
        assertEquals("그다음 미상2018", 2, HeadDocBuilder.oldestIndex(l));
        l.remove(2);
        assertEquals("현직은 마지막", 1, HeadDocBuilder.oldestIndex(l));
    }

    @Test
    public void 요약본은_현직_미상_변경_뒤에도_학력_경력_줄에_날짜_글자가_전혀_없다() throws Exception {
        List<Map<String, Object>> edu = new ArrayList<Map<String, Object>>(Arrays.asList(
                item("가람고등학교 졸업", "2010", null),          // 시작만 있는 학력(날짜 포함이면 '(2010 ~ 미상)')
                item("나래대학교 졸업", null, null)));             // 연도 없는 학력
        List<Map<String, Object>> career = new ArrayList<Map<String, Object>>(Arrays.asList(
                cur(item("가람구청장", "2026-07", null)),          // 현직(날짜 포함이면 '(2026.07 ~ 현재)')
                item("가람시 기획관", "2018", null)));             // 끝 모름(날짜 포함이면 '(2018 ~ 미상)')
        Map<String, Object> d = detail(edu, career);
        String x = render(d, false);
        assertFalse("현재 없음", x.contains("현재"));
        assertFalse("미상 없음", x.contains("미상"));
        for (String v : new String[]{"가람고등학교 졸업", "나래대학교 졸업", "가람구청장", "가람시 기획관"}) {
            java.util.regex.Matcher m = Pattern.compile("<w:t[^>]*>(" + Pattern.quote(v) + "[^<]*)</w:t>").matcher(x);
            assertTrue(v + " 줄이 있다", m.find());
            String line = m.group(1);
            assertEquals(v + " 줄은 내용만(괄호·날짜 없음)", v, line);
            assertFalse(v + " 줄 안 4자리 연도 없음", Pattern.compile("\\d{4}").matcher(line).find());
        }
        assertFalse("문서 전체 저장 형식·표기 형식 날짜 없음", Pattern.compile("\\d{4}[-.]\\d{2}").matcher(x).find()
                || x.contains("2010") || x.contains("2018") || x.contains("2026"));
        assertTrue("요약본도 현직이 맨 위", x.indexOf("가람구청장") < x.indexOf("가람시 기획관"));
        assertTrue("대조: 날짜 포함 모드에는 나온다", squareLine(render(d, true), "가람구청장(2026.07 ~ 현재)")
                && squareLine(render(d, true), "가람시 기획관(2018 ~ 미상)") && squareLine(render(d, true), "가람고등학교 졸업(2010 ~ 미상)"));
    }
}
