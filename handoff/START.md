# 다음 세션 시작점 (항상 최신 1개 — 덮어쓴다)

마지막 갱신: 2026-11-19(목) 16:30 (main) — 오늘 요약: `handoff/2026-11-19_summary.md`

## 내일 11-20(금) 순서 (PM 11-19 16:2x, 묻지 않고 실행)
0. **환경**: MySQL `C:\dev\mysql-start.cmd`, 8080(main 담당, `java -jar target/kgi-ggreport-web.war` — kgi-ggreport-web에서), `ListAgents`. 0f에 로그인 시안 B 커밋·`frontend/seduU9ayA` 정체 확인. JDK `C:\Users\superuser\AppData\Local\Programs\Eclipse Adoptium\jdk8u504-b01`, Maven `C:\Users\superuser\tools\apache-maven-3.9.16\bin`. 로컬 DB는 047·048·051까지 적용(손 적용 시 `--default-character-set=utf8mb4`).
1. **W47**: req-review 캡처(8080 필요 — mvn보다 먼저) → `docs/요구사항 파악/index_2026-11-20.html`, `docs/pm_history/index.html` W47·에이전트별 정리·이번 주 질문(문안: `handoff/agents/pm/2026-11-19_1612_adfb8b4e.md` 7·8절) → 커밋.
2. **99 4~5단계** 적용(설계 backend Opus 11-19 오후, `handoff/agents/backend-dev/`) → mvn → security → 커밋.
3. **100 S2(049)** 적용 → 사용자 049 로컬 적용 요청 → mvn → security → 커밋. PrepUiIds·PrepService는 fa 소유 — 필요한 diff는 fa에 요청.
4. 0f 커밋 뒤: **⑥ 디자인 검토 화면 + 기관장 [Word 내려받기] 버튼**(design 규격 11-19 오후 → frontend → qa → design 대조 → design_history 장).
5. 월: 95 부서 이름(fa·0f·05 커밋 뒤), 90 4단계, 100 S3(050, fa와 PrepService 협의)·S4, 97 lines_next·home_portal 감사(backend).

## 다시 알릴 것 (질문은 선택식, 답 받을 때까지 멈춤)
- ⓐ 입찰 현황판 재유치/신규유치 태그 기준 확인(Q-17-49·58, 권장 '지금대로') — 98 실사용 요청과 함께.
- 본문 요청: 89 금고 약정 업무 테스트, 56 수집 요청 실사용, 98 목표·관심 기관 실사용, 97 2·3단계 화면 확인(로그인·남색 머리 띠·Tab 테두리·지도 선택 테두리, 영업팀 시작화면 숫자 칸·유형 탭·태그·일정/결재 대기, 전산팀은 보기 전용), (버튼 붙은 뒤) 기관장 Word를 현업 Word로 열어 보기.
- Q-16-19 옛 PC 주간 수집은 11-23(월) 09:00 실행 뒤.

## 미해결 이슈 상기 (세션 첫 답변에서 3~5줄)
해소하면 이 목록과 NEXT 항목에서 지우고 done.md로. 정본 세부는 괄호 안 NEXT 번호.
- **[운영 배포 순서]** DB 먼저(026·030~048·051) 서버 나중. Oracle 11g FETCH FIRST·IDENTITY 대체본(NEXT 9). hwplib 1.1.9 오프라인 반입. 외부 확인 동시 반입 잠금은 JVM 단위 — 운영 WAS 여러 대면 재검토. 회의록·디자인 검토는 운영 기본 꺼짐(설정 키).
- **[할인율 가짜 값]** 코드·문서 3.30% 임시 가림, 이사회 수익성 화면 숫자도 가짜(NEXT 37·66).
- **[보안 수용]** X-Emp-No 자기신고(SSO 전, NEXT 35), 세 팀 /tasks 쓰기 무인증(R1, NEXT 35 하위), 클로바 텍스트는 사내 메일·지정 계정 수칙, 원격 저장소 공개 여부.
- **[다른 PC 이전]** 옛 PC 로컬 DB 시험 행·주간 수집 예약 작업, git 이력 재작성(11-12) — 새로 clone.

## 세션 분담 (11-19)
- main: 8080·target/·로컬 DB, 99·100(minutes/·docout/·051·049·050), 95 서버.
- fa: kbboard·dashboard·PrepService·98·98-1(DB 048 PREP_NOBID_ACK), 공고 전 [제안 확정] 화면 노출.
- 05: plans.js·PlanCollect*(56).
- 0f: index.html·nav·app·portal·render·DESIGN.md(97).
- DB 번호: 046 fa 예약, 047 main, 048 fa, 049·050 main, 051 main, 다음 052. design_history: 05 c61, fa c62~.
- 커밋은 경로 지정, NEXT는 항목 단위 Edit, questions.json은 최신을 읽고 항목 단위로. mvn은 target/ 공유 — 돌리기 전 다른 세션에 알림.

## 사용자 목표·방향 (불변)
내부망에서 화면에 필요한 DB와 LLM 최소 기능. **LLM은 업무 서비스·DB가 다 만들어진 뒤.** DB는 MySQL(로컬)+Oracle(회사) 쌍, **회사 DB에는 외래키 없음**(코드표는 가능), 로컬 MySQL 적용은 `kgi-ggreport-web/tools/db/apply-mysql.mjs`. 메뉴·업무 흐름은 업무 대분류 5 + 시스템 관리. **사무실 PC 전용**(좁은 폭 미지원). **결재 끝난 건의 모든 행위는 누가·어느 화면·어느 버튼인지 기록**(잊지 말 것). 입찰 현황판은 지금 모양 그대로 현업과 무엇을 살릴지 정한다(11-13). 팀 이름은 부서 이름이 된다(영업부서·개발부서·재무부서·사업부서, 직책 이름은 그대로, 11-17·19). **이 시스템 때문에 일을 두 번 하지 않는다(11-19).**

## 이 파일의 규칙
- 작업 한 바퀴를 끝내며 사용자에게 '다음 단계·남은 질문·권장 순서'를 말했다면 같은 내용을 이 파일에 덮어쓴다(CLAUDE.md 4절).
- 에이전트 보고서는 SubagentStop 훅이 `handoff/agents/<역할>/`에 자동 저장한다. 사람이 읽는 정리는 `docs/pm_history/`(에이전트별 일괄 정리)·`docs/design_history/`(화면 전/후).
