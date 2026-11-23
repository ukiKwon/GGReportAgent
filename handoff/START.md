# 다음 세션 시작점 (항상 최신 1개 — 덮어쓴다)

마지막 갱신: 2026-11-23(월) 17:30 (main) — 오늘 요약: `handoff/2026-11-23_summary.md`

## 다음 순서 (main, 묻지 않고 실행)
0. **환경**: MySQL `C:\dev\mysql-start.cmd`, `ListAgents`(재시작 뒤 이름이 바뀜 — 각 세션에 정체 확인). **8080은 커밋된 HEAD만**: `git -C c:/github/_gg_build checkout -q --detach <HEAD>` → 그 폴더 kgi-ggreport-web에서 `mvn -q -o package -DskipTests`(실행 중 8080이 war를 잡으므로 먼저 내림) → main 폴더 kgi-ggreport-web에서 `java -Xmx768m -jar c:/github/_gg_build/kgi-ggreport-web/target/kgi-ggreport-web.war`. mvn은 `MAVEN_OPTS=-Xmx384m`·`-DargLine="-Xmx768m"`, IDE 자동 빌드가 target/classes를 지우면 재실행. 로컬 DB 적용: 047·048·049·051·055·056·057·058. **052는 적용 여부 확인**(fa 세션 기록엔 적용, 11-23 로그인 이름은 최디자이너로 보였음), **059(되찾기 코드)는 fa 화면 커밋 뒤 사용자 적용**(COMMON_CODE 행만이라 HEAD 재빌드는 막지 않음).
1. **11-24(화) 발표 자료**: 11-10 보고 이후 ~ 11-23 변경 정리 HTML(사용자 요청 11-23). PM 문안(handoff/agents/pm/ 11-23 '발표 자료') → main이 HTML 작성(`docs/pm_history/`), 내일 발표 전에 완성.
2. **100 S2 화면 마무리**(초안 `handoff/agents/frontend-dev/2026-11-23_100S2_instsummary_초안.md`, 규격 design 2026-11-23_1257_a78d8d68): node 시험 'isn.stripBullet is not a function' → 내보내기 이름을 시험과 맞춤 → `node --test` 전체 → 적용. 연결 줄은 0d(index.html CSS·script)·fa(prep.js T1 [양식 열기])에 요청, 커밋 확인 뒤 붙임 → qa-verifier → design-reviewer 대조 → design_history 장 → DESIGN.md `--full` 대상 추가(main).
3. **실사용 요청 묶음 발송**: ① 99 회의록 고치기(서버 6992ee5·화면 a8ea786·qa 2차 89002f1c, design_history 75) — 김영업 노원구 2026 → 회의록 탭 → 올리기 → 미리보기 → 이름표 고르기·발언 고치기 → 다시 미리보기 → 저장 → 상세 [발화자 이름표 바꾸기]. 먼저 로컬 config 2줄(Q-2026-11-19-59: ggreport.minutes.enabled=true·require-verified=false) ② 102 대시보드(00b3fc1e 반영분 — 입찰 예정일 순서·끝난 건 보기·담당 아닌 사람 읽기 전용).
4. **102 남은 것**: 기획 이관 1건(개설 승인 전 손 칸을 누가 체크할지 — planner → 질문), design_history 102 후속 장(00b3fc1e분, 85 다음), fa 몫 P3-7·P3-8 전달, Playwright 실측(브라우저가 비어 있을 때).
5. **99 서버 이관 묶음**: 공개범위 후보 API·rules_ack 감사·LIMIT_SPEAKER 문구·열람 기한 필드·board_review id·detail speakers first_seq(design ade114bb 7절) — backend-dev **Opus**(감사 설계 예외) → 적용 Sonnet. DB가 바뀌면 다음 번호 060.
6. 100 S3(fa PrepService.judgeFact와 조율) → S4 결재 연결, 95 부서 이름, 97 lines_next·home_portal 감사.
7. **W48 주간 보고(11-27 금)**: pm_history 주간 절 + '이번 주 질문' 표 + 에이전트별 정리, 요구사항 파악 `index_2026-11-27.html`.

## 다시 알릴 것 (질문은 선택식, 답 받을 때까지 멈춤)
- ⓐ **주간 수집 2주 연속 실패**(11-16·11-23, 0xC000013A — 09:00 시작 뒤 콘솔 창이 닫혀 강제 종료, 11-23은 09:19): 창 없는 실행기 run_weekly_hidden.vbs·python -u 커밋함. **작업 스케줄러 동작 변경은 권한상 사용자가 직접**(`schtasks /Change /TN "GGReport collector weekly" /TR "C:\Windows\System32\wscript.exe //B //Nologo \"C:\github\GGReportAgent\collector\run_weekly_hidden.vbs\""` → `schtasks /Run /TN "GGReport collector weekly"`) → 20분쯤 뒤 '마지막 실행 결과' 0과 data/collector/_logs 최신 로그의 `eminwon exit=`·`g2b exit=` 확인.
- 052 로컬 적용 완료(사용자 11-23 저녁, Q-2026-11-23-37 done).
- 보안 확인(11-23 PUSH-GATE 하): `docs/design/2026-11-20_기관장_프로필_견본.docx` 사진이 가상 이미지인지 Word로 열어 확인 — 실제 공식 사진이면 교체 또는 git에서 제외(사용자 11-13 결정).
- 본문 요청(실사용): 99 회의록 고치기·102 대시보드(main), 105 목표 결재·106 점검(fa), 104 협약 성과 표본 교체 결과(05), 89 금고 약정, 98 A~C·101 D.

## 미해결 이슈 상기 (세션 첫 답변에서 3~5줄)
해소하면 이 목록과 NEXT 항목에서 지우고 done.md로. 정본 세부는 괄호 안 NEXT 번호.
- **[운영 배포 순서]** DB 먼저(026·030~059 — 049는 051 뒤 번호 역전, 052는 시험 계정 이름 바꿈이라 운영 대상인지 확인, 053은 05 예약 사용 여부 확인) 서버 나중. Oracle 11g FETCH FIRST·IDENTITY 대체본(NEXT 9). hwplib 1.1.9 오프라인 반입. 외부 확인 동시 반입 잠금은 JVM 단위 — 운영 WAS가 여러 대면 재검토. 회의록·디자인 검토는 운영 기본 꺼짐(설정 키). 회의록은 운영 켜기 전 multipart 임시 파일 처리 필수(security 11-19).
- **[할인율 가짜 값]** 코드·문서 3.30% 임시 가림, 이사회 수익성 화면 숫자도 가짜(NEXT 37·66).
- **[보안 수용]** X-Emp-No 자기신고(SSO 전, NEXT 35), 세 팀 /tasks 쓰기 무인증(R1, NEXT 35 하위), 클로바 텍스트는 사내 메일·지정 계정 수칙, 원격 저장소 공개 여부. 기관장 사진: 공공누리 제1유형도 Word에 출처 없이 넣음(사용자 11-23 위험 수용). DocCheck 문맥 보기는 담당·팀 제한 없음(security 11-23 하, 기획 판단).
- **[디자인 확인 요청 오발송]** 11-23 04:28 1차본 제출에 7명이 쪽지를 받음 → 받는 사람 = 담당 영업의 결재 팀장 1명 결재함, 부재 시 대결자, 쪽지 없음(사용자 11-23). fa가 고치는 중(NEXT 108).
- **[다른 PC 이전]** 옛 PC 로컬 DB 시험 행·주간 수집 예약 작업, git 이력 재작성(11-12) — 새로 clone.

## 세션 분담 (11-23, 재시작 뒤 이름)
- **11-23 저녁 재시작 뒤 이름**: fa=ggreportagent-6c, 05=ggreportagent-31, e4=ggreportagent-f9, 0d=디자인 검토 세션, **새 b0=입찰 현황판 전담**(dashboard.js·index.html .db-* CSS, 사용자 지시). fa 108은 설계 원안 backend 1358_ace7936a + delta 1410_ace7936a 완성, 서버 적용은 중단 — 부분 변경 handoff/agents/history/2026-11-23_디자인확인_받는사람_적용중단.patch(fa e0c6b64e). 052 적용 끝(로그인 박디자이너 확인). 05 17:00 표본 삭제 끝(남은 표본 0). e4는 8080 API로 기관장·사진 등록 중(415기관, 나무위키). 사용자 로컬 059 적용 끝.
- main: 8080·target/·로컬 DB·mvn 전담, 99(minutes/·board-minutes.js·058)·100(docout/·049·PrepForm*·InstSummary*·instsummary.js 새 파일)·102 서버(PrepBoard*·054)와 기록, 052, 95 서버, W48·발표 자료.
- fa(ed): kbboard·dashboard·PrepService·prep.js·105(056)·106(057)·되찾기(059, 화면 미커밋 진행 중)·**디자인 검토 받는 사람(DesignReviewService, 사용자 지시로 main에서 넘겨받음)**·106 문맥 길이.
- 05(20): plans.js·PlanCollect*·PlanInbox*·103·104(TargetResult*)·56 반입·107 뉴스.
- e4(51): 기관장(InstitutionHead*·headcard·055)·Word·사진.
- 0d(디자인 검토 세션): 공통 팝업 .dlg·nav·index.html 공통부·design_history 미커밋. 3단계 ②에 bd-m-rw(board-material = main 파일)가 있으니 손대기 전에 main과 조율.
- DB 번호: 052 main, 053 05, 054·056·057 fa, 055 e4, 058 main, 059 fa, **다음 060**.
- **커밋**: 인덱스는 공유 — main은 `GIT_INDEX_FILE=.git/index.main.tmp`(read-tree HEAD → cacheinfo/add → commit → 공유 인덱스는 `git reset -q HEAD -- 내경로`)로 공유 인덱스를 건드리지 않는다. 다른 세션은 `git commit -o -- 경로`(내 전용 파일) 또는 cacheinfo(공유 파일).
- **임시 인덱스 함정(11-23)**: 임시 인덱스는 **커밋하는 같은 명령 안에서** `read-tree HEAD`로 새로 만든다(미리 만들어 두면 그 사이 남의 커밋을 되돌린다 — e4 6e7ff39가 0d 128bea0을 되돌림, 0d 7963caf로 복구). 커밋 직후 `git show --stat HEAD`로 내 파일만 들어갔는지 확인한다.

## 사용자 목표·방향 (불변)
내부망에서 화면에 필요한 DB와 LLM 최소 기능. **LLM은 업무 서비스·DB가 다 만들어진 뒤.** DB는 MySQL(로컬)+Oracle(회사) 쌍, **회사 DB에는 외래키 없음**(코드표는 가능), 로컬 MySQL 적용은 `kgi-ggreport-web/tools/db/apply-mysql.mjs`. 메뉴·업무 흐름은 업무 대분류 5 + 시스템 관리. **사무실 PC 전용**(좁은 폭 미지원). **결재 끝난 건의 모든 행위는 누가·어느 화면·어느 버튼인지 기록**(잊지 말 것). 입찰 현황판은 지금 모양 그대로 현업과 무엇을 살릴지 정한다(11-13). 팀 이름은 부서 이름이 된다(영업부서·개발부서·재무부서·사업부서, 직책 이름은 그대로, 11-17·19). **이 시스템 때문에 일을 두 번 하지 않는다(11-19).**

## 이 파일의 규칙
- 작업 한 바퀴를 끝내며 사용자에게 '다음 단계·남은 질문·권장 순서'를 말했다면 같은 내용을 이 파일에 덮어쓴다(CLAUDE.md 4절).
- 에이전트 보고서는 SubagentStop 훅이 `handoff/agents/<역할>/`에 자동 저장한다. 사람이 읽는 정리는 `docs/pm_history/`(에이전트별 일괄 정리)·`docs/design_history/`(화면 전/후).
