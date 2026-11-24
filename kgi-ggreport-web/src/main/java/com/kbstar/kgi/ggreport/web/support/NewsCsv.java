package com.kbstar.kgi.ggreport.web.support;

import java.text.Normalizer;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 기관 관련 뉴스 반입 CSV(060, NEXT 107) 파서·검사기 — collector/SCHEMA.md ⑪-9 의 정본. 열·규칙을 바꾸면 ⑪-9·uploader 사본도 같은 변경에서 고친다.
 * 인코딩·따옴표·칸 공통 규칙은 PlanCsv 와 같다(디코딩·text·date 재사용). 오류는 InstitutionCsv.CsvFormatException — 사유에 행 번호만 싣고 칸 원문은 싣지 않는다.
 * 열은 이름으로 찾는다(순서 자유, 9열 모두 필수). 본문은 저장하지 않는다 — '요약'(직접 쓴 3줄·300자 이내)만 받는다.
 * 개인정보: 제목·언론사·요약에 Pii.scanExternal(NFKC·비ASCII 숫자 접힘) + 나이·생년 패턴(접은 사본)이 걸리면 파일 전체를 받지 않는다.
 * 기관장·공직자 이름은 허용, 일반인 이름은 서버가 못 가린다(표본 검수). 같은 제목·같은 URL 중복 거부.
 */
public final class NewsCsv {

    public static final Pattern FILE_NAME = Pattern.compile("([A-Za-z0-9-]{1,64})_(\\d{8})_news\\.csv");
    public static final int MAX_ROWS = 10;
    public static final int MAX_SUMMARY_LINES = 3;
    public static final int MAX_SUMMARY_CHARS = 300;
    private static final long PII_BUDGET_NANOS = 5_000_000_000L;   // 파일 한 개의 개인정보 검사 시간 상한
    private static final Pattern DATE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");
    static final String PII_MSG = "제목·언론사·요약에 개인정보(전화·이메일·주민번호·나이·생년)로 보이는 값이 있습니다.";
    /** 나이: 숫자 1~3자리 + 세·살. '세기·세대·세입·세출·세금·세트…' 같은 낱말은 뺀다('65세 이상'은 거부 — 팀 결정). */
    private static final Pattern AGE = Pattern.compile("(?<![0-9])[0-9]{1,3}\\s?(?:세|살)(?![기대입출금수계부무외목율액법정트포])");
    /** 생년: '65년생'·'1965년생'·'1965년 출생'. '2026년 생활임금'·'생산'은 통과. */
    private static final Pattern BIRTH = Pattern.compile("(?<![0-9])(?:[0-9]{2}|[0-9]{4})년(?:생(?![활산])|\\s?출생)");
    /** 괄호 나이: 한글 바로 뒤 '(65)' 두 자리 숫자. */
    private static final Pattern PAREN_AGE = Pattern.compile("[가-힣]\\s?\\(\\s?[1-9][0-9]\\s?\\)");

    static final String H_INST = "기관ID", H_FIELD = "분야", H_TITLE = "제목", H_PRESS = "언론사", H_PUBLISHED = "보도일",
            H_URL = "출처URL", H_SUMMARY = "요약", H_CHECKED = "확인일", H_COLLECTOR = "수집자";
    /** 계약 열(권장 순서). 서버는 이름으로 찾으므로 순서는 자유다 — uploader 사본과 함께 고친다. */
    public static final List<String> HEADERS = Collections.unmodifiableList(Arrays.asList(
            H_INST, H_FIELD, H_TITLE, H_PRESS, H_PUBLISHED, H_URL, H_SUMMARY, H_CHECKED, H_COLLECTOR));
    private static final Map<String, String> FIELDS;
    static {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("TREASURY", "금고");
        m.put("FINANCE", "재정");
        m.put("BUDGET", "예산");
        m.put("MAJOR_PROJECT", "주요사업");
        m.put("HEAD_NEWS", "기관장동정");
        FIELDS = Collections.unmodifiableMap(m);
    }

    public static final class Options {
        final String institutionId;
        final String fileDate;
        final LocalDate today;

        public Options(String institutionId, String fileDate, LocalDate today) {
            this.institutionId = institutionId;
            this.fileDate = fileDate;
            this.today = today;
        }
    }

    public static final class Row {
        public int row;
        public String fieldCd, title, press, publishedOn, url, summary, checkedOn, collectorAgent;
    }

    public static final class Result {
        public final List<Row> rows;

        Result(List<Row> rows) {
            this.rows = rows;
        }
    }

    private NewsCsv() {
    }

    public static String fieldName(String cd) {
        return FIELDS.get(cd);
    }

    public static Result parse(byte[] raw, Options opt) {
        CsvLimits.checkSize(raw.length);
        CsvLimits.Parsed parsed = CsvLimits.PLAN.parse(PlanCsv.decodeStrict(raw));
        List<List<String>> recs = parsed.records;
        if (recs.size() < 2) {
            throw new InstitutionCsv.CsvFormatException("뉴스 행이 없습니다.");
        }
        Map<String, Integer> col = header(recs.get(0));
        if (recs.size() - 1 > MAX_ROWS) {   // 행 검사(개인정보 검사)보다 먼저 — 최대 5,000행을 돌리지 않는다(security 하6)
            throw CsvLimits.bad(parsed.rawRows.get(MAX_ROWS + 1), "뉴스는 한 파일에 " + MAX_ROWS + "건까지입니다.");
        }
        int width = recs.get(0).size();
        long deadline = System.nanoTime() + PII_BUDGET_NANOS;
        List<Row> out = new ArrayList<>();
        Set<String> urls = new HashSet<>();
        Set<String> titles = new HashSet<>();
        String latest = null;
        for (int i = 1; i < recs.size(); i++) {
            List<String> r = recs.get(i);
            int rawRow = parsed.rawRows.get(i);
            if (r.size() != width) {
                throw CsvLimits.bad(rawRow, "칸 수가 머리행과 다릅니다.");
            }
            Row it = row(new Cells(r, col), rawRow, opt, deadline);
            if (!urls.add(it.url.toLowerCase(Locale.ROOT))) {
                throw CsvLimits.bad(rawRow, "같은 출처URL이 앞 행에 있습니다.");
            }
            if (!titles.add(it.title.toLowerCase(Locale.ROOT))) {
                throw CsvLimits.bad(rawRow, "같은 제목이 앞 행에 있습니다.");
            }
            if (latest == null || it.checkedOn.compareTo(latest) > 0) {
                latest = it.checkedOn;
            }
            out.add(it);
        }
        if (!opt.fileDate.equals(latest)) {
            throw new InstitutionCsv.CsvFormatException("파일 이름의 날짜가 확인일 중 가장 늦은 날과 다릅니다.");
        }
        return new Result(out);
    }

    private static Map<String, Integer> header(List<String> h) {
        Map<String, Integer> col = new HashMap<>();
        for (int i = 0; i < h.size(); i++) {
            String name = PlanCsv.text(h.get(i), 0, 20, false, false);
            if (!HEADERS.contains(name)) {
                throw new InstitutionCsv.CsvFormatException("header: " + (i + 1) + "번째 열 이름을 알 수 없습니다.");
            }
            if (col.put(name, i) != null) {
                throw new InstitutionCsv.CsvFormatException("header: " + (i + 1) + "번째 열 이름이 겹칩니다.");
            }
        }
        for (String req : HEADERS) {   // 9열 모두 필수 — 열 이름은 서버 고정값이라 사유에 실어도 된다
            if (!col.containsKey(req)) {
                throw new InstitutionCsv.CsvFormatException("header: 필수 열이 없습니다(" + req + ").");
            }
        }
        return col;
    }

    private static Row row(Cells c, int row, Options opt, long deadline) {
        Row it = new Row();
        it.row = row;
        String csvInst = PlanCsv.text(c.get(H_INST), row, 64, false, true);
        if (!PlanCsv.validId(csvInst) || !csvInst.equalsIgnoreCase(opt.institutionId)) {
            throw CsvLimits.bad(row, "기관ID가 반입 대상 기관과 다릅니다.");
        }
        it.fieldCd = field(c.get(H_FIELD), row);
        it.title = required(PlanCsv.text(c.get(H_TITLE), row, 200, false, true), row, "제목");
        it.press = required(PlanCsv.text(c.get(H_PRESS), row, 60, false, true), row, "언론사");
        it.checkedOn = PlanCsv.date(c.get(H_CHECKED), row, opt.today);
        it.publishedOn = published(c.get(H_PUBLISHED), row, LocalDate.parse(it.checkedOn));
        String url = PlanCsv.text(c.get(H_URL), row, SafeUrl.MAX, false, false);
        if (url.isEmpty() || !SafeUrl.isHttp(url)) {
            throw CsvLimits.bad(row, "출처URL은 http 또는 https 주소(500자 이내, 계정정보 없음)여야 합니다.");
        }
        it.url = url;
        String agent = PlanCsv.text(c.get(H_COLLECTOR), row, 60, false, false);
        if (agent.isEmpty() || !PlanCsv.AGENT.matcher(agent).matches()) {
            throw CsvLimits.bad(row, "수집자는 수집 프로그램 식별자(영문자로 시작, 예 news-collector/1.0)여야 합니다.");
        }
        it.collectorAgent = agent;
        it.summary = summary(PlanCsv.text(c.get(H_SUMMARY), row, CsvLimits.MAX_CELL_CHARS, true, true), row, it.title);
        pii(it.title, row, deadline);
        pii(it.press, row, deadline);
        pii(it.summary, row, deadline);
        return it;
    }

    private static String field(String raw, int row) {
        String v = PlanCsv.text(raw, row, 100, false, false);
        if (v.isEmpty()) {
            throw CsvLimits.bad(row, "분야 칸이 비어 있습니다.");
        }
        if (FIELDS.containsKey(v)) {
            return v;
        }
        for (Map.Entry<String, String> e : FIELDS.entrySet()) {
            if (e.getValue().equals(v)) {
                return e.getKey();
            }
        }
        throw CsvLimits.bad(row, "분야 값이 허용값이 아닙니다.");
    }

    /** 확인일 − 1년 ≤ 보도일 ≤ 확인일. */
    private static String published(String raw, int row, LocalDate checked) {
        String v = PlanCsv.text(raw, row, 10, false, false);
        try {
            if (DATE.matcher(v).matches()) {
                LocalDate d = LocalDate.parse(v);
                if (!d.isBefore(checked.minusYears(1)) && !d.isAfter(checked)) {
                    return v;
                }
            }
        } catch (DateTimeException ignored) {
            // 아래 고정 문구로
        }
        throw CsvLimits.bad(row, "보도일은 확인일 이전 1년 안의 YYYY-MM-DD 여야 합니다.");
    }

    /** 빈 줄을 뺀 1~3줄, 줄바꿈을 뺀 글자 합 300자 이내. 제목과 같은 문장 거부. 저장 값 = 줄마다 앞뒤 공백을 자르고 '\n' 으로 이은 것. */
    private static String summary(String raw, int row, String title) {
        List<String> lines = new ArrayList<>();
        for (String ln : raw.split("\n")) {
            String t = ln.trim();
            if (!t.isEmpty()) {
                lines.add(t);
            }
        }
        if (lines.isEmpty()) {
            throw CsvLimits.bad(row, "요약 칸이 비어 있습니다.");
        }
        if (lines.size() > MAX_SUMMARY_LINES) {
            throw CsvLimits.bad(row, "요약은 " + MAX_SUMMARY_LINES + "줄 이내여야 합니다.");
        }
        int chars = 0;
        String st = squash(title);
        for (String ln : lines) {
            chars += ln.length();
            if (!st.isEmpty() && st.equals(squash(ln))) {
                throw CsvLimits.bad(row, "요약이 제목과 같습니다. 직접 쓴 요약을 적으세요.");
            }
        }
        if (chars > MAX_SUMMARY_CHARS) {
            throw CsvLimits.bad(row, "요약은 " + MAX_SUMMARY_CHARS + "자 이내여야 합니다.");
        }
        return String.join("\n", lines);
    }

    private static void pii(String text, int row, long deadline) {
        try {
            if (!Pii.scanExternal(text, deadline).isEmpty()) {
                throw CsvLimits.bad(row, PII_MSG);
            }
        } catch (Pii.ScanTimeoutException e) {
            throw CsvLimits.bad(row, PII_MSG);   // 확인하지 못하면 받지 않는다(PlanCollectService.reason 선례)
        }
        String f = fold(text);
        if (AGE.matcher(f).find() || BIRTH.matcher(f).find() || PAREN_AGE.matcher(f).find()) {
            throw CsvLimits.bad(row, PII_MSG);
        }
    }

    /** NFKC(전각 숫자·괄호·NBSP 접힘) 뒤 비ASCII 십진 숫자(아랍-인도 등)를 ASCII 로. 검사용 사본이며 저장은 원문이다. */
    private static String fold(String text) {
        String s = Normalizer.normalize(text, Normalizer.Form.NFKC);
        StringBuilder b = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); ) {
            int cp = s.codePointAt(i);
            i += Character.charCount(cp);
            if (Character.getType(cp) == Character.DECIMAL_DIGIT_NUMBER) {
                b.append((char) ('0' + Character.digit(cp, 10)));
            } else {
                b.appendCodePoint(cp);
            }
        }
        return b.toString();
    }

    /** 글자·숫자만 남긴 비교용 값(대소문자·공백·문장부호 차이로 '같은 문장'을 피하지 못하게). */
    private static String squash(String s) {
        String n = Normalizer.normalize(s, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
        StringBuilder b = new StringBuilder(n.length());
        for (int i = 0; i < n.length(); ) {
            int cp = n.codePointAt(i);
            i += Character.charCount(cp);
            if (Character.isLetterOrDigit(cp)) {
                b.appendCodePoint(cp);
            }
        }
        return b.toString();
    }

    private static String required(String v, int row, String label) {
        if (v.isEmpty()) {
            throw CsvLimits.bad(row, label + " 칸이 비어 있습니다.");
        }
        return v;
    }

    private static final class Cells {
        final List<String> cells;
        final Map<String, Integer> col;

        Cells(List<String> cells, Map<String, Integer> col) {
            this.cells = cells;
            this.col = col;
        }

        String get(String h) {
            Integer i = col.get(h);
            return i == null ? "" : cells.get(i);
        }
    }
}
