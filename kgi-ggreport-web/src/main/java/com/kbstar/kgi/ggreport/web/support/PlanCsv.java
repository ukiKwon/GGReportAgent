package com.kbstar.kgi.ggreport.web.support;

import java.math.BigDecimal;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 기관 사업계획 반입 CSV(034) 파서·검사기. 1행 = 사업 1개, 문서 칸은 행마다 반복.
 * 엄격 UTF-8(BOM 허용, cp949 폴백 없음 — 보안 조건 3). 상한은 {@link CsvLimits}. 제어·서식 문자 거부, = + - @ 로 시작하는 글 칸 거부(조건 6ⓐ).
 * 오류는 {@link InstitutionCsv.CsvFormatException} — 사유에 행 번호만 싣고 칸 원문은 싣지 않는다(조건 9).
 * 출처 URL 빈칸은 {@link Options} 의 seed(서버 고정 시드 경로)일 때만 허용 — CSV 값으로는 열 수 없다(조건 8).
 * '수집자' 칸은 사람이 아니라 수집 프로그램 식별자다(사용자 결정 2026-11-16, 예 plan-collector/1.0) — 사람 정보를 싣지 않는다.
 * 시드 경로에서는 서버가 {@link #SEED_AGENT} 로 고정한다.
 */
public final class PlanCsv {

    public static final Pattern FILE_NAME = Pattern.compile("([A-Za-z0-9-]{1,64})_(\\d{8})_plan\\.csv");
    private static final Pattern ID = Pattern.compile("[A-Za-z0-9-]{1,64}");
    private static final Pattern ITEM_NO = Pattern.compile("[\\p{L}\\p{N}][\\p{L}\\p{N} _./()\\-]{0,49}");   // InstitutionEditRules NO 와 같은 글자
    private static final Pattern FIELD_NO = Pattern.compile("[\\p{L}\\p{N}][\\p{L}\\p{N} _./()\\-]{0,19}");
    private static final Pattern PAGE = Pattern.compile("\\d{1,4}(~\\d{1,4})?");
    /** 숫자 모양: 쉼표 없이 연속 숫자, 또는 3자리 묶음 쉼표만(1,,2·12,34 거부). 소수는 3자리까지(DB NUMBER(18,3)). */
    private static final String NUM = "(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\\.[0-9]{1,3})?";
    private static final Pattern AMOUNT_RE = Pattern.compile(NUM);
    /** DB NUMBER(18,3) — 정수부 최대 15자리. */
    private static final int MAX_INT_DIGITS = 15;
    private static final String YV = "(?:(?:19|20)\\d{2}|장기):" + NUM;
    private static final Pattern YEARS = Pattern.compile(YV + "(?:;" + YV + ")*");
    private static final Pattern RATE = Pattern.compile("\\d{1,3}(\\.\\d)?");
    private static final Pattern DATE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");
    /** 수집 프로그램 식별자: 영문자로 시작, 영숫자·점·밑줄·하이픈 40자까지 + 선택 '/버전'. 공백·@·한글·숫자만의 값은 못 통과한다. */
    private static final Pattern AGENT = Pattern.compile("[A-Za-z][A-Za-z0-9._-]{0,39}(/[0-9][0-9A-Za-z.]{0,15})?");
    private static final BigDecimal HUNDRED = new BigDecimal(100);
    private static final int MAX_DOCS = 20;
    private static final int MAX_WARNINGS = 100;
    public static final String AMOUNT = "AMOUNT";
    /** 서울 25구 원문 변환 시드 경로(서버 고정)의 수집 프로그램 식별자. */
    public static final String SEED_AGENT = "seed-txt-convert/1";

    static final String H_INST = "기관ID", H_TITLE = "문서명", H_KIND = "원천종류", H_FROM = "대상기간시작", H_TO = "대상기간끝",
            H_URL = "출처URL", H_CHECKED = "확인일", H_COLLECTOR = "수집자", H_DOC_PAGES = "문서쪽범위", H_DOC_NOTE = "문서비고",
            H_FIELD_NO = "분야번호", H_FIELD = "분야명", H_NO = "사업번호", H_PARENT = "상위사업번호", H_NAME = "사업명",
            H_CONTENT = "내용", H_BSTATE = "예산상태", H_AMOUNT = "예산금액", H_UNIT = "예산단위", H_YEARS = "연차예산",
            H_PAGE = "원문쪽", H_CHECK = "확인상태", H_PROGRESS = "진행상태", H_RATE = "이행률", H_NOTE = "비고";
    /** 반입 계약 — 바깥 수집 쪽과 함께 고친다(collector/SCHEMA.md 확장 시 동기화). */
    public static final List<String> HEADERS = Collections.unmodifiableList(Arrays.asList(H_INST, H_TITLE, H_KIND, H_FROM, H_TO,
            H_URL, H_CHECKED, H_COLLECTOR, H_DOC_PAGES, H_DOC_NOTE, H_FIELD_NO, H_FIELD, H_NO, H_PARENT, H_NAME, H_CONTENT,
            H_BSTATE, H_AMOUNT, H_UNIT, H_YEARS, H_PAGE, H_CHECK, H_PROGRESS, H_RATE, H_NOTE));
    private static final Set<String> REQUIRED = new HashSet<>(Arrays.asList(H_INST, H_TITLE, H_KIND, H_FROM, H_TO, H_URL,
            H_CHECKED, H_COLLECTOR, H_NO, H_NAME, H_BSTATE));

    /** COMMON_CODE 사용 가능 값 → 코드. 코드 또는 CODE_NAME(한글) 그대로만 받는다. 없으면 null. */
    public interface Codes {
        String resolve(String group, String raw);
    }

    public static final class Options {
        final String institutionId;
        final String fileDate;
        final boolean seed;
        final LocalDate today;

        public Options(String institutionId, String fileDate, boolean seed, LocalDate today) {
            this.institutionId = institutionId;
            this.fileDate = fileDate;
            this.seed = seed;
            this.today = today;
        }
    }

    public static final class Doc {
        public String title, srcKind, url, checkedOn, collectorAgent, pageRange, note;
        public int from, to;
        public boolean urlMissing;
        public final List<Item> items = new ArrayList<>();
        final Map<String, Item> byNo = new HashMap<>();

        String signature() {
            return srcKind + '\u0001' + from + '\u0001' + to + '\u0001' + url + '\u0001' + checkedOn + '\u0001' + collectorAgent
                    + '\u0001' + pageRange + '\u0001' + note;
        }
    }

    public static final class Item {
        public int row;
        public String fieldNo, fieldName, no, parentNo, name, content, budgetState, budgetUnit, budgetYears, page, check, progress, note;
        public BigDecimal amount, rate;
    }

    public static final class Warning {
        public final int row;
        public final String code;

        Warning(int row, String code) {
            this.row = row;
            this.code = code;
        }
    }

    public static final class Result {
        public final List<Doc> docs;
        public final int rows;
        public final List<Warning> warnings;
        public final int warnCount;

        Result(List<Doc> docs, int rows, List<Warning> warnings, int warnCount) {
            this.docs = docs;
            this.rows = rows;
            this.warnings = warnings;
            this.warnCount = warnCount;
        }
    }

    private PlanCsv() {
    }

    public static boolean validId(String s) {
        return s != null && ID.matcher(s).matches();
    }

    public static Result parse(byte[] raw, Options opt, Codes codes) {
        CsvLimits.checkSize(raw.length);
        CsvLimits.Parsed parsed = CsvLimits.PLAN.parse(decodeStrict(raw));
        List<List<String>> recs = parsed.records;
        if (recs.size() < 2) {
            throw new InstitutionCsv.CsvFormatException("사업 행이 없습니다.");
        }
        Map<String, Integer> col = header(recs.get(0));
        int width = recs.get(0).size();
        Map<String, Doc> docs = new LinkedHashMap<>();
        List<Warning> warns = new ArrayList<>();
        int[] warnCount = {0};
        for (int i = 1; i < recs.size(); i++) {
            List<String> r = recs.get(i);
            int rawRow = parsed.rawRows.get(i);   // 리더와 같은 번호(빈 줄 포함 원시 행) — 오류 사유·ROW_NO 모두 이 기준
            if (r.size() != width) {
                throw CsvLimits.bad(rawRow, "칸 수가 머리행과 다릅니다.");
            }
            Row c = new Row(r, col, rawRow);
            Doc d = doc(c, opt, codes);
            Doc prev = docs.get(d.title);
            if (prev == null) {
                if (docs.size() >= MAX_DOCS) {
                    throw CsvLimits.bad(rawRow, "문서는 한 파일에 20개까지입니다.");
                }
                docs.put(d.title, d);
                prev = d;
            } else if (!prev.signature().equals(d.signature())) {
                throw CsvLimits.bad(rawRow, "같은 문서명의 문서 칸(원천종류·기간·출처·확인일 등)이 앞 행과 다릅니다.");
            }
            Item it = item(c, prev, codes, warns, warnCount);
            if (prev.byNo.put(it.no, it) != null) {
                throw CsvLimits.bad(rawRow, "같은 문서 안에 사업번호가 겹칩니다.");
            }
            prev.items.add(it);
        }
        String latest = null;
        for (Doc d : docs.values()) {
            for (Item it : d.items) {
                if (it.parentNo == null) {
                    continue;
                }
                Item p = d.byNo.get(it.parentNo);
                if (p == null || p == it || p.parentNo != null) {
                    throw CsvLimits.bad(it.row, "상위사업번호가 같은 문서에 없거나 2단을 넘습니다.");
                }
            }
            if (latest == null || d.checkedOn.compareTo(latest) > 0) {
                latest = d.checkedOn;
            }
        }
        if (!opt.fileDate.equals(latest)) {
            throw new InstitutionCsv.CsvFormatException("파일 이름의 날짜가 문서 확인일 중 가장 늦은 날과 다릅니다.");
        }
        return new Result(new ArrayList<>(docs.values()), recs.size() - 1, warns, warnCount[0]);
    }

    static String decodeStrict(byte[] raw) {
        int off = raw.length >= 3 && (raw[0] & 0xFF) == 0xEF && (raw[1] & 0xFF) == 0xBB && (raw[2] & 0xFF) == 0xBF ? 3 : 0;
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(raw, off, raw.length - off)).toString();
        } catch (CharacterCodingException e) {
            throw new InstitutionCsv.CsvFormatException("UTF-8 로 저장된 CSV 만 받습니다(엑셀: 'CSV UTF-8' 형식으로 저장).");
        }
    }

    private static Map<String, Integer> header(List<String> h) {
        Map<String, Integer> col = new HashMap<>();
        for (int i = 0; i < h.size(); i++) {
            String name = text(h.get(i), 0, 20, false, false);
            if (!HEADERS.contains(name)) {
                throw new InstitutionCsv.CsvFormatException("header: " + (i + 1) + "번째 열 이름을 알 수 없습니다.");
            }
            if (col.put(name, i) != null) {
                throw new InstitutionCsv.CsvFormatException("header: " + (i + 1) + "번째 열 이름이 겹칩니다.");
            }
        }
        for (String req : HEADERS) {   // 순서 고정 — 열 이름은 서버 고정값이라 사유에 실어도 된다
            if (REQUIRED.contains(req) && !col.containsKey(req)) {
                throw new InstitutionCsv.CsvFormatException("header: 필수 열이 없습니다(" + req + ").");
            }
        }
        return col;
    }

    private static Doc doc(Row c, Options opt, Codes codes) {
        int row = c.row;
        Doc d = new Doc();
        String csvInst = text(c.get(H_INST), row, 64, false, true);
        if (!ID.matcher(csvInst).matches() || !csvInst.equalsIgnoreCase(opt.institutionId)) {   // ASCII 검사 뒤에 대소문자 무시 비교(유니코드 접힘 차단). 저장은 서비스의 정식 표기
            throw CsvLimits.bad(row, "기관ID가 반입 대상 기관과 다릅니다.");
        }
        d.title = required(text(c.get(H_TITLE), row, 200, false, true), row, "문서명");
        d.srcKind = code(codes, "PLAN_SRC_KIND", c.get(H_KIND), row, "원천종류", true);
        d.from = year(c.get(H_FROM), row);
        d.to = year(c.get(H_TO), row);
        if (d.from > d.to || d.to - d.from > 10) {
            throw CsvLimits.bad(row, "대상기간이 올바르지 않습니다(시작 ≤ 끝, 10년 이내).");
        }
        String url = text(c.get(H_URL), row, SafeUrl.MAX, false, false);
        if (url.isEmpty()) {
            if (!opt.seed) {
                throw CsvLimits.bad(row, "출처URL이 비어 있습니다(반입 파일은 필수).");
            }
            d.urlMissing = true;
        } else if (!SafeUrl.isHttp(url)) {
            throw CsvLimits.bad(row, "출처URL은 http 또는 https 주소(500자 이내, 계정정보 없음)여야 합니다.");
        } else {
            d.url = url;
        }
        d.checkedOn = date(c.get(H_CHECKED), row, opt.today);
        String agent = text(c.get(H_COLLECTOR), row, 60, false, false);
        if (opt.seed) {
            // 시드 경로: 수집 프로그램은 서버가 고정한다. CSV 칸은 비워 두거나 같은 값만 허용한다.
            if (!agent.isEmpty() && !SEED_AGENT.equals(agent)) {
                throw CsvLimits.bad(row, "시드 파일의 수집자 칸은 비워 두세요.");
            }
            d.collectorAgent = SEED_AGENT;
        } else if (agent.isEmpty()) {
            throw CsvLimits.bad(row, "수집자(수집 프로그램 식별자)가 비어 있습니다.");
        } else if (!AGENT.matcher(agent).matches()) {
            throw CsvLimits.bad(row, "수집자는 수집 프로그램 식별자(영문자로 시작, 예 plan-collector/1.0)여야 합니다.");
        } else {
            d.collectorAgent = agent;
        }
        d.pageRange = pattern(c.get(H_DOC_PAGES), PAGE, row, "문서쪽범위");
        d.note = blankToNull(text(c.get(H_DOC_NOTE), row, 500, true, true));
        return d;
    }

    private static Item item(Row c, Doc d, Codes codes, List<Warning> warns, int[] warnCount) {
        int row = c.row;
        Item it = new Item();
        it.row = row;
        it.fieldNo = pattern(c.get(H_FIELD_NO), FIELD_NO, row, "분야번호");
        it.fieldName = blankToNull(text(c.get(H_FIELD), row, 100, false, true));
        it.no = pattern(c.get(H_NO), ITEM_NO, row, "사업번호");
        if (it.no == null) {
            throw CsvLimits.bad(row, "사업번호 칸이 비어 있습니다.");
        }
        it.parentNo = pattern(c.get(H_PARENT), ITEM_NO, row, "상위사업번호");
        it.name = required(text(c.get(H_NAME), row, 300, false, true), row, "사업명");
        it.content = blankToNull(text(c.get(H_CONTENT), row, 1000, true, true));
        it.note = blankToNull(text(c.get(H_NOTE), row, 500, true, true));
        it.budgetState = code(codes, "PLAN_BUDGET_STATE", c.get(H_BSTATE), row, "예산상태", true);
        String amount = text(c.get(H_AMOUNT), row, 25, false, false);
        String unit = text(c.get(H_UNIT), row, 20, false, false);
        String years = text(c.get(H_YEARS), row, 300, false, false);
        if (AMOUNT.equals(it.budgetState)) {
            if (!AMOUNT_RE.matcher(amount).matches() || intDigits(amount) > MAX_INT_DIGITS) {
                throw CsvLimits.bad(row, "예산금액은 원문 숫자(3자리 쉼표만 허용, 정수 15자리·소수 3자리까지)여야 합니다.");
            }
            it.amount = new BigDecimal(amount.replace(",", ""));
            if (it.amount.signum() <= 0) {
                throw CsvLimits.bad(row, "예산금액은 0보다 커야 합니다. 원문의 '-'·빈칸은 예산상태로 적으세요.");
            }
            it.budgetUnit = code(codes, "PLAN_BUDGET_UNIT", unit, row, "예산단위", true);
            if (!years.isEmpty()) {
                if (!YEARS.matcher(years).matches()) {
                    throw CsvLimits.bad(row, "연차예산 형식이 올바르지 않습니다(예: 2024:600;2025:600;장기:200).");
                }
                it.budgetYears = years;
                if (yearSumDiffers(years, it.amount)) {
                    warnCount[0]++;
                    if (warns.size() < MAX_WARNINGS) {
                        warns.add(new Warning(row, "YEAR_SUM_MISMATCH"));
                    }
                }
            }
        } else if (!amount.isEmpty() || !unit.isEmpty() || !years.isEmpty()) {
            throw CsvLimits.bad(row, "예산상태가 '금액'이 아니면 예산금액·예산단위·연차예산을 비워 두세요.");
        }
        it.page = pattern(c.get(H_PAGE), PAGE, row, "원문쪽");
        String chk = code(codes, "PLAN_CHECK", c.get(H_CHECK), row, "확인상태", false);
        it.check = chk == null ? "NOT_CHECKED" : chk;
        String prog = text(c.get(H_PROGRESS), row, 20, false, false);
        String rate = text(c.get(H_RATE), row, 5, false, false);
        if (!prog.isEmpty() || !rate.isEmpty()) {
            if (!"PLEDGE".equals(d.srcKind)) {
                throw CsvLimits.bad(row, "진행상태·이행률은 원천종류가 공약이행일 때만 적습니다.");
            }
            it.progress = code(codes, "PLAN_PROGRESS", prog, row, "진행상태", false);
            if (!rate.isEmpty()) {
                if (!RATE.matcher(rate).matches() || new BigDecimal(rate).compareTo(HUNDRED) > 0) {
                    throw CsvLimits.bad(row, "이행률은 0~100(소수 1자리)이어야 합니다.");
                }
                it.rate = new BigDecimal(rate);
            }
        }
        return it;
    }

    /** 쉼표를 뺀 정수부 자리 수(소수점 앞). */
    private static int intDigits(String amount) {
        int dot = amount.indexOf('.');
        String ip = dot < 0 ? amount : amount.substring(0, dot);
        return ip.replace(",", "").length();
    }

    /** 4자리 연도 칸의 합이 계와 다르면 true(장기는 계에 들지 않는다 — 원문 '계 2022~2026 / 장기' 관례). 경고만, 반입은 받는다. */
    static boolean yearSumDiffers(String years, BigDecimal total) {
        BigDecimal sum = BigDecimal.ZERO;
        boolean any = false;
        for (String part : years.split(";")) {
            int k = part.indexOf(':');
            if (k == 4) {
                sum = sum.add(new BigDecimal(part.substring(k + 1).replace(",", "")));
                any = true;
            }
        }
        return any && sum.compareTo(total) != 0;
    }

    /** 제어(C0·C1·DEL)·서식(U+200B·U+202E·U+FEFF 등)·줄/문단 구분 문자 거부, 앞뒤 공백 자름, 길이, 수식 시작 문자 거부. */
    static String text(String raw, int row, int max, boolean multiline, boolean formula) {
        String v = raw == null ? "" : raw.replace("\r\n", "\n");
        for (int i = 0; i < v.length(); i++) {
            char ch = v.charAt(i);
            if (ch == '\n' && multiline) {
                continue;
            }
            int t = Character.getType(ch);
            if (ch < 0x20 || ch == 0x7f || (ch >= 0x80 && ch <= 0x9f) || t == Character.FORMAT
                    || t == Character.LINE_SEPARATOR || t == Character.PARAGRAPH_SEPARATOR) {
                throw CsvLimits.bad(row, "허용되지 않는 글자(제어·서식 문자)가 있습니다.");
            }
        }
        v = v.trim();
        if (v.length() > max) {
            throw CsvLimits.bad(row, "칸이 너무 깁니다(" + max + "자 이하).");
        }
        if (formula && !v.isEmpty() && "=+-@".indexOf(v.charAt(0)) >= 0) {
            throw CsvLimits.bad(row, "칸이 = + - @ 로 시작합니다(수식으로 열릴 수 있어 받지 않습니다).");
        }
        return v;
    }

    private static String pattern(String raw, Pattern p, int row, String label) {
        String v = text(raw, row, 60, false, false);
        if (v.isEmpty()) {
            return null;
        }
        if (!p.matcher(v).matches()) {
            throw CsvLimits.bad(row, label + " 형식이 올바르지 않습니다.");
        }
        return v;
    }

    private static String code(Codes codes, String group, String raw, int row, String label, boolean required) {
        String v = text(raw, row, 100, false, false);
        if (v.isEmpty()) {
            if (required) {
                throw CsvLimits.bad(row, label + " 칸이 비어 있습니다.");
            }
            return null;
        }
        String c = codes.resolve(group, v);
        if (c == null) {
            throw CsvLimits.bad(row, label + " 값이 허용값이 아닙니다.");
        }
        return c;
    }

    private static int year(String raw, int row) {
        String v = text(raw, row, 4, false, false);
        if (!v.matches("\\d{4}")) {
            throw CsvLimits.bad(row, "대상기간은 4자리 연도(2000~2100)여야 합니다.");
        }
        int y = Integer.parseInt(v);
        if (y < 2000 || y > 2100) {
            throw CsvLimits.bad(row, "대상기간은 4자리 연도(2000~2100)여야 합니다.");
        }
        return y;
    }

    private static String date(String raw, int row, LocalDate today) {
        String v = text(raw, row, 10, false, false);
        try {
            if (DATE.matcher(v).matches()) {
                LocalDate d = LocalDate.parse(v);
                if (!d.isBefore(LocalDate.of(2000, 1, 1)) && !d.isAfter(today)) {
                    return v;
                }
            }
        } catch (DateTimeException ignored) {
            // 아래 고정 문구로
        }
        throw CsvLimits.bad(row, "확인일은 오늘 이전의 YYYY-MM-DD 여야 합니다.");
    }

    private static String required(String v, int row, String label) {
        if (v.isEmpty()) {
            throw CsvLimits.bad(row, label + " 칸이 비어 있습니다.");
        }
        return v;
    }

    private static String blankToNull(String v) {
        return v == null || v.isEmpty() ? null : v;
    }

    private static final class Row {
        final List<String> cells;
        final Map<String, Integer> col;
        final int row;

        Row(List<String> cells, Map<String, Integer> col, int row) {
            this.cells = cells;
            this.col = col;
            this.row = row;
        }

        String get(String h) {
            Integer i = col.get(h);
            return i == null ? "" : cells.get(i);
        }
    }
}
