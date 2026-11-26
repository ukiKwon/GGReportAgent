package com.kbstar.kgi.ggreport.web.docout;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * 이사회·출연금심의위원회 발표 대본(NEXT 113 ⑤) → 출력 모델. 저장하지 않는다(그때그때 조립). DocxKit·DocModel 은 쓰기만 한다.
 * 값이 없으면 숫자를 지어내지 않고 〔… 확인 필요〕(시스템 값이 빔)·〔… 입력 필요〕(사람 칸이 빔)로 남긴다.
 * 모든 글자는 Run 일반 글자로만 넣는다(필드·하이퍼링크 없음).
 * 문구 상수는 아래에 모았다 — 금고 외 기관 문장은 사용자 답(planner Q3)을 받으면 여기만 바꾼다.
 */
public final class BoardScriptDocBuilder {

    public static final String MEETING_BOARD = "BOARD";
    public static final String MEETING_COMMITTEE = "COMMITTEE";
    public static final String AMOUNT_EXCL_IT = "EXCL_IT";
    public static final String AMOUNT_TOTAL = "TOTAL";
    public static final String DEFAULT_ACCOUNTING = "무형자산";

    static final String DRAFT_PREFIX = "[확정 전 초안] ";
    // ── 기관 유형별 문구(지자체·교육청 = GOV, 그 밖 = OTHER) ──
    static final String BID_GOV = "금고 지정";
    static final String BID_OTHER = "주거래은행 선정";
    static final String BANK_GOV = "금고은행";
    static final String BANK_OTHER = "주거래은행";
    static final String REVIEW_GOV = "금고지정 심의·평가";
    static final String REVIEW_OTHER = "주거래은행 선정 심의·평가";
    static final String SCOPE_GOV = "지자체별 ";
    static final String SCOPE_OTHER = "";
    static final String DEPOSIT_GOV = "세입 및 세출, 특별회계, 기금 등 회계별 운용자금을 당행에 예치하게 됩니다.";
    static final String DEPOSIT_OTHER = "〔이행사항(예치 회계) 문장 입력 필요〕";
    static final String EFFECT_CLOSE = "이를 통해 당행의 기관영업 입지를 확대해나가고자 합니다.";
    static final String NO_BOARD = "이사회 자료 없음 — 확인 필요";

    private BoardScriptDocBuilder() {
    }

    public static boolean isGov(String instType) {
        String t = instType == null ? "" : instType.trim();
        return "지자체".equals(t) || "교육청".equals(t);   // 비어 있으면 '그 밖'(괄호 표시가 눈에 띄도록 보수적으로)
    }

    public static DocModel build(BoardScriptInput in) {
        final boolean gov = isGov(in.instType);
        final String inst = orMark(in.instName, "기관명 확인 필요");
        final String q = "「" + inst + "」";
        final String bid = gov ? BID_GOV : BID_OTHER;
        final String bank = gov ? BANK_GOV : BANK_OTHER;
        List<DocModel.Block> b = new ArrayList<DocModel.Block>();

        // 제목
        String year = in.year == null ? mark("연도 확인 필요") : String.valueOf(in.year);
        String meeting = MEETING_COMMITTEE.equals(in.meeting) ? "출연금심의위원회" : "이사회";
        b.add(new DocModel.Heading((in.draft ? DRAFT_PREFIX : "") + year + "년 제" + orMark(in.round, "차수 입력 필요") + "차 "
                + meeting + " 시나리오", 14));

        // 인사
        b.add(line("안녕하십니까? " + orMark(in.speakerDept, "소속 입력 필요") + " " + orMark(in.speakerName, "발표자 이름 입력 필요")
                + " " + orMark(in.speakerTitle, "직함 입력 필요") + "입니다."));

        // 기관별 사전 설명(비면 문단 전체 생략)
        if (!in.intro.isEmpty()) {
            b.add(line("보고에 앞서 기관 관련 사항을 설명드리겠습니다."));
            addLines(b, in.intro);
        }

        // 의안 소개
        b.add(line("그럼 지금부터"));
        b.add(line("의안번호 " + orMark(in.agendaNo, "의안번호 입력 필요")));
        b.add(line(q + " " + bid + " 입찰 제안을 위한 출연금 지급 승인(안)"));
        b.add(line("보고드리겠습니다."));

        // 제안 배경
        b.add(sub("제안 배경입니다."));
        b.add(line(orMark(in.region, "지역 확인 필요") + " 내 기관영업 거점을 확보하는 동시에"));
        b.add(line("운영자금 예치 및 우량고객 기반 확대로 당행 수익증대에 기여하고자"));
        b.add(line(q + " " + bank + " 유치를 추진하게 되었습니다."));

        // 기관 현황 및 일정
        b.add(sub("기관 현황 및 일정입니다."));
        String budget = orMark(in.budget, "예산 확인 필요");
        b.add(line(inst + KoreanJosa.eunNeun(inst) + " 임직원 수 " + orMark(in.staff, "임직원 수 확인 필요") + ", 예산규모는 "
                + budget + KoreanJosa.euroRo(budget)));   // 샘플: "…9,999억원으로"
        String bankNow = orMark(in.currentBank, "현 거래 은행 확인 필요");
        if (gov) {   // 샘플: "현재 …은행이 영종구금고를 맡고 있습니다."
            b.add(line("현재 " + bankNow + KoreanJosa.iGa(bankNow) + " " + inst + "금고를 맡고 있습니다."));
        } else {
            b.add(line("현재 주거래은행은 " + bankNow + "입니다."));
        }
        addLines(b, in.statusNote);
        String years = in.termYears == null ? mark("약정기간 입력 필요") : "총 " + in.termYears + "년";
        b.add(line((gov ? "금고 약정기간은 " : "약정기간은 ") + dateText(in.termStart) + "부터 " + years + "이며,"));
        b.add(line(orMark(in.reviewWhen, "심의 예상 시기 입력 필요") + " " + (gov ? REVIEW_GOV : REVIEW_OTHER)
                + "를 진행할 것으로 예상하고 있습니다."));

        // 출연금 지급 승인(안)
        b.add(sub("다음으로 출연금 지급 승인(안)에 대해 보고드리겠습니다."));
        b.add(line("출연금은 예비비 포함하여 " + (gov ? SCOPE_GOV : SCOPE_OTHER) + "출연금 총액 승인 범위 내에서 제안하고자 하며,"));
        b.add(line("승인받고자 하는 총 금액은 " + amountText(in) + "입니다."));
        b.add(line("최종 제안은 경쟁은행 동향 등을 고려하여 출연금 총액 승인범위 내에서"));
        b.add(line("제안하도록 하겠습니다."));

        // 주요 이행사항
        b.add(sub(bank + " 선정 시 주요 이행사항입니다."));
        String yearsLong = in.termYears == null ? mark("약정기간 입력 필요") : in.termYears + "년간";
        b.add(line(q + KoreanJosa.eunNeun(inst) + " 당행을 " + yearsLong + " " + bank + "으로 지정하고,"));
        b.add(line(gov ? DEPOSIT_GOV : DEPOSIT_OTHER));
        b.add(line("자세한 내용은 본문 참고 부탁드립니다."));

        // 기대효과
        b.add(sub("기대효과입니다."));
        List<String> effect = !in.effect.isEmpty() ? in.effect : in.effectDefault;
        if (effect.isEmpty()) {
            b.add(line(mark("기대효과 입력 필요")));
        } else {
            addLines(b, effect);
        }
        b.add(line(EFFECT_CLOSE));

        // 수익성분석
        b.add(sub("다음으로 수익성분석에 대해 보고드리겠습니다."));
        String profit = in.profit != null ? fmtFixed2(in.profit) + "억원"
                : mark(in.boardMissing ? NO_BOARD : "이사회 자료 표 B 순이익 확인 필요");
        b.add(line("소요비용 및 출연금을 감안한 순이익은 명목가치 기준 " + profit + "입니다."));
        addLines(b, in.profitNote);
        b.add(line("출연금은 출연금운영규정을 준수하여"));
        b.add(line("현재가치 기준 예상영업이익 범위 내에서 제의하고자 합니다."));
        b.add(line("수익성분석의 세부사항은 붙임 자료를 참조하여 주시기 바랍니다."));

        // 기타사항
        b.add(sub("마지막으로 기타사항입니다."));
        String acc = blank(in.accounting) ? DEFAULT_ACCOUNTING : in.accounting.trim();
        b.add(line("출연금은 " + acc + KoreanJosa.euroRo(acc) + " 회계처리하겠습니다."));

        // 맺음
        b.add(line("이상으로 " + q + " " + bid + " 입찰 제안 관련"));
        b.add(line("출연금 지급 승인(안) 보고를 마치겠습니다."));
        return new DocModel(b);
    }

    // ── 도우미 ──────────────────────────────────────────────────────────

    private static String amountText(BoardScriptInput in) {
        BigDecimal v = AMOUNT_TOTAL.equals(in.amountMode) ? in.amountTotal : in.amountExclIt;
        if (v != null) {
            return fmtAmount(v) + "억원";
        }
        return mark(in.boardMissing ? NO_BOARD : "이사회 자료 표 A 확인 필요");
    }

    /** 승인 총액 — 끝자리 0을 뗀다(6, 99.5, 1,234). */
    static String fmtAmount(BigDecimal v) {
        BigDecimal s = v.setScale(2, RoundingMode.HALF_UP).stripTrailingZeros();
        if (s.scale() < 0) {
            s = s.setScale(0);
        }
        String pat = s.scale() == 0 ? "#,##0" : s.scale() == 1 ? "#,##0.0" : "#,##0.00";
        return format(s, pat);
    }

    /** 표 B 순이익 — 소수 2자리 고정(이사회 자료와 같다). */
    static String fmtFixed2(BigDecimal v) {
        return format(v.setScale(2, RoundingMode.HALF_UP), "#,##0.00");
    }

    private static String format(BigDecimal v, String pattern) {
        DecimalFormat df = new DecimalFormat(pattern, DecimalFormatSymbols.getInstance(Locale.ROOT));
        df.setRoundingMode(RoundingMode.HALF_UP);
        return df.format(v);
    }

    /** YYYY-MM-DD → "2027년 1월 1일". 형식이 아니거나 없으면 괄호 표시. */
    static String dateText(String iso) {
        if (iso != null && iso.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) {
            return Integer.parseInt(iso.substring(0, 4)) + "년 " + Integer.parseInt(iso.substring(5, 7)) + "월 "
                    + Integer.parseInt(iso.substring(8, 10)) + "일";
        }
        return mark("약정 시작일 확인 필요");
    }

    private static boolean blank(String s) {
        return s == null || s.trim().isEmpty();
    }

    static String mark(String what) {
        return "〔" + what + "〕";
    }

    private static String orMark(String v, String what) {
        return blank(v) ? mark(what) : v.trim();
    }

    private static DocModel.Para line(String text) {
        return DocModel.Para.plain(text);
    }

    /** 문단 소제목 — 굵게(샘플의 '<n페이지>' 자리). */
    private static DocModel.Para sub(String text) {
        return DocModel.Para.of(DocModel.Bullet.NONE, 0, DocModel.Run.bold(text)).withSpacing(10, 2);
    }

    private static void addLines(List<DocModel.Block> b, List<String> lines) {
        for (String s : lines) {
            if (!blank(s)) {
                b.add(line(s.trim()));
            }
        }
    }
}
