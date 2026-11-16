# 다음 세션 시작점 (항상 최신 1개 — 덮어쓴다)

마지막 갱신: 2026-11-15(일) 마무리 (새 PC 첫날 — 세션 4b·3d·9b) — 오늘 요약: `handoff/2026-11-15_summary.md`

## 다음 세션 먼저 할 일 (PM 11-15 저녁 순서 — `handoff/agents/pm/2026-11-15_2048_aff0bd7d.md`, 진행 여부는 묻지 않고 바로 실행)
0. **환경**: VS Code를 완전히 재시작했으면 PATH(JDK8·mysql·gh)가 잡힌다. 아니면 경로 직접 지정 — Maven은 IntelliJ 동봉 `C:\Program Files\JetBrains\IntelliJ IDEA Community Edition 2025.2.2\plugins\maven\lib\maven3\bin\mvn.cmd`, JDK `C:\dev\jdk8\jdk8u504-b01`. MySQL은 `C:\dev\mysql-start.cmd`(세션마다 꺼짐), 8080은 `java -jar target/kgi-ggreport-web.war`(kgi-ggreport-web에서). 로컬 DB는 001~032 적용됨.
   - DB 적용: 이 PC MySQL root는 비밀번호가 비어 있다(`mysql -u root`, `-p` 없이). 적용 도구는 `--user ggreport`(NEXT 83 해소 11-15).
   - `.claude/worktrees/` 빈 폴더(prep-audit-test·mysql-cred)는 VS Code 잠금으로 남은 것 — 재시작 뒤 지운다(커밋 대상 아님).
1. **① 병렬(읽기 전용)**: qa-verifier(Opus)로 NEXT 66·68·64 반영 대조 — 66ⓐⓑⓒ·② 후속·68 내려받기 기록·64 ①③이 **이미 코드에 들어가 있는 것으로 보임**(PM 대조: BoardMaterialService:371·637, BidAssignmentService:395-488, StaticCacheFilter:100). Q-2026-11-10-01(이어받을 담당자 모두 비활성 → 승인 막고 안내, 답 ⓐ) 빈틈 2개 판정 포함. ∥ planner(Opus) 기획 묶음(NEXT 70 하 500 유지·WARN/ERROR, 78 요약 카드·decoratePopover 폐기·map_detail 분리, 64② 열림 동안 목록 범위) — 팀 결정, 사용자에게 묻지 않음.
2. **②** 대조 결과 빈틈만 backend/frontend-dev → 적용·시험 → 커밋, NEXT 66·68·64 다시 쓰기, Q-11-10-01 done.
3. **③ NEXT 64② 2단계(패치 C)**: 열림 상태 `POST /bidcases` 무가드 닫기 — Prep* 시험 생성 도우미에 관리자 사번(다른 세션이 Prep* 쓰는지 확인 뒤) → mvn → security → 커밋. 그 전 운영 배포는 `ggreport.legacy-flow.open=false`(docs/이관작업 README 4단계).
4. **④** 1-c 결정대로 NEXT 78 후속(frontend-dev → qa, 화면 바뀌면 design·design_history).
5. **푸시(맨 먼저)**: 11-15 마무리에서 사용자가 푸시를 승인했지만 **새 PC에 GitHub 인증이 없어 실패**(Invalid username or token). 사용자가 `C:devghingh.exe auth login` → `gh auth setup-git` 한 뒤 `git push origin kgi-report-web-dev`(로컬 커밋 46건, PUSH-GATE 11-15 통과 — security 차단 없음). 토큰은 Contents·Pull requests Read and write.
6. **11-16(월) 09:00 주간 수집 확인(NEXT 80)** — 옛 PC 작업 스케줄러. 종료 코드 0 정상, 3이면 새 실패. 정상이면 scourt를 run_weekly에(NEXT 81).
7. **11-20(금) W47 산출물**: PM 주간 보고·에이전트별 정리(docs/pm_history), 요구사항 파악 자료(docs/요구사항 파악/index_2026-11-20.html — 종류 6종·기관 정보 변경 창 설명 포함), 질문 장부 '이번 주 질문' 표.

## 11-16 새 작업 — 기관 사업계획(NEXT 56-3)
- 1단계 커밋 `7aa9d1f`(미푸시). 남은 것: 로컬 MySQL 034 적용(사용자 터미널, Q-11-16-29) → 9f에게 8080 재기동 요청 → 실화면 확인, nav.js '준비중' 배지 한 줄(b6 nav.js 커밋 뒤), 도봉 1장 10~13번 원문 확인(Q-11-16-28). 정본은 NEXT 56 (3). 11-20 요구사항 자료에 이 화면을 넣어 현업 의견을 다시 받는다.

## 사용자 답 받고 구현 대기
- **관리자 범위(NEXT 84)**: 사용자 답 ⓐ(11-15) — 전산팀원·전산팀장 모두 관리자. 한 줄 수정으로는 '마지막 관리자' 보호·골든 4건이 깨져 되돌림 → backend-dev(Opus) 설계부터. **다음 세션 ① 병렬 작업에 같이 넣는다.**

## 11-15 사용자 결정 (요약 — 정본은 summary·NEXT·questions.json)
- PM 주도: 다음 작업 진행 여부는 묻지 않는다(PM이 정하고 메인이 실행). 질문은 업무 의미·실제 값·되돌리기 어려운 일만.
- 사전준비 확정 취소·중단 사유는 그 건의 현재·옛 담당자도 본다(b877885).
- 입찰 예정일 확정은 출처(공고 링크·번호) 필수, 개원 예정 법원은 자동 전환 없이 '개원 확인 필요'(030·b04299b). 출처 없던 확정 9곳 중 8곳은 메모의 공고 번호로 확정 유지, 용산은 추정(145fe95).
- 기관 종류 6종: 시도 교육청은 '교육청'으로 따로, **재단법인은 '기타'로 빼지 않고 공공기관 유지**(32b4767) — PM·기획자 공유.
- 이관 문의서 3통은 `docs/이관작업/`에 작업 계획으로 정리, **지금은 의논하지 않음** — 내부망 이관 때 사용자가 직접(cc7e9fa).
- 질문 패널은 대시보드에서 뺌, 답 자동 기록 끔 — 질문 수집 훅만, 답·해소는 메인이 장부에 기록(9b 85b1b6f·9012020).

## 미해결 이슈 상기 (사용자 지시 11-11: 세션 첫 답변에서 핵심 3~5줄 말할 것)
해소하면 이 목록과 NEXT 항목에서 지우고 done.md로. 정본 세부는 괄호 안 NEXT 번호.
- **[PUSH-GATE 하 묶음]** capture-questions Stop 경로가 사용자 글을 장부에 씀(다음 푸시 전에 고칠 것), 그 밖 하 등급은 NEXT 84. 원격 저장소 공개 여부 확인.
- **[운영 배포 조건]** 064② 2단계 전에는 legacy-flow 닫고 배포, DB(026·030~032) 먼저 서버 나중(반대면 기관 목록 500), 회사 Oracle이 11g면 IDENTITY 11개 파일 대체본 필요(docs/이관작업 02-A1, NEXT 9).
- **[다른 PC 이전]** 옛 PC에만 남는 것: 로컬 DB 시험 행·서울 25 구청장(재등록 대기 — 기관 ID 확정됨, 029~032), `data/collector/` 로그·주간 수집 예약 작업(옛 PC 유지).
- **[요구사항 자료 캡처 확인]** docs/요구사항 파악/index_2026-11-13.html 캡처의 실명·사번·연락처를 현업에 보내기 전 눈으로 확인.
- **[보안·위험 수용] SSO 전 운영에서 기관장 기능 켜 둠**(자기신고 사번) — SSO(NEXT 35) 전 정보보호 확인(docs/이관작업 01).
- **[기관장 남은 것]** 운영 photo-dir 절대경로, 2~4단계, 코드표 읽기 API, 학력·경력 상한, 금지어 목록(기획), 사진 이용 근거(공공저작물).
- **[NEXT 72 하]** 무잠금 묶음 쓰기(P2-1), 반입 날짜 형식 검사(P2-2), 추정+출처 입력 버림(P3-2, 기획), 출처 미확인 8곳은 메모 번호(원문 재확인은 성북만).
- **[실화면 1280폭]** 현황판 상세 첫 화면 빈 상자, 6개월 안 수가 화면마다 다름, 지도 상단 '기준 2026-1…' 잘림(NEXT 77·78).
- **[로그인 슬라이드]** 서울 임박 지도 장은 11-20 뒤 자동 제외, 마포 접수(11-16~19) 뒤 문구·관악·성북 결과 확인(frontend/data/login-slides.js).
- **[법원·공공기관]** 정보공개청구 여부(NEXT 81), 공공기관 결과 미확인(NEXT 79).
- **[git 이력 재작성 11-12]** 다른 PC는 새로 clone.

## 세션 분담 (여러 세션이 동시에 일할 때)
- 시작할 때 `ListAgents`로 다른 세션을 보고, 쓰기용 에이전트를 부르기 전·서버/DB를 쓰기 전에 그 세션에 담당 파일을 묻는다(11-15 4b·3d·9b가 이 방식으로 충돌 없이 병합). 별도 작업이면 worktree, 병합 동안 다른 세션은 커밋을 멈춘다.
- 같은 날 summary는 먼저 쓴 세션이 파일을 만들고 다른 세션은 이어 붙이기만. 커밋은 경로 지정, NEXT는 항목 단위 Edit, questions.json은 매번 최신본을 읽고 항목 단위로.

## 사용자 목표·방향 (불변)
내부망에서 화면에 필요한 DB와 LLM 최소 기능. **LLM은 업무 서비스·DB가 다 만들어진 뒤.** DB는 MySQL(로컬)+Oracle(회사) 쌍, **회사 DB에는 외래키 없음**(코드표는 가능), 로컬 MySQL 적용은 `kgi-ggreport-web/tools/db/apply-mysql.mjs`. 메뉴·업무 흐름은 업무 대분류 5 + 시스템 관리. **사무실 PC 전용**(좁은 폭 미지원). **결재 끝난 건의 모든 행위는 누가·어느 화면·어느 버튼인지 기록**(잊지 말 것). 입찰 현황판은 지금 모양 그대로 현업과 무엇을 살릴지 정한다(11-13).

## 이 파일의 규칙
- 작업 한 바퀴를 끝내며 사용자에게 '다음 단계·남은 질문·권장 순서'를 말했다면 같은 내용을 이 파일에 덮어쓴다(CLAUDE.md 4절).
- 에이전트 보고서는 SubagentStop 훅이 `handoff/agents/<역할>/`에 자동 저장한다. 사람이 읽는 정리는 `docs/pm_history/`(에이전트별 일괄 정리)·`docs/design_history/`(화면 전/후).
