# 다음 세션 시작점 (항상 최신 1개 — 덮어쓴다)

마지막 갱신: 2026-11-26(목) 15시 main 마무리 — 6세션(ca·6e·0d·0a=e4·b3·16=c3) 작업·커밋 끝, main 푸시. 오늘 요약: handoff/2026-11-26_summary.md `## Session 08:00`(db)·`## Session 15:00 (main 마무리)`. 근거 보고서: handoff/agents/<역할>/2026-11-26_*. **규칙(사용자 11-26)**: NEXT·START 항목엔 handoff 자료 경로 우선, 해소 과제는 두 파일에서 반드시 뺀다(CLAUDE.md 4절).

**사용자 11-26 15시**: 오늘 16시 이후 다른 세션에서 하던 작업은 모두 새 세션으로 다시 시작한다 — 각 세션은 아래 '이어갈 일'의 handoff 자료 경로에서 이어 받는다.

## 첫 순서 (main, 묻지 않고 실행)
1. `git pull`(kgi-report-web-dev) → 환경 점검(CLAUDE.md 3절 ⓐ~ⓔ) → `ListAgents`로 세션 정체 확인(이름은 세션마다 바뀜).
2. **이 PC 환경(11-26)**: mvn = PATH의 apache-maven-3.9.16, JDK8 jdk8u504-b01, 로컬 DB 064까지 적용(11-26 저녁 사용자, 8080 = 921447e1 빌드). 다음 번호 065(6e)·066(ca)·067(6e), 샘플은 사용자 Downloads\sample(저장소 밖). 다른 PC면 `node kgi-ggreport-web/tools/db/apply-mysql.mjs --status`부터.
3. **8080은 커밋된 HEAD만**: `c:/github/_gg_build`에서 `git checkout -q --detach <HEAD>` → kgi-ggreport-web에서 `mvn -q -o package -DskipTests`(MAVEN_OPTS=-Xmx384m) → war를 scratchpad로 복사해 그 사본을 `java -Xmx768m -jar`로 main 폴더 kgi-ggreport-web에서 띄움. **실행 인자에 `--ggreport.plan-inbox.location=C:/Users/superuser/Downloads/inout/plan/inbox`를 붙인다**(55 기관 사업계획 반입 대기 파일, 11-26 16시 — 읽기만). 전체 mvn도 _gg_build에서 `-DargLine="-Xmx768m"`(11-26 62d1ea77 2710/0/0). 화면만 바뀐 커밋은 재기동 불필요. design_history 다음 장 **134**.
4. **공유 .git/index는 늘 뒤처진다**(세션마다 임시 인덱스로 커밋하기 때문) — 커밋은 반드시 `GIT_INDEX_FILE=.git/index.<세션>.tmp`, 공유 인덱스로 커밋 금지. 필요하면 `git reset -q`(작업 파일 무변경)로 맞춘다.

## 이어갈 일 (세션별 — 자세한 내용은 경로의 자료)
- **6e(제안 준비 현황)**: ① 125 1단계 화면·서버 실측(8080 = 921447e1, /preps 응답에 bid_subject_cd·bid_subject_name 확인됨) ② NEXT 125 db 몫 — DB 065·067 → S3a 한 커밋(PrepStage5·120 ① 서버 + prepboard.js·preptask.js, 해시를 ca에 전달) → S3b ③ 125 화면 열(입찰 대상·공고명, A안) ④ NEXT 113(대본 '이사회' 고정 적용·요약서 여백·design_history 장·화면 실측) → 121 ①~⑥. 자료: handoff/sessions/2026-11-26_0900_dash.md '19시 덧붙임', 설계 handoff/agents/backend-dev/2026-11-26_1708_a12c06a4.md·1737_a12c06a4.md(+같은 폴더 a12c06a4 최종판), 검토 handoff/agents/qa-verifier/2026-11-26_1714_abbe2e11.md, 시안 handoff/agents/history/2026-11-26_입찰대상_목록_시안/index.html.
- **ca(입찰 현황판)**: NEXT 120 ① 2차 서버·② 기획 판정 → 114 ②~⑤. 자료: handoff/sessions/2026-11-26_0921_ca.md. security 후속(하): 응답 tag_source DEFAULT→NONE을 화면이 쓰는지, 옛 GOAL 이월 행 처리(data-auditor) — handoff/agents/security/ 11-26 15시대 PUSH-GATE 보고서.
- **0d(디자인 검토)**: NEXT 124 남은 몫. 자료: handoff/sessions/2026-11-19_1930_0d.md '11-26'.
- **e4(기관장)**: NEXT 77 — 옛 경력 12줄·qa P3·Word 실물·법원장 사진. 자료: handoff/sessions/2026-11-25_2020_e4.md '11-26'. 잊지 말 것: Word '요약'에는 연도·일자 정보가 없다.
- **b3(시작화면)**: NEXT 126. 자료: handoff/sessions/2026-11-26_1400_b3.md.
- **c3(랜딩)**: NEXT 127(캡처 4자리 가상 자료로). 자료: handoff/sessions/2026-11-26_1112_c3.md.
- **f4(AI 기능 개발)**: NEXT 129 — 이 PC Ollama 시범으로 ⑤ 대본 서술 4칸 초안 → ⑥ 기대효과 → ① 이유 한 줄, 랜딩과 다른 3곳은 기능을 랜딩에 맞춰 만듦(사용자 11-26 저녁). 자료: handoff/agents/history/2026-11-26_AI기능_개발.md(대조 결과·결정·순서), 설계 보고서 handoff/agents/backend-dev·planner/2026-11-26_19*.
- **bf(예상 공고현황, 미기동)**: NEXT 122 qa P2-1·P2-2, 119. 자료: handoff/sessions/2026-11-25_1755_map.md.
- **main**: W48 주간 보고(11-27 금, docs/pm_history/index.html) + 질문 장부 정리(아래), NEXT 108 → 99 → 100, worktree 정리(_gg_ca·_gg_dash·_gg_e4test에 미커밋 시험 변경 — 각 세션 확인 뒤).

## 다시 물을 것 (선택식, 답 받을 때까지 멈춤)
- **113 ⑤ 발표 대본**(회의 이름 = '이사회' 고정, 11-26 답): 승인 총액 기준(출연금+예비비/표 합계), 주거래은행 기관 문장, 샘플 판독 2곳('어업보상금'·'2조 3,671억원'). 자료 handoff/sessions/2026-11-26_0900_dash.md.
- **NEXT 125 한 기관 여러 공고**(담당자·결재는 입찰마다 따로, 11-26 답): 수집 검색어에 "금융기관 선정"·"법인카드"·"자금관리" 추가.
- **NEXT 120 ②**: 탈락·유찰 세는 법(Q-25-44), 제출·선정 기록 위치(Q-25-45), 협약식 없는 기관의 '협약 완료' 기준(Q-25-48).
- **주간 수집 실행기**(Q-2026-11-24-15, 11-30 09:00 전): 옛 PC 작업 스케줄러 변경·이 PC로 옮길지.
- 작업에 붙인 질문: Q-25-18(ca 101), Q-25-53(122 P2 뒤), 0d 빈 사유 표시 시점·폐쇄망 브라우저 `:has` 지원(124), 공고문 견본(Q-24-13), 법원장 사진(Q-24-23), 업로더(Q-24-54·55).
- 장부 정리안(pm 11-26 PUSH-GATE): done 후보 Q-25-43·26-05·26-08·26-06·26-07·25-40~42·25-49·25-50·25-15·26-01·25-56·25-91·26-10·26-11 / hold 후보 Q-25-16·17·19·20·22~33(db 일괄 확인) / Q-26-09 확인 필요.

## 미해결 이슈 상기 (세션 첫 답변에서 3~5줄)
- **[보안]** 121 ①~⑥ 잔여(옛 refresh 호환 거두기·상세 체크 감사 이름·결과 기억 상한·F4ⓐ·옛 /assignee-change·매퍼 DEBUG 로그).
- **[운영 배포 순서]** DB 먼저(026·030~063 — 049는 051 뒤 번호 역전, 052는 시험 계정 이름 바꿈이라 운영 대상 확인, 053은 05 예약 사용 여부 확인), 서버는 나중. Oracle 11g 대체본(NEXT 9), hwplib 1.1.9 오프라인 반입, 운영 USERS '본부장' 직위 확인, 회의록 운영 켜기 전 multipart 임시 파일(패치 I), 개발 설정 ggreport.errors.detail=false(123).
- **[할인율 가짜 값]** 3.30% 임시 가림, 이사회 수익성 화면 숫자도 가짜(NEXT 37·66).
- **[보안 수용]** X-Emp-No 자기신고(SSO 전, NEXT 35), 세 팀 /tasks 쓰기 무인증, 클로바 수칙, 기관장 사진 출처 없이 Word, 서버 confirm 게이트.
- **[브라우저 한 번에 한 세션]** Playwright Chrome 창을 사용자가 직접 쓰면 qa 조작이 섞인다 — qa 전에 알린다.

## 사용자 목표·방향 (불변)
내부망에서 화면에 필요한 DB와 LLM 최소 기능. **LLM은 업무 서비스·DB가 다 만들어진 뒤.** DB는 MySQL(로컬)+Oracle(회사) 쌍, **회사 DB에는 외래키 없음**(코드표는 가능), 로컬 MySQL 적용은 `kgi-ggreport-web/tools/db/apply-mysql.mjs`. 메뉴·업무 흐름은 업무 대분류 5 + 시스템 관리. **사무실 PC 전용**(좁은 폭 미지원). **결재 끝난 건의 모든 행위는 누가·어느 화면·어느 버튼인지 기록**(잊지 말 것). 입찰 현황판은 지금 모양 그대로 현업과 무엇을 살릴지 정한다(11-13). 팀 이름은 부서 이름이 된다(영업부서·개발부서·재무부서·사업부서, 직책 이름은 그대로, 11-17·19). **이 시스템 때문에 일을 두 번 하지 않는다(11-19).** 회의록 공개 대상은 영업부서·임원급(11-24).

## 이 파일의 규칙
- 작업 한 바퀴를 끝내며 사용자에게 '다음 단계·남은 질문·권장 순서'를 말했다면 같은 내용을 이 파일에 덮어쓴다(CLAUDE.md 4절). 해소한 과제는 여기서도 뺀다.
- 에이전트 보고서는 SubagentStop 훅이 `handoff/agents/<역할>/`에 자동 저장한다. 사람이 읽는 정리는 `docs/pm_history/`(에이전트별 일괄 정리)·`docs/design_history/`(화면 전/후).
