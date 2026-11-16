package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.dto.NoticeRoundIn;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.junit.Test;

import java.time.LocalDate;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** 공고 상태 기록(037) 입력 검사·회차 넘어감 판정 — DB 없음. 보이지 않는 문자는 코드 포인트 숫자로만 만든다(소스에 날것으로 두지 않는다). */
public class NoticeRoundRulesTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 16);
    private static final String EMOJI = new String(Character.toChars(0x1F600));   // UTF-16 두 칸, 코드 포인트 하나

    private static NoticeRoundIn in(Integer seq, Integer base, String status, String opinion, String next) {
        NoticeRoundIn i = new NoticeRoundIn();
        i.setRoundSeq(seq);
        i.setBaseRevNo(base);
        i.setStatusCd(status);
        i.setOpinion(opinion);
        i.setNextCheckDate(next);
        return i;
    }

    private static String tomorrow() {
        return TODAY.plusDays(1).toString();
    }

    /** 400 INVALID 이고 field 가 기대와 같아야 한다. 메시지를 돌려준다. */
    private static String assertBad(NoticeRoundIn in, String field) {
        try {
            NoticeRoundRules.parse(in, TODAY);
        } catch (ApiException e) {
            return checkBad(e, field);
        }
        fail("400 이 아니다: " + field);
        return null;
    }

    private static String checkBad(ApiException e, String field) {
        assertEquals(400, e.getStatus());
        Map<?, ?> d = (Map<?, ?>) e.getDetailObject();
        assertEquals("INVALID", d.get("code"));
        assertEquals(field, d.get("field"));
        return String.valueOf(d.get("message"));
    }

    private static String opinionBad(String raw) {
        try {
            NoticeRoundRules.opinion(raw);
        } catch (ApiException e) {
            return checkBad(e, "opinion");
        }
        fail("400 이 아니다");
        return null;
    }

    /** 앞·뒤 글자 사이에 코드 포인트 하나를 끼운 문자열. */
    private static String around(int cp) {
        return "앞" + new String(Character.toChars(cp)) + "뒤";
    }

    private static String repeat(String s, int n) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < n; i++) {
            b.append(s);
        }
        return b.toString();
    }

    @Test
    public void 회차가_넘어갔나는_둘_다_있고_지금_값이_뒤일_때만_참이다() {
        assertTrue(NoticeRoundRules.advanced("2022-10-18", "2026-10-20"));
        assertFalse(NoticeRoundRules.advanced(null, "2026-10-20"));
        assertFalse(NoticeRoundRules.advanced("2022-10-18", null));
        assertFalse(NoticeRoundRules.advanced("2022-10-18", "2022-10-18"));
        assertFalse(NoticeRoundRules.advanced("2026-10-20", "2022-10-18"));
        assertFalse(NoticeRoundRules.advanced(" ", "2026-10-20"));
    }

    @Test
    public void 날짜는_표기가_달라도_날짜로_읽어_비교한다() {
        assertFalse(NoticeRoundRules.advanced("2022-10-18", "2022.10.18"));
        assertFalse(NoticeRoundRules.advanced("2024-07-24", "2024-7-24"));
        assertFalse(NoticeRoundRules.advanced("2024/07/24", "2024-07-24"));
        assertTrue(NoticeRoundRules.advanced("2022.10.18", "2026-10-20"));
        assertTrue(NoticeRoundRules.advanced("2024-9-9", "2024-10-1"));   // 문자열 비교면 '9' > '1' 로 거꾸로 나온다
        assertFalse(NoticeRoundRules.advanced("2024-10-1", "2024-9-9"));
        assertTrue(NoticeRoundRules.advanced("2022-10-18", "2026-10-20"));
        assertTrue(NoticeRoundRules.advanced("2022-10-18T00:00:00+09:00", "2026-10-20"));
    }

    @Test
    public void 읽을_수_없거나_없는_날짜면_넘어감이_아니다() {
        assertFalse(NoticeRoundRules.advanced("2022-10-18", "미상"));
        assertFalse(NoticeRoundRules.advanced("미상", "2026-10-20"));
        assertFalse(NoticeRoundRules.advanced("2022-10-18", "2026-02-30"));
        assertFalse(NoticeRoundRules.advanced("2022-13-01", "2026-10-20"));
        assertFalse(NoticeRoundRules.advanced("2022-10-18", "2026"));
    }

    @Test
    public void 구분자를_바꾼_전화번호도_400() {
        String fullWidth = new String(new char[]{0xFF10, 0xFF11, 0xFF10}) + "-1234-5678";
        String[] samples = {"담당 010.1234.5678", "담당 " + fullWidth, "담당 010 - 1234 - 5678"};
        for (String s : samples) {
            assertEquals(NoticeRoundRules.OPINION_PII, opinionBad(s));
        }
    }

    @Test
    public void 회차와_기준_REV가_어긋나면_base_rev_no_400() {
        assertBad(in(1, 0, "IN_PROGRESS", null, null), "base_rev_no");
        assertBad(in(null, 1, "IN_PROGRESS", null, null), "base_rev_no");
        assertBad(in(null, null, "IN_PROGRESS", null, null), "base_rev_no");
        assertBad(in(0, 1, "IN_PROGRESS", null, null), "base_rev_no");
        assertBad(in(1, -1, "IN_PROGRESS", null, null), "base_rev_no");
    }

    @Test
    public void 본문이_없으면_400() {
        try {
            NoticeRoundRules.parse(null, TODAY);
            fail();
        } catch (ApiException e) {
            checkBad(e, "body");
        }
    }

    @Test
    public void 판정이_목록_밖이면_400() {
        assertEquals("판정을 하나 고르세요.", assertBad(in(null, 0, "DONE", null, null), "status_cd"));
        assertBad(in(null, 0, null, null, null), "status_cd");
    }

    @Test
    public void 지연은_다음_확인일이_내일부터_1년_안이어야_한다() {
        assertBad(in(null, 0, "DELAYED", "왜 늦나", null), "next_check_date");
        assertBad(in(null, 0, "DELAYED", "왜 늦나", TODAY.toString()), "next_check_date");
        assertBad(in(null, 0, "DELAYED", "왜 늦나", "2026-02-30"), "next_check_date");
        assertBad(in(null, 0, "DELAYED", "왜 늦나", "2026/11/20"), "next_check_date");
        assertBad(in(null, 0, "DELAYED", "왜 늦나", TODAY.plusDays(367).toString()), "next_check_date");
        assertEquals(tomorrow(), NoticeRoundRules.parse(in(null, 0, "DELAYED", "왜 늦나", tomorrow()), TODAY).nextCheck);
        NoticeRoundRules.parse(in(null, 0, "DELAYED", "왜 늦나", TODAY.plusDays(366).toString()), TODAY);
    }

    @Test
    public void 공고_종료는_다음_확인일을_버린다() {
        NoticeRoundRules.Parsed p = NoticeRoundRules.parse(in(null, 0, "CLOSED", "게시판에서 종료 확인", tomorrow()), TODAY);
        assertNull(p.nextCheck);
        assertEquals("CLOSED", p.status);
    }

    @Test
    public void 진행_중은_다음_확인일_없이도_된다() {
        NoticeRoundRules.Parsed p = NoticeRoundRules.parse(in(null, 0, "IN_PROGRESS", null, null), TODAY);
        assertNull(p.opinion);
        assertNull(p.nextCheck);
    }

    @Test
    public void 종료와_지연은_의견이_필요하다() {
        String closed = assertBad(in(null, 0, "CLOSED", "   ", null), "opinion");
        assertTrue(closed.startsWith("공고 종료로 적을 때는 의견이 필요합니다."));
        String delayed = assertBad(in(null, 0, "DELAYED", "", tomorrow()), "opinion");
        assertTrue(delayed.startsWith("지연·재공고 대기로 적을 때는 의견이 필요합니다."));
    }

    @Test
    public void 의견은_500자까지이고_코드포인트로_센다() {
        opinionBad(repeat("가", 501));
        String emoji = repeat(EMOJI, 500);   // 코드 포인트 500(UTF-16 1000)
        assertEquals(emoji, NoticeRoundRules.opinion(emoji));
        opinionBad(repeat(EMOJI, 501));
        assertEquals(repeat("가", 500), NoticeRoundRules.opinion(repeat("가", 500)));
    }

    @Test
    public void 의견_오류_문구는_입력값을_싣지_않는다() {
        String msg = opinionBad(repeat("가", 501));
        assertFalse(msg.contains("가가"));
    }

    @Test
    public void 의견의_제어_서식_구분자_서로게이트는_400() {
        assertEquals("의견에 쓸 수 없는 문자가 있습니다.", opinionBad(around(0x0007)));
        opinionBad(around(0x007F));   // DEL
        opinionBad(around(0x0085));   // C1 제어(NEL)
        opinionBad(around(0x202E));   // 방향 바꿈(FORMAT)
        opinionBad(around(0x200B));   // 폭 없는 공백(FORMAT)
        opinionBad(around(0xFEFF));   // BOM(FORMAT)
        opinionBad(around(0x2028));   // 줄 구분자
        opinionBad(around(0x2029));   // 문단 구분자
        opinionBad(around(0xD800));   // 짝 없는 서로게이트(앞쪽)
        opinionBad(around(0xDC00));   // 짝 없는 서로게이트(뒤쪽)
    }

    @Test
    public void 줄바꿈과_탭은_허용하고_CRLF는_LF로_통일한다() {
        assertEquals("가\n나\t다", NoticeRoundRules.opinion("  가\r\n나\t다\r  "));
        assertEquals("가\n나", NoticeRoundRules.opinion("가\r나"));
        assertNull(NoticeRoundRules.opinion(" \n\t "));
        assertNull(NoticeRoundRules.opinion(null));
    }

    @Test
    public void 개인정보가_걸리면_고정_문구로_400_검출값은_싣지_않는다() {
        String[] samples = {"연락처 010-1234-5678 로 확인", "주민번호 900101-1234567", "메일 hong@example.com", "카드 4111-1111-1111-1111"};   // Pii 는 Luhn 을 통과한 카드번호만 잡는다
        for (String s : samples) {
            String msg = opinionBad(s);
            assertEquals(NoticeRoundRules.OPINION_PII, msg);
            assertEquals("의견에 주민등록번호·전화번호 같은 개인정보를 적을 수 없습니다.", msg);
            assertFalse(msg.contains("1234"));
        }
    }

    @Test
    public void 평범한_의견은_통과한다() {
        String s = "시청 게시판에 2026-10-20 공고 없음. 담당 부서에 전화 확인 예정";
        assertEquals(s, NoticeRoundRules.opinion(s));
    }

    @Test
    public void 스냅샷_코드와_범위를_검사한다() {
        NoticeRoundIn a = in(null, 0, "IN_PROGRESS", null, null);
        a.setSnapshot(snap("2026-10-31", "Cycle", null, null, null));
        assertBad(a, "snapshot.due_basis");

        NoticeRoundIn b = in(null, 0, "IN_PROGRESS", null, null);
        b.setSnapshot(snap(null, null, null, null, 99999));
        assertBad(b, "snapshot.auto_days");

        NoticeRoundIn c = in(null, 0, "IN_PROGRESS", null, null);
        c.setSnapshot(snap("2026-02-30", null, null, null, null));
        assertBad(c, "snapshot.due_date");

        NoticeRoundIn d = in(null, 0, "IN_PROGRESS", null, null);
        d.setSnapshot(snap(null, null, null, "Overdue", null));
        assertBad(d, "snapshot.auto_kind");

        NoticeRoundIn ok = in(null, 0, "IN_PROGRESS", null, null);
        ok.setSnapshot(snap("2026-10-31", "cycle", Boolean.FALSE, "overdue", 16));
        NoticeRoundRules.Parsed p = NoticeRoundRules.parse(ok, TODAY);
        assertEquals("CYCLE", p.dueBasis);
        assertEquals("OVERDUE", p.autoKind);
        assertEquals(Integer.valueOf(16), p.autoDays);
        assertEquals(0, p.dueConfirmed);
        assertEquals("2026-10-31", p.dueDate);
    }

    private static NoticeRoundIn.Snapshot snap(String due, String basis, Boolean confirmed, String kind, Integer days) {
        NoticeRoundIn.Snapshot s = new NoticeRoundIn.Snapshot();
        s.setDueDate(due);
        s.setDueBasis(basis);
        s.setDueConfirmed(confirmed);
        s.setAutoKind(kind);
        s.setAutoDays(days);
        return s;
    }
}
