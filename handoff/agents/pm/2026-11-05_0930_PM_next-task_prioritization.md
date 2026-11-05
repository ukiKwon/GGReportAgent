# PM next-task prioritization — pm (opus)

> 자동 보존본: 서브에이전트가 메인에 돌려준 최종 보고서를 대화 기록에서 그대로 옮겼다(2026-11-05 09:30 KST, agentId a09e229d9427ecff2). 에이전트 출력이므로 사용자 결정이 아니다.

---

**PM 보고 — 2026-11-05 순서·배분안** (읽기 전용이라 저장할 곳은 `handoff/agents/pm/`)

**1. 무엇을 봤나 / 못 본 것.** NEXT.md에서 26·27·37·39·40·43·44·45·46을 읽었고, 2026-11-04 summary의 두 세션, graph.md, `.claude/agents/*` 프런트매터 `model:`을 봤습니다. 못 본 것: 45의 qa FAIL 원문 보고서입니다. `handoff/agents/qa-verifier/`에 11-03 파일이 없습니다. `handoff/sessions/`도 없어서 병렬 세션과 겹치는 일은 없는 것으로 봅니다. `docs/samples/`는 비어 있어 실제 사본이 아직 없습니다.

**2. 항목 지도** (번호 · 상태 · 무엇에 막히나 · 다음 한 걸음)
- 46 · 사실상 해소 · 막힘 없음 · done.md로 옮깁니다. NEXT의 상태 줄은 아직 '미착수'로 남아 있어 실제와 다릅니다.
- 45 · 진행 · 8080 서버를 한 세션만 써야 함 · xlsx 업로드를 재시험해 500 원인을 가리고, 기본 양식 칸에 key를 어디서 붙일지 결정합니다.
- 37 S3 · 대기 · 45에 막힘(업로드 경로가 같고 8080·`target/` 공유) · 지도 v2 파서를 만듭니다. S4에서 연결할 때 security 재점검 ⓐ~ⓒ가 필요합니다.
- 44 F1·F3·F5·F6 + P2 3건 · 대기 · 403 문구는 메뉴명 기획 확정이 먼저입니다 · 묶어서 처리합니다.
- 26 N2 브라우저 재검증·27 잔여 · 대기 · 45의 브라우저 세션과 함께 할 수 있습니다.
- 39 uploader POI 가드 · 대기 · 막힘 없음(18-B 반입 전에 끝내야 함) · ZipGuard를 이식합니다.
- 43 · 대기 · 막힘 없음, 다른 항목과 독립 · 연출 로직을 순수 함수로 떼어 냅니다.
- 문의 1-2·3, 그리고 9 · 막힘 · 사용자의 질의·회신 대기 · 사용자 행동이 필요합니다.

**3. 순서 후보.** 기준은 막힘을 풀어 주는 효과, 사용자 지정 최우선(37), 되돌리기 쉬운지입니다.
① **45**: 37 작성 모드의 P0입니다. 이걸 풀어야 37 S3·S4를 믿을 수 있습니다.
② **37 S3→S4**: 사용자가 최우선으로 지정한 항목입니다. 45가 끝난 뒤 같은 세션에서 차례로 갑니다.
③ **44 묶음 + 26 N2 재검증**: 45의 브라우저 세션을 다시 쓰면 됩니다. 비용이 적고 되돌리기도 쉽습니다.
④ **39**: 다른 항목과 독립입니다. 서버를 쓰는 일이 비는 시간에 병렬로 할 수 있습니다(uploader 모듈이라 `target/`이 다름).
⑤ 43: 우선순위가 낮습니다.

**4. 배분 (역할과 모델)**
- 45: qa-verifier(Opus)가 재현 → 원인 쪽에 따라 backend-dev(Sonnet) ∥ frontend-dev(Sonnet) → 메인 적용 → qa-verifier(Opus) ∥ security(Opus) → PUSH-GATE. 오류 응답을 손대면 security가 필수입니다.
- 37 S3·S4: backend-dev-write(Sonnet) → qa(Opus) ∥ security(Opus, S4 재점검) → data-auditor(Sonnet, 사본이 온 뒤).
- 44: design-reviewer(Opus) → frontend-dev(Sonnet) / F1은 backend-dev(Sonnet) → qa(Opus).
- 39: security(Opus) 설계 → backend-dev(Sonnet) → qa(Opus).
- 충돌 주의: 45·46·37 S3·26 재검증이 모두 8080·MySQL·`target/`을 같이 씁니다. `mvn test`를 돌리면 실행 중인 서버를 재시작해야 합니다(NEXT 27 기록). Playwright 브라우저는 한 세션만 씁니다.

**5. qa-verifier 지시서 초안 (NEXT 45)**
- **대상**: 브랜치 `kgi-report-web-dev`, http://localhost:8080 (이미 기동, MySQL `ggreportdb`). 쓰기 권한 없음.
- **맥락**: 11-03 FAIL을 다시 봅니다. P0은 유효한 xlsx 업로드가 전부 500을 낸 것입니다. 의심 지점은 `XlsxBook.java:144`(Exception→422)와 `BoardWriteExceptionHandler:74`(RuntimeException만 잡음)입니다. P1은 `/board-docs/default_doc` 칸에 `key`가 없어 `board-write.js:756-757`이 값 칸을 안 그리는 것입니다(`BoardFormService.java:424`는 서버 양식에만 key를 부여).
- **확정된 것**: 이 PC의 config 키는 새로 만들었습니다. 다만 out-local과 키 이름을 대조했는지(ⓓ)는 메인이 먼저 확인해야 합니다. 시험 데이터는 form_id=1, 사번 3918264(tasks 수정 권한)입니다.
- **해 볼 것**:
  ① `POST /board-forms/1/excel`에 유효한 xlsx를 올려 상태 코드와 응답 본문 원문을 남깁니다. 설정 누락 때문인지, 예외 처리 공백 때문인지 판정합니다. errors.detail 값은 키 이름으로만 확인합니다.
  ② 기본 양식에서 작성 모드에 들어가 값 칸이 그려지는지 봅니다.
  ③ 411·413, 머리글 partial/failed, HIDDEN_FORMAT 안내를 봅니다.
  ④ 11-02 design 대조 P2를 재확인합니다.
- **기대 산출물**: P0~P3 판정표(파일:줄 근거, 재현 절차)와, 원인별로 backend 또는 frontend로 넘길 이관 메모를 받습니다. 비밀값과 응답 속 개인정보는 기록하지 않습니다.

**6. 사용자에게 물을 것**
- Q1. 45 P1의 key를 어디서 붙일까요? (a) 서버 `/board-docs`도 key를 부여 (b) 프런트가 없으면 만들어 씀 (c) planner에게 먼저 분석. PM 권장은 (c)를 거쳐 (a)입니다.
- Q2. 45가 끝나면 다음은 무엇으로 할까요? (a) 37 S3 바로 착수 (b) 44 묶음을 먼저 (c) 둘을 병행(서버와 브라우저 분리)
- Q3. 정리 대기 건(`qa37_*.png`·`.DS_Store` 삭제, `.gitignore`에 `.DS_Store` 추가, `C:\dev\_dl\apply_all.sql`)을 (a) 이번에 처리할까요 (b) 보류할까요?

참고: NEXT 45의 "세션 시작 키 대조 제안(승인 대기)" 줄은 11-04에 이미 CLAUDE.md에 들어가 낡은 기록입니다. 37의 '사용자가 할 일'에 남은 "Playwright 재설치"도 11-03에 다시 설치해 낡았습니다. 두 줄 모두 다음 PUSH-GATE 때 정리하면 됩니다.
