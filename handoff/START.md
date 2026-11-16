# 다음 세션 시작점 (항상 최신 1개 — 덮어쓴다)

마지막 갱신: 2026-11-16(월) 마무리 (세션 9f·c0·d9·4c) — 오늘 요약: `handoff/2026-11-16_summary.md`

## 다음 세션 먼저 할 일 (PM 11-16 마무리 순서 — handoff/agents/pm/ 11-16 최신, 묻지 않고 실행)
0. **환경**: MySQL `C:\dev\mysql-start.cmd`, `ListAgents`, 8080 담당 정함(아침 d9 → 9f). JDK `C:\Users\superuser\AppData\Local\Programs\Eclipse Adoptium\jdk8u504-b01`, Maven `C:\Users\superuser\tools\apache-maven-3.9.16\bin`. 8080은 `java -jar target/kgi-ggreport-web.war`(kgi-ggreport-web에서).
1. **사용자 터미널 1회**: 037(·040, c0가 SCHEMA_PROBES 040 줄을 넣은 뒤) mysql 직접 적용 → `node kgi-ggreport-web/tools/db/apply-mysql.mjs --mark-applied 033,036,037,038 --dry-run` → 통과면 `--dry-run` 빼고 실제 기록. 039는 89 적용 뒤 따로(mysql 직접 + `--mark-applied 039`).
2. **병렬**: d9 = war 재빌드 → 8080 → 사용자 관리자 curl 4건(동대문·동작·중구·노원 새 판) → 화면 확인(NEXT 56-3). ∥ 9f = NEXT 89 개정·델타 패치 파일 적용(handoff/agents/backend-dev/2026-11-16_1813·1814, 빌드는 d9 뒤). ∥ c0 = NEXT 30 2단계 화면(frontend-dev-write, 플랜 모드 끄고 — frontend-dev 1821 계획대로).
3. **9f**: 89 mvn → 039 로컬(사용자) → 8080 재기동 → security(적용분) → 커밋. 89 화면은 c0의 dashboard.js 커밋 뒤(frontend-dev → qa → design_history ㊸, design-reviewer 11-16 규격 6-1·6-2).
4. **기다리는 동안 9f**: NEXT 90 외부 확인 — collector SCHEMA v1 확장(찾지 못함·보도·매칭 신뢰도)·반입 개인정보 재검사 설계(backend-dev → security).
5. NEXT 84 남은 하(DENIED·413 URI·동시 저장 OLD_VAL·JSON 400 시험·ApiExceptionHandler 로그 시험, 5xx ApiException 로그 메시지), 56 이관 기획(중구 연차 7행·동작 중복 3건).
6. **11-20(금) W47**: PM 주간 보고·에이전트별 정리·'이번 주 질문' 표(docs/pm_history), 요구사항 자료 docs/요구사항 파악/index_2026-11-20.html(현황판/공고 현황 역할, 공고 PDF·배점표 현업 질문 Q-36, 종류 6종·기관 정보 변경 창).
7. **대시보드 공사판(NEXT 31, 4c)**: design_history ㉞ 후속 장 → 고도 구간·공정 조정.

## 내일 다시 물을 것 (질문은 plan 모드 + 선택식, 답 받을 때까지 멈춤)
- 금고 약정 취소에 영업부장도 포함?(Q-106 후속 — 지금 설계 HeadRules.isLead = 팀장·부장, 기관장 무효와 같음. 답 전에는 팀장·부장 모두로 적용)
- 로컬 DB 적용 실행(Q-94, 위 1번)
- 옛 PC 주간 수집 결과 0/3(Q-19, NEXT 80·81)

## 미해결 이슈 상기 (세션 첫 답변에서 3~5줄)
해소하면 이 목록과 NEXT 항목에서 지우고 done.md로. 정본 세부는 괄호 안 NEXT 번호.
- **[운영 배포 순서]** DB 먼저(026·030~040) 서버 나중. Oracle 11g면 FETCH FIRST·IDENTITY 대체본(NEXT 9). 064② 2단계 전에는 legacy-flow 닫고 배포.
- **[할인율 가짜 값]** 코드·문서를 3.30%로 임시로 가림 → 이사회 수익성 화면 숫자도 가짜. 설정값 분리·IRR 칸 연동은 Q-104·105(NEXT 37·66).
- **[보안 하·위험 수용]** NEXT 84 남은 하, 원격 저장소 공개 여부. SSO 전 기관장 기능 켜 둠(NEXT 35). 기관장 사진 저작권법 24조의2는 로컬 수집만 — 운영 전 다시 확인.
- **[화면 확인]** 실화면 1280폭(NEXT 77·78), 요구사항 자료 캡처의 실명·사번 확인, 로그인 슬라이드 서울 임박 지도 장 11-20 뒤 제외·마포 결과.
- **[다른 PC 이전]** 옛 PC에만: 로컬 DB 시험 행·서울 25 구청장, `data/collector/` 로그·주간 수집 예약 작업. git 이력 재작성(11-12) — 다른 PC는 새로 clone.

## 세션 분담
- 8080·target/: 한 세션씩(아침 d9 → 9f). dashboard.js: c0 먼저, 89 화면은 그 뒤. index.html: c0는 d9 `.pl-*` 블록 끝 뒤에 덧붙임.
- 9f = 서버·DB 도구·collector, c0 = 공고 상태 화면, d9 = 사업계획·8080 아침, 4c = agent-dashboard(NEXT 31).
- DB 번호: 039 = 9f 금고 약정(미적용), 040 = c0 NO_BID, 다음 새 파일은 041부터.
- 커밋은 경로 지정, NEXT는 항목 단위 Edit, questions.json은 최신본을 읽고 항목 단위로.

## 사용자 목표·방향 (불변)
내부망에서 화면에 필요한 DB와 LLM 최소 기능. **LLM은 업무 서비스·DB가 다 만들어진 뒤.** DB는 MySQL(로컬)+Oracle(회사) 쌍, **회사 DB에는 외래키 없음**(코드표는 가능), 로컬 MySQL 적용은 `kgi-ggreport-web/tools/db/apply-mysql.mjs`. 메뉴·업무 흐름은 업무 대분류 5 + 시스템 관리. **사무실 PC 전용**(좁은 폭 미지원). **결재 끝난 건의 모든 행위는 누가·어느 화면·어느 버튼인지 기록**(잊지 말 것). 입찰 현황판은 지금 모양 그대로 현업과 무엇을 살릴지 정한다(11-13).

## 이 파일의 규칙
- 작업 한 바퀴를 끝내며 사용자에게 '다음 단계·남은 질문·권장 순서'를 말했다면 같은 내용을 이 파일에 덮어쓴다(CLAUDE.md 4절).
- 에이전트 보고서는 SubagentStop 훅이 `handoff/agents/<역할>/`에 자동 저장한다. 사람이 읽는 정리는 `docs/pm_history/`(에이전트별 일괄 정리)·`docs/design_history/`(화면 전/후).
