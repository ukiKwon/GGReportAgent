# 다음 세션 시작점 (항상 최신 1개 — 덮어쓴다)

마지막 갱신: 2026-11-24(화) 마무리 (오늘 요약 handoff/2026-11-24_summary.md Session 18:04·18:45 + 이 마무리 절)

## 다음 순서 (main, 묻지 않고 실행)
0. **환경**: MySQL `C:\dev\mysql-start.cmd`, `ListAgents`(재시작하면 이름이 바뀜 — 각 세션에 정체를 확인). **8080은 커밋된 HEAD만** 올린다: `git -C c:/github/_gg_build checkout -q --detach <HEAD>` → 그 폴더 kgi-ggreport-web에서 `mvn -q -o package -DskipTests`(8080을 먼저 내림) → main 폴더 kgi-ggreport-web에서 `java -Xmx768m -jar c:/github/_gg_build/kgi-ggreport-web/target/kgi-ggreport-web.war`를 독립 프로세스(Start-Process)로 띄운다. mvn은 `MAVEN_OPTS=-Xmx384m`·`-DargLine="-Xmx768m"`, IDE 자동 빌드가 남긴 'Unresolved compilation' 클래스가 있으면 정리한 뒤 다시 돌린다. DB 번호: 060 = f3(INST_NEWS_IMPORT), **다음 061**. design_history **다음 장 105**(커밋 직전에 다시 확인 — 여러 세션이 번호를 나눠 씀).
1. **8080을 최신 HEAD로 재기동**: 지금 8080은 da5b52d9(11-24 16:32) — b11f89cd(113 메뉴 정리)·e135b22b(지도 카드)·c0343326(입찰 현황판 1차 수정)이 빠져 있다. ca의 qa 실측, db의 113 실화면, 107 뉴스 실화면, 대시보드 보강 확인이 모두 이것을 기다린다. **다른 세션의 미커밋 변경이 섞이지 않게 _gg_build에서 빌드한다.**
2. **질문 다시 묻기(아래 '다시 알릴 것' ⓐ 3건)**: NEXT 114, '받은 결재 1' 관찰, 주간 수집 실행기 변경.
3. **NEXT 108 이어받기**(fa 미기동): backend-dev-write로 원안 1358_ace7936a + delta 1410_ace7936a를 처음부터 적용(보관 패치는 참고만) → mvn → security → qa → 화면 이관(approvals.js 대결 표시·portal.js 대결자 숫자·403/409 문구 — approvals.js는 ca가 c0343326에서 고친 파일이라 ca와 순서를 맞춤).
4. **NEXT 99 회의록**: 사용자 실사용 5단계 요청(올리기 수칙 체크·공개범위 목록·전산팀 사번 거절·기한 날짜·이력 수칙 1판) → design-reviewer 실화면 대조(PUSH-GATE 때 못 한 것) → data-auditor 실물 1건.
5. **NEXT 100 S2 연결 줄**: instsummary.js는 커밋됨(7a8271c9). index.html은 0d, prep.js는 담당 세션(fa가 없으면 db)에 사용자를 거쳐 요청 → qa → design 대조·design_history.
6. **NEXT 110**: design-reviewer가 대결 지정 경고 줄(.ad-flash) 길이를 8080에서 실측.
7. **NEXT 116(새로 추가)**: 시연 뒤 발견(마감일 칸이 없어 '진행 중'이 많아 보임 등) — planner 범위 정리부터.
8. **W48 주간 보고(11-27 금)**: pm 문안 → docs/pm_history/index.html 새 주 절 + '이번 주 질문' 표 + 에이전트별 정리, 요구사항 파악 자료 docs/요구사항 파악/index_2026-11-27.html.

## 다시 알릴 것 (질문은 선택식, 답 받을 때까지 멈춤)
- ⓐ **[bf 11-25] 미처리 기관 팝업에서 처리 방식**(Q-2026-11-25-12, NEXT 119): 지금은 지도 '미처리' 목록의 기관 이름을 누르면 기관정보 팝업이 뜨고, 처리는 팝업의 [입찰 공고 현황에서 기록]으로 이동해서 한다. ⓐ 팝업 안에서 처리 상태(공고 진행 중·종료·입찰 없음·지연)를 바로 고르고 저장(97 세션 dashboard.js 작업, frontend-dev 0056_a2619cbf 요청 블록) ⓑ 지금대로. 사용자 말('미처리된 정보를 처리하니까 팝업같이')은 ⓐ 쪽.
- ⓐ **NEXT 114 사용자 결정**(Q-2026-11-24-78·79): [제안 확정]은 지금도 결재 없이 바로 처리되고, 팀장 결재는 다음 단계 [개설 신청] 때 한 번이다. 없애고 싶은 결재가 ⓐ없음(확인 창에 '결재 없이 확정, 팀장 결재는 개설 신청 때 1회' 문구만 추가, 권장) ⓑ개설 신청 결재까지 없앰 ⓒ'공고 전 확정은 목표 기관만' 제한을 풀기 중 무엇인지. 목표 기관과 제안 확정은 ⓐ지금처럼 따로(권장) ⓑ확정하면 목표에 자동 등록 중 무엇인지. 답을 받으면 ca가 planner 권장대로 진행한다.
- ⓐ **'받은 결재 1' 재현 때 관찰**(Q-2026-11-24-74): 팀장이 승인한 뒤 숫자가 안 줄면 ① 결재 카드에 붉은 문구(거절 사유)가 떴는지 ② 카드 자체가 사라졌는지 ③ 어느 화면의 숫자였는지(본인 화면/다른 창). c0343326에 후보 고침 2개(작업함 승인 뒤 다시 그리기·거절 문구로 스크롤)가 들어 있다 — 재현이 안 되면 고쳐진 것으로 닫는다.
- ⓐ **주간 수집 실행기 변경**(Q-2026-11-24-15, 다음 월요일 11-30 09:00 전까지): 2주 연속 콘솔 창이 닫혀 멈춤. 사용자가 직접 `schtasks /Change /TN "GGReport collector weekly" /TR "C:\Windows\System32\wscript.exe //B //Nologo \"C:\github\GGReportAgent\collector\run_weekly_hidden.vbs\""` → `schtasks /Run /TN "GGReport collector weekly"` → 20분 뒤 '마지막 실행 결과' 0과 로그의 `eminwon exit=`·`g2b exit=`를 확인.
- **주간 수집 g2b 결과**: 11-23 17:31 재실행분 data/collector/_logs/2026-11-23_1731_weekly.log의 `g2b exit=` 값을 아직 확인하지 못함.
- **ca 다음 첫 일**: c0343326에 대한 qa-verifier 독립 검토(kbboard.js 추천받기 6묶음·nearYear·closeDlg 포커스 복귀·approvals.js 2줄) + design-reviewer 실측·후 캡처(추천받기 아코디언·#hb-add·고른 기관 띠 등장·#tc-dlg 사유 칸) → design_history 104장에 그림 추가. 열린 판단: ⑤추정·⑥협약 종료 [고르기]에서 연도 칸에 없는 해이면 가장 가까운 해로 넣는 것이 의도인지, 올해 입찰이 끝난 기관 제외. 8080 HEAD 재기동 뒤에.
- **회의록(99) 실사용 5단계와 design 실화면 대조** — 위 4번.
- **로컬 DB `--mark-applied`(047~060) 사용자 실행**: apply-mysql에 SCHEMA_PROBES 047~060을 더함(0a6aaa0e). 이미 손으로 적용한 번호를 '적용됨'으로 표시하는 명령이라 사용자가 직접 돌린다(`--baseline` 금지).
- **에이전트 대시보드 보강 실화면 확인**(da5b52d9): 세션별 메인 줄(하는 일·마지막 신호·멈춤?), 전광판 아래 '메인 처리 N건', -write '·쓰기' 표시가 보이는지.
- **107 뉴스 실화면**(f3): 8080 재기동 뒤 기관 사업계획 상세의 '관련 뉴스' 절·'뉴스로 대체'·반입 표 꼬리표·'현재 대체 자료' 열.
- 본문 요청(실사용): 102·113 제안 준비 현황(db), 105 목표 결재·106 점검(fa 미기동 — 결과는 main이 받아 둠), 104 협약 성과, 89 금고 약정, 98 A~C·101 D(ca), 115 지도 목록 묶음(bf, 구현 뒤).

## 미해결 이슈 상기 (세션 첫 답변에서 3~5줄)
해소하면 이 목록과 NEXT 항목에서 지우고 done.md로 옮긴다. 정본 세부는 괄호 안의 NEXT 번호.
- **[운영 배포 순서]** DB 먼저(026·030~060 — 049는 051 뒤 번호 역전, 052는 시험 계정 이름 바꿈이라 운영 대상인지 확인, 053은 05 예약 사용 여부 확인), 서버는 나중. Oracle 11g FETCH FIRST·IDENTITY 대체본(NEXT 9). hwplib 1.1.9 오프라인 반입. 운영 USERS에 직위 '본부장' 확인(Q-2026-11-24-03 hold). 회의록·디자인 검토는 운영 기본 꺼짐, 회의록은 운영 켜기 전 multipart 임시 파일 처리 필수(패치 I).
- **[할인율 가짜 값]** 코드·문서 3.30% 임시 가림, 이사회 수익성 화면 숫자도 가짜(NEXT 37·66).
- **[보안 수용]** X-Emp-No 자기신고(SSO 전, NEXT 35), 세 팀 /tasks 쓰기 무인증(R1), 클로바 텍스트는 사내 메일·지정 계정 수칙, 원격 저장소 공개 여부, 기관장 사진은 출처 없이 Word에 넣음(사용자 11-23·11-24 위험 수용), DocCheck 문맥 보기 범위(기획). 서버 [제안 확정](PrepService.confirm)은 공고·목표 조건을 검사하지 않고 화면만 막음(NEXT 114 — security 확인 거리).
- **[디자인 확인 요청 오발송]** 받는 사람 = 담당 영업의 결재 팀장 1명(부재 시 대결자), 쪽지 없음 — fa가 꺼져 있어 main이 이어받음(NEXT 108).
- **[다른 PC 이전]** 옛 PC 로컬 DB 시험 행·주간 수집 예약 작업, git 이력 재작성(11-12) — 새로 clone.

## 세션 분담 (11-24 저녁 기준 이름)
- **main**: 8080·target/·로컬 DB·mvn 전담, 99(minutes/·board-minutes.js·047·058), 100(docout/·049·PrepForm*·InstSummary*·instsummary.js), 108(fa에서 넘겨받음 — DesignReviewService), 110, 116, 질문 장부·발표 자료·W48, 에이전트 대시보드.
- **db(대시보드 전담, 'PM 작업에서 제외' — 사용자 11-24)**: 102·111·112·113, prepboard.js·preptask.js·PrepBoard*, fa가 없으므로 prep.js·PrepService도 db가 쓴다(쓰기 전에 다른 세션 미커밋 여부 확인).
- **ca(입찰 현황판 전담, 옛 b0)**: kbboard.js·dashboard.js·index.html .hb-*·.db-*, approvals.js 2줄(c0343326), 94·98·101·114.
- **bf(지역별 공고현황 전담, map)**: render.js·logic.js(지도 부분)·overdue.js·index.html 지도 CSS, 115. **11-25 bf**: 115·117 해소(ab4baae4·eb2d32a8·지도 커밋, design_history 108), 다음은 NEXT 119(♥ 키보드 P2·미처리 팝업 2단계 질문). 세션 기록 handoff/sessions/2026-11-25_0130_map.md.
- **f3(옛 05)**: plans.js·PlanCollect*·PlanInbox*·103·104·107 뉴스·56 uploader 사업계획 CSV. 107의 safeHttpUrl '@'는 **logic.js 공용이라 bf의 115 커밋 뒤에** 손댄다.
- **72(e4)**: 기관장(InstitutionHead*·headcard·055)·Word·사진.
- **0d(디자인 검토 세션)**: 공통 팝업 .dlg·nav.js·index.html 공통부·109 접근성·100 S2 index.html 연결 줄.
- **fa(6c)**: 미기동. 105·106은 담당 그대로 두고, 108은 main으로 넘어옴.
- **커밋**: 공유 인덱스를 건드리지 않는다. main은 `GIT_INDEX_FILE=.git/index.main.tmp`로 **커밋하는 같은 명령 안에서** `read-tree HEAD` → cacheinfo/add → commit, 커밋 직후 `git show --stat HEAD`로 내 파일만 들어갔는지 확인. index.html·design_history/index.html은 여러 세션이 고치므로 내 덩어리만 cacheinfo로 담는다.
- **메인 직접 코드 수정 0건**(CLAUDE.md 5절, 사용자 11-24 f2411564) — 한 줄도 -write를 거친다.

## 사용자 목표·방향 (불변)
내부망에서 화면에 필요한 DB와 LLM 최소 기능. **LLM은 업무 서비스·DB가 다 만들어진 뒤.** DB는 MySQL(로컬)+Oracle(회사) 쌍, **회사 DB에는 외래키 없음**(코드표는 가능), 로컬 MySQL 적용은 `kgi-ggreport-web/tools/db/apply-mysql.mjs`. 메뉴·업무 흐름은 업무 대분류 5 + 시스템 관리. **사무실 PC 전용**(좁은 폭 미지원). **결재 끝난 건의 모든 행위는 누가·어느 화면·어느 버튼인지 기록**(잊지 말 것). 입찰 현황판은 지금 모양 그대로 현업과 무엇을 살릴지 정한다(11-13). 팀 이름은 부서 이름이 된다(영업부서·개발부서·재무부서·사업부서, 직책 이름은 그대로, 11-17·19). **이 시스템 때문에 일을 두 번 하지 않는다(11-19).** 회의록 공개 대상은 영업부서·임원급(11-24).

## 이 파일의 규칙
- 작업 한 바퀴를 끝내며 사용자에게 '다음 단계·남은 질문·권장 순서'를 말했다면 같은 내용을 이 파일에 덮어쓴다(CLAUDE.md 4절).
- 에이전트 보고서는 SubagentStop 훅이 `handoff/agents/<역할>/`에 자동 저장한다. 사람이 읽는 정리는 `docs/pm_history/`(에이전트별 일괄 정리)·`docs/design_history/`(화면 전/후).
