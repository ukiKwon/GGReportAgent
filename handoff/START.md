# 다음 세션 시작점 (항상 최신 1개 — 덮어쓴다)

마지막 갱신: 2026-11-17(화) 16:10 (9f, c0·d9는 마무리 때 자기 항목을 덧붙임) — 오늘 요약: `handoff/2026-11-17_summary.md`

## 사용자 새 요건 — 우선순위 높음 (11-17 저녁, PM이 아래 순서에 앞세워 배분)
- **NEXT 99 이사회 회의 내용 전수**: 부장 의견 "이사회에서 오가는 좋은 내용이 전수되면 좋겠다" → 사용자 구상: 네이버 클로바(노트) 외부 공유로 받은 STT 결과를 업로드. planner(범위·권한·반입 경로·보안 정책 질문)부터.
- **NEXT 100 '제안서 확정' → 사전준비 프로세스 전환 구체 구현**: planner(NEXT 70과 이어 단계별 흐름·빈 곳 정리)부터, c0 입찰 현황판 [제안 확정]과 조율.
- 사용자 11-17 저녁: 다른 세션에서 디자인 작업 진행 — 9f는 잠시 대기.

## 다음 세션 먼저 할 일 (PM 11-17 오후 순서 — handoff/agents/pm/ 11-17 최신, 묻지 않고 실행)
0. **환경**: MySQL `C:\dev\mysql-start.cmd`, `ListAgents`, 8080 담당 9f. JDK `C:\Users\superuser\AppData\Local\Programs\Eclipse Adoptium\jdk8u504-b01`, Maven `C:\Users\superuser\tools\apache-maven-3.9.16\bin`. 8080은 `java -jar target/kgi-ggreport-web.war`(kgi-ggreport-web에서). 로컬 DB는 043까지 최신(손 적용 시 `--default-character-set=utf8mb4` 필수, 되도록 apply-mysql 도구).
1. **9f**: 89 사용자 업무 테스트 결과 반영(금고 약정 저장·고치기·지우기, '입력 A · 마지막 고침 B'·확인 부서 '영업부서') ∥ 94① 기관별 약정 종료일 목록 API는 c0가 요약 API로 진행 중이면 확인만.
2. **9f**: 90 4단계 현황판 '외부 확인 MM-DD HH:mm' — design-reviewer → frontend-dev(c0 kbboard·dashboard와 시간 맞춤). 그 전에 90 하: 같은 batch_id 동시 반입 직렬화(security 중)·이력 조회 LIMIT·다운로드 동시 수.
3. **NEXT 95 부서 이름 전체 변경**: planner(범위·역할 이름 질문 문안) → pm(세션 조율).
4. 기다리는 동안: NEXT 84 하 5건, records 오류 문구 값 에코(py·java 쌍), hwplib 1.1.9→1.1.11 차이, _LinkDoc·작성자 메타 전처리 규칙(data-auditor → SCHEMA).
5. **11-19 오후 PM 초안 → 11-20(금) W47**: PM 주간 보고·에이전트별 정리·'이번 주 질문' 표(docs/pm_history), 요구사항 자료 docs/요구사항 파악/index_2026-11-20.html.

## 다시 알릴 것 (질문은 선택식, 답 받을 때까지 멈춤)
- 89 금고 약정 업무 테스트(본문 요청 — 질문 아님).
- Q-16-19 옛 PC 주간 수집은 11-23(월) 09:00 실행 뒤.
- 부서 이름 변경 때 팀장·부장 등 역할 이름은 어떻게 되는지(NEXT 95 착수 때).

## 미해결 이슈 상기 (세션 첫 답변에서 3~5줄)
해소하면 이 목록과 NEXT 항목에서 지우고 done.md로. 정본 세부는 괄호 안 NEXT 번호.
- **[운영 배포 순서]** DB 먼저(026·030~045) 서버 나중. Oracle 11g면 FETCH FIRST·IDENTITY 대체본(NEXT 9). 064② 2단계 전에는 legacy-flow 닫고 배포. 새 의존성 hwplib 1.1.9(사용자 승인) 오프라인 저장소 반입 필요.
- **[할인율 가짜 값]** 코드·문서를 3.30%로 임시로 가림 → 이사회 수익성 화면 숫자도 가짜. 설정값 분리·IRR 칸 연동은 Q-104·105(NEXT 37·66).
- **[보안 하·위험 수용]** NEXT 84 남은 하, 원격 저장소 공개 여부. SSO 전 기관장 기능 켜 둠(NEXT 35) — 수정자·취소 권한은 X-Emp-No 자기신고 기준(화면 '로그인 연동 전' 표지). 기관장 사진 저작권법 24조의2는 로컬 수집만 — 운영 전 다시 확인.
- **[외부 확인 범위]** 반입 파일 안 이미지 속 글자는 서버가 못 읽음(IMAGE_ONLY 제외). 사업계획 수집은 d9가 외부 agent 직접 호출을 실험(사용자 11-17) — 외부 확인(공고)은 미리 돌려두기 유지.
- **[다른 PC 이전]** 옛 PC에만: 로컬 DB 시험 행·서울 25 구청장, `data/collector/` 로그·주간 수집 예약 작업. git 이력 재작성(11-12) — 다른 PC는 새로 clone.

## 세션 분담
- 8080·target/·bankcontract(서버·화면)·inbox/ext-check = 9f, kbboard·dashboard·index.html·BidTarget(043·044) = c0, plans.js·사업계획 수집(045) = d9, agent-dashboard = 4c.
- DB 번호: 042=9f, 043·044=c0(044=관심 기관 KIND_CD), 045=d9, 046=c0 예약(설명회 기록), 9f 다음 047.
- 커밋은 경로 지정, NEXT는 항목 단위 Edit, questions.json은 최신본을 읽고 항목 단위로. mvn은 target/ 공유 — 돌리기 전 다른 세션에 알림.

## 사용자 목표·방향 (불변)
내부망에서 화면에 필요한 DB와 LLM 최소 기능. **LLM은 업무 서비스·DB가 다 만들어진 뒤.** DB는 MySQL(로컬)+Oracle(회사) 쌍, **회사 DB에는 외래키 없음**(코드표는 가능), 로컬 MySQL 적용은 `kgi-ggreport-web/tools/db/apply-mysql.mjs`. 메뉴·업무 흐름은 업무 대분류 5 + 시스템 관리. **사무실 PC 전용**(좁은 폭 미지원). **결재 끝난 건의 모든 행위는 누가·어느 화면·어느 버튼인지 기록**(잊지 말 것). 입찰 현황판은 지금 모양 그대로 현업과 무엇을 살릴지 정한다(11-13). 팀 이름은 부서 이름이 된다(영업부서·개발부서·재무부서·사업부서, 11-17).

## 이 파일의 규칙
- 작업 한 바퀴를 끝내며 사용자에게 '다음 단계·남은 질문·권장 순서'를 말했다면 같은 내용을 이 파일에 덮어쓴다(CLAUDE.md 4절).
- 에이전트 보고서는 SubagentStop 훅이 `handoff/agents/<역할>/`에 자동 저장한다. 사람이 읽는 정리는 `docs/pm_history/`(에이전트별 일괄 정리)·`docs/design_history/`(화면 전/후).
