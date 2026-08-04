# WebLogic/Java 이관 설계 — Python(FastAPI+LangGraph) → eGovFrame 4.x

작성일: 2026-08-05

## 1. 목적과 결론

지금 이 저장소의 실동작 시스템(FastAPI 백엔드 + LangGraph 에이전트 + 순수 HTML/JS
대시보드)을 **WebLogic 기반 Web/WAS 구성으로, 주 언어를 Java + HTML로 이관**하는 것이
목표다.

**결론: 가능하다.** 화면은 사실상 그대로 재사용하고, 백엔드는 전면 재작성한다.
재작성 대상은 프로덕션 Python **6,288줄**(테스트 6,833줄 / 63파일은 JUnit으로 별도
재작성)이며, 이 중 라이브러리 등가물이 없어 직접 만들어야 하는 부분은
**오케스트레이터 상태·재개(HITL)** 와 **한글 전문검색** 두 군데다.

## 2. 확정된 제약 (사용자 확인 완료)

| 항목 | 값 | 영향 |
|---|---|---|
| 언어 | **Java only** — 폐쇄망 서버에 Python 런타임 불가 | 사이드카 방식 배제. RAG 색인·임베딩 호출·PPTX 생성까지 전부 Java |
| JDK | **1.8** | Spring Boot 3·Lucene 9·java.net.http 사용 불가. 라이브러리 상한이 전부 구세대로 고정 |
| 프레임워크 | **전자정부 표준프레임워크(eGovFrame) 4.x 준수 필수** | Spring 5.x MVC + `web.xml` + **WAR 배포**. Spring Boot 독립실행 배제 |
| 영속화 | **Oracle + MyBatis** | SQLite 3파일(registry / corpus_index / LangGraph 체크포인트) 전부 Oracle 스키마로 통합 |
| WAS | **WebLogic** | 컨테이너 관리 스레드·JNDI DataSource 전제. 앱이 스레드를 직접 만들면 안 됨 |
| 망 | **폐쇄망** | 의존성 전량 사전 반입(사내 Nexus 또는 오프라인 리포지토리) |
| LLM | **기관 사내 공용 LLM API** | 엔드포인트를 받아 쓴다. 호환규격·인증·임베딩 지원 여부는 §7 확인항목 |
| 브라우저 | **크롬/엣지 최신** | ES6 모듈·`fetch`·`EventSource`·d3 v7 그대로 사용 가능 → **프런트 재작성 없음** |

## 3. 목표 아키텍처

```
[크롬/엣지]
   │ HTTP
   ▼
WebLogic ── ggreport.war (단일 WAR)
   ├─ /            정적 리소스: dashboard/index.html, js/*.js, geo/*.json, vendor/d3
   ├─ /api/**      Spring MVC @RestController (기존 11 라우터와 1:1)
   │                  └ Service ── MyBatis Mapper ──▶ Oracle (JNDI DataSource)
   ├─ Orchestrator 상태머신 ── CommonJ WorkManager 스레드
   │                  └ 실행상태·체크포인트 ──▶ Oracle (ORCH_RUN / ORCH_STEP)
   └─ LLM/Embed 어댑터 ──── HTTP ────▶ 기관 사내 공용 LLM API
```

핵심 원칙 세 가지:

1. **화면은 손대지 않는다.** `dashboard/`(2,986줄 + d3 vendor)는 빌드 단계가 없는 순수
   정적 자산이라 WAR의 정적 리소스로 그대로 들어간다. 브라우저가 현대 버전이므로
   폴리필도, JSP 재작성도 필요 없다. 유일한 변경은 API 베이스 경로(`/api` 컨텍스트)다.
2. **REST 계약을 먼저 동결한다.** 프런트가 안 바뀌므로 기존 응답 JSON이 그대로 계약이다.
   Java 쪽은 이 계약을 만족시키기만 하면 되고, 이것이 이관 검증의 기준선이 된다.
3. **LLM 어댑터 경계를 유지한다.** 현재 `agent/llm.py`는 모델·엔드포인트·키를 전부
   환경변수로 받는 63줄짜리 어댑터다(폐쇄망을 이미 전제한 설계). Java에서도 같은 경계를
   유지해 사내 API 규격이 바뀌어도 한 클래스만 고치면 되게 한다.

## 4. 컴포넌트 매핑

| 현재 (Python) | 이관 후 (Java / JDK 1.8) | 비고 |
|---|---|---|
| FastAPI `APIRouter` 11개 (`backend/routers/`) | `@RestController` 11개 | 기계적. 경로·응답 형태 동일 유지 |
| Pydantic `models.py` | POJO + Jackson 2.x + Bean Validation(hibernate-validator 6.2.x) | Pydantic의 자동 검증·직렬화가 두 갈래로 나뉜다 |
| `sqlite3` 직접 호출 모듈 12개 (리포지토리 4 + 서비스·유틸 8) | MyBatis 3.5.x Mapper 인터페이스 + XML | 원시 SQL이 대부분이라 이식성은 좋다 |
| `registry.db` 6테이블 | Oracle 6테이블 | PK가 전부 앱 생성 TEXT라 시퀀스 불필요 (§5 함정 참고) |
| `corpus_index.db` FTS5(trigram) | **Oracle Text CONTEXT 인덱스** (폴백: 인메모리 색인) | §6-A |
| `vectors` BLOB + numpy 코사인 | Oracle BLOB + Java `float[]` 브루트포스 코사인 | 코퍼스가 5.6MB/413파일이라 전량 메모리 적재로 충분. 벡터DB 불필요 |
| LangGraph `StateGraph`/`interrupt()`/`SqliteSaver` | **직접 구현한 상태머신 + Oracle 체크포인트** | §6-B. 그래프 자체는 129줄이지만 재개 의미론이 본질 |
| `threading.Thread` 백그라운드 실행 (`orchestrator_service.py`, `reindex_service.py`) | **CommonJ WorkManager** (`commonj.work.WorkManager`, JNDI 조회) | WAS에서 앱이 raw thread를 만드는 것은 금지 사항 |
| SSE `StreamingResponse` (`chat.py`, `tasks.py`) | Servlet 3.1 `AsyncContext` + Spring `SseEmitter` | `web.xml`/필터에 `async-supported=true` 필수 (§7) |
| `pypdf` | **PDFBox 2.0.x** | RFP PDF 텍스트 추출 |
| `python-pptx` | **Apache POI 5.2.x (XSLF)** | 산출물 PPTX 생성. 서식 재현 검증 필요 |
| `langchain_openai.ChatOpenAI` | **Apache HttpClient 4.5 + Jackson 직접 호출** | §6-C — LangChain4j를 쓰지 않는다 |
| `pytest` 63파일 | JUnit 4.13 + Mockito + Spring MockMvc | §8 |

## 5. Oracle 전환에서 실제로 깨지는 지점

SQLite → Oracle은 "타입만 바꾸면 되는" 작업이 아니다. 현재 스키마를 읽어 확인한 구체적
충돌 두 가지를 설계에 반영한다.

**(A) 빈 문자열이 NULL이 된다.** Oracle은 `''`를 NULL로 취급한다. 현재 스키마에는
`tasks.draft_content TEXT NOT NULL DEFAULT ''`가 있고, `NOT NULL` 컬럼에 `DEFAULT ''`는
Oracle에서 그대로 옮기면 제약 위반이 된다. 나아가 애플리케이션 의미도 달라진다 —
Python 코드가 `draft_content == ""`(아직 안 씀)로 판단하던 자리에서 Java는 `null`을
받는다. **결정: 이런 컬럼은 Oracle에서 `NOT NULL`을 유지하되 DB 기본값을 두지 않고,
INSERT 시 애플리케이션이 항상 명시값을 넣는다. 읽을 때는 Mapper 레벨에서 `null → ""`로
정규화**해 프런트가 받는 JSON을 현재와 동일하게 유지한다. (`participation_decision
DEFAULT '[]'`처럼 빈 문자열이 아닌 기본값은 문제없다.)

**(B) 긴 텍스트는 CLOB이어야 한다.** `draft_content`, `messages.content`,
`chat_messages.content`, 그리고 색인 청크 본문은 4000바이트를 넘길 수 있어 `VARCHAR2`로
못 받는다. **결정: 이들은 CLOB.** 그 대가로 (1) `WHERE clob_col = ?` 같은 등호 비교가
안 되므로 그런 쿼리가 있으면 해시 컬럼을 따로 두고, (2) MyBatis에 `jdbcType=CLOB`을
명시하고, (3) `ORDER BY`/`DISTINCT` 대상에서 CLOB을 뺀다.

**(C) 날짜는 문자열로 남긴다.** 현재 모든 시각 컬럼이 ISO 문자열(`TEXT`)이고 프런트도
문자열로 받는다. `DATE`/`TIMESTAMP`로 승격하면 타임존·포맷 차이로 화면 표시가 바뀐다.
**결정: `VARCHAR2`로 1:1 이관.** 날짜 타입 승격은 이관 완료 후 별건으로 다룬다.

**(D) 마이그레이션 로직 대체.** `backend/db.py`의 `MIGRATIONS` 딕셔너리(뒤늦게 추가된
컬럼을 기동 시 `ALTER TABLE`로 메우는 방식)는 Oracle에서 그대로 쓸 수 없고, 그럴 필요도
없다. **결정: 최종 스키마 DDL 한 벌을 정본으로 만들고, 이후 변경은 번호가 붙은 DDL
스크립트로 관리한다**(폐쇄망 DBA 반영 절차와도 맞는다).

## 6. 등가물이 없어 직접 만드는 세 가지

### A. 한글 전문검색 — FTS5 trigram 대체

현재는 SQLite FTS5의 `tokenize='trigram'`, 즉 3글자 부분문자열 색인이다. 한글에서
형태소 분석 없이 부분일치를 얻는 실용적 선택이었다. Oracle에는 등가물이 없다.

- **1안(권장): Oracle Text `CONTEXT` 인덱스.** eGovFrame/Oracle 환경에서 가장 표준적이고
  운영 이관이 깔끔하다. 한글은 `KOREAN_MORPH_LEXER`, 부분일치가 필요하면 `WORDLIST`에
  substring 색인을 켠다. 단 **형태소 색인은 trigram과 검색 결과가 달라진다** — 이건
  버그가 아니라 의도된 교체이므로, 골든 쿼리 세트로 차이를 문서화하고 수용 여부를 받는다.
- **2안(폴백): Java 인메모리 색인.** Oracle Text를 쓸 수 없을 때. 코퍼스가 5.6MB뿐이라
  기동 시 전량 적재해 trigram 색인을 Java로 재현하면 **현재 동작을 가장 정확히 보존**한다.
  단 WebLogic 다중 인스턴스면 인스턴스마다 중복 적재되고, 반입 즉시 반영이 아니라 재적재
  트리거가 필요하다.
- Lucene은 배제한다. JDK 1.8이면 Lucene 8.x 계열에 묶이고, 인덱스 파일이 WAS 파일시스템에
  생겨 이중화·백업 대상이 Oracle 밖으로 새어나간다.

벡터 검색은 그대로 유지한다. 청크 벡터를 Oracle BLOB(리틀엔디언 float32)로 옮기고 Java에서
`float[]` 코사인 유사도를 전수 계산한다. 수천 청크 × 1024차원이면 수십MB·수십ms 규모다.
하이브리드 랭킹(BM25 + 코사인) 합산식은 현재 `agent/retrieval/search.py`의 것을 그대로 옮긴다.

### B. 오케스트레이터 — LangGraph `interrupt()` 대체

LangGraph 사용량 자체는 얇다(`agent/orchestrator/graph.py` 129줄). 어려운 건 라이브러리가
공짜로 주던 **의미론**이다: 노드 실행 중 `interrupt()`로 멈추고, 상태를 체크포인트에
저장하고, 사람이 결재한 뒤 `Command(resume=...)`로 **멈춘 지점부터** 다시 흐른다.

**결정: 명시적 상태머신으로 직접 구현한다.**

- `ORCH_RUN` — 실행 1건(입찰건·현재 노드·상태·생성시각).
- `ORCH_STEP` — 노드별 입출력과 결과 스냅샷(= 체크포인트). 상태 직렬화는 Jackson JSON.
- 노드는 Java `enum` + 각 노드 1클래스(`rfp_extract`, `rfp_analysis`, `role_router`,
  `institution_match`, `content_writer`, `verification`, `pptx_builder` — 현재 7개와 1:1).
- 라우팅은 노드가 "다음 노드 이름"을 반환하는 방식으로 단순화한다. 현재 쓰는
  `Command(goto=[Send(...)])` 팬아웃(팀별 병렬 작성)은 **팬아웃 노드가 자식 STEP 여러 건을
  만들고 WorkManager에 각각 제출, 전부 완료되면 조인 노드로 진행**하는 형태로 재현한다.
- `interrupt()`는 "노드가 `PENDING_APPROVAL`을 반환하고 리턴" + "결재 API가 해당 RUN을
  다시 큐에 넣음"으로 대체한다. **재개 지점이 DB에 명시적으로 남는 게 오히려 장점**이다
  (지금은 LangGraph 체크포인트 내부에 있어 운영자가 못 본다).
- PII 마스킹(`orchestrator/pii.py` 42줄)은 정규식이라 그대로 이식된다.

### C. LLM 호출 — LangChain4j를 쓰지 않는 이유

실제로 쓰는 기능은 두 개뿐이다: **구조화 출력**(`structured_llm`, 스키마에 맞는 JSON을
받는다)과 **2단 폴백**(1순위 모델 실패 시 2순위 재시도). 이걸 위해 프레임워크를 들이면
JDK 1.8 지원 때문에 구버전에 묶이고, 폐쇄망 의존성 반입 목록만 길어진다.

**결정: Apache HttpClient 4.5 + Jackson으로 직접 호출한다.** 구조화 출력은 "JSON 스키마를
프롬프트에 포함 → 응답에서 JSON 블록 추출 → Jackson 역직렬화 → 실패 시 재시도" 로 재현한다
(현재 langchain의 `with_structured_output`도 사내 API가 tool-calling을 지원하지 않으면
결국 이 경로다). 폴백은 어댑터 안의 try/catch 2단으로 유지하고, **어느 모델이 실제로
답했는지 응답에 실어 보낸다** (`messages.model` 컬럼이 이미 그 용도로 존재한다).

## 7. 설계 전 확인이 필요한 항목 (기관/DBA 문의)

| # | 확인할 것 | 답에 따라 바뀌는 것 |
|---|---|---|
| 1 | 사내 공용 LLM API가 **OpenAI 호환**인가, 인증 헤더 방식은? | 어댑터 구현. 비호환이면 요청/응답 변환 계층 추가 |
| 2 | 사내 API가 **임베딩 엔드포인트를 제공하는가** | **없으면 벡터 검색을 포기하고 전문검색 단독**이 된다. 현재 하이브리드보다 검색 품질이 떨어지므로 사전 합의 필요 |
| 3 | **Oracle Text** 사용 가능 여부(설치·라이선스·`KOREAN_MORPH_LEXER`) | §6-A 1안/2안 분기 |
| 4 | **WebLogic 버전** (12.2.1.x = Servlet 3.1 / 14.1.1 = Servlet 4.0) | SSE 가능 여부는 둘 다 OK. `weblogic.xml` 설정과 프록시 타임아웃 값이 달라진다 |
| 5 | eGovFrame 표준 템플릿의 `web.xml`/공통 필터가 **`async-supported`** 를 켜두는가 | 안 켜져 있으면 SSE가 필터에서 막힌다. 대화 탭·작업 진행표시가 여기 걸린다 |
| 6 | Oracle 버전 (11g / 19c / 23ai) | 11g면 `IDENTITY`·일부 JSON 함수 사용 불가(현 스키마는 앱 생성 PK라 영향은 작다) |
| 7 | 앞단에 **웹서버(HTTP Server/Apache)** 를 두는 구성인가 | SSE는 프록시 버퍼링·타임아웃에 특히 취약하다 |

## 8. 단계 분할과 검증 방법

각 단계는 그 자체로 화면에서 확인 가능한 상태로 끝난다.

1. **골격** — WAR 구조, `web.xml`, JNDI DataSource, 스키마 DDL, 정적 화면 서빙.
   *끝난 모습:* 대시보드가 뜨고 데이터는 비어 있다.
2. **조회 REST** — institutions / bidcases / documents / notifications / accounts.
   MyBatis Mapper + 시드 데이터 이관. *끝난 모습:* 지도·목록·상세가 현재와 같이 보인다.
3. **검색** — 청크·벡터 Oracle 이관, Oracle Text(또는 폴백) + 하이브리드 랭킹.
   *끝난 모습:* 지식 탭이 동작한다.
4. **오케스트레이터** — 상태머신 + WorkManager + SSE + 결재 재개.
   *끝난 모습:* 워크플로 탭에서 실행·중단·결재·재개가 된다.
5. **산출물** — PDFBox RFP 파싱, POI PPTX 생성, 검증·일관성 체크.
   *끝난 모습:* PPTX가 떨어지고 검증 결과가 표시된다.

**검증은 "같은 입력 → 같은 출력" 회귀 비교로 한다.** 이관 전에 현재 Python 시스템에서
주요 API 응답과 산출물을 **골든 파일로 떠 두고**(단계 0 작업), Java 쪽 결과를 그것과
비교한다. 프런트가 안 바뀌므로 이 비교가 통과하면 화면도 통과한다. 의도적으로 달라지는
곳(§6-A 검색 랭킹)은 골든 파일에 차이를 기록하고 수용 근거를 남긴다.

JUnit 테스트는 63개 pytest 파일을 1:1로 옮기지 않는다. **REST 계약 테스트(MockMvc) +
Mapper 테스트 + 오케스트레이터 상태전이 테스트**에 집중하고, Oracle 의존 테스트는 H2의
Oracle 호환 모드로 대체하지 않는다(§5의 빈 문자열·CLOB 차이가 바로 그 지점에서 갈리므로,
H2로 통과한 테스트는 오히려 잘못된 안심을 준다). 개발용 Oracle 인스턴스를 전제한다.

## 9. 하지 않는 것 (YAGNI)

- **벡터DB 도입 안 함** — 코퍼스 5.6MB 규모에서 순수 낭비다.
- **LangChain4j / langgraph4j 도입 안 함** — §6-C.
- **Lucene 도입 안 함** — §6-A.
- **화면 프레임워크 도입 안 함** — 현재 화면이 잘 돌고 브라우저 제약도 없다.
- **날짜 타입 승격, PII 집계 구조 개선(NEXT.md 항목 7) 같은 개선은 이관에 섞지 않는다** —
  이관은 "동작 동일"이 유일한 성공 기준이어야 회귀 비교가 성립한다.
