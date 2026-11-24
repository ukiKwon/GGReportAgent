package com.kbstar.kgi.ggreport.web.support;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** 뉴스 CSV(060) 검사기 — 계약 ⑪-9. 오늘 2026-11-24, 파일 날짜 2026-11-18 고정. */
public class NewsCsvTest {

    private static final String HDR = "기관ID,분야,제목,언론사,보도일,출처URL,요약,확인일,수집자";
    private static final NewsCsv.Options OPT = new NewsCsv.Options("sample-gu", "2026-11-18", LocalDate.of(2026, 11, 24));
    private static final String SUM = "가상구가 일정을 공개했다.";

    private static String q(String s) { return "\"" + s.replace("\"", "\"\"") + "\""; }

    private static String row(String title, String summary, String published, String checked, String url) {
        return String.join(",", "sample-gu", "TREASURY", q(title), "가상일보", published, url, q(summary), checked, "news-collector/1.0");
    }

    private static String row(String title, String summary) {
        return row(title, summary, "2026-10-30", "2026-11-18", "https://example.org/n/" + Math.abs(title.hashCode()));
    }

    private static String csv(String... rows) {
        StringBuilder sb = new StringBuilder(HDR);
        for (String r : rows) sb.append('\n').append(r);
        return sb.append('\n').toString();
    }

    private static NewsCsv.Result ok(String csv) { return NewsCsv.parse(csv.getBytes(StandardCharsets.UTF_8), OPT); }

    private static String reject(String csv) {
        try {
            NewsCsv.parse(csv.getBytes(StandardCharsets.UTF_8), OPT);
            fail("받으면 안 된다");
            return null;
        } catch (InstitutionCsv.CsvFormatException e) {
            return e.getMessage();
        }
    }

    @Test
    public void SCHEMA_예시가_통과한다() {
        String example = HDR + "\n"
                + "sample-gu,TREASURY,\"가상구 금고 지정 심의 일정 공개\",가상일보,2026-10-30,https://example.org/n1,"
                + "\"가상구가 내년 금고 지정 심의 일정을 공개했다.\n다음 달 공고를 낼 계획이라고 한다.\",2026-11-18,news-collector/1.0\n";
        NewsCsv.Result r = ok(example);
        assertEquals(1, r.rows.size());
        assertEquals("TREASURY", r.rows.get(0).fieldCd);
        assertEquals("가상구가 내년 금고 지정 심의 일정을 공개했다.\n다음 달 공고를 낼 계획이라고 한다.", r.rows.get(0).summary);
    }

    @Test
    public void 파일_이름_정규식은_종류를_가른다() {
        assertTrue(NewsCsv.FILE_NAME.matcher("sample-gu_20261118_news.csv").matches());
        assertFalse(NewsCsv.FILE_NAME.matcher("sample-gu_20261118_plan.csv").matches());
        assertFalse(PlanCsv.FILE_NAME.matcher("sample-gu_20261118_news.csv").matches());
    }

    @Test
    public void 분야는_한글도_받고_열_순서는_자유다() {
        String swapped = "수집자,기관ID,요약,출처URL,보도일,언론사,제목,분야,확인일\n"
                + "news-collector/1.0,sample-gu," + q(SUM) + ",https://example.org/a,2026-10-30,가상일보," + q("순서 바꿈") + ",기관장동정,2026-11-18\n";
        assertEquals("HEAD_NEWS", ok(swapped).rows.get(0).fieldCd);
    }

    @Test
    public void 머리행_위반은_header_문구로_거부한다() {
        assertTrue(reject("기관ID,분야,제목,언론사,보도일,출처URL,요약,확인일,수집자,메모\nx\n").startsWith("header:"));
        assertTrue(reject("기관ID,분야,제목,언론사,보도일,출처URL,요약,확인일\nx\n").startsWith("header:"));
        assertTrue(reject("기관ID,기관ID,제목,언론사,보도일,출처URL,요약,확인일,수집자\nx\n").startsWith("header:"));
        assertTrue(reject(HDR + "\n").contains("뉴스 행이 없습니다"));
    }

    @Test
    public void 행이_11건이면_거부하고_10건은_받는다() {
        List<String> rows = new ArrayList<>();
        for (int i = 1; i <= 10; i++) rows.add(row("가상 제목 " + (char) ('가' + i), SUM));
        assertEquals(10, ok(csv(rows.toArray(new String[0]))).rows.size());
        rows.add(row("가상 제목 마지막", SUM));
        assertTrue(reject(csv(rows.toArray(new String[0]))).contains("10건"));
    }

    @Test
    public void 같은_URL_또는_같은_제목은_거부한다() {
        String u = "https://example.org/same";
        assertTrue(reject(csv(row("가상 하나", SUM, "2026-10-30", "2026-11-18", u), row("가상 둘", SUM, "2026-10-30", "2026-11-18", u))).contains("출처URL"));
        assertTrue(reject(csv(row("가상 같은 제목", SUM, "2026-10-30", "2026-11-18", "https://example.org/a"),
                row("가상 같은 제목", SUM, "2026-10-30", "2026-11-18", "https://example.org/b"))).contains("제목"));
    }

    @Test
    public void 보도일은_확인일_이전_1년_안이어야_한다() {
        String t = "가상 제목";
        ok(csv(row(t, SUM, "2025-11-18", "2026-11-18", "https://example.org/a")));   // 정확히 1년 전
        ok(csv(row(t, SUM, "2026-11-18", "2026-11-18", "https://example.org/a")));   // 확인일 당일
        assertTrue(reject(csv(row(t, SUM, "2025-11-17", "2026-11-18", "https://example.org/a"))).contains("보도일"));   // 1년 하루 전
        assertTrue(reject(csv(row(t, SUM, "2026-11-19", "2026-11-18", "https://example.org/a"))).contains("보도일"));   // 확인일 다음 날
        assertTrue(reject(csv(row(t, SUM, "2026-02-30", "2026-11-18", "https://example.org/a"))).contains("보도일"));   // 없는 날짜
    }

    @Test
    public void 확인일은_오늘_이전이어야_한다() {
        assertTrue(reject(csv(row("가상 제목", SUM, "2026-10-30", "2026-11-25", "https://example.org/a"))).contains("확인일"));
    }

    @Test
    public void 요약은_3줄_300자_제목과_다른_글이어야_한다() {
        ok(csv(row("가상 제목", "첫째 줄이다.\n\n둘째 줄이다.\n  \n셋째 줄이다.")));   // 빈 줄은 줄 수에 들지 않는다
        assertTrue(reject(csv(row("가상 제목", "하나.\n둘.\n셋.\n넷."))).contains("3줄"));
        StringBuilder s300 = new StringBuilder(), s301 = new StringBuilder();
        for (int i = 0; i < 300; i++) s300.append('가');
        for (int i = 0; i < 301; i++) s301.append('가');
        ok(csv(row("가상 제목", s300.toString())));
        assertTrue(reject(csv(row("가상 제목", s301.toString()))).contains("300자"));
        assertTrue(reject(csv(row("가상구 금고 지정 심의", "가상구 금고 지정 심의."))).contains("제목과 같"));   // 문장부호 차이는 같은 문장
        assertTrue(reject(csv(row("가상 제목", ""))).contains("요약"));
    }

    @Test
    public void 연락처_이메일_주민번호는_거부하고_사유에_원문이_없다() {
        for (String bad : new String[]{"담당자 010-1234-5678 에게 문의", "문의 kim@example.org", "번호 900101-1234567", "전화 02-123-4567"}) {
            String msg = reject(csv(row("가상 제목", bad)));
            assertTrue(bad + " -> " + msg, msg.contains("개인정보"));
            assertFalse(msg.contains("1234"));
            assertFalse(msg.contains("kim@"));
        }
    }

    @Test
    public void 나이와_생년은_전각_NBSP_괄호_우회까지_거부한다() {
        for (String bad : new String[]{"구청장은 65세다", "구청장은 ６５세다", "구청장은 65 세다", "구청장은 65 살이다", "1965년생 구청장",
                "65년생 구청장", "1965년 출생 구청장", "홍길동(65) 구청장", "홍길동 （６５） 구청장", "구청장은 ٦٥세다"}) {
            assertTrue(bad, reject(csv(row("가상 제목", bad))).contains("개인정보"));
        }
        // 제목·언론사도 같다
        assertTrue(reject(csv(row("구청장 65세 취임", SUM))).contains("개인정보"));
    }

    @Test
    public void 나이_생년_패턴의_오탐_방지_낱말은_통과한다() {
        for (String good : new String[]{"21세기 도시를 말했다", "2026년 생활임금을 논의했다", "3세대 주택을 공급한다", "2026 세입 결산을 공개했다",
                "예산 3세트를 편성했다", "세금과 세출을 비교했다", "2025년 생산 현황을 공개했다", "2026년 예산안(2026)을 발표했다"}) {
            ok(csv(row("가상 제목 " + good.length(), good)));
        }
    }

    @Test
    public void 수식_시작_글자와_위험한_URL은_거부한다() {
        assertTrue(reject(csv(row("=1+1", SUM))).contains("="));
        assertTrue(reject(csv(row("-가상", SUM))).contains("시작"));
        assertTrue(reject(csv(row("가상 제목", "@요약 시작"))).contains("시작"));
        assertTrue(reject(csv(row("가상 제목", SUM, "2026-10-30", "2026-11-18", "javascript:alert(1)"))).contains("출처URL"));
        assertTrue(reject(csv(row("가상 제목", SUM, "2026-10-30", "2026-11-18", "https://user:pw@example.org/a"))).contains("출처URL"));
        assertTrue(reject(csv(row("가상 제목", SUM, "2026-10-30", "2026-11-18", ""))).contains("출처URL"));
    }

    @Test
    public void 파일_이름_날짜와_기관ID는_본문과_맞아야_한다() {
        NewsCsv.Options wrongDate = new NewsCsv.Options("sample-gu", "2026-11-17", LocalDate.of(2026, 11, 24));
        try {
            NewsCsv.parse(csv(row("가상 제목", SUM)).getBytes(StandardCharsets.UTF_8), wrongDate);
            fail();
        } catch (InstitutionCsv.CsvFormatException e) {
            assertTrue(e.getMessage().contains("파일 이름의 날짜"));
        }
        NewsCsv.Options wrongInst = new NewsCsv.Options("other-gu", "2026-11-18", LocalDate.of(2026, 11, 24));
        try {
            NewsCsv.parse(csv(row("가상 제목", SUM)).getBytes(StandardCharsets.UTF_8), wrongInst);
            fail();
        } catch (InstitutionCsv.CsvFormatException e) {
            assertTrue(e.getMessage().contains("기관ID"));
        }
    }

    @Test
    public void 분야가_허용값_밖이면_거부한다() {
        String bad = String.join(",", "sample-gu", "SPORTS", q("가상 제목"), "가상일보", "2026-10-30", "https://example.org/a", q(SUM), "2026-11-18", "news-collector/1.0");
        assertTrue(reject(csv(bad)).contains("분야"));
    }
}
