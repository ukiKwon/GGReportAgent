package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BidPrep;
import com.kbstar.kgi.ggreport.web.domain.SysUser;

import java.util.List;

/**
 * 발표 대본 AI 초안의 '공고 자료' 자리(NEXT 129 ⑤, 사용자 11-26 A-6). <b>지금은 구현이 없다</b> — 빈이 없으면 공고 자료 없이 만든다.
 * 구현 규칙: 그 건(bid)의 값만 · 사람 이름이 들어갈 수 있는 칸·URL·파일명·첨부 번호는 넣지 않는다 · 한 줄 = 사실 하나.
 * 리더가 줄마다 clean(제어문자·Pii·7자리 숫자 버림)·300자 자르기·최대 20줄·합계 3,000자를 다시 적용한다(구현을 믿지 않는다).
 * 호출은 읽기 전용 트랜잭션 안 — 파일 파싱처럼 오래 걸리는 일은 시간 상한(ScoringTable.extractTimed 같은)을 둔다.
 */
public interface NoticeBasisSource {
    List<String> lines(SysUser me, BidPrep p);
}
