package com.kbstar.kgi.ggreport.web.docout;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * 발표 대본(NEXT 113 ⑤) 조립 입력 — 자동 값과 손 입력 값을 한 곳에 모은 값 모음. 문자열 null·빈 글자는 '값 없음'이다(조립이 〔…〕 표시로 바꾼다).
 * 손 입력 값은 서비스가 제어문자·길이를 검사한 뒤 넣는다. 조립은 이 값을 Run 글자로만 쓴다.
 */
public final class BoardScriptInput {
    // ── 자동 값 ──
    public String instName;
    public String instType;                 // 지자체·교육청이면 금고 문장
    public String region;                   // 시·도 짧은 이름(예 '인천')
    public Integer year;                    // 이사회 날짜 연도, 없으면 boardYear
    public boolean draft;                   // 확정 전 값이 섞였거나 확정 판이 없음 → 제목에 [확정 전 초안]
    public boolean boardMissing;            // 이사회 자료(값) 자체가 없음·볼 수 없음
    public String staff;                    // 요약 양식(사람이 쓴 문자열 — 단위를 붙이지 않는다)
    public String budget;
    public String currentBank;
    public List<String> effectDefault = new ArrayList<String>();
    public String termStart;                // YYYY-MM-DD
    public BigDecimal amountExclIt;         // 표 A 출연금+예비비(억원)
    public BigDecimal amountTotal;          // 표 A 합계(억원)
    public BigDecimal profit;               // 표 B 명목가치 순이익(억원)
    // ── 손 입력 ──
    public String meeting = BoardScriptDocBuilder.MEETING_BOARD;
    public String amountMode = BoardScriptDocBuilder.AMOUNT_EXCL_IT;
    public String round;
    public String agendaNo;
    public String speakerDept;
    public String speakerName;
    public String speakerTitle;
    public Integer termYears;
    public String reviewWhen;
    public String accounting;
    public List<String> intro = new ArrayList<String>();
    public List<String> statusNote = new ArrayList<String>();
    public List<String> effect = new ArrayList<String>();
    public List<String> profitNote = new ArrayList<String>();
}
