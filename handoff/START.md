# 다음 세션 시작점 (항상 최신 1개 — 덮어쓴다)

마지막 갱신: 2026-11-27(금) 08시 cf 마무리 — a6·92·e2·1d 커밋 확인 뒤 cf가 일괄 푸시(origin 08736b9d..HEAD). 오늘 요약: handoff/2026-11-27_summary.md `## Session 02:00`(a6)·`## Session 08:00 (cf 마무리)`. 근거: handoff/agents/security/2026-11-27_0759_a1e16e36.md·pm/2026-11-27_0759_aaa8e05d.md·cleaner/2026-11-27_0757_aa6792ad.md. **규칙(사용자 11-26)**: NEXT·START 항목엔 handoff 자료 경로 우선, 해소 과제는 두 파일에서 반드시 뺀다(CLAUDE.md 4절).

**사용자 11-27 08시**: 작업은 모두 **다음 PC에서 이어** 한다 — 그 PC에서 pull(814411a0 이후) → 환경 점검 → `apply-mysql.mjs --status`부터. snrnd PC는 064까지 적용 확인(11-27 사용자 출력: 적용 56·대기 1), **068만 대기**, 8080 = 5a328494 빌드로 둔 채 마무리(HEAD war는 빌드만 해 둠). 답 받음: 주간 공고 수집은 **옛 PC 그대로**(Q-2026-11-24-15 answered), 131 쓰기 확인은 **시험 건 bc-db44987f를 목표 기관으로 지정해** 한다(권장안, 시연 건은 건드리지 않음) — 시험 건이 다음 PC DB에 없으면 그 PC에서 시험 건을 새로 정한다.

**사용자 11-26 밤**: 세션 하나(11-27은 cf)가 각 세션 작업을 지켜보고 **커밋·최종 푸시·git pull·환경설정·8080 재기동을 전담**한다. 다른 세션은 묶음이 끝나면 파일 목록+커밋 메시지 초안을 그 세션에 보내거나 임시 인덱스로 직접 커밋하고 해시를 알린다(푸시는 하지 않는다).

## 첫 순서 (main, 묻지 않고 실행)
1. `git pull`(kgi-report-web-dev) → 환경 점검(CLAUDE.md 3절 ⓐ~ⓔ) → `ListAgents`로 세션 정체 확인(이름은 세션마다 바뀜).
2. **PC가 둘이다 — 환경이 다르다.** ⓐ superuser PC(11-26): mvn = PATH의 apache-maven-3.9.16, 로컬 DB 064까지 적용, plan-inbox 폴더 있음. ⓑ **snrnd PC(11-27 cf가 쓴 PC)**: mvn은 PATH에 없고 IntelliJ 동봉(`/c/Program Files/JetBrains/IntelliJ IDEA Community Edition 2025.2.2/plugins/maven/lib/maven3/bin/mvn.cmd`), JAVA_HOME=/c/dev/jdk8/jdk8u504-b01, **로컬 DB 적용 상태 미확인(기록상 063, 064·068 필요)** — 사용자가 터미널에서 `node kgi-ggreport-web/tools/db/apply-mysql.mjs --status` → 대기분 적용(비밀번호 필요, 메인은 못 함). **068 적용 전에는 8080을 HEAD로 띄우지 않는다**(이사회 자료 목록·상세 500) — 지금 8080 = 5a328494 빌드. DB 번호: 068은 131(a6)이 먼저 씀, 065·067(a6)·066(ca)은 비어 있음(예약 유지), 069~는 133 예약. 설정 키 대조(CLAUDE.md 3절 ⓓ)는 권한에 막혀 미실행 — 사용자에게 diff 명령 안내, 92가 쓸 `ggreport.llm.ollama.*` 키도 그때 확인. 샘플은 사용자 Downloads\sample(저장소 밖).
3. **8080은 커밋된 HEAD만**: `c:/github/_gg_build`에서 `git checkout -q --detach <HEAD>` → kgi-ggreport-web에서 `mvn -q -o package -DskipTests`(MAVEN_OPTS=-Xmx384m) → war를 scratchpad로 복사해 그 사본을 `java -Xmx768m -jar`로 main 폴더 kgi-ggreport-web에서 띄움. **실행 인자에 `--ggreport.plan-inbox.location=C:/Users/superuser/Downloads/inout/plan/inbox`를 붙인다**(55 기관 사업계획 반입 대기 파일, 11-26 16시 — 읽기만. **superuser PC 경로다 — snrnd PC에는 그 폴더가 없어 11-27은 빼고 띄웠다**). 전체 mvn도 _gg_build에서 `-DargLine="-Xmx768m"`(11-27 5091eb0e 2817/0/0 skip 3). 화면만 바뀐 커밋은 재기동 불필요. design_history 다음 장 **142**.
4. **공유 .git/index는 늘 뒤처진다**(세션마다 임시 인덱스로 커밋하기 때문) — 커밋은 반드시 `GIT_INDEX_FILE=.git/index.<세션>.tmp`, 공유 인덱스로 커밋 금지. 필요하면 `git reset -q`(작업 파일 무변경)로 맞춘다. 두 세션이 같은 순간 커밋하면 한쪽이 ref lock으로 거부된다 — 임시 인덱스를 HEAD에서 다시 읽어 재시도(손실 없음).
5. **남의 조각이 섞인 파일에서 내 조각만 담을 때**(11-27 cf 실수 9e6fe19b): `git diff -U0`를 걸러 `git apply --unidiff-zero`로 넣으면 자리가 밀린다 — 문맥 3줄을 둔 패치를 쓰고, 커밋 뒤 `git show HEAD:<파일>`로 `node --check`와 **커밋 상태 시험**(_gg_build에서 HEAD checkout 뒤 `node --test "frontend/test/*.test.js"`)을 돌린다. 작업 폴더 시험·8080은 작업 폴더 파일을 읽어 커밋본 오류를 못 잡는다.
6. **전체 mvn은 한 번에 한 세션**: 동시에 돌리면 CompleteApiTest가 %TEMP%\kgi-ggreport-test-archive 고정 폴더에서 부딪혀 1건 실패(단독 통과) — 돌리기 전에 다른 세션에 한 줄 알린다.

## 이어갈 일 (세션별 — 자세한 내용은 경로의 자료)
- **6e(제안 준비 현황)**: ① 125 1단계 화면·서버 실측(8080 = 921447e1, /preps 응답에 bid_subject_cd·bid_subject_name 확인됨) ② NEXT 125 db 몫 — DB 065·067 → S3a 한 커밋(PrepStage5·120 ① 서버 + prepboard.js·preptask.js, 해시를 ca에 전달) → S3b ③ 125 화면 열(입찰 대상·공고명, A안) ④ NEXT 113(대본 '이사회' 고정 적용·요약서 여백·design_history 장·화면 실측) → 121 ①~⑥. 자료: handoff/sessions/2026-11-26_0900_dash.md '19시 덧붙임', 설계 handoff/agents/backend-dev/2026-11-26_1708_a12c06a4.md·1737_a12c06a4.md(+같은 폴더 a12c06a4 최종판), 검토 handoff/agents/qa-verifier/2026-11-26_1714_abbe2e11.md, 시안 handoff/agents/history/2026-11-26_입찰대상_목록_시안/index.html. **11-27 02시 a6 덧붙임**: NEXT 131(피드백 9건, 커밋 61f1dfde·5a328494·840b7eb5·5091eb0e) — 첫 일은 로컬 DB 068 적용 확인 → 8080 재기동 → qa 실화면(쓰기 검증할 건을 사용자에게 다시 묻기), 이어 NEXT 133(11단계 제출서류, 답 3건 대기). design_history 다음 장 141. 자료: handoff/sessions/2026-11-27_0000_dash.md.
- **ca(입찰 현황판)**: NEXT 120 ① 2차 서버·② 기획 판정 → 114 ②~⑤. 자료: handoff/sessions/2026-11-26_0921_ca.md. security 후속(하): 응답 tag_source DEFAULT→NONE을 화면이 쓰는지, 옛 GOAL 이월 행 처리(data-auditor) — handoff/agents/security/ 11-26 15시대 PUSH-GATE 보고서.
- **0d(디자인 검토)**: NEXT 124 남은 몫. 자료: handoff/sessions/2026-11-19_1930_0d.md '11-26'.
- **e4(기관장)**: NEXT 77 — 옛 경력 12줄·qa P3·Word 실물·법원장 사진. 자료: handoff/sessions/2026-11-25_2020_e4.md '11-26'. 잊지 말 것: Word '요약'에는 연도·일자 정보가 없다.
- **b3(시작화면)**: NEXT 126. 자료: handoff/sessions/2026-11-26_1400_b3.md.
- **1d(랜딩, c3 이어받음)**: NEXT 127 — 업무 흐름 예시 화면 5개 커밋(ad3ea875, design_history 141, 랜딩 시험 12/12·security 통과). 남은 것: qa-verifier·design-reviewer 실화면(1280×800·1440×900), DESIGN.md '소개 표면' 절(문안 handoff/agents/design-reviewer/2026-11-27_0116_a128582f.md 7절 끝). 자료: handoff/sessions/2026-11-27_1d_랜딩.md(이름이 규칙 `날짜_HHmm_세션이름`을 벗어남 — 바꾸면 NEXT 127 포인터도 고친다), 앞 기록 2026-11-26_1112_c3.md.
- **92(AI 기능 개발, f4 뒤 — 11-27 새벽)**: ⑤ 대본 AI 초안 서버는 커밋(85f6ca40·182bb31d), 화면은 미커밋 중간 상태(preptask.js 거의 적용·prep.js 배선 남음, script-ai-draft.test.js 2건 실패가 그 표시), 공고 파일 읽기·의안번호 기본값 미착수. 이어 갈 순서와 인터뷰 답은 NEXT 129 '11-27 새벽' 줄과 handoff/sessions/2026-11-26_2335_92.md. **08시 cf**: 중간 상태(작업 폴더의 preptask.js·prep.js·index.html 조각 + 미추적 frontend/test/script-ai-draft.test.js)는 커밋하지 않고 그대로 둠 — 보관 사본 handoff/agents/history/2026-11-27_대본AI화면_중간.patch. 화면을 커밋할 때 모델 출력(fields.intro/effect)은 textarea `.value`나 `esc()`로만 넣는다(security 11-27). a6의 S3a(preptask.js·prep.js)는 이 화면 커밋 뒤. 앞 세션 f4의 배경 자료: handoff/agents/history/2026-11-26_AI기능_개발.md, handoff/sessions/2026-11-26_1825_f4.md.
- **bf(예상 공고현황, 미기동)**: NEXT 122 qa P2-1·P2-2, 119. 자료: handoff/sessions/2026-11-25_1755_map.md.
- **e2(디자인 — KB글꼴)**: NEXT 130 — 화면 적용 커밋 끝(11-27 새벽). **글꼴 파일은 저장소에 없다**(사용자가 따로 메일로 보냄, `frontend/fonts/`는 .gitignore — 받은 PC에서 그 폴더에 woff2 4개를 넣는다, 없으면 설치된 KB글꼴→맑은 고딕). 사내 서버에 웹 글꼴로 올리는 것은 가능(사용자 11-27). 남은 것: qa P3(캐시 기간·회의록 붙여넣기 칸 고정폭·미설치 PC 실측). 자료: handoff/sessions/2026-11-26_2350_e2.md(파일 이름·해시·변환 방법), 검증 handoff/agents/qa-verifier/2026-11-27_0006_a737c488.md. design_history 다음 장 **137**(a6가 쓰면 그 뒤).
- **main(커밋·푸시 전담 세션)**: ① 사용자 DB 적용 답 → 8080 HEAD 재기동 → a6·92에 알림 ② **금요일 일(11-27 새벽에 못 함 — 다음 세션 첫 작업)**: W48 주간 보고(docs/pm_history/index.html, '이번 주 질문' 표 — 장부 밖 질문은 세션 기록에서 모아 따로 표시) + 요구사항 파악 자료(docs/요구사항 파악/index_2026-11-27.html, 8080 HEAD 기동 뒤) ③ 질문 장부 정리(아래 정리안 + NEXT 88 수집 누락) ④ NEXT 108 → 99 → 100 ⑤ worktree 정리(_gg_ca·_gg_dash·_gg_e4test에 미커밋 시험 변경 — 각 세션 확인 뒤, _gg_a6test는 미커밋 없음·지워도 됨). 순서·배분 전문: handoff/agents/pm/2026-11-27_0759_aaa8e05d.md 6절.

## 다시 물을 것 (선택식, 답 받을 때까지 멈춤)
- **작업하는 PC의 로컬 DB 068 적용**(사용자 터미널, 비밀번호 필요): 적용 전에는 8080을 최신으로 못 띄워 피드백 9건을 화면에서 확인할 수 없다. 다음 PC는 `--status`로 064부터 확인.
- **133 제출서류 답 3건**(분모·7/7 자동 완료·주민번호 든 서류)과 견본 RFP(a6, 설계 착수 때).
- **132 메뉴 접근 이름 '지금 보는 화면 포함'의 뜻**(e2, 기획 확인).
- **113 ⑤ 발표 대본**(회의 이름 = '이사회' 고정, 11-26 답): 승인 총액 기준(출연금+예비비/표 합계), 주거래은행 기관 문장, 샘플 판독 2곳('어업보상금'·'2조 3,671억원'). 자료 handoff/sessions/2026-11-26_0900_dash.md.
- **NEXT 125 한 기관 여러 공고**(담당자·결재는 입찰마다 따로, 11-26 답): 수집 검색어에 "금융기관 선정"·"법인카드"·"자금관리" 추가.
- **NEXT 120 ②**: 탈락·유찰 세는 법(Q-25-44), 제출·선정 기록 위치(Q-25-45), 협약식 없는 기관의 '협약 완료' 기준(Q-25-48).
- **주간 수집 실행기**(Q-2026-11-24-15, 답 11-27: 옛 PC 그대로): 남은 것은 옛 PC 작업 스케줄러에서 실행기를 run_weekly_hidden.vbs로 바꾸는 일(사용자, 11-30 09:00 전) — 했는지만 확인한다.
- 작업에 붙인 질문: Q-25-18(ca 101), Q-25-53(122 P2 뒤), 0d 빈 사유 표시 시점(124 — 폐쇄망 브라우저는 Chrome·Edge 105 이상으로 답 받음 11-27, `:has` 사용 가능, DESIGN.md), 공고문 견본(Q-24-13), 법원장 사진(Q-24-23), 업로더(Q-24-54·55).
- 장부 정리안(pm 11-26 PUSH-GATE): done 후보 Q-25-43·26-05·26-08·26-06·26-07·25-40~42·25-49·25-50·25-15·26-01·25-56·25-91·26-10·26-11 / hold 후보 Q-25-16·17·19·20·22~33(db 일괄 확인) / Q-26-09 확인 필요.

## 미해결 이슈 상기 (세션 첫 답변에서 3~5줄)
- **[보안]** 121 ①~⑥ 잔여(옛 refresh 호환 거두기·상세 체크 감사 이름·결과 기억 상한·F4ⓐ·옛 /assignee-change·매퍼 DEBUG 로그).
- **[운영 배포 순서]** DB 먼저(026·030~064·068 — 068은 065~067보다 먼저 올라간 번호 역전, 049는 051 뒤 번호 역전, 052는 시험 계정 이름 바꿈이라 운영 대상 확인, 053은 05 예약 사용 여부 확인), 서버는 나중. Oracle 11g 대체본(NEXT 9), hwplib 1.1.9 오프라인 반입, 운영 USERS '본부장' 직위 확인, 회의록 운영 켜기 전 multipart 임시 파일(패치 I), 개발 설정 ggreport.errors.detail=false(123).
- **[할인율 가짜 값]** 3.30% 임시 가림, 이사회 수익성 화면 숫자도 가짜(NEXT 37·66).
- **[보안 수용]** X-Emp-No 자기신고(SSO 전, NEXT 35), 세 팀 /tasks 쓰기 무인증, 클로바 수칙, 기관장 사진 출처 없이 Word, 서버 confirm 게이트.
- **[브라우저 한 번에 한 세션]** Playwright Chrome 창을 사용자가 직접 쓰면 qa 조작이 섞인다 — qa 전에 알린다.

## 사용자 목표·방향 (불변)
내부망에서 화면에 필요한 DB와 LLM 최소 기능. **LLM은 업무 서비스·DB가 다 만들어진 뒤.** DB는 MySQL(로컬)+Oracle(회사) 쌍, **회사 DB에는 외래키 없음**(코드표는 가능), 로컬 MySQL 적용은 `kgi-ggreport-web/tools/db/apply-mysql.mjs`. 메뉴·업무 흐름은 업무 대분류 5 + 시스템 관리. **사무실 PC 전용**(좁은 폭 미지원). **결재 끝난 건의 모든 행위는 누가·어느 화면·어느 버튼인지 기록**(잊지 말 것). 입찰 현황판은 지금 모양 그대로 현업과 무엇을 살릴지 정한다(11-13). 팀 이름은 부서 이름이 된다(영업부서·개발부서·재무부서·사업부서, 직책 이름은 그대로, 11-17·19). **이 시스템 때문에 일을 두 번 하지 않는다(11-19).** 회의록 공개 대상은 영업부서·임원급(11-24).

## 이 파일의 규칙
- 작업 한 바퀴를 끝내며 사용자에게 '다음 단계·남은 질문·권장 순서'를 말했다면 같은 내용을 이 파일에 덮어쓴다(CLAUDE.md 4절). 해소한 과제는 여기서도 뺀다.
- 에이전트 보고서는 SubagentStop 훅이 `handoff/agents/<역할>/`에 자동 저장한다. 사람이 읽는 정리는 `docs/pm_history/`(에이전트별 일괄 정리)·`docs/design_history/`(화면 전/후).
