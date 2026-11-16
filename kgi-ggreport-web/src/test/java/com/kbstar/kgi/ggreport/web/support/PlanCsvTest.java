package com.kbstar.kgi.ggreport.web.support;

import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** 사업계획 반입 CSV 파서·검사기(034) — Spring 없음, 코드표는 스텁. 오류 사유에는 행 번호만 있고 칸 원문은 없다. */
public class PlanCsvTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 16);
    private static final String HDR = "기관ID,문서명,원천종류,대상기간시작,대상기간끝,출처URL,확인일,수집자,분야번호,분야명,사업번호,상위사업번호,"
            + "사업명,내용,예산상태,예산금액,예산단위,연차예산,원문쪽,확인상태,진행상태,이행률";

    private static final Map<String, Map<String, String>> CODES = new HashMap<>();

    static {
        put("PLAN_SRC_KIND", "FOUR_YEAR", "4개년계획");
        put("PLAN_SRC_KIND", "WORK_PLAN", "주요업무계획");
        put("PLAN_SRC_KIND", "PLEDGE", "공약이행");
        put("PLAN_CHECK", "CONFIRMED", "확인됨");
        put("PLAN_CHECK", "UNCONFIRMED", "확인안됨");
        put("PLAN_BUDGET_STATE", "AMOUNT", "금액");
        put("PLAN_BUDGET_STATE", "UNVERIFIED", "확인안됨");
        put("PLAN_BUDGET_STATE", "NOT_IN_SOURCE", "원문에 없음");
        put("PLAN_BUDGET_UNIT", "MIL_KRW", "백만원");
        put("PLAN_BUDGET_UNIT", "HUNDRED_MIL_KRW", "억원");
        put("PLAN_PROGRESS", "NORMAL", "정상");
        put("PLAN_PROGRESS", "DROPPED", "폐기");
    }

    private static void put(String g, String code, String name) {
        Map<String, String> m = CODES.computeIfAbsent(g, k -> new HashMap<>());
        m.put(code, code);
        m.put(name, code);
    }

    private static final PlanCsv.Codes STUB = (g, raw) -> CODES.containsKey(g) ? CODES.get(g).get(raw) : null;

    /** 한 행. 기본값은 정상 값이고 필요한 칸만 바꾼다. */
    private static final class R {
        String inst = "jongno", title = "종로 시험 계획", kind = "4개년계획", from = "2023", to = "2026",
                url = "https://example.kr/plan.pdf", checked = "2026-11-10", agent = "plan-collector/1.0",
                no = "1", parent = "", name = "시험 사업", content = "", bstate = "원문에 없음", amount = "", unit = "",
                years = "", check = "", progress = "", rate = "";

        String line() {
            return String.join(",", inst, title, kind, from, to, url, checked, agent, "1", "시험", no, parent, name, content,
                    bstate, amount, unit, years, "", check, progress, rate);
        }
    }

    private static R r() {
        return new R();
    }

    private static byte[] bytes(R... rows) {
        StringBuilder sb = new StringBuilder(HDR);
        for (R row : rows) {
            sb.append('\n').append(row.line());
        }
        sb.append('\n');
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static PlanCsv.Result parse(byte[] raw, String fileDate, boolean seed) {
        return PlanCsv.parse(raw, new PlanCsv.Options("jongno", fileDate, seed, TODAY), STUB);
    }

    private static PlanCsv.Result parse(R... rows) {
        return parse(bytes(rows), "2026-11-10", false);
    }

    /** 오류가 나야 한다. 사유에 want 가 들어 있고, 칸 원문(leak)은 없어야 한다. */
    private static String bad(byte[] raw, String fileDate, boolean seed, String want) {
        try {
            parse(raw, fileDate, seed);
        } catch (InstitutionCsv.CsvFormatException e) {
            assertTrue("사유: " + e.getMessage(), e.getMessage().contains(want));
            return e.getMessage();
        }
        fail("오류가 나야 한다: " + want);
        return null;
    }

    private static String bad(String want, R... rows) {
        return bad(bytes(rows), "2026-11-10", false, want);
    }

    // ---------------------------------------------------------------- 정상

    @Test
    public void 정상_두_문서_세_사업과_부모_연결() {
        R a1 = r();
        a1.no = "1";
        R a2 = r();
        a2.no = "1-1";
        a2.parent = "1";
        a2.name = "하위 사업";
        a2.bstate = "금액";
        a2.amount = "\"1,200\"";
        a2.unit = "백만원";
        R b1 = r();
        b1.title = "종로 둘째 계획";
        b1.kind = "주요업무계획";
        b1.no = "A";

        PlanCsv.Result res = parse(a1, a2, b1);

        assertEquals(2, res.docs.size());
        assertEquals(3, res.rows);
        assertEquals(2, res.docs.get(0).items.size());
        assertEquals("1", res.docs.get(0).items.get(1).parentNo);
        assertEquals(0, new java.math.BigDecimal("1200").compareTo(res.docs.get(0).items.get(1).amount));
        assertEquals("MIL_KRW", res.docs.get(0).items.get(1).budgetUnit);
        assertEquals("FOUR_YEAR", res.docs.get(0).srcKind);
        assertEquals("WORK_PLAN", res.docs.get(1).srcKind);
        assertEquals("NOT_CHECKED", res.docs.get(0).items.get(0).check);
        assertFalse(res.docs.get(0).urlMissing);
    }

    @Test
    public void BOM이_있어도_통과한다() throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(new byte[]{(byte) 0xEF, (byte) 0xBB, (byte) 0xBF});
        out.write(bytes(r()));
        assertEquals(1, parse(out.toByteArray(), "2026-11-10", false).rows);
    }

    @Test
    public void 열_순서는_자유다() {
        String csv = "사업명,사업번호,예산상태,기관ID,문서명,원천종류,대상기간시작,대상기간끝,출처URL,확인일,수집자\n"
                + "순서 시험,1,원문에 없음,jongno,종로 계획,4개년계획,2023,2026,https://example.kr/a,2026-11-10,plan-collector/1.0\n";
        assertEquals(1, parse(csv.getBytes(StandardCharsets.UTF_8), "2026-11-10", false).rows);
    }

    // ---------------------------------------------------------------- 인코딩·글자

    @Test
    public void cp949_바이트는_받지_않는다() {
        Charset cp949 = Charset.forName(Charset.isSupported("x-windows-949") ? "x-windows-949" : "EUC-KR");
        byte[] raw = new String(bytes(r()), StandardCharsets.UTF_8).getBytes(cp949);
        bad(raw, "2026-11-10", false, "UTF-8");
    }

    @Test
    public void 수식_시작_칸은_거부하고_사유에_원문이_없다() {
        R x = r();
        x.content = "\"=HYPERLINK(\"\"x\"\")\"";
        String msg = bad("row 1", x);
        assertFalse(msg, msg.contains("HYPERLINK"));
    }

    @Test
    public void 방향_뒤집기_글자는_거부한다() {
        R x = r();
        x.name = "사업‮뒤집힘";   // U+202E 방향 뒤집기
        bad("row 1", x);
    }

    @Test
    public void 따옴표가_닫히지_않으면_거부한다() {
        byte[] raw = (HDR + "\njongno,\"닫히지 않은 칸,4개년계획\n").getBytes(StandardCharsets.UTF_8);
        bad(raw, "2026-11-10", false, "닫히지");
    }

    // ---------------------------------------------------------------- 출처·수집자

    @Test
    public void 바깥_반입은_출처URL이_필수고_시드는_빈칸이_통과한다() {
        R x = r();
        x.url = "";
        bad("출처URL", x);

        x.agent = "";   // 시드 경로는 수집자 칸을 비워 둔다(서버가 SEED_AGENT로 고정)
        PlanCsv.Result res = parse(bytes(x), "2026-11-10", true);
        assertTrue(res.docs.get(0).urlMissing);
        assertNull(res.docs.get(0).url);
    }

    @Test
    public void 계정정보가_든_URL은_거부한다() {
        R x = r();
        x.url = "https://u:p@example.kr/";
        bad("출처URL", x);
    }

    @Test
    public void 수집자는_프로그램_식별자만_받는다() {
        R ok = r();
        ok.agent = "plan-collector/1.0";
        assertEquals("plan-collector/1.0", parse(ok).docs.get(0).collectorAgent);
        R ok2 = r();
        ok2.agent = "collector_v2";
        assertEquals("collector_v2", parse(ok2).docs.get(0).collectorAgent);

        for (String badAgent : new String[]{"", "3918264", "홍길동", "plan collector", "a@b.kr", "-x", "1abc", "plan-collector/v1"}) {
            R x = r();
            x.agent = badAgent;
            bad("수집자", x);
        }
    }

    @Test
    public void 시드_경로는_수집자를_서버_고정값으로_채운다() {
        R x = r();
        x.agent = "";
        PlanCsv.Result res = parse(bytes(x), "2026-11-10", true);
        assertEquals(PlanCsv.SEED_AGENT, res.docs.get(0).collectorAgent);
        assertEquals("seed-txt-convert/1", PlanCsv.SEED_AGENT);

        R other = r();
        other.agent = "plan-collector/1.0";
        bad(bytes(other), "2026-11-10", true, "수집자");
    }

    // ---------------------------------------------------------------- 예산

    @Test
    public void 금액_0은_거부한다() {
        R x = r();
        x.bstate = "금액";
        x.amount = "0";
        x.unit = "백만원";
        bad("0보다", x);
    }

    @Test
    public void 금액에_단위가_없으면_거부한다() {
        R x = r();
        x.bstate = "금액";
        x.amount = "100";
        bad("예산단위", x);
    }

    @Test
    public void 원문에_없음인데_금액이_있으면_거부한다() {
        R x = r();
        x.bstate = "원문에 없음";
        x.amount = "100";
        bad("비워", x);
    }

    @Test
    public void 연차_합이_다르면_경고만_하고_통과한다() {
        R x = r();
        x.bstate = "금액";
        x.amount = "100";
        x.unit = "백만원";
        x.years = "2024:50;2025:30;장기:20";
        PlanCsv.Result res = parse(x);
        assertEquals(1, res.warnCount);
        assertEquals("YEAR_SUM_MISMATCH", res.warnings.get(0).code);
        assertEquals(1, res.warnings.get(0).row);
    }

    // ---------------------------------------------------------------- 구조

    @Test
    public void 사업번호가_겹치면_거부한다() {
        R a = r();
        R b = r();
        bad("겹칩니다", a, b);
    }

    @Test
    public void 상위번호가_없거나_3단이면_거부한다() {
        R lonely = r();
        lonely.parent = "9";
        bad("상위사업번호", lonely);

        R a = r();
        R b = r();
        b.no = "1-1";
        b.parent = "1";
        R c = r();
        c.no = "1-1-1";
        c.parent = "1-1";
        bad("상위사업번호", a, b, c);
    }

    @Test
    public void 기관ID_확인일_파일날짜가_어긋나면_거부한다() {
        R other = r();
        other.inst = "dobong";
        bad("기관ID", other);

        R future = r();
        future.checked = "2026-11-17";
        bad(bytes(future), "2026-11-17", false, "확인일");

        bad(bytes(r()), "2026-11-09", false, "파일 이름의 날짜");
    }

    @Test
    public void 공약이행이_아닌_문서의_진행상태는_거부한다() {
        R x = r();
        x.progress = "정상";
        bad("공약이행", x);

        R ok = r();
        ok.kind = "공약이행";
        ok.progress = "폐기";
        ok.rate = "42.5";
        PlanCsv.Result res = parse(ok);
        assertEquals("DROPPED", res.docs.get(0).items.get(0).progress);
        assertEquals(0, new java.math.BigDecimal("42.5").compareTo(res.docs.get(0).items.get(0).rate));
    }

    // ---------------------------------------------------------------- 상한

    @Test
    public void 행_5001개는_거부한다() {
        List<R> rows = new ArrayList<>();
        for (int i = 1; i <= 5001; i++) {
            R x = r();
            x.no = String.valueOf(i);
            rows.add(x);
        }
        bad(bytes(rows.toArray(new R[0])), "2026-11-10", false, "5,000행");
    }

    // ---------------------------------------------------------------- 예산금액 자릿수·쉼표 (DB NUMBER(18,3))

    private static R amountRow(String amount) {
        R x = r();
        x.bstate = "금액";
        x.amount = amount;
        x.unit = "백만원";
        return x;
    }

    @Test
    public void 금액_정수부_15자리는_통과하고_16자리는_row_N으로_거부한다() {
        assertEquals(0, new java.math.BigDecimal("123456789012345.123")
                .compareTo(parse(amountRow("123456789012345.123")).docs.get(0).items.get(0).amount));
        assertEquals(0, new java.math.BigDecimal("123456789012345")
                .compareTo(parse(amountRow("\"123,456,789,012,345\"")).docs.get(0).items.get(0).amount));
        bad("row 1", amountRow("1234567890123456"));
        bad("row 1", amountRow("\"1,234,567,890,123,456\""));
        bad("row 1", amountRow("1234567890123456.5"));
    }

    @Test
    public void 쉼표_위치가_3자리_묶음이_아니면_거부한다() {
        for (String badAmount : new String[]{"\"1,,2\"", "\"12,34\"", "\"1,2345\"", "\",100\"", "\"100,\"", "\"1,23,456\""}) {
            bad("row 1", amountRow(badAmount));
        }
        assertEquals(0, new java.math.BigDecimal("1200").compareTo(parse(amountRow("\"1,200\"")).docs.get(0).items.get(0).amount));
        assertEquals(0, new java.math.BigDecimal("1200").compareTo(parse(amountRow("1200")).docs.get(0).items.get(0).amount));
    }

    @Test
    public void 연차예산의_쉼표도_3자리_묶음만_받는다() {
        R x = amountRow("100");
        x.years = "\"2024:1,,0\"";
        bad("row 1", x);
    }

    // ---------------------------------------------------------------- 행 번호 기준(빈 줄 포함 원시 행)

    @Test
    public void 빈_줄이_있어도_검사기_오류와_ROW_NO가_리더와_같은_원시_행_번호다() {
        R a = r();
        R b = r();
        b.no = "2";
        b.name = "둘째";
        String ok = HDR + "\n" + a.line() + "\n\n" + b.line() + "\n";   // 머리 0, a = 1, 빈 줄 2, b = 3
        PlanCsv.Result res = parse(ok.getBytes(StandardCharsets.UTF_8), "2026-11-10", false);
        assertEquals(1, res.docs.get(0).items.get(0).row);
        assertEquals(3, res.docs.get(0).items.get(1).row);

        R broken = amountRow("0");
        broken.no = "2";
        String bad = HDR + "\n" + a.line() + "\n\n" + broken.line() + "\n";
        String msg = bad(bad.getBytes(StandardCharsets.UTF_8), "2026-11-10", false, "row 3");
        assertFalse(msg, msg.contains("row 2"));
    }

    @Test
    public void 리더_오류도_같은_기준이다_빈_줄_뒤_칸_수_오류는_원시_행() {
        R a = r();
        String csv = HDR + "\n" + a.line() + "\n\n" + "jongno,짧은 행\n";
        bad(csv.getBytes(StandardCharsets.UTF_8), "2026-11-10", false, "row 3");
    }

    @Test
    public void 칸_1001자는_거부한다() {
        R x = r();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 1001; i++) {
            sb.append('가');
        }
        x.name = sb.toString();
        bad("1,000자", x);
    }
}
