---
tags: [item, open]
원본: NEXT.md
번호: 9
---

> 원본: `handoff/NEXT.md` (파생본)

### 9. WebLogic/Java 이관 — **단계 1·2·5 완료, 4 대부분. 남은 것은 전부 문의 회신 대기** (2026-08-27)

- **출처**: `[[2026-08-05|2026-08-05_summary.md]]` `## Session 07:57`.
- **무엇이 있나**: 설계 문서
  `docs/superpowers/specs/2026-08-05-weblogic-java-migration-design.md` (커밋됨).
  브레인스토밍으로 제약을 사용자에게 확정받고 쓴 것이다 —
  **① Java only(폐쇄망에 Python 런타임 불가) ② JDK 1.8 ③ ~~eGovFrame 4.x 준수 필수~~
  → **Spring Boot 2.7.x WAR**(2026-08-25 폐기) + Oracle + MyBatis ④ 브라우저는
  크롬/엣지 최신 ⑤ LLM은 당행 사내 공용 API ⑥ **[2026-08-25 신설] 서비스 간 호출은
  회사 공통 API 게이트웨이(경유지) 경유 + OAuth 필수.**
  이것들이 설계의 전제이므로 하나라도 바뀌면 문서를 다시 봐야 한다.
- ⚠️ **2026-08-25 — eGovFrame 제약을 폐기했다(사용자 확정).** "eGovFrame 4.x 준수
  필수"는 **잘못 받은 확정**이었다. eGovFrame은 행안부의 **공공기관 정보화사업 전용**
  프레임워크인데 이관 목적지는 **당행 내부 표준 플랫폼**이라 적용 대상이 아니다
  (제안 대상이 구청이라 혼선이 있었던 것으로 보인다). 그 한 줄이 설계 제목·
  Spring Boot 배제·문의서 6번까지 끌고 갔었다.
  - **되살아나는 조건**: 이 시스템을 지자체·공공기관에 **납품**하기로 하는 경우.
  - **폐기의 이득**: `web.xml`을 우리가 소유하게 돼 종전 문의 6번이 불필요해졌고
    (직접 `async-supported=true` 명시), **`uploader/`(Spring Boot 2.7.18 + JDK 8 +
    WebLogic WAR + MyBatis + PDFBox/POI)가 단계 1(골격)의 실물 출발점**이 됐다.
  - 개정한 문서 4건: 설계(제목·§2·§3·§6-C·§7) · 문의서 · 내부메모 · 구현계획.
    **문의서·설계 §7·계획 매핑표의 번호를 통일**해 2026-08-19에 실제 오류를 냈던
    번호 불일치 자리를 없앴다.
- **핵심 결론**(문서를 안 열어도 이어받을 수 있게): 화면(`frontend/` 2,986줄)은
  **재작성 없이 WAR 정적 리소스로 그대로** 간다(브라우저가 현대 버전이라 폴리필·JSP
  불필요). 백엔드 프로덕션 6,288줄은 전면 재작성. 등가물이 없어 **직접 만들어야 하는
  것은 3개** — (a) FTS5 trigram 한글 검색 → Oracle Text CONTEXT(폴백: Java 인메모리
  색인, 코퍼스가 5.6MB뿐이라 가능), (b) LangGraph `interrupt()`/체크포인트 →
  `ORCH_RUN`/`ORCH_STEP` 테이블 기반 명시적 상태머신 + CommonJ WorkManager,
  (c) LLM 호출 → LangChain4j 대신 HttpClient+Jackson 직접(구조화출력·2단폴백만 쓰므로).
  벡터 검색은 Oracle BLOB + Java `float[]` 브루트포스 코사인으로 유지(벡터DB 불필요).
- **미착수**: ① **구현계획(`docs/superpowers/plans/`)이 아직 없다** — 설계 §8의 5단계를
  plan으로 풀어야 한다. ② **기관·DBA 확인 7건(설계 §7)이 전부 미확인**이다. 그중
  두 건은 설계를 바꾼다 — **사내 LLM API가 임베딩 엔드포인트를 주는가**(없으면 벡터 검색
  포기 = 검색 품질 하락, 사전 합의 필요), **Oracle Text를 쓸 수 있는가**(§6-A 1안/2안 분기).
- **이관 전에 반드시 먼저 할 일**: 현재 Python 시스템에서 주요 API 응답·산출물을
  **골든 파일로 떠 두는 단계 0**. 프런트가 안 바뀌므로 "같은 입력 → 같은 출력" 비교가
  이관 검증의 전부다. 지금 시스템이 살아 있는 동안에만 뜰 수 있다.
- **2026-08-06 착수 판단 정리**(출처: `[[2026-08-06|2026-08-06_summary.md]]` `## Session 16:48`).
  사용자가 "9번 해보자"로 열었다가 **시간 관계로 착수 없이 중단**했다. 다음 세션이
  같은 분류를 다시 하지 않도록 결론만 남긴다 — **아직 아무것도 시작하지 않았다.**

  | | 하위 과제 | 지금 가능한가 |
  |---|---|---|
  | ① | 구현계획(`docs/superpowers/plans/`) — 설계 §8의 5단계 | **잠정 작성 완료(2026-08-10)** — `docs/superpowers/plans/2026-08-10-weblogic-java-migration.md`. 3단계(검색)만 A/B 분기로 잠정(문의 3 회신이 확정, 회신 전 착수 금지), 나머지는 착수 가능. 문의서 회신 ↔ 계획 매핑표 포함. 검증은 전부 `golden/` 비교 |
  | ② | 인프라·DBA 확인 **10건**(설계 §7) | **문의서 작성(2026-08-10) + 발송 전 점검(2026-08-20) + 재개정(2026-08-25) + 발송본 정리·5-1 추가(2026-08-28, `df95616`)** — `docs/이관문의서_WebLogic_확인사항.md`(**2026-08-25 개명**, 종전 `기관문의서_WebLogic이관_확인사항7건.md`) + 메일 본문 `docs/이관문의서_발송본_2026-08-28.md`. **준비는 전부 끝났고 발송·회신만 사용자 몫**이다 — 2·3번(임베딩·Oracle Text)만 먼저 회신받아도 ①을 진행할 수 있다. 상세는 이 파일 위쪽 **"▶ 문의서"** 절 |
  | ③ | ~~단계 0 — 골든 파일 뜨기~~ | **완료(2026-08-10)** — 아래 참조 |

  - ~~추천 순서는 ③ → ② → ①~~ — **2026-08-10에 ③·②·① 전부 완료.** 이 항목에서
    이제 남은 것은 ⓐ 문의서 발송·회신 수령(사용자 몫) ⓑ 회신 반영(계획의 잠정
    지점 확정 — 매핑표대로 기계적) ⓒ 실제 Java 구현 착수(별도 환경·별도 세션)뿐이다.
    (**ⓐ의 준비 쪽은 2026-08-28에 종결** — 발송본까지 만들었다. 위 "▶ 문의서" 절.)
  - ✅ **2026-08-26 — ⓒ 착수. 단계 1(골격)이 전부 끝났다.**
    출처: `[[2026-08-26|2026-08-26_summary.md]]` `## Session 13:00`. 커밋 `11dc72a`…`0c028ec`
    (13건, 전부 push). **산출물: `kgi-ggreport-web/`** — groupId `com.kbstar` /
    artifactId `kgi-ggreport-web` / 패키지 `com.kbstar.kgi.ggreport.web`(사용자 확정).
    - **Task 1.1·1.2** WAR 골격 + `web.xml`/`weblogic.xml`. 실기동 확인 —
      `GET /` 200(대시보드), 디자인 실험본 404. `mvn package` BUILD SUCCESS.
    - **Task 1.3** DDL 2벌 11테이블 — `src/main/resources/db/{oracle,mysql}/001_schema.sql`.
    - **Task 1.4** 골든 비교 하네스 4클래스. 모듈 테스트 **31건 통과**.
    - **환경 확정(사용자)**: 내부망은 `local`부터 전 구간 **Oracle**, 외부망 로컬만
      **MySQL**, Maven 중앙 접근 불가(수동 반입, 절차는 있고 까다롭지 않음),
      JDK 1.8 공통. ⇒ 종전의 "개발용 Oracle을 구해야 한다"는 **더 이상 과제가 아니다.**
    - **Maven 설치됨**: `C:\Users\superuser\tools\apache-maven-3.9.16`,
      사용자 환경변수 `JAVA_HOME`·`MAVEN_HOME`·`PATH` 등록 완료.
  - ✅ **2026-08-27 — 단계 2·5 완료, 단계 4 대부분.** 출처: `[[2026-08-27|2026-08-27_summary.md]]`
    `## Session 19:41`. 커밋 `56bfe6c`…`a63154b`(11건). **브랜치
    `weblogic-java-migration`, 전부 push 됨.** 테스트 `kgi-ggreport-web` **147건** +
    `uploader` 38건, 전부 `mvn -o` 통과.
    - **단계 2 완료** — 2.1 POJO 21+Mapper 7(방언 분기 `databaseId`) · 2.2 컨트롤러 8 ·
      2.3 시드 `003`(25개 자치구, MERGE 라 멱등).
    - **단계 4 결재 흐름 완주** — 골든 `10`~`30` 대조 통과(생성→참여결정 3단→작업 결재
      3세트→최종확정→조회 5종). `GoldenWriteScenarioTest` 하나가 순서대로 재생한다.
    - **단계 5 완료** — PDFBox(골든과 **공백 뺀 본문 완전 일치**, 줄바꿈만 다름) ·
      POI XSLF(슬라이드 텍스트 골든 일치) · 배점 검증 테스트.
    - **Task 4.1·4.2 완료** — `ORCH_RUN`/`ORCH_STEP` + 상태머신 엔진 + 3단 게이트 +
      재개 + `/run`·`/checkpoint` + WorkManager(리플렉션 배선 + 폴백).
    - DDL 이 `001`~`006` 으로 늘었다(`004` 시각 컬럼 40자, `005` 로그 테이블 `SEQ_NO`,
      `006` 오케스트레이터). **MySQL 미러에 전부 실제 적용해 확인**했고 Oracle 은 미검증.
    - 상세(되돌리면 안 되는 계약, 실측 수치)는 **`kgi-ggreport-web/README.md` §7-1~§7-7**.
  - ✅ **2026-08-28 — Task 4.3 완료 + 4.4 인터페이스 동결.** 출처: `[[2026-08-28|2026-08-28_summary.md]]`
    `## Session 14:58`. 커밋 `bde657b`(문서 정정)·`1972721`(4.3)·`cf31c31`(4.4),
    전부 push. 테스트 **147 → 168**, `mvn -o package` BUILD SUCCESS.
    - ⚠️ **설계가 원본을 "SSE"로 규정한 것은 사실오류였다 — 정정 완료.** 원본은
      `POST` + `text/plain; charset=utf-8` **평문 청크**이고 `data:` 프레이밍이 없다
      (`server/routers/chat.py:88` 주석이 명시). 화면도 `EventSource` 가 아니라
      `fetch` + `body.getReader()` 로 읽는다(`frontend/js/chat.js:144`).
      **`SseEmitter` 로 만들면 말풍선에 `data:` 가 쌓인다** — 화면 무변경이 전제라
      `StreamingResponseBody` 로 갔다. 설계 §3 표·§7·계획 Task 4.3·문의서 7번·web.xml
      주석을 함께 고쳤다(`bde657b`).
    - **곁가지 사실 2건**: 스트리밍 소비처는 **채팅 하나뿐**이다(작업 진행 표시는
      스트리밍이 아니라 **폴링** — `workflow.js` 의 `progress_pct`). `tasks.py` 의
      스트리밍 엔드포인트는 **프런트 호출부가 없는 API 전용**이다.
    - **Task 4.3 산출물**: `ChatController`(GET 이력 + POST 스트리밍) ·
      `ChatService`(원본 `finally` 저장 규칙 4가지) · `ClientGoneException`(중단 ≠ 실패) ·
      `ConsultReply`(4.4 와의 경계) · **`docs/경유지_프록시설정_요청서_대화스트리밍.md`**
      (계획이 지정한 산출물 — **문의 7번 회신 뒤 발송**, `[현재값]` 자리를 채워서).
    - **Task 4.4 는 인터페이스만 동결**(계획이 정한 범위). HTTP 호출 코드는 없다 —
      `LlmClient`/`LlmRequest`/`LlmResponse`/`TokenProvider`/`FallbackPolicy`/
      `LlmProperties` + `NotYetMigratedLlmClient`(소리 내어 실패).
  - ⚠️ **2026-08-28 — "회신 없이 갈 곳이 없다"는 판단이 틀렸다. 계획에 빠진 API 가 있었다.**
    출처: `[[2026-08-28|2026-08-28_summary.md]]` `## Session 15:54`. 커밋 `07576c3`.
    엔드포인트를 실측했더니 **파이썬 47개 중 자바 25개(53%)** 였고, 차이 22개 중
    검색(단계 3)·LLM 대기(4.4)를 빼도 **쓰기 API 가 무더기로 남아 있었다.**
    단계 2를 "조회 REST"로, 단계 4를 "결재 흐름"으로 잡으면서 **그 둘 어디에도 안
    들어가는 쓰기 API 가 계획에서 통째로 빠진 것**이다.
    - **계획에 `단계 5-B`(Task 5B.1~5B.6)를 신설**했다 —
      `docs/superpowers/plans/2026-08-10-weblogic-java-migration.md`.
      기존 `단계 6`(uploader)의 번호를 흔들지 않으려고 `5-B` 로 뒀다(README·NEXT 가
      그 번호를 참조한다). **전부 회신 불요**라 지금 진행할 수 있다.
    - ✅ **Task 5B.1 작업함 — 대부분 완료**: `GET /tasks/{id}` + 첨부 4종
      (`POST`/`GET` 목록/`GET` 단건/`DELETE`). 경로 위생은 `support/TaskFiles` 가
      두 겹으로 끝낸다. 테스트 168 → **188**. 엔드포인트 **30/47(64%)**.
      ✅ **`GET /tasks/{id}/handoff` 도 완료**(2026-08-28, 커밋 `567d40d`) — 팀 산출물 +
      `scoring`·`coverage`·`pptx_path`. **Task 5B.1 은 이것으로 닫혔다.**
      되돌리면 안 되는 계약 3가지(전부 테스트로 고정): 팀 산출물을 **상태로 거르지
      않는다**(감추면 디자이너가 다 받은 줄 안다) · **에이전트 단계 제외**(사람
      작성물이 없어 빈 카드가 된다) · **자기 팀 제외**. 정렬은 `SEQ_NO` 다(원본
      `rowid` 의 Oracle 대응). 테스트 188 → 193 → **216**(5B.2·5B.3 포함), 엔드포인트 **34/47(72%)**.
    - ✅ **Task 5B.2 결재함 완료**(커밋 `365c5c5`) — `GET /approvals`.
      **(팀, 상태) 쌍**으로 거른다: 팀만 보면 같은 디자이너 작업이 팀장(`1차완료`)과
      부장(`2차완료`) 결재함에 **동시에** 뜨고, 잘못 좁히면 카드가 아예 안 떠 결재가
      멈춘다. 둘 다 오류가 아니라 실행으로는 못 찾으므로 네 역할을 테스트로 고정했다
      (`ApprovalsQueueTest`). 게이트는 **영업부장만** 조회한다(기관 25건을 매번 물으면
      팀장 결재함이 느려진다). 결재 권한이 없는 역할은 **질의를 돌리지 않는다** —
      빈 `IN` 절은 SQL 오류다.
    - ✅ **Task 5B.3 쪽지 쓰기 완료**(커밋 `6aee782`) — `POST /notifications` ·
      `POST /{id}/read`. ⚠️ **`kind` 를 본문으로 받지 않는다**(`쪽지` 고정) —
      `결재요청`·`되물음`·`이관` 은 그래프만 만들 수 있어야 흐름을 신뢰할 수 있고,
      받으면 사람이 결재요청을 **위조**할 수 있다. 읽음 처리는 두 번 눌러도 안전하다
      (여러 탭이 정상 경로 — 두 번째는 오류가 아니라 `{"read": false}`).
    - ✅ **Task 5B.4 권한 저장 완료**(커밋 `b9bf38e`) — `PUT /menus`.
      ⚠️ **자물쇠 검사를 저장 전에 한다** — 권한관리를 모든 역할에서 끄면 아무도 그
      화면에 못 들어오는데 **되돌릴 화면이 바로 그 화면**이라 복구 방법이 없다.
      "저장 뒤의 모습"을 메모리에 먼저 그려 보고 판정한다. 거부됐을 때 **반쯤
      적용되지 않는 것**도 테스트로 고정했다. 격자 전체가 아니라 **바뀐 칸만** upsert
      한다(전체 덮어쓰기는 동시 편집 시 상대 변경을 통째로 지운다). upsert 는 갱신
      먼저·0건이면 삽입 — `ON CONFLICT DO UPDATE` 는 Oracle 9i~11g 에 없다.
    - ✅ **Task 5B.5·5B.6 완료 (2026-08-31)** — **단계 5-B 8개가 전부 찼다.**
      커밋 `0fd5011`(기관 추가·편집) · `9cb4cb9`(CSV 반입) · `ff5e52a`(코퍼스
      검사·등록) · `f473c70`(배치 반입 2개 + `GET /llm/status`) ·
      `1456865`(완료 처리). 테스트 **216 → 295**, 전부 통과.
      파이썬 유틸 **약 680줄**을 함께 옮겼다 — `corpus_validator`(305) ·
      `inbox_import`(184) · `batch_schema`(121) · `archive`(71) · `csv_import`(37).
      - **반입 이력 테이블(`IMPORT_BATCH`)은 신설하지 않기로 했다**(사용자 확정 ⓑ,
        2026-08-31). 원본에 없는 테이블이라 "동작 동일" 회귀 비교를 흐린다.
        추적이 필요해지면 **별건**으로 다룬다(근거는 그대로
        `docs/메뉴별_테이블_컬럼_정리.md` §5-④).
      - ⚠️ **남은 두 구멍 — 둘 다 의도적이고, 회신·단계 3 에 걸려 있다.**
        ⓐ `POST /complete` 의 **후속 색인(reindex)이 없다** — 자바에 검색 계층 자체가
        없어서(단계 3) 넣을 자리가 없다. **단계 3 이 붙을 때 다시 달아야 한다**;
        그때 지킬 규칙(백그라운드 · 실패해도 완료는 200)은
        `InstitutionCommandService.complete` 주석에 적어 뒀다.
        ⓑ `GET /llm/status` 의 `installed` 는 **항상 빈 목록**이다(어댑터 보류 —
        문의 1-2). 그래서 `probe=1` 이어도 `reachable` 은 항상 false 인데, 지금은
        그게 사실이다. 응답 모양은 확정이라 어댑터가 붙어도 안 바뀐다.
      - ⚠️ **`BatchSchema` 는 `contract/batch_schema.py` 의 사본이다.** 파이썬은 한
        모듈을 망 안팎이 공유해 "두 개의 진실"을 막았는데 **언어가 갈려 그 방법을 쓸
        수 없다** — **SCHEMA v2 가 나오면 두 파일을 함께 고쳐야 한다.**
        같은 이유로 `InstitutionCsv.HEADER_MAP` 도 수집기와의 계약이다.
      - ⚠️ **배운 것 — 테스트 프로퍼티는 그 클래스에만 붙이면 안 된다.** inbox 뿌리를
        `@TestPropertySource` 로 붙였더니 **스프링 컨텍스트가 둘이 되어** 001 DDL 이
        같은 H2 에 두 번 돌고 12건이 전부 죽었다. `AppTest` 주석이 정확히 이 함정을
        경고하고 있었다. `src/test/resources/application.properties` 로 옮겼다 —
        **단독 실행만으로는 안 잡히는 부류**다(단독은 통과했다).
    - ⚠️ **배운 것**: 실패(404) 응답에도 `Content-Disposition` 이 붙는다. 우리가 단 게
      아니라 **Spring MVC 의 RFD 공격 방어**다(경로 끝이 `.pptx` 라 확장자로 보인다).
      "헤더가 없어야 한다"는 기대가 틀렸던 것이라 코드가 아니라 테스트를 고쳤다.
  - ⛔ **아래는 여전히 문의 회신 대기다** (위 단계 5-B 는 회신과 무관하다).
    - **단계 3 검색** — 문의 2·3(임베딩 엔드포인트 / Oracle Text 가용).
    - **Task 4.4 LLM 어댑터 — 구현만 남았다**(인터페이스는 2026-08-28 동결). 문의 1·6
      (사내 API 규격 / 경유지 OAuth). 이게 없어 노드 본문 4개
      (`rfi`·`draft`·`packager`·`verifier`)가 비어 있고, 운영 배선은
      `NotYetMigratedHandler` 로 **소리 내어 실패**한다(일부러 그렇게 뒀다 — 빈 구현으로
      통과시키면 실행이 끝까지 돌아 화면에 정상 완료로 보인다).
      `packager` 는 LLM 을 안 쓰지만 입력이 `draft` 의 산출이라 앞이 막혀 도달 못 한다.
      **회신 뒤 할 일은 `NotYetMigratedLlmClient` 의 javadoc 에 4단계로 적어 뒀다** —
      구현 2개(`LlmClient`·`TokenProvider`) 등록 + `FallbackPolicy` 재사용 +
      `LlmResponse.getModel()` 에 실제 응답 모델 싣기. 그 뒤
      `NotYetMigratedConsultReply` 와 노드 4개를 갈아 끼우면 단계 4가 닫힌다.
      ⚠️ **폴백 범위가 원본과 다르다(의도)** — 파이썬 `with_fallbacks` 는 어떤 실패든
      넘어가지만 계획(2026-08-25)대로 **404 일 때만** 폴백한다. 401/403 은 2순위도 같은
      토큰이라 태우면 토큰 만료가 "모델 2개가 다 죽었다"로 보고된다.
      넓히는 조건은 `FallbackPolicy` javadoc 참고.
    - ~~**Task 4.3 SSE**~~ — **완료(2026-08-28).** 위 참조. 남은 것은 경유지 설정
      요청서 발송뿐이고 그건 문의 7번 회신에 붙어 있다.
    - **Task 4.2 WorkManager 실검증** — 문의 **5-1**(2026-08-28 신설). 코드는 끝났지만
      JNDI 경로는 **WebLogic 에서만 검증된다** — 로컬·테스트는 JNDI 가 없어 폴백
      (`caller-runs`)으로 떨어진다. 폴백인 채로 운영에 올라가면 요청 스레드가 게이트까지
      붙잡혀 **WAS 스레드 풀이 마른다**(증상이 "가끔 느리다"로만 보여 원인 추적이 어렵다).
      그래서 JNDI 조회 이름·전용 WorkManager 정의 필요 여부·시험 환경을 물었다.
  - ⚠️ **이관하며 잡은 원본 결함 4건**(전부 Java 쪽은 고쳤다. 상세는 오늘 summary):
    DDL 시각 컬럼 30자 부족 · `GET /status` 정렬 무보장 · `list_tasks` 정렬 무보장 ·
    **`assemble_deliverable` 의 `TEAM_ORDER` 에 옛 팀명 `IT`** (→ [[항목 22 Python assemble_deliverable 이 전산팀 초안을 빠뜨|항목 22]]).

  - ⚠️ **[2026-08-30 추가] 내부 Oracle 이 11g 로 확인됐다 — 현재 Oracle DDL·SQL 은 12c 전제라
    그대로는 안 돈다.** 출처: 2026-08-30 세션(요약 파일 미작성, 사용자 구두 확인 —
    "실제로 내부에서는 11g를 쓰고 있어"). 설계 §7 문의 4번(Oracle 버전)의 답이 사실상
    나온 셈이지만 **패치레벨(11.2.0.4 인지)은 아직 미확인**이다. 고칠 자리는 `c917e47`
    기준 아래 2종이고, 둘 다 11g 폴백이 **주석으로만** 존재한다:
    - `GENERATED BY DEFAULT AS IDENTITY` (12c+) — `kgi-ggreport-web/src/main/resources/db/oracle/`
      `002_seq_no.sql:37,47` · `005_seq_no_log_tables.sql:33,39` · `007_uploader.sql:45,67`.
      11g 는 **시퀀스 + BEFORE INSERT 트리거**로 바꿔야 한다(폴백 절이 `002_seq_no.sql:54~`,
      `007_uploader.sql:76~` 에 주석으로 적혀 있으니 그걸 활성화하는 형태).
    - `FETCH FIRST #{limit} ROWS ONLY` (12c+) — `src/main/resources/mapper/NotificationMapper.xml:91`.
      11g 는 `ROWNUM` 서브쿼리로 바꿔야 하고, **`src/test/java/.../mapper/DynamicSqlTest.java:71`
      이 "Oracle 분기에 FETCH FIRST 가 있어야 한다"고 단언**하므로 테스트도 같이 고쳐야 한다.
      (이 파일은 MySQL/Oracle 분기를 이미 나눠 두었으니 분기 자체는 재사용 가능하다.)
    - `uploader/` 쪽 매퍼 2개(`InstitutionMapper.xml`·`UploadedFileMapper.xml`)에는 12c 전용
      문법이 **없다** — 이 건의 영향 범위는 `kgi-ggreport-web/` 뿐이다.
    - ⚠️ 이 발견은 **기록만 해 둔 것이고 코드는 손대지 않았다**(그 시점에 다른 세션이
      `weblogic-java-migration` 브랜치에서 병합 작업 중이었다). 착수 전에 그 브랜치의
      최신 상태를 먼저 확인할 것.
  - ℹ️ **[2026-08-30 추가] 로컬 검증 환경 조사 결과**(같은 세션. 전부 조사만, 설치 안 함):
    - **WAR 빌드는 지금도 된다** — `uploader/` 를 `c917e47` 소스로 빌드해 `BUILD SUCCESS`,
      테스트 `38/38` 통과, `target/uploader-1.0.0.war` 54.5MB 생성. WebLogic 요건 3종
      확인: `WEB-INF/weblogic.xml` 포함 · `ServletInitializer.class` 포함 ·
      `tomcat-embed` 3종이 `WEB-INF/lib-provided/` 로 격리 · 바이트코드 major 52(Java 8).
      (Maven 미설치 환경이라 포터블 Maven 3.9.9 를 임시 폴더에 풀어서 빌드했다.)
    - **WebLogic 은 14.1.1.0.0 이 유일한 선택** — 공식 문서상 JDK **8·11** 인증.
      14.1.2·15.1.1 은 JDK 17/21 전용이라 JDK 1.8 제약과 맞지 않고, 12.2.1.4 는 Java EE 7 로
      구식이다. 개발용은 Oracle 계정 + OTN 개발자 라이선스로 무료. 단 14.1.1 의
      Premier Support 는 **2026-12-31 종료** 예정이라 기관 확인 때 같이 물어두면 좋다.
    - **DB 무료 개발본**: 내부와 같은 EE 11.2.0.4 는 MOS 지원계약이 있어야 받을 수 있어
      무료 경로가 없다. 대안은 `Oracle Database XE 11g Release 2`(11.2.0.2, prior-release
      archive) — Oracle Text 포함, 한도 1 CPU / 1GB RAM / 사용자 데이터 11GB.
    - **JDBC**: 호환 매트릭스상 ojdbc8(21.x) ↔ **11.2.0.4 는 인증됨**이라 `pom.xml` 의
      `ojdbc8 21.7.0.0` 을 그대로 둬도 된다. 다만 로컬 XE 는 11.2.0.2 라 인증 범위 밖이니
      로컬 검증만 ojdbc8 19.x 로 낮추는 편이 안전하다.
