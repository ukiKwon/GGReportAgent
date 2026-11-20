# 다음 세션 시작점 (항상 최신 1개 — 덮어쓴다)

마지막 갱신: 2026-11-20(금) 12:00 (main) — 오늘 요약: `handoff/2026-11-20_summary.md`

## 다음 순서 (main, 묻지 않고 실행)
0. **환경**: MySQL `C:\dev\mysql-start.cmd`, 8080(main 담당, **커밋된 HEAD만** — `git worktree add --detach c:/github/_gg_build HEAD` 뒤 그 폴더 kgi-ggreport-web에서 `mvn -q -o package -DskipTests`, 실행은 main 폴더 kgi-ggreport-web에서 `java -Xmx768m -jar c:/github/_gg_build/kgi-ggreport-web/target/kgi-ggreport-web.war` — 작업 트리 빌드는 다른 세션 미커밋이 섞여 500, 11-20), `ListAgents`(재시작 뒤 이름이 바뀜 — 각 세션에 정체 확인). PC 메모리가 빠듯하다: mvn은 `MAVEN_OPTS=-Xmx384m`, `-DargLine="-Xmx768m"`. 로컬 DB는 047·048·049·051·055·058 적용(11-20 사용자). IDE(VSCode Java·IntelliJ) 자동 빌드가 target/classes를 지워 시험이 깨질 수 있음 — 재실행.
1. **사용자 실사용 확인**: 99 회의록 탭·100 S2 실사용 요청(절차는 NEXT 99·100).
2. **100 S2 화면**(양식 작성 — design-reviewer → frontend-dev → qa) ∥ **S3(050)** fa와 PrepService.judgeFact 협의.
3. **99 실화면 qa**(Playwright 복구 뒤) + 서버 이관 5건(design ade114bb 7절).
4. **⑥ 디자인 검토 화면**(051 서버 55b77b3 끝).
5. 052 박디자이너(USERS UPDATE 쌍 + 시험 문자열 3), 95 부서 이름, 90 4단계, 97 lines_next·home_portal 감사.
6. 금요일 마무리: summary·NEXT·START → 커밋 → PUSH-GATE(security·pm·cleaner, 화면은 design 대조·design_history 68장 있음) → 푸시.

## 다시 알릴 것 (질문은 선택식, 답 받을 때까지 멈춤)
- ⓐ 입찰 현황판 재유치/신규유치 태그 기준 확인(Q-17-49·58, 권장 '지금대로') — 98 실사용 요청과 함께.
- 본문 요청: 89 금고 약정 업무 테스트, 56 수집 요청 실사용, 98 목표·관심 기관 실사용, 97 화면 확인 순서 1~6(11-19 0f: ①로그인 시안 B ②김영업 시작화면 고정 탭·숫자 칸·1년/30일 두 칸·유형 탭·신규 확정 태그 ③제목 클릭 복귀·지도 파랑 3겹·지난 금고 선정일·F5 ④현황판 연 채 로그아웃→권전산 탭 2개·팝업 닫기만·도구줄 기관 추가/CSV 없음·수집 요청 됨 ⑤최디자이너 보기 전용 ⑥정예산 지도 시작), (버튼 붙은 뒤) 기관장 Word를 현업 Word로 열어 보기.
- Q-16-19 옛 PC 주간 수집은 11-23(월) 09:00 실행 뒤.

## 미해결 이슈 상기 (세션 첫 답변에서 3~5줄)
해소하면 이 목록과 NEXT 항목에서 지우고 done.md로. 정본 세부는 괄호 안 NEXT 번호.
- **[운영 배포 순서]** DB 먼저(026·030~048·049·051·055, 049는 051 뒤 번호 역전) 서버 나중. Oracle 11g FETCH FIRST·IDENTITY 대체본(NEXT 9). hwplib 1.1.9 오프라인 반입. 외부 확인 동시 반입 잠금은 JVM 단위 — 운영 WAS 여러 대면 재검토. 회의록·디자인 검토는 운영 기본 꺼짐(설정 키). 회의록은 운영 켜기 전 multipart 임시 파일 처리 필수(security 11-19).
- **[할인율 가짜 값]** 코드·문서 3.30% 임시 가림, 이사회 수익성 화면 숫자도 가짜(NEXT 37·66).
- **[보안 수용]** X-Emp-No 자기신고(SSO 전, NEXT 35), 세 팀 /tasks 쓰기 무인증(R1, NEXT 35 하위), 클로바 텍스트는 사내 메일·지정 계정 수칙, 원격 저장소 공개 여부.
- **[다른 PC 이전]** 옛 PC 로컬 DB 시험 행·주간 수집 예약 작업, git 이력 재작성(11-12) — 새로 clone.

## 세션 분담 (11-20, 재시작 뒤 이름)
- main: 8080·target/·로컬 DB·mvn 전담, 99·100(minutes/·docout/·049·050·051·PrepForm*), 95 서버, W47.
- fa(22): kbboard·dashboard·PrepService·105 목표 기관 조작 팀장 결재(DB 056)·106 제안서 점검 보고(DB 057).
- 05(a7): plans.js·PlanCollect*·103 사업계획 개편·104 협약 성과(TargetResult*, DB 053 예약).
- e4(38): 기관장(InstitutionHead*·headcard·055).
- 0d(6f): 공통 팝업 .dlg·nav·index.html 공통부.
- DB 번호: 052 main, 053 05, 054·056·057 fa, 055 e4, 다음 058.
- **커밋**: 인덱스는 공유 — add와 commit을 한 명령 안에서, `git diff --cached --name-only`가 내 파일뿐일 때만 커밋(11-20 17e81b1 섞임). 공유 파일은 cacheinfo로 내 hunk만.

## 사용자 목표·방향 (불변)
내부망에서 화면에 필요한 DB와 LLM 최소 기능. **LLM은 업무 서비스·DB가 다 만들어진 뒤.** DB는 MySQL(로컬)+Oracle(회사) 쌍, **회사 DB에는 외래키 없음**(코드표는 가능), 로컬 MySQL 적용은 `kgi-ggreport-web/tools/db/apply-mysql.mjs`. 메뉴·업무 흐름은 업무 대분류 5 + 시스템 관리. **사무실 PC 전용**(좁은 폭 미지원). **결재 끝난 건의 모든 행위는 누가·어느 화면·어느 버튼인지 기록**(잊지 말 것). 입찰 현황판은 지금 모양 그대로 현업과 무엇을 살릴지 정한다(11-13). 팀 이름은 부서 이름이 된다(영업부서·개발부서·재무부서·사업부서, 직책 이름은 그대로, 11-17·19). **이 시스템 때문에 일을 두 번 하지 않는다(11-19).**

## 이 파일의 규칙
- 작업 한 바퀴를 끝내며 사용자에게 '다음 단계·남은 질문·권장 순서'를 말했다면 같은 내용을 이 파일에 덮어쓴다(CLAUDE.md 4절).
- 에이전트 보고서는 SubagentStop 훅이 `handoff/agents/<역할>/`에 자동 저장한다. 사람이 읽는 정리는 `docs/pm_history/`(에이전트별 일괄 정리)·`docs/design_history/`(화면 전/후).
