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
 * 사용자 참고 양식(11-20): 쪽 테두리, 가운데·굵게·밑줄 제목 「{기관명} {이름} {직위} Profile」(22pt), 왼쪽 사진·오른쪽 ■ 줄(14pt, 테두리 없는 표),
 * [ 학 력 ]·[ 경 력 ](16pt 굵게). 학력·경력은 표 없이 한 줄씩 '■ 내용'(12pt, ■ 뒤 한 칸, 줄바꿈하면 내어쓰기)이다(사용자 11-24).
 * 기본(요약본)은 날짜가 없고, 날짜 포함 모드는 내용 바로 뒤 괄호에 '(2018.07 ~ 2022.06)'·'(2018)'·'(2026.07 ~ 현재)'(경력 현직만)·'(2018 ~ 미상)'(끝을 모름)·'(2026.01)'을 붙인다 — 확인 안 되는 날짜는 적지 않는다.
 * 글자 크기는 줄이지 않는다(사용자 11-23). 확정된 칸만 쓰고, 값이 없는 절은 머리째 생략한다.
 * <b>출처·이용 조건·기준일·안내 문구는 문서에 쓰지 않는다</b>(사용자 11-23: 웹 화면에서만). 사진을 못 넣은 사정은 문서가 아니라
 * 응답 머리 X-Head-Photo(included|none|failed)로 알린다 — {@link Built#photoStatus()}.
 * 기준일(baseDate)은 나이 계산에만 쓴다. 나이는 '만 n세'만 쓴다 — 생년월일 날짜는 어디에도 넣지 않는다(사용자 11-20).
 * 후보 값·사번(created_by)·이전 기관장은 넣지 않는다.
 * <p>사진은 1장 맞춤을 위해 4단계 상자(S0 78×81.8 … S3 88×92.3mm, 비율 78:81.8) 중 들어가는 가장 큰 것을 고른다({@link #chooseStage}).
 * 사진은 그 상자를 꽉 채우고 넘치는 쪽을 Word 자르기(srcRect)로 잘라낸다(cover — 사용자 11-23 '최소 78×81.8'). 잘림이 한 축 35%를 넘는 극단 비율은 자르지 않고 상자 안에 비율대로 넣는다(contain).
 * 어느 단계도 안 들어가면 S0 로 두고, 그래도 넘치면 경력을(경력이 0줄이 되면 학력을) 표 맨 아래(가장 오래된) 줄부터 뺀다(글자는 줄이지 않음 — 사용자 11-23 밤 '어떤 경우에도 1장').
 * 뺀 줄 수는 응답 머리 X-Head-Trimmed-Career·X-Head-Trimmed-Edu 로 알린다.
 */
public final class HeadDocBuilder {

    /**
     * KOGL1(공공누리 제1유형)은 원래 출처 표시가 이용 조건이다. 문서에서 출처를 뺐지만 사용자가 11-23 'ⓒ 출처 없이 넣기'로 결정했다
     * — 출처 표시 의무 위반 위험은 사용자가 수용(결정 기록). 되돌리려면 false.
     */
    private static final boolean WORD_PHOTO_KOGL1 = true;

    /**
     * 사용자 11-24 "무조건 넣어": 이용 조건(LOCAL_ONLY·KOGL2~4·PRESS_PERMIT·모르는 코드 포함)과 관계없이 사진이 있으면 Word에 넣는다.
     * 언론·나무위키 등 이용 허락 미확인 사진이 Word 파일로 밖에 나갈 수 있는 위험은 사용자가 수용(결정 기록). 되돌리려면 false — 그때는 PHOTO_LICENSE 만.
     */
    private static final boolean WORD_PHOTO_ANY_LICENSE = true;

    /** WORD_PHOTO_ANY_LICENSE=false 일 때 문서에 사진을 넣어도 되는 이용 조건 코드. */
    private static final Set<String> PHOTO_LICENSE = new HashSet<String>();

    private static boolean licenseOk(Object code) {
        return WORD_PHOTO_ANY_LICENSE || PHOTO_LICENSE.contains(str(code));
    }

    /** 응답 머리 X-Head-Photo 값. none=사진 없음·허용 밖, failed=허용 조건인데 못 읽음. */
    public static final String PHOTO_INCLUDED = "included";
    public static final String PHOTO_NONE = "none";
    public static final String PHOTO_FAILED = "failed";

    // 사진 상자 단계(가로×세로 mm, 비율 78:81.8 유지)
    static final double[] STAGE_W_MM = {78, 82, 85, 88};
    static final double[] STAGE_H_MM = {81.8, 86.0, 89.1, 92.3};

    /** 상자를 꽉 채울 때 한 축에서 잘라내도 되는 최대 비율. 넘으면 자르지 않고 상자 안에 비율대로 넣는다(contain). */
    static final double MAX_CROP = 0.35;
    /** 세로로 긴 사진은 머리 위 여유를 덜 자른다 — 잘라낼 양의 30% 를 위, 70% 를 아래에서. */
    static final double TOP_SHARE = 0.30;

    /**
     * 사진(w×h px)을 상자(boxW×boxH mm)에 꽉 채울 때 자를 비율 {왼쪽, 위, 오른쪽, 아래}(각 0~1).
     * 비율이 같거나(자를 것 없음) 잘림이 {@value #MAX_CROP} 를 넘으면 null — 호출부는 contain 으로 넣는다.
     */
    static double[] cropFor(double boxW, double boxH, int w, int h) {
        double boxR = boxW / boxH;
        double r = (double) w / h;
        if (Math.abs(r - boxR) < 1e-6) {
            return null;
        }
        if (r < boxR) {   // 세로로 긴 사진: 폭을 맞추고 위아래를 자른다
            double f = 1 - r / boxR;
            return f > MAX_CROP ? null : new double[]{0, f * TOP_SHARE, 0, f * (1 - TOP_SHARE)};
        }
        double f = 1 - boxR / r;   // 가로로 긴 사진: 높이를 맞추고 좌우를 가운데 기준으로 자른다
        return f > MAX_CROP ? null : new double[]{f / 2, 0, f / 2, 0};
    }

    // 1장 맞춤 추정(본문 170×257mm, 목표 예산 247mm). 맑은 고딕 행간 ≈ 1.33×글자.
    static final double BODY_W_MM = 170;
    static final double BUDGET_MM = 247;
    private static final double TITLE_MM = 23;
    private static final double TITLE_EXTRA_MM = 10.3;   // 22pt 제목이 두 줄이 되면 줄마다(qa 11-23 P2-1)
    private static final double TITLE_CAP = 21;          // 170mm ÷ 22pt 한글 1자 ≈ 7.8mm
    private static final double INFO_LINE_MM = 9.5;      // 14pt 줄 + 뒤 8pt
    private static final double INFO_EXTRA_MM = 6.6;     // 줄바꿈 추가마다
    private static final double SECTION_MM = 13;         // 절 머리(16pt, 앞 12 뒤 4)
    private static final double ROW_MM = 7.0;            // 학력·경력 한 줄(12pt 줄 5.6 + 뒤 3pt + 여유)
    private static final double ROW_EXTRA_MM = 5.6;      // 줄바꿈 추가마다
    private static final double CONTENT_CAP = 34;        // 한 줄 가중 글자수 ≈ (본문 170mm − 내어쓰기·■ 약 5.5mm) ÷ 12pt 한글 4.23mm ≈ 38.9 — Word는 어절 단위로 줄을 바꿔 경계 줄이 1줄 더 늘 수 있어 34로 여유(qa a79159d6 P2-1)
    private static final double CHAR_MM = 4.94;          // 14pt 한글 1자 폭
    private static final double INFO_PAD_MM = 3.5 + 4.9; // 칸 여백 3.5 + 14pt 내어쓰기 4.9

    static {
        PHOTO_LICENSE.add("INST_PERMIT");
        if (WORD_PHOTO_KOGL1) {
            PHOTO_LICENSE.add("KOGL1");
        }
    }

    private HeadDocBuilder() {
    }

    /** 문서 모델 + 사진 상태. */
    public static final class Built {
        private final DocModel model;
        private final String photoStatus;
        private final int careerDropped;
        private final int eduDropped;

        Built(DocModel model, String photoStatus) {
            this(model, photoStatus, 0, 0);
        }

        Built(DocModel model, String photoStatus, int careerDropped, int eduDropped) {
            this.model = model;
            this.photoStatus = photoStatus;
            this.careerDropped = careerDropped;
            this.eduDropped = eduDropped;
        }

        public DocModel model() {
            return model;
        }

        /** included | none | failed */
        public String photoStatus() {
            return photoStatus;
        }

        /** 1장 맞춤 때문에 문서에서 뺀 경력 줄 수(오래된 것부터). */
        public int careerDropped() {
            return careerDropped;
        }

        /** 경력을 다 빼고도 넘칠 때만 뺀 학력 줄 수(극단 경우). */
        public int eduDropped() {
            return eduDropped;
        }
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
        return !photo.isEmpty() && licenseOk(photo.get("license_cd")) && photoIdOf(detail) != null;
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

    /** 문서 모델만 필요할 때(시험 호환). 사진 상태는 {@link #buildDoc} 로 본다. */
    public static DocModel build(Map<String, Object> detail, String instName, String baseDate, byte[] photoJpeg) {
        return buildDoc(detail, instName, baseDate, photoJpeg).model();
    }

    /**
     * @param baseDate  기준일 yyyy-MM-dd(문서를 만든 날, 서울 기준) — 나이 계산에만 쓴다(문서에 적지 않는다)
     * @param photoJpeg 서버에 저장된 재인코딩 JPEG 본문. null 이거나 못 읽는 그림이면 사진 없이 만든다(상태 failed).
     */
    public static Built buildDoc(Map<String, Object> detail, String instName, String baseDate, byte[] photoJpeg) {
        return buildDoc(detail, instName, baseDate, photoJpeg, false);   // 기본 = 요약본(날짜 없음)
    }

    /** @param withDates true 면 학력·경력 내용 뒤 괄호에 날짜(연도 또는 YYYY.MM)를 붙인다. false(기본)면 날짜 없이 내용만(사용자 11-24 요약본/날짜정보 포함). */
    public static Built buildDoc(Map<String, Object> detail, String instName, String baseDate, byte[] photoJpeg, boolean withDates) {
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

        // 정보 줄 글자(■ 는 렌더러가 붙인다): 성명 → 나이 → 직위+임기(줄바꿈으로 이어 붙임) → 첫 취임일
        List<String> infoTexts = new ArrayList<String>();
        if (!name.isEmpty()) {
            infoTexts.add("성 명 : " + name);
        }
        if (age != null) {
            infoTexts.add("만 " + age + "세");
        }
        StringBuilder posText = new StringBuilder();
        if (!pos.isEmpty() || acting) {
            posText.append(pos).append(acting ? "(권한대행)" : "");
        }
        if (!start.isEmpty() || !end.isEmpty()) {
            posText.append(termText(start, end, posText.length() == 0 ? "" : "\n"));   // 글머리 아래 줄에 임기 '(시작 ~ 끝)'
        }
        if (posText.length() > 0) {
            infoTexts.add(posText.toString());
        }
        if (!first.isEmpty()) {
            infoTexts.add("첫 취임일 : " + ymd(first));
        }

        Photo photo = planPhoto(head, photoJpeg);
        boolean hasPhoto = photo != null && !photo.failed;
        DocModel.Para title = titlePara(instName, name, pos);
        String titleStr = titleText(instName, name, pos);

        // 1장 맞춤(사용자 11-23 Q-2026-11-23-17·18 '어떤 경우에도 1장'): 사진은 S0 가 최소. 그래도 넘치면 경력을 오래된 것부터 뺀다.
        // 경력이 0줄이 돼도 넘치면 마지막 수단으로 학력도 오래된 것부터 뺀다. 둘 다 0줄이면 멈춘다(제목·정보·사진만으로 넘치면 줄일 것이 없음).
        int careerDropped = 0;
        int eduDropped = 0;
        while (estimateMm(titleStr, 0, infoTexts, hasPhoto, contentsOf(edu, withDates), contentsOf(career, withDates)) > BUDGET_MM) {
            if (!career.isEmpty()) {
                career.remove(oldestIndex(career));
                careerDropped++;
            } else if (!edu.isEmpty()) {
                edu.remove(oldestIndex(edu));
                eduDropped++;
            } else {
                break;
            }
        }
        List<String> eduContents = contentsOf(edu, withDates);
        List<String> careerContents = contentsOf(career, withDates);
        int stage = hasPhoto ? chooseStage(titleStr, infoTexts, true, eduContents, careerContents) : 0;

        List<DocModel.Block> blocks = new ArrayList<DocModel.Block>();
        blocks.add(title);

        List<DocModel.Block> lines = new ArrayList<DocModel.Block>();
        for (String t : infoTexts) {
            lines.add(square(t));
        }

        String status = PHOTO_NONE;
        if (hasPhoto) {
            double[] crop = cropFor(STAGE_W_MM[stage], STAGE_H_MM[stage], photo.w, photo.h);   // 상자를 꽉 채우고 넘치는 쪽을 자른다(사용자 11-23 '최소 78×81.8')
            DocModel.Picture pic = null;
            try {
                if (crop != null) {
                    pic = DocModel.Picture.jpeg(photo.jpeg, STAGE_W_MM[stage], STAGE_H_MM[stage], "기관장 사진")
                            .withCrop(crop[0], crop[1], crop[2], crop[3]);
                } else {   // 극단 비율: 자르지 않고 상자 안에 비율대로(찌그러뜨리지 않는다)
                    double scale = Math.min(STAGE_W_MM[stage] / photo.w, STAGE_H_MM[stage] / photo.h);
                    pic = DocModel.Picture.jpeg(photo.jpeg, photo.w * scale, photo.h * scale, "기관장 사진");
                }
            } catch (IllegalArgumentException e) {
                pic = null;   // planPhoto 가 크기·바이트를 미리 거르므로 거의 없다
            }
            if (pic != null) {
                if (lines.isEmpty()) {
                    lines.add(DocModel.Para.plain(""));   // 정보 줄 0개면 빈칸(표 칸에는 문단이 하나 필요)
                }
                double pct = (STAGE_W_MM[stage] + 8) / BODY_W_MM * 100;   // 사진칸 % = (폭+8)/170×100
                List<List<DocModel.Cell>> row = new ArrayList<List<DocModel.Cell>>();
                row.add(Arrays.asList(
                        DocModel.Cell.of(Collections.<DocModel.Block>singletonList(pic)),
                        DocModel.Cell.of(lines)));
                blocks.add(new DocModel.Table(2, new double[]{pct, 100 - pct}, row, 0, true).withoutBorders());
                status = PHOTO_INCLUDED;
            } else {
                blocks.addAll(lines);
                status = PHOTO_FAILED;
            }
        } else {
            blocks.addAll(lines);   // 사진이 없으면 표 없이 정보만
            if (photo != null) {
                status = PHOTO_FAILED;   // 허용 조건인데 못 읽음
            }
        }

        if (!edu.isEmpty()) {
            blocks.add(sectionPara("[ 학 력 ]"));
            blocks.addAll(lineParas(edu, withDates));
        }
        if (!career.isEmpty()) {
            blocks.add(sectionPara("[ 경 력 ]"));
            blocks.addAll(lineParas(career, withDates));
        }
        return new Built(new DocModel(blocks).withPageBorder(), status, careerDropped, eduDropped);
    }

    // ── 1장 맞춤 단계 선택(추정) ──────────────────────────────────────────

    /**
     * 들어가는 가장 큰 사진 단계(0~3). 어느 단계도 예산({@value #BUDGET_MM}mm)에 안 들어가면 0. 그래도 넘치면 buildDoc 이 경력(이어서 학력)을 표 맨 아래 줄부터 뺀다(사용자 11-23 밤).
     * 추정치이며 Word 가 실제로 그리는 쪽 수와 다를 수 있다.
     */
    static int chooseStage(List<String> infoTexts, boolean hasPhoto, List<String> eduContents, List<String> careerContents) {
        return chooseStage("", infoTexts, hasPhoto, eduContents, careerContents);
    }

    /** title 은 문서 제목 글자 — 22pt 한 줄(약 21자)을 넘으면 줄 수만큼 높이를 더한다. */
    static int chooseStage(String title, List<String> infoTexts, boolean hasPhoto, List<String> eduContents, List<String> careerContents) {
        for (int s = STAGE_W_MM.length - 1; s >= 1; s--) {
            if (estimateMm(title, s, infoTexts, hasPhoto, eduContents, careerContents) <= BUDGET_MM) {
                return s;
            }
        }
        return 0;
    }

    static double estimateMm(int stage, List<String> infoTexts, boolean hasPhoto, List<String> eduContents, List<String> careerContents) {
        return estimateMm("", stage, infoTexts, hasPhoto, eduContents, careerContents);
    }

    /** 단계 s 일 때 문서 높이 추정(mm). hasPhoto=false 면 정보 줄만(전체 폭). */
    static double estimateMm(String title, int stage, List<String> infoTexts, boolean hasPhoto, List<String> eduContents, List<String> careerContents) {
        double infoMm = hasPhoto ? BODY_W_MM - (STAGE_W_MM[stage] + 8) : BODY_W_MM;
        double cap = (infoMm - INFO_PAD_MM) / CHAR_MM;
        double info = 0;
        for (String t : infoTexts) {
            info += INFO_LINE_MM + INFO_EXTRA_MM * (wrapLines(t, cap) - 1);
        }
        double h = TITLE_MM + TITLE_EXTRA_MM * (wrapLines(title, TITLE_CAP) - 1);
        h += hasPhoto ? Math.max(STAGE_H_MM[stage], info) + 1 : info;
        h += sectionMm(eduContents) + sectionMm(careerContents);
        return h;
    }

    private static double sectionMm(List<String> contents) {
        if (contents.isEmpty()) {
            return 0;   // 0건이면 절 머리째 생략
        }
        double h = SECTION_MM;   // 표가 없어 표 뒤 빈 문단도 없다
        for (String c : contents) {
            h += ROW_MM + ROW_EXTRA_MM * (wrapLines(c, CONTENT_CAP) - 1);
        }
        return h;
    }

    /** 줄 수(최소 1). '\n' 은 줄 나눔, 한글 등 넓은 글자 1·ASCII(영숫자·공백·기호) 0.5 가중으로 cap 을 넘으면 줄을 바꾼다. */
    static int wrapLines(String text, double cap) {
        int total = 0;
        for (String seg : nz(text).split("\n", -1)) {
            int lines = 1;
            double cur = 0;
            for (int i = 0; i < seg.length(); i++) {
                double w = seg.charAt(i) < 0x80 ? 0.5 : 1.0;
                if (cur + w > cap) {
                    lines++;
                    cur = w;
                } else {
                    cur += w;
                }
            }
            total += lines;
        }
        return total;
    }

    // ── 사진 ────────────────────────────────────────────────────────────

    private static final class Photo {
        byte[] jpeg;
        int w;
        int h;
        boolean failed;
    }

    /**
     * head.photo 가 없거나 이용 조건이 허용 밖이면 null(상태 none). 허용 조건이면 Photo — 못 읽으면 failed=true.
     * 파일 읽기 실패·깨진 그림도 막지 않는다.
     */
    private static Photo planPhoto(Map<String, Object> head, byte[] jpeg) {
        Map<String, Object> p = map(head.get("photo"));
        if (p.isEmpty() || !licenseOk(p.get("license_cd"))) {
            return null;
        }
        Photo out = new Photo();
        int[] wh = jpeg == null || jpeg.length > DocModel.Picture.MAX_BYTES ? null : jpegSize(jpeg);
        if (wh == null) {
            out.failed = true;
            return out;
        }
        out.jpeg = jpeg;
        out.w = wh[0];
        out.h = wh[1];
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

    /** '{기관명} {이름} {직위} Profile' — 22pt 가운데·굵게·밑줄(참고 양식, 사용자 11-20·11-23). 빈 값은 건너뛴다. */
    private static String titleText(String inst, String name, String pos) {
        StringBuilder b = new StringBuilder();
        for (String s : new String[]{nz(inst).trim(), name, pos}) {
            if (!s.isEmpty()) {
                b.append(b.length() == 0 ? "" : " ").append(s);
            }
        }
        return b.append(b.length() == 0 ? "" : " ").append("Profile").toString();
    }

    private static DocModel.Para titlePara(String inst, String name, String pos) {
        return new DocModel.Para(Collections.singletonList(DocModel.Run.bold(titleText(inst, name, pos)).withUnderline()),
                DocModel.Bullet.NONE, 0, 22, DocModel.Align.CENTER).withSpacing(18, 18);
    }

    /** 절 제목 16pt 굵게. */
    private static DocModel.Para sectionPara(String text) {
        return new DocModel.Para(Collections.singletonList(DocModel.Run.bold(text)), DocModel.Bullet.NONE, 0, 16,
                DocModel.Align.LEFT).withSpacing(12, 4);
    }

    /** 사진 옆 정보 줄 14pt ■. */
    private static DocModel.Para square(String text) {
        return new DocModel.Para(Collections.singletonList(DocModel.Run.of(text)), DocModel.Bullet.SQUARE, 0,
                14, DocModel.Align.LEFT).withSpacing(0, 8);
    }

    /** 임기 '(2023.12 ~ 2027.12)'. lead 는 앞에 붙일 줄바꿈. */
    private static String termText(String start, String end, String lead) {
        if (!start.isEmpty()) {
            return lead + "(" + ym(start) + " ~" + (end.isEmpty() ? "" : " " + ym(end)) + ")";
        }
        return lead + "(~ " + ym(end) + ")";
    }

    /** 학력·경력 한 줄 12pt — '■' + 탭은 DocxKit 이 붙이고(■ 뒤 한 칸 안팎) 둘째 줄부터는 내어쓰기(left=hanging=312twip, 디자인 11-25). 사용자 11-24 "띄어쓰기 1~2개 정도". */
    private static List<DocModel.Block> lineParas(List<Map<String, Object>> items, boolean withDates) {
        List<DocModel.Block> out = new ArrayList<DocModel.Block>();
        for (Map<String, Object> it : items) {
            out.add(new DocModel.Para(Collections.singletonList(DocModel.Run.of(lineText(it, withDates))), DocModel.Bullet.SQUARE, 0, 12,
                    DocModel.Align.LEFT).withSpacing(0, 3));
        }
        return out;
    }

    /** 한 줄 글자('■ ' 제외). 요약본은 내용만 — '현재'·'미상'·연도·연월·괄호를 한 글자도 붙이지 않는다(사용자 11-24·11-25 재확인). 날짜 포함은 내용 + 괄호(앞 공백 없음) — 사용자 11-24 '마산공업고등학교 졸업(2026.01)'. */
    static String lineText(Map<String, Object> it, boolean withDates) {
        String v = str(it.get("value")).trim();
        return withDates ? v + datesOf(it) : v;
    }

    /**
     * 날짜 괄호. 저장값 YYYY / YYYY-MM(-DD) 를 연도 또는 'YYYY.MM'(일은 버림)으로. 형식 밖 값은 '확인 안 됨'으로 보아 적지 않는다.
     * 둘 다: '(A ~ B)', 같으면 '(A)' · 시작만: 경력 현직이면 '(A ~ 현재)', 그 밖(학력 포함)은 '(A ~ 미상)' · 끝만: '(B)' · 둘 다 없음: "".
     * 확인하지 않은 '현재'를 주장하지 않는다(기획 11-25 원칙 1) — 현직은 상세의 current=true 인 줄뿐이다.
     */
    private static String datesOf(Map<String, Object> it) {
        String from = dateText(str(it.get("from")));
        String to = dateText(str(it.get("to")));
        if (!from.isEmpty() && !to.isEmpty()) {
            return from.equals(to) ? "(" + from + ")" : "(" + from + " ~ " + to + ")";
        }
        if (!from.isEmpty()) {
            return "(" + from + (isCurrent(it) ? " ~ 현재)" : " ~ 미상)");
        }
        return to.isEmpty() ? "" : "(" + to + ")";
    }

    /** 현직 줄 — current 가 참이고 끝이 비었다(끝이 있으면 현직으로 보지 않는다). 학력에는 서버가 current 를 싣지 않는다. */
    static boolean isCurrent(Map<String, Object> it) {
        return Boolean.TRUE.equals(it.get("current")) && str(it.get("to")).trim().isEmpty();
    }

    private static String dateText(String raw) {
        String s = raw.trim();
        return s.matches("\\d{4}(-\\d{2}(-\\d{2})?)?") ? ym(s) : "";
    }

    /** 'YYYY-MM' 또는 'YYYY-MM-DD' → 'YYYY.MM'. 그 밖(연도만 등)은 그대로. 표시할 때만 바꾼다. */
    private static String ym(String s) {
        return s.matches("\\d{4}-\\d{2}(-\\d{2})?") ? s.substring(0, 4) + "." + s.substring(5, 7) : s;
    }

    /** 'YYYY-MM-DD' → 'YYYY.MM.DD'(첫 취임일). 그 밖은 ym 과 같다. */
    private static String ymd(String s) {
        return s.matches("\\d{4}-\\d{2}-\\d{2}") ? s.replace('-', '.') : ym(s);
    }

    /** 최근 것이 위로 — 현직은 맨 위, 끝난 줄은 끝 연월, 끝 미상은 시작 연월로 끝난 줄과 섞고, 날짜가 없으면 맨 아래. 키(연도만은 ymKey로 맞춤)·문자열 비교·안정 정렬 모두 headcard.js sortPeriod 와 같아야 한다. */
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
        String head;
        if (isCurrent(it)) {
            head = "9999-99";              // 현직 — 맨 위, 1장 맞춤에서 가장 늦게 빠진다
        } else if (!to.isEmpty()) {
            head = ymKey(to, true);        // 끝난 줄 — 끝 연월
        } else if (!from.isEmpty()) {
            head = ymKey(from, false);     // 끝 미상 — 시작 연월로 끝난 줄과 섞는다(빼는 순서도 같다)
        } else {
            head = "0000-00";              // 날짜 없음 — 맨 아래, 가장 먼저 빠진다
        }
        return head + "|" + ymKey(from, false);
    }

    /** 정렬용 — 연도만이면 끝은 YYYY-12, 시작은 YYYY-01 로 맞춘다(headcard.js ym() 과 같은 규칙, 사용자 11-24 연도 허용 · qa a910bf7a P3-1). */
    private static String ymKey(String s, boolean endSide) {
        return s.matches("\\d{4}") ? s + (endSide ? "-12" : "-01") : s;
    }

    private static List<String> contentsOf(List<Map<String, Object>> items, boolean withDates) {
        List<String> out = new ArrayList<String>();
        for (Map<String, Object> it : items) {
            out.add(lineText(it, withDates));   // 높이 추정도 실제 출력 글자(날짜 괄호 포함)로
        }
        return out;
    }

    /**
     * 1장 맞춤에서 뺄 줄 — 표 순서({@link #sortPeriod})의 맨 아래 줄. 현직 줄(current)은 맨 위라 마지막까지 남고
     * (qa 11-23 P2-1), 끝 미상 줄은 시작 연월 자리에서 끝난 줄과 같은 순서로 빠지며, 날짜가 전혀 없는 줄은 가장 먼저 빠진다. 같으면 표에서 더 아래 줄.
     */
    static int oldestIndex(List<Map<String, Object>> items) {
        int best = 0;
        String bestKey = sortKey(items.get(0));
        for (int i = 1; i < items.size(); i++) {
            String k = sortKey(items.get(i));
            if (k.compareTo(bestKey) <= 0) {
                best = i;
                bestKey = k;
            }
        }
        return best;
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
