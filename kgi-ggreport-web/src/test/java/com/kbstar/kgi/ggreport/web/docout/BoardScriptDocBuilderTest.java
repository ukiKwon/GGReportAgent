package com.kbstar.kgi.ggreport.web.docout;

import org.junit.Test;

import java.math.BigDecimal;
import java.util.Arrays;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** NEXT 113 ⑤ 발표 대본 조립 — DB·스프링 없음. 문단 글자를 모델에서 직접 읽는다. */
public class BoardScriptDocBuilderTest {

    private static String text(BoardScriptInput in) {
        StringBuilder sb = new StringBuilder();
        for (DocModel.Block b : BoardScriptDocBuilder.build(in).getBlocks()) {
            if (b instanceof DocModel.Heading) {
                sb.append(((DocModel.Heading) b).getText()).append('\n');
            } else if (b instanceof DocModel.Para) {
                for (DocModel.Run r : ((DocModel.Para) b).getRuns()) {
                    sb.append(r.getText());
                }
                sb.append('\n');
            }
        }
        return sb.toString();
    }

    private static BoardScriptInput full() {
        BoardScriptInput in = new BoardScriptInput();
        in.instName = "가상구";
        in.instType = "지자체";
        in.region = "가상시";
        in.year = 2026;
        in.staff = "999명";
        in.budget = "9,999억원";
        in.currentBank = "가상은행";
        in.termStart = "2027-01-01";
        in.amountExclIt = new BigDecimal("6.00");
        in.amountTotal = new BigDecimal("9.00");
        in.profit = new BigDecimal("10.14");
        in.round = "10";
        in.agendaNo = "제 2026-10-03호";
        in.speakerDept = "기관영업부";
        in.speakerName = "가상발표자";
        in.speakerTitle = "부장";
        in.termYears = 4;
        in.reviewWhen = "10월 중";
        in.effectDefault = Arrays.asList("가상 기대효과");   // 비면 〔기대효과 입력 필요〕가 남는다
        return in;
    }

    @Test
    public void 값이_다_있으면_샘플_흐름대로_채운다() {
        String t = text(full());
        assertTrue(t, t.startsWith("2026년 제10차 이사회 시나리오\n"));
        assertTrue(t, t.contains("안녕하십니까? 기관영업부 가상발표자 부장입니다."));
        assertTrue(t, t.contains("의안번호 제 2026-10-03호"));
        assertTrue(t, t.contains("「가상구」 금고 지정 입찰 제안을 위한 출연금 지급 승인(안)"));
        assertTrue(t, t.contains("가상시 내 기관영업 거점을 확보하는 동시에"));
        assertTrue(t, t.contains("가상구는 임직원 수 999명, 예산규모는 9,999억원으로\n"));
        assertTrue(t, t.contains("현재 가상은행이 가상구금고를 맡고 있습니다."));
        assertTrue(t, t.contains("금고 약정기간은 2027년 1월 1일부터 총 4년이며,"));
        assertTrue(t, t.contains("10월 중 금고지정 심의·평가를 진행할 것으로 예상하고 있습니다."));
        assertTrue(t, t.contains("출연금은 예비비 포함하여 지자체별 출연금 총액 승인 범위 내에서"));
        assertTrue(t, t.contains("승인받고자 하는 총 금액은 9억원입니다."));   // 기본 = 표 합계(출연금+예비비 6 아님)
        assertTrue(t, t.contains("「가상구」는 당행을 4년간 금고은행으로 지정하고,"));
        assertTrue(t, t.contains("순이익은 명목가치 기준 10.14억원입니다."));
        assertTrue(t, t.contains("출연금은 무형자산으로 회계처리하겠습니다."));
        assertFalse(t, t.contains("〔"));
        assertFalse(t, t.contains("페이지"));
        assertFalse(t, t.contains("[확정 전 초안]"));   // draft=false
    }

    @Test
    public void 값이_없으면_숫자를_지어내지_않고_괄호_표시한다() {
        BoardScriptInput in = new BoardScriptInput();
        in.boardMissing = true;
        in.draft = true;
        String t = text(in);
        assertTrue(t, t.startsWith("[확정 전 초안] 〔연도 확인 필요〕년 제〔차수 입력 필요〕차 이사회 시나리오\n"));
        assertTrue(t, t.contains("〔의안번호 입력 필요〕"));
        assertTrue(t, t.contains("〔약정기간 입력 필요〕"));
        assertTrue(t, t.contains("〔약정 시작일 확인 필요〕부터"));
        assertTrue(t, t.contains("승인받고자 하는 총 금액은 〔이사회 자료 없음 — 확인 필요〕입니다."));
        assertTrue(t, t.contains("명목가치 기준 〔이사회 자료 없음 — 확인 필요〕입니다."));
        assertTrue(t, t.contains("〔기대효과 입력 필요〕"));
        assertTrue(t, t.contains("〔임직원 수 확인 필요〕"));
        assertFalse("숫자+억원이 만들어지면 안 된다", t.matches("(?s).*[0-9]억원.*"));
    }

    @Test
    public void 자료는_있는데_표가_빠졌으면_표_이름을_알린다() {
        BoardScriptInput in = new BoardScriptInput();
        in.boardMissing = false;
        String t = text(in);
        assertTrue(t, t.contains("〔이사회 자료 표 A 확인 필요〕"));
        assertTrue(t, t.contains("〔이사회 자료 표 B 순이익 확인 필요〕"));
    }

    @Test
    public void 금액_기준_기본은_표_A_합계이고_합계가_출연금_예비비_합과_달라도_합계를_쓴다() {
        BoardScriptInput in = full();   // 합계 9 ≠ 출연금+예비비 6
        assertEquals(BoardScriptDocBuilder.AMOUNT_TOTAL, in.amountMode);
        assertTrue(text(in).contains("승인받고자 하는 총 금액은 9억원입니다."));
        assertFalse(text(in).contains("총 금액은 6억원"));
        in.amountMode = null;   // 비어 있어도 합계
        assertTrue(text(in).contains("총 금액은 9억원입니다."));
        in.amountTotal = null;  // 합계가 없으면 출연금+예비비로 대신하지 않고 확인 필요
        assertTrue(text(in).contains("〔이사회 자료 표 A 확인 필요〕"));
    }

    @Test
    public void 금액_기준_EXCL_IT를_명시하면_출연금_예비비_합을_쓴다() {
        BoardScriptInput in = full();
        in.amountMode = BoardScriptDocBuilder.AMOUNT_EXCL_IT;
        assertTrue(text(in).contains("승인받고자 하는 총 금액은 6억원입니다."));
    }

    @Test
    public void 금액_자릿수_규칙() {
        assertEquals("6", BoardScriptDocBuilder.fmtAmount(new BigDecimal("6.00")));
        assertEquals("99.5", BoardScriptDocBuilder.fmtAmount(new BigDecimal("99.50")));
        assertEquals("99.25", BoardScriptDocBuilder.fmtAmount(new BigDecimal("99.25")));
        assertEquals("1,234", BoardScriptDocBuilder.fmtAmount(new BigDecimal("1234.00")));
        assertEquals("0", BoardScriptDocBuilder.fmtAmount(new BigDecimal("0.00")));
        assertEquals("10.10", BoardScriptDocBuilder.fmtFixed2(new BigDecimal("10.1")));
    }

    @Test
    public void 초안이면_제목에_표시한다() {
        BoardScriptInput in = full();
        in.draft = true;
        assertTrue(text(in).startsWith("[확정 전 초안] 2026년 제10차 이사회 시나리오\n"));
    }

    @Test
    public void 출연금심의위원회_회의_이름() {
        BoardScriptInput in = full();
        in.meeting = BoardScriptDocBuilder.MEETING_COMMITTEE;
        assertTrue(text(in).startsWith("2026년 제10차 출연금심의위원회 시나리오\n"));
    }

    @Test
    public void 금고_외_기관은_주거래은행_문장이고_회계_문장은_입력_필요() {
        BoardScriptInput in = full();
        in.instType = "공공기관";
        String t = text(in);
        assertFalse(t, t.contains("금고"));
        assertFalse(t, t.contains("지자체별"));
        assertTrue(t, t.contains("「가상구」 주거래은행 선정 입찰 제안을 위한 출연금 지급 승인(안)"));
        assertTrue(t, t.contains("「가상구」 주거래은행 유치를 추진하게 되었습니다."));
        assertTrue(t, t.contains("당행을 4년간 주거래은행으로 지정하고,"));
        assertTrue(t, t.contains("〔이행사항(예치 회계) 문장 입력 필요〕"));
        assertTrue(t, t.contains("10월 중 주거래은행 선정 심의·평가를 진행할 것으로"));
        assertFalse(t, t.contains("세입 및 세출"));
    }

    @Test
    public void 유형이_비어_있으면_그_밖으로_본다() {
        BoardScriptInput in = full();
        in.instType = null;
        assertFalse(text(in).contains("금고"));
    }

    @Test
    public void 사전_설명은_비면_문단을_생략하고_있으면_줄마다_넣는다() {
        BoardScriptInput in = full();
        assertFalse(text(in).contains("보고에 앞서"));
        in.intro = Arrays.asList("첫 줄", "둘째 줄");
        String t = text(in);
        assertTrue(t, t.contains("보고에 앞서 기관 관련 사항을 설명드리겠습니다.\n첫 줄\n둘째 줄\n그럼 지금부터"));
    }

    @Test
    public void 기대효과는_손_입력이_요약_양식_기본값을_덮는다() {
        BoardScriptInput in = full();
        in.effectDefault = Arrays.asList("기본 효과 1", "기본 효과 2");
        String t = text(in);
        assertTrue(t, t.contains("기본 효과 1\n기본 효과 2\n" + BoardScriptDocBuilder.EFFECT_CLOSE));
        in.effect = Arrays.asList("손 효과");
        t = text(in);
        assertTrue(t, t.contains("손 효과\n" + BoardScriptDocBuilder.EFFECT_CLOSE));
        assertFalse(t, t.contains("기본 효과"));
    }

    @Test
    public void 부연_줄과_회계처리_기본값과_조사() {
        BoardScriptInput in = full();
        in.statusNote = Arrays.asList("과거 가상군의 금고은행이었던 가상은행");
        in.profitNote = Arrays.asList("보수적으로 산출");
        in.accounting = "비용";
        String t = text(in);
        assertTrue(t, t.contains("현재 가상은행이 가상구금고를 맡고 있습니다.\n과거 가상군의 금고은행이었던 가상은행\n"));
        assertTrue(t, t.contains("순이익은 명목가치 기준 10.14억원입니다.\n보수적으로 산출\n"));
        assertTrue(t, t.contains("출연금은 비용으로 회계처리하겠습니다."));   // 용 → ㅇ → 으로
        in.accounting = "무형자산";
        assertTrue(text(in).contains("무형자산으로"));
    }

    @Test
    public void 소제목은_굵은_글자이고_Word로_만들어진다() {
        BoardScriptInput in = full();
        boolean boldFound = false;
        for (DocModel.Block b : BoardScriptDocBuilder.build(in).getBlocks()) {
            if (b instanceof DocModel.Para && ((DocModel.Para) b).getRuns().get(0).isBold()
                    && ((DocModel.Para) b).getRuns().get(0).getText().equals("제안 배경입니다.")) {
                boldFound = true;
            }
        }
        assertTrue(boldFound);
        byte[] bytes = DocxKit.render(BoardScriptDocBuilder.build(in), DocxKit.Footer.pageNumberOnly());
        assertEquals('P', bytes[0]);
        assertEquals('K', bytes[1]);
    }
}
