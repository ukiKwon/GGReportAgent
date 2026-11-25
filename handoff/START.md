# 다음 세션 시작점 (항상 최신 1개 — 덮어쓴다)

마지막 갱신: 2026-11-25(수) 마무리 — 사용자는 **다른 PC에서 이어** 한다. 오늘 요약: handoff/2026-11-25_summary.md(Session 01:30·03:00·18:30 main 마무리). PM 마무리 문안 원본: handoff/agents/pm/2026-11-25_* (질문 장부 정리안 4절 포함). **11-26 08시 db(a6) 마무리 덧붙임**: handoff/2026-11-26_summary.md Session 08:00, 세션 기록 handoff/sessions/2026-11-25_2000_dash.md.

**11-26 08시 사용자**: 다음 작업은 **다른 PC**에서 시작한다. 샘플 경로는 그 PC에서 사용자가 새로 알려 준다 — 요약 양식 샘플 두 쪽(page1·page2)과 발표 대본 샘플은 저장소에 없으므로(11-25 밤 결정: 보관 안 함) 113 ④ 실물 대조·발표 대본 작업 전에 경로를 먼저 받는다(구조는 planner 2026-11-25 a5b660db·a6d227b6 보고서에 글로 있음). 그 PC는 아래 "첫 순서" 0~3대로: pull(4f27ec6a 이후) → 환경 점검 → apply-mysql --status(이 PC는 적용 55·대기 0, 다음 번호 064) → 8080은 그 PC의 mvn·JDK 경로로 새로 띄운다(아래 3번의 "이 PC(11-26)" 경로는 이 PC 전용). 시험 건 bc-db44987f·시연 건 bc-c3690ec7은 이 PC 로컬 DB의 건이라 그 PC DB에 없을 수 있다 — 없으면 시험 건을 새로 정한다.

## 다른 PC 첫 순서 (main, 묻지 않고 실행)
0. **받기**: 저장소가 없으면 새로 clone(11-12 이력 재작성 — 옛 사본은 pull 금지), 있으면 `git pull`, 브랜치 kgi-report-web-dev. 11-25 마지막 푸시에 bf 4fc724f4·611fa9c8(예상 공고현황), db a233240f(security F1~F5 반영), ca 0370ecb8, e4 8fd231b4가 들어 있는지 확인.
1. **환경 점검**(CLAUDE.md 3절 ⓐ~ⓔ). `ListAgents`로 세션 이름 새로 확인(PC를 옮기면 이름이 바뀜 — 각 세션에 정체 확인).
2. **로컬 DB는 PC마다 다르다 — `node kgi-ggreport-web/tools/db/apply-mysql.mjs --status`부터.** 옛 PC는 047~062 적용(050·053은 파일 없음). 다음 번호 **063**. 빠진 번호는 순서대로(비밀번호는 사용자). 061 뒤 NULL_WATCH_OWNER 0 확인. 기관장 사진 314장·옛 시험 행은 git에 없음(Q-2026-11-24-51·53).
3. **8080은 커밋된 HEAD만**: `c:/github/_gg_build`가 없으면 `git worktree add --detach c:/github/_gg_build HEAD`, 있으면 `checkout -q --detach <HEAD>` → 그 폴더 kgi-ggreport-web에서 `mvn -q -o package -DskipTests`(MAVEN_OPTS=-Xmx384m) → **war를 scratchpad로 복사해 그 사본으로** `java -Xmx768m -jar <사본>`을 main 폴더 kgi-ggreport-web에서 독립 프로세스로(원본 war로 띄우면 다음 빌드 repackage가 rename 실패 — 11-25). 새 PC에서 -o 실패하면 처음 한 번 온라인. 전체 mvn도 _gg_build에서(11-25 마지막 1573e8a0 2549/0/0, 0370ecb8 결과는 아래 마무리 절). design_history **다음 장 117**(커밋 직전 재확인). **이 PC(11-26)**: mvn이 PATH에 없다 — JAVA_HOME=/c/dev/jdk8/jdk8u504-b01, mvn=/c/Program Files/JetBrains/IntelliJ IDEA Community Edition 2025.2.2/plugins/maven/lib/maven3/bin(3.9.9). main 세션이 없어 db(a6)가 8080·_gg_build·mvn을 맡았다. 화면만 바뀐 커밋은 재기동이 필요 없다(frontend/는 디스크에서 바로 읽힘). 8080 = aaa2c79b 빌드(11-26 07:41), 전체 mvn aaa2c79b 2629/0/0(skip 3). 로컬 DB 적용 55·대기 0(061은 baseline만 — 관심 주인 채우기 미실행). design_history 다음 장 **121**.
4. **8080 실화면 확인 묶음**(design·qa Playwright 실측, 사용자 실사용 요청): db 113(담당자 바로 변경·이사회 일정·선정 평가표·4단계 수익성표→이사회 초안 자동), ca 114(구분 '저장 전 대기'→띠 [수정하기…], 관심 탭 공고 상태 칸·[공고 중 n]), bf 예상 공고현황(지도 머리 줄·경남 카드·design_history 116 캡처 2장), 107 뉴스, 에이전트 대시보드 보강. **11-26 db**: 113 ④ 요약 양식 v3(두 쪽) 실화면·Word 대조가 첫 일 — 시험 건 (재)연구개발특구진흥재단 bc-db44987f, 시연 건 bc-c3690ec7은 열지 않는다.
5. **질문 다시 묻기**(아래 ⓐ).
6. **이어갈 일(PM 순서)**: ① db NEXT 121(security 후속: F1 답 확정·N1·N2·F4ⓐ) → security 재검토 ② ca NEXT 114 a414f5ae([수정하기] 간단 확인·[삭제하기] 결재 요청) → 120 a794d548 전문 ③ bf NEXT 122 qa P2-1·P2-2 → 0d 메뉴 이름 '예상 공고현황'(nav.js) ④ e4 기관장 학력·경력 재조사 ⑤ main NEXT 108 → 99 실사용 5단계 → 100 S2 qa·design ⑥ W48 주간 보고(11-27 금) + 질문 장부 일괄 정리(PM 11-25 문안 4절) ⑦ 주간 수집 실행기(11-30 09:00 전). **11-26 db 순서(PM a7b8c70a)**: 113 ④ v3 qa 실물 대조 → 사용자 피드백 → NEXT 121 N1·N2·하-3 + 123(500 응답 SQL 노출) → 화면 잔여(2단계 오탐·P3-1) → 118 설계 재시작.

## 다시 알릴 것 (질문은 선택식, 답 받을 때까지 멈춤)
- **브라우저는 한 번에 한 세션**(11-26 사례): Playwright가 띄운 Chrome 창을 사용자가 직접 쓰면 qa 조작이 섞인다. qa를 시작하기 전에 사용자와 다른 세션에 알린다. 그 창의 로그인은 김영업(3918264)으로 남아 있을 수 있다(원래 이영업 5047192). (담당자 변경 범위·팀장 자기 추가 질문은 11-25 밤 답 받아 반영 — a233240f·cb705c6e·c4c61ce7)
- ⓐ **주간 수집 실행기 변경**(Q-2026-11-24-15, 11-30 09:00 전): **옛 PC의 작업 스케줄러 일**. 사용자가 옛 PC에서 `schtasks /Change /TN "GGReport collector weekly" /TR "C:\Windows\System32\wscript.exe //B //Nologo \"C:\github\GGReportAgent\collector\run_weekly_hidden.vbs\""` → `/Run` → 20분 뒤 결과 0·로그 `eminwon exit=`·`g2b exit=` 확인. 새 PC로 예약을 옮길지도 묻는다.
- ⓑ 작업에 붙인 질문: 지도 실화면(Q-25-53, 4번 때), 114 띠 '다음 해로 옮기기' 입구(Q-25-50, a414f5ae 때), 추천받기 연도(Q-25-18, ca 101), 발표 대본 샘플(Q-25-43 남은 몫, 113 ⑤ — 요약 양식 샘플 두 쪽은 11-25 밤 받음), 공고문 견본(Q-24-13), 법원장 사진(Q-24-23, e4), 업로더(Q-24-54·55, f3). 나머지는 questions.json + PM 11-25 문안 4-3.
- **e4 기관장 학력·경력 재조사 끝(11-25 저녁)**: 1374줄 입력, 3줄 미만 364→189명(법원 75 전원 포함 — 공개 자료 한계로 더 돌리지 않음, PM 11-25). 커밋 63614260(Word 사진 꽉 채우기·■ 내어쓰기)·4bae43b3(학력 연도 비움), design_history 118·119. 9bc9a132(경력 현직 표시 — 현직 '~현재'·끝 모름 '~미상', 사용자 11-25 밤 "화면에서는 미상이라고 써도 된다", 스키마 변경 없음, 오늘 현직 183줄 재등록 끝, 8080 반영). **잊지 말 것(사용자): Word '요약'에는 연도·일자 정보가 없다** — 시험 2건으로 고정. **다음**: ① 끝이 빈데 현직 표시 없는 옛 경력 108줄 가르기(data-auditor 목록 → 화면에서 무효 후 현직으로 재등록, 김윤철·변광용 포함) ② 9bc9a132 qa-verifier 독립 검토·design_history 장(현직 확인란·'미상')·실화면(확인란 글자 흐림) ③ tools/head-transfer에 current 싣기(지금 묶음을 옮기면 전부 '미상') ④ Word 실물 확인(사람: 손상 경고·둘째 줄·사진 잘림) ⑤ qa P3(DocxKit tabs 자리·INFO_PAD_MM·squareLine 중복·연도 없는 학력이 1장 맞춤에서 먼저 빠짐) ⑥ 기존 값 의심 6건·11-24 정정분 대조(data-auditor) ⑦ 법원장 사진 68. 새 줄은 이 PC DB에만 있음 — 다른 PC로 옮기려면 tools/head-transfer(Q-24-51). 자세히: handoff/sessions/2026-11-25_2020_e4.md.
- **security 남은 것**(NEXT 121): N1·N2·하-3(평가표 읽기가 prep_detail/refresh로 감사에 남음) 전용 버튼 id, 하-2 결과 기억 상한, F4ⓐ. 500 응답 SQL 노출은 NEXT 123. 보고서 security 2026-11-25_1753_aca953dc·2023_a786ff0c·2026-11-26 af98b39b.
- **정리**: _gg_ca·_gg_e4test worktree는 옛 PC — git status 본 뒤 정리. design_history 번호는 117부터 커밋 직전 확인.
- **사용자 실사용 요청 묶음**: 102·113(db), 114(ca), 99 회의록 5단계, 105·106(fa 미기동), 104, 89, 98 A~C·101 D.

## 미해결 이슈 상기 (세션 첫 답변에서 3~5줄)
해소하면 이 목록과 NEXT 항목에서 지우고 done.md로 옮긴다.
- **[보안]** 담당자 변경 범위 확정·반영 끝(a233240f·cb705c6e). 남은 것: 감사 화면·버튼 불일치 N1·N2·하-3(NEXT 121), 500 응답 SQL 노출(NEXT 123).
- **[운영 배포 순서]** DB 먼저(026·030~062 — 049는 051 뒤 번호 역전, 052는 시험 계정 이름 바꿈이라 운영 대상 확인, 053은 05 예약 사용 여부 확인), 서버는 나중. Oracle 11g 대체본(NEXT 9), hwplib 1.1.9 오프라인 반입, 운영 USERS '본부장' 직위 확인, 회의록 운영 켜기 전 multipart 임시 파일(패치 I).
- **[할인율 가짜 값]** 3.30% 임시 가림, 이사회 수익성 화면 숫자도 가짜(NEXT 37·66).
- **[보안 수용]** X-Emp-No 자기신고(SSO 전, NEXT 35), 세 팀 /tasks 쓰기 무인증, 클로바 수칙, 기관장 사진 출처 없이 Word, 서버 confirm 게이트.
- **[다른 PC 이전]** 로컬 DB·기관장 사진·주간 수집 예약은 옛 PC. 새 PC는 apply-mysql --status부터.

## 세션 분담 (11-25 저녁 기준 — 새 PC에서는 이름이 바뀌므로 정체 확인)
- **main**: 8080·target/·로컬 DB·mvn 전담. 99(minutes/·board-minutes.js·047·058), 100(docout/·049·PrepForm*·InstSummary*·instsummary.js), 108(DesignReviewService), 110, 116, portal.js, 질문 장부·W48·에이전트 대시보드.
- **db(제안 준비 현황, 이 PC a6 — main이 없어 8080·_gg_build·mvn 대행, 11-25 밤부터 에이전트 사용)**: 102·111·112·113·118·121·123, prepboard.js·preptask.js·prep.js·PrepService·PrepBoard*·PrepAttach*·BidAssignmentService(변경 경로) + 113 ④로 이어받은 instsummary.js·InstSummary*·PrepFormService·ScoringTable. DocxKit은 e4.
- **ca(입찰 현황판)**: kbboard.js·dashboard.js·index.html .hb-*·.db-*, 94·98·101·114·120.
- **bf(지도 = 예상 공고현황)**: render.js·logic.js(지도)·overdue.js·index.html 지도 CSS, 119·122.
- **0d(디자인 검토)**: .dlg·nav.js(메뉴 이름 '예상 공고현황')·109·index.html 공통부.
- **f3**: plans.js·PlanCollect*·103·104·107. **e4**: 기관장·Word·사진(InstitutionHead*·HeadDocBuilder·headcard.js·tools/head-transfer/). **fa**: 미기동(105·106, 108은 main).
- **커밋**: 공유 인덱스를 쓰지 않는다. `GIT_INDEX_FILE=.git/index.main.tmp`로 read-tree HEAD → add/cacheinfo → commit을 한 명령 안에서, 직후 `git show --stat HEAD` 확인. 공유 파일은 내 덩어리만. **메인 직접 코드 수정 0건**(한 줄도 -write).

## 사용자 목표·방향 (불변)
내부망에서 화면에 필요한 DB와 LLM 최소 기능. **LLM은 업무 서비스·DB가 다 만들어진 뒤.** DB는 MySQL(로컬)+Oracle(회사) 쌍, **회사 DB에는 외래키 없음**(코드표는 가능), 로컬 MySQL 적용은 `kgi-ggreport-web/tools/db/apply-mysql.mjs`. 메뉴·업무 흐름은 업무 대분류 5 + 시스템 관리. **사무실 PC 전용**(좁은 폭 미지원). **결재 끝난 건의 모든 행위는 누가·어느 화면·어느 버튼인지 기록**(잊지 말 것). 입찰 현황판은 지금 모양 그대로 현업과 무엇을 살릴지 정한다(11-13). 팀 이름은 부서 이름이 된다(영업부서·개발부서·재무부서·사업부서, 직책 이름은 그대로, 11-17·19). **이 시스템 때문에 일을 두 번 하지 않는다(11-19).** 회의록 공개 대상은 영업부서·임원급(11-24).

## 이 파일의 규칙
- 작업 한 바퀴를 끝내며 사용자에게 '다음 단계·남은 질문·권장 순서'를 말했다면 같은 내용을 이 파일에 덮어쓴다(CLAUDE.md 4절).
- 에이전트 보고서는 SubagentStop 훅이 `handoff/agents/<역할>/`에 자동 저장한다. 사람이 읽는 정리는 `docs/pm_history/`(에이전트별 일괄 정리)·`docs/design_history/`(화면 전/후).
