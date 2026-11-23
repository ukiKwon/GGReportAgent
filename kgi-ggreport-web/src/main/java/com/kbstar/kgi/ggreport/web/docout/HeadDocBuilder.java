package com.kbstar.kgi.ggreport.web.docout;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageInputStream;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 기관장 정보 상세({@code InstitutionHeadService.detail} 결과) → 문서 모델(NEXT 100 S1).
 * 사용자 참고 양식(11-20): 쪽 테두리, 가운데·굵게·밑줄 제목 「{기관명} {이름} {직위} Profile」, 왼쪽 사진·오른쪽 ■ 줄(테두리 없는 표),
 * [ 학 력 ]·[ 경 력 ](기간 YYYY.MM). 확정된 칸만 쓴다. 참고자료 번호(ref_no)는 형식만 검사하고 문서에는 쓰지 않는다.
 * <b>출처·이용 조건은 문서에 쓰지 않는다</b>(사용자 11-23: 웹 화면에서만 표기) — 위첨자 번호·출처 목록·사진 캡션 없음.
 * 학력·경력은 카드처럼 최근 것부터, 기간을 앞에 쓴다(사용자 11-20).
 * 사진은 이용 조건이 PHOTO_LICENSE 에 있을 때만, 78×81.8mm 상자 안에 비율을 지켜 맞춰 넣는다(사용자 11-23 — 참고 샘플 7.8×8.18cm). 사진이 없으면 표 없이 정보 줄만 쓴다.
 * 나이는 '만 n세'만 쓴다 — 생년월일 날짜는 어디에도 넣지 않는다(사용자 11-20).
 * 후보 값·사번(created_by)·이전 기관장은 넣지 않는다.
 */
public final class HeadDocBuilder {

    /** KOGL1(공공누리 제1유형)은 출처 표시가 이용 조건이다. 문서에서 출처를 뺐으므로 기본은 넣지 않는다 — 사용자 결정 전까지 false(11-23). */
    private static final boolean WORD_PHOTO_KOGL1 = false;

    /** 문서에 사진을 넣어도 되는 이용 조건 코드. 그 밖(KOGL2~4·PRESS_PERMIT·LOCAL_ONLY·모르는 코드)은 넣지 않는다. */
    private static final Set<String> PHOTO_LICENSE = new HashSet<String>();
    private static final double PHOTO_W_MM = 78;
    private static final double PHOTO_H_MM = 81.8;

    static {
        PHOTO_LICENSE.add("INST_PERMIT");
        if (WORD_PHOTO_KOGL1) {
            PHOTO_LICENSE.add("KOGL1");
        }
    }

    private HeadDocBuilder() {
    }

    /**
     * 문서에 담을 확정 칸이 하나라도 있는지 — 권한대행 밖 확정 값·학력·경력 중 하나. 사진만 있거나 권한대행·생년월일 칸만 있으면 false
     * (그런 머리는 빈 문서가 되므로 호출부가 409 HEAD_EMPTY 로 막는다). 생년월일은 날짜로는 문서에 넣지 않으므로(나이 줄만) 이 판정에서도 뺀다(사용자 11-19·11-20).
     */
    public static boolean hasContent(Map<String, Object> detail) {
        Map<String, Object> head = map(detail.get("head"));
        for (String key : map(head.get("fields")).keySet()) {
            if (!"ACTING".equals(key) && !"BIRTH_DATE".equals(key)) {
                return true;
            }
        }
        return !listOf(head.get("education")).isEmpty() || !listOf(head.get("career")).isEmpty();
    }

    /** detail 의 현 기관장 번호(감사 표 HEAD_ID 용). 없으면 null. */
    public static Long headIdOf(Map<String, Object> detail) {
        Object id = map(detail.get("head")).get("head_id");
        return id instanceof Number ? Long.valueOf(((Number) id).longValue()) : null;
    }

    /** ACTIVE 사진이 있고 이용 조건이 문서에 넣어도 되는 코드일 때만 true — 호출부는 true 일 때만 사진 파일을 읽는다. */
    public static boolean photoWanted(Map<String, Object> detail) {
        Map<String, Object> photo = map(map(detail.get("head")).get("photo"));
        return !photo.isEmpty() && PHOTO_LICENSE.contains(str(photo.get("license_cd"))) && photoIdOf(detail) != null;
    }

    public static Long photoIdOf(Map<String, Object> detail) {
        Object id = map(map(detail.get("head")).get("photo")).get("photo_id");
        return id instanceof Number ? Long.valueOf(((Number) id).longValue()) : null;
    }

    /**
     * 만 나이. 형식 오류·미래 날짜·150세 초과면 null. 2월 29일생은 평년 2/28 에는 한 살이 오르지 않고 3/1 에 오른다.
     * @param today 서울 오늘 yyyy-MM-dd
     */
    public static Integer ageOn(String birth, String today) {
        try {
            LocalDate b = LocalDate.parse(birth);
            LocalDate t = LocalDate.parse(today);
            if (b.isAfter(t)) {
                return null;
            }
            long years = ChronoUnit.YEARS.between(b, t);
            return years > 150 ? null : Integer.valueOf((int) years);
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** 사진 없이 만든다(기존 호출·시험 호환). */
    public static DocModel build(Map<String, Object> detail, String instName, int refNo, String baseDate) {
        return build(detail, instName, refNo, baseDate, null);
    }

    /**
     * @param baseDate  기준일 yyyy-MM-dd(문서를 만든 날, 서울 기준) — 나이 계산도 이 날 기준
     * @param photoJpeg 서버에 저장된 재인코딩 JPEG 본문. null 이거나 못 읽는 그림이면 사진 없이 만든다.
     */
    public static DocModel build(Map<String, Object> detail, String instName, int refNo, String baseDate, byte[] photoJpeg) {
        Map<String, Object> head = map(detail.get("head"));
        List<Map<String, Object>> edu = sortPeriod(listOf(head.get("education")));      // 카드(hc sortPeriod)와 같은 순서
        List<Map<String, Object>> career = sortPeriod(listOf(head.get("career")));
        boolean acting = Boolean.TRUE.equals(head.get("acting"));

        String name = str(head.get("name"));
        String pos = str(head.get("position"));
        String first = str(head.get("first_take_office"));
        String start = str(head.get("term_start"));
        String end = str(head.get("term_end"));
        String birth = str(head.get("birth_date"));
        Integer age = name.isEmpty() && pos.isEmpty() ? null : ageOn(birth, nz(baseDate));   // 카드와 같다 — 이름·직위가 모두 없으면 나이도 뺀다(qa 11-20 P3-1)

        Photo photo = planPhoto(head, photoJpeg);

        List<DocModel.Block> blocks = new ArrayList<DocModel.Block>();
        blocks.add(titlePara(instName, name, pos));

        // 줄 모음(■): 성명 → 나이 → 직위+임기(줄바꿈으로 이어 붙임) → 첫 취임일
        List<DocModel.Block> lines = new ArrayList<DocModel.Block>();
        if (!name.isEmpty()) {
            lines.add(square("성 명 : " + name));
        }
        if (age != null) {
            lines.add(square("만 " + age + "세"));
        }
        StringBuilder posText = new StringBuilder();
        if (!pos.isEmpty() || acting) {
            posText.append(pos).append(acting ? "(권한대행)" : "");
        }
        if (!start.isEmpty() || !end.isEmpty()) {
            posText.append(termText(start, end, posText.length() == 0 ? "" : "\n"));   // 글머리 아래 줄에 임기 '(시작 ~ 끝)'
        }
        if (posText.length() > 0) {
            lines.add(square(posText.toString()));
        }
        if (!first.isEmpty()) {
            lines.add(square("첫 취임일 : " + ymd(first)));
        }
        if (lines.isEmpty()) {
            lines.add(DocModel.Para.plain("확정된 값이 없습니다."));
        }

        if (photo != null && photo.picture != null) {   // 왼쪽 사진 + 오른쪽 줄 — 테두리 없는 2칸 표(50:50 = 각 85mm, 사진 상자 78mm 가 들어간다)
            List<List<DocModel.Cell>> row = new ArrayList<List<DocModel.Cell>>();
            row.add(Arrays.asList(
                    DocModel.Cell.of(Collections.<DocModel.Block>singletonList(photo.picture)),
                    DocModel.Cell.of(lines)));
            blocks.add(new DocModel.Table(2, new double[]{50, 50}, row, 0, true).withoutBorders());
        } else {
            if (photo != null) {   // 허용 조건 사진을 못 읽었을 때만 안내 한 줄(이용 조건 언급 없음)
                blocks.add(small(photo.notice));
            }
            blocks.addAll(lines);   // 사진이 없으면 표 없이 정보만
        }

        blocks.add(sectionPara("[ 학 력 ]"));
        blocks.addAll(eduList(edu));
        blocks.add(sectionPara("[ 경 력 ]"));
        blocks.addAll(careerBlocks(career));

        blocks.add(new DocModel.Para(Collections.singletonList(DocModel.Run.of("확정된 값만 담았습니다. 기준일 " + nz(baseDate))),
                DocModel.Bullet.NONE, 0, 8, DocModel.Align.LEFT).withSpacing(14, 0));
        return new DocModel(blocks).withPageBorder();
    }

    // ── 사진 ────────────────────────────────────────────────────────────

    private static final class Photo {
        DocModel.Picture picture;   // null 이면 notice 를 쓴다
        String notice;
    }

    /**
     * head.photo 가 없거나 이용 조건이 허용 밖이면 null(아무것도 쓰지 않는다). 허용 조건이면 그림, 못 읽으면 안내 한 줄.
     * 파일 읽기 실패·깨진 그림도 막지 않는다.
     */
    private static Photo planPhoto(Map<String, Object> head, byte[] jpeg) {
        Map<String, Object> p = map(head.get("photo"));
        if (p.isEmpty() || !PHOTO_LICENSE.contains(str(p.get("license_cd")))) {
            return null;
        }
        Photo out = new Photo();
        int[] wh = jpegSize(jpeg);
        if (wh == null) {
            out.notice = "사진을 불러오지 못해 넣지 않았습니다.";
            return out;
        }
        double scale = Math.min(PHOTO_W_MM / wh[0], PHOTO_H_MM / wh[1]);   // 78×81.8mm 상자 안에 비율을 지켜 맞춘다(찌그러뜨리지 않는다)
        try {
            out.picture = DocModel.Picture.jpeg(jpeg, wh[0] * scale, wh[1] * scale, "기관장 사진");
        } catch (IllegalArgumentException e) {
            out.notice = "사진을 불러오지 못해 넣지 않았습니다.";
        }
        return out;
    }

    /** JPEG 머리말(FF D8 FF)과 가로·세로만 읽는다(본문 디코딩 없음). 실패하면 null. */
    private static int[] jpegSize(byte[] b) {
        if (b == null || b.length < 4 || (b[0] & 0xFF) != 0xFF || (b[1] & 0xFF) != 0xD8 || (b[2] & 0xFF) != 0xFF) {
            return null;
        }
        try (ImageInputStream in = new MemoryCacheImageInputStream(new ByteArrayInputStream(b))) {   // 임시 파일을 쓰지 않는다(security S7)
            Iterator<ImageReader> it = ImageIO.getImageReadersByFormatName("jpeg");
            if (!it.hasNext()) {
                return null;
            }
            ImageReader r = it.next();
            try {
                r.setInput(in, true, true);
                int w = r.getWidth(0);
                int h = r.getHeight(0);
                return w > 0 && h > 0 && w <= 20000 && h <= 20000 ? new int[]{w, h} : null;
            } finally {
                r.dispose();
            }
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    // ── 문단 ────────────────────────────────────────────────────────────

    private static DocModel.Para small(String text) {
        return new DocModel.Para(Collections.singletonList(DocModel.Run.of(text)), DocModel.Bullet.NONE, 0, 8, DocModel.Align.LEFT);
    }

    /** '{기관명} {이름} {직위} Profile' — 가운데·굵게·밑줄(참고 양식, 사용자 11-20). 빈 값은 건너뛴다. */
    private static DocModel.Para titlePara(String inst, String name, String pos) {
        StringBuilder b = new StringBuilder();
        for (String s : new String[]{nz(inst).trim(), name, pos}) {
            if (!s.isEmpty()) {
                b.append(b.length() == 0 ? "" : " ").append(s);
            }
        }
        b.append(b.length() == 0 ? "" : " ").append("Profile");
        return new DocModel.Para(Collections.singletonList(DocModel.Run.bold(b.toString()).withUnderline()),
                DocModel.Bullet.NONE, 0, 18, DocModel.Align.CENTER).withSpacing(18, 18);
    }

    private static DocModel.Para sectionPara(String text) {
        return new DocModel.Para(Collections.singletonList(DocModel.Run.bold(text)), DocModel.Bullet.NONE, 0, 12,
                DocModel.Align.LEFT).withSpacing(12, 4);
    }

    private static DocModel.Para square(String text) {
        return new DocModel.Para(Collections.singletonList(DocModel.Run.of(text)), DocModel.Bullet.SQUARE, 0,
                DocModel.Para.DEFAULT_PT, DocModel.Align.LEFT).withSpacing(0, 8);
    }

    /** 임기 '(2023.12 ~ 2027.12)'. lead 는 앞에 붙일 줄바꿈. */
    private static String termText(String start, String end, String lead) {
        if (!start.isEmpty()) {
            return lead + "(" + ym(start) + " ~" + (end.isEmpty() ? "" : " " + ym(end)) + ")";
        }
        return lead + "(~ " + ym(end) + ")";
    }

    /** 학력: ■ 내용 (YYYY.MM~YYYY.MM) — 최근 것부터(sortPeriod 가 이미 정렬). */
    private static List<DocModel.Block> eduList(List<Map<String, Object>> items) {
        List<DocModel.Block> out = new ArrayList<DocModel.Block>();
        for (Map<String, Object> it : items) {
            String p = periodOf(it, false);
            String text = str(it.get("value")) + (p.isEmpty() ? "" : " (" + p + ")");
            out.add(DocModel.Para.of(DocModel.Bullet.SQUARE, 1, DocModel.Run.of(text)));
        }
        if (out.isEmpty()) {
            out.add(DocModel.Para.plain("확정된 값이 없습니다."));
        }
        return out;
    }

    /** 경력: 테두리 없는 2열 표(기간 | 내용)로 기간 열을 맞춘다. 기간이 없는 항목은 두 칸을 합쳐 값만. */
    private static List<DocModel.Block> careerBlocks(List<Map<String, Object>> items) {
        List<DocModel.Block> out = new ArrayList<DocModel.Block>();
        if (items.isEmpty()) {
            out.add(DocModel.Para.plain("확정된 값이 없습니다."));
            return out;
        }
        List<List<DocModel.Cell>> rows = new ArrayList<List<DocModel.Cell>>();
        for (Map<String, Object> it : items) {
            String p = periodOf(it, true);
            DocModel.Run val = DocModel.Run.of(str(it.get("value")));
            if (p.isEmpty()) {
                rows.add(Collections.singletonList(DocModel.Cell.of(Collections.<DocModel.Block>singletonList(
                        DocModel.Para.of(DocModel.Bullet.SQUARE, 0, val))).withSpan(2, 1)));
            } else {
                rows.add(Arrays.asList(
                        DocModel.Cell.of(Collections.<DocModel.Block>singletonList(DocModel.Para.of(DocModel.Bullet.SQUARE, 0, DocModel.Run.of(p)))),
                        DocModel.Cell.of(Collections.<DocModel.Block>singletonList(DocModel.Para.of(DocModel.Bullet.NONE, 0, val)))));
            }
        }
        out.add(new DocModel.Table(2, new double[]{34, 66}, rows, 0, true).withoutBorders());
        return out;
    }

    /** 기간: spaced 면 'A ~ B'(경력), 아니면 'A~B'(학력). 시작만이면 '~현재', 끝만이면 '~B', 둘 다 없으면 "". 저장값 'YYYY-MM' 을 'YYYY.MM' 으로, 연도만 값은 그대로. */
    private static String periodOf(Map<String, Object> i, boolean spaced) {
        String from = ym(str(i.get("from")).trim());
        String to = ym(str(i.get("to")).trim());
        String tilde = spaced ? " ~ " : "~";
        if (!from.isEmpty() && !to.isEmpty()) {
            return from + tilde + to;
        }
        if (!from.isEmpty()) {
            return from + tilde + "현재";
        }
        return to.isEmpty() ? "" : (spaced ? "~ " : "~") + to;
    }

    /** 'YYYY-MM' 또는 'YYYY-MM-DD' → 'YYYY.MM'. 그 밖(연도만 등)은 그대로. 표시할 때만 바꾼다. */
    private static String ym(String s) {
        return s.matches("\\d{4}-\\d{2}(-\\d{2})?") ? s.substring(0, 4) + "." + s.substring(5, 7) : s;
    }

    /** 'YYYY-MM-DD' → 'YYYY.MM.DD'(첫 취임일). 그 밖은 ym 과 같다. */
    private static String ymd(String s) {
        return s.matches("\\d{4}-\\d{2}-\\d{2}") ? s.replace('-', '.') : ym(s);
    }

    /** 최근 것이 위로 — 끝 연월이 없으면 현재 진행으로 보아 맨 위(시작도 없으면 맨 아래). 키·문자열 비교·안정 정렬 모두 headcard.js sortPeriod 와 같다. */
    private static List<Map<String, Object>> sortPeriod(List<Map<String, Object>> in) {
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>(in);
        Collections.sort(out, new Comparator<Map<String, Object>>() {   // Collections.sort 는 안정 정렬
            @Override
            public int compare(Map<String, Object> a, Map<String, Object> b) {
                return sortKey(b).compareTo(sortKey(a));   // 내림차순
            }
        });
        return out;
    }

    private static String sortKey(Map<String, Object> it) {
        String from = str(it.get("from")).trim();
        String to = str(it.get("to")).trim();
        return (!to.isEmpty() ? to : (!from.isEmpty() ? "9999-99" : "0000-00")) + "|" + from;
    }

    // ── 값 꺼내기 ───────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object o) {
        return o instanceof Map ? (Map<String, Object>) o : Collections.<String, Object>emptyMap();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> listOf(Object o) {
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        if (o instanceof List) {
            for (Object x : (List<Object>) o) {
                if (x instanceof Map) {
                    out.add((Map<String, Object>) x);
                }
            }
        }
        return out;
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
