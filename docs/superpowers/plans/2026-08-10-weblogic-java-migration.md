# WebLogic/Java 이관 구현계획 — 설계 §8의 5단계 전개

- **작성일**: 2026-08-10 · **상태**: **잠정 확정** — 3단계(검색)와 LLM 어댑터 세부만
  기관 회신 대기, 나머지는 회신 없이 착수 가능.
- **설계(정본)**: `docs/superpowers/specs/2026-08-05-weblogic-java-migration-design.md`.
  이 계획은 그 §8의 단계 분할을 실행 단위로 풀어놓은 것이다. 설계와 이 계획이
  어긋나면 설계가 이긴다.
- **문의서**: `docs/기관문의서_WebLogic이관_확인사항7건.md` (발송·회신은 사용자 몫).
- **선행 완료 — 단계 0(골든 파일)**: `golden/` (2026-08-10, main `221e3b9`).
  API 34개 스냅샷 + 산출물 2종, 정규화 규칙과 캡처 제외 근거는 `golden/README.md`.
  **이 계획의 모든 단계 검증이 이 골든과의 비교다.**

## 잠정 지점과 확정 조건 (문의서 회신 ↔ 계획 매핑)

| 문의서 # | 회신이 확정하는 것 | 회신 전 기본 가정 |
|---|---|---|
| 1 (LLM 규격) | Task 4.4 어댑터의 요청/응답 계층 | OpenAI 호환·Bearer 인증으로 가정하고 어댑터 인터페이스만 동결 |
| 2 (임베딩) | Task 3.3 벡터 검색 포함 여부 | **포함**으로 가정. 없다고 회신 오면 Task 3.3 삭제 + 검색 품질 저하 합의 기록 |
| 3 (Oracle Text) | Task 3.2의 **A/B 분기** | 분기 양쪽을 계획에 둔다(아래). 회신 전 3단계 착수 금지 |
| 4 (WebLogic 버전) | Task 1.2 `weblogic.xml` 설정값 | 12.2.1.x(Servlet 3.1) 가정 — 14.1.1이어도 구조 불변 |
| 5 (async-supported) | Task 4.3 SSE의 필터 설정 | 꺼져 있다고 가정하고 켜는 절차를 Task에 포함 |
| 6 (Oracle 버전) | Task 1.3 DDL 문법 | 19c 가정 — 11g로 회신 오면 DDL 리뷰 1회 추가 |
| 7 (앞단 웹서버) | Task 4.3 프록시 설정 요청 목록 | 있다고 가정(보수적) |

**1·2·4·5·6·7은 가정으로 진행해도 재작업이 국소적**이다(설정값·Task 하나 수준).
**3만 구조가 갈리므로** 3단계는 회신 전 착수하지 않는다 — 단계 순서상 1·2단계를
끝낼 때쯤 회신이 와 있는 것이 이상적이다.

## 공통 규칙 (모든 Task에 적용)

- **동작 동일이 유일한 성공 기준**(설계 §9) — 개선은 이관에 섞지 않는다.
  응답 JSON의 키·형태·순서는 `golden/api/`가 계약이다.
- 검증 하네스: Java 쪽에 `golden/README.md`의 정규화 규칙(타임스탬프→`<TS>`,
  랜덤 id→`<ID>`, 경로 치환)을 그대로 구현한 비교 테스트를 **1단계에서 먼저**
  만들고, 이후 단계마다 통과 범위를 넓힌다.
- JDK 1.8 상한 준수: Spring 5.x MVC · MyBatis 3.5.x · HttpClient 4.5 ·
  Jackson 2.x · PDFBox 2.0.x · POI 5.2.x · JUnit 4.13 (설계 §4 표).
- 폐쇄망: 의존성은 전량 사전 반입 목록으로 관리(1단계 산출물).
- 테스트는 pytest 1:1 이식이 아니라 **REST 계약(MockMvc) + Mapper +
  상태전이**에 집중, H2 대체 금지·개발용 Oracle 전제(설계 §8).

---

## 단계 1 — 골격 (회신 불요, 즉시 착수 가능)

*끝난 모습: 대시보드가 WAR에서 뜨고 데이터는 비어 있다.*

- **Task 1.1 — WAR 프로젝트 골격**: eGovFrame 4.x 표준 템플릿 기반
  `ggreport.war`. `dashboard/` 전체를 정적 리소스로 복사(무수정 — 유일한 변경은
  API 베이스 `/api` 프리픽스이며, 프런트 쪽 대응은 이관 마지막에 한 줄 설정으로).
  의존성 반입 목록(`dependencies.txt`) 시작.
- **Task 1.2 — `web.xml`/`weblogic.xml`**: JNDI DataSource 조회, 인코딩 필터,
  `async-supported=true`(문의 5의 기본 가정 — 꺼져 있다는 전제로 우리 필터
  체인에는 전부 명시). CommonJ WorkManager 리소스 선언(4단계에서 사용).
- **Task 1.3 — Oracle 스키마 DDL 정본**: registry 6테이블 + 검색
  (CHUNK/VECTOR) + `ORCH_RUN`/`ORCH_STEP`. 설계 §5의 4개 결정을 그대로 반영 —
  ⓐ `NOT NULL DEFAULT ''` 금지(INSERT 명시값 + Mapper `null→""` 정규화)
  ⓑ 긴 텍스트 CLOB(+`jdbcType=CLOB`, ORDER BY 배제)
  ⓒ 시각 컬럼 `VARCHAR2` 유지(ISO 문자열)
  ⓓ 이후 변경은 번호 붙은 DDL 스크립트.
- **Task 1.4 — 골든 비교 하네스(Java)**: `golden/api/*.json`을 읽어 MockMvc
  응답과 비교하는 JUnit 러너 + 정규화 유틸. *이 단계에서는 하네스 자체의 단위
  테스트만 통과하면 된다.*

## 단계 2 — 조회 REST (회신 불요)

*끝난 모습: 지도·목록·상세가 현재와 같이 보인다.*

- **Task 2.1 — POJO + Mapper**: `models.py` → POJO(Jackson) + Bean Validation.
  리포지토리 4 + 서비스·유틸 모듈의 SQL을 MyBatis XML로(원시 SQL이라 이식성 좋음).
- **Task 2.2 — 조회 컨트롤러 5종**: institutions / bidcases / documents /
  notifications / accounts (+menus·consistency — 조회 계열이므로 여기 포함).
- **Task 2.3 — 시드 이관**: `backend/seed.py`의 25개 기관 시드를 Java CLI 또는
  DDL 후속 스크립트로.
- **검증**: 골든 `00`~`09`(읽기 일괄) + `25`~`27`(뷰 계열은 4단계 데이터가
  필요하므로 빈 상태 응답만) 비교 통과.

## 단계 3 — 검색 (⚠️ 문의 2·3 회신 전 착수 금지)

*끝난 모습: 지식 탭이 동작한다.*

- **Task 3.1 — 청크 이관**: 파서(`agent/retrieval/parsers.py`)의 Java 이식 +
  코퍼스 → Oracle CHUNK 적재 배치.
- **Task 3.2 — 전문검색 (A/B 잠정 분기, 문의 3이 확정)**:
  - **A안(Oracle Text 가능)**: `CONTEXT` 인덱스 + `KOREAN_MORPH_LEXER`
    (+substring WORDLIST). **형태소 색인은 trigram과 결과가 다르다** — 골든
    `31`~`33`(검색 3건)과의 차이를 그대로 기록하고 "의도된 교체" 문서 +
    사용자 수용 승인(설계 §6-A). 특히 골든 `31`(2글자 '금고' 0건)은 A안에서
    결과가 **생길** 것이 예상되는 지점이다.
  - **B안(불가 시 폴백)**: 기동 시 전량 적재 Java trigram 인메모리 색인 —
    현재 동작 보존이 목표이므로 골든 `31`~`33`과 **일치**해야 한다. 재적재
    트리거(반입 후 호출)를 함께 만든다.
- **Task 3.3 — 벡터 검색 (문의 2가 존폐 확정)**: 청크 벡터 Oracle
  BLOB(리틀엔디언 float32) + Java `float[]` 코사인 전수 계산 + 하이브리드
  랭킹 합산식(`agent/retrieval/search.py` 그대로). 임베딩 미제공 회신이면
  이 Task를 삭제하고 전문검색 단독 — 품질 저하 합의를 문서로 남긴다.

## 단계 4 — 오케스트레이터 (회신 불요, 문의 1이 어댑터 세부만 좌우)

*끝난 모습: 워크플로 탭에서 실행·중단·결재·재개가 된다.*

- **Task 4.1 — 상태머신 코어**: `ORCH_RUN`/`ORCH_STEP` Mapper + 노드
  enum(7개: rfp_extract → pptx_builder, 설계 §6-B와 1:1) + "다음 노드 이름
  반환" 라우팅. `interrupt()` 대체 = `PENDING_APPROVAL` 반환 + 결재 API가
  재큐잉. PII 마스킹 정규식 그대로 이식.
- **Task 4.2 — WorkManager 실행기**: CommonJ WorkManager(JNDI)로 백그라운드
  실행·팬아웃(자식 STEP 생성→개별 제출→전부 완료 시 조인). raw thread 금지.
- **Task 4.3 — SSE**: `AsyncContext` + `SseEmitter`. 문의 5·7 회신에 따라
  필터/프록시 설정값 확정(구조는 불변).
- **Task 4.4 — LLM 어댑터**: HttpClient 4.5 + Jackson 직접 호출. 구조화
  출력(스키마 프롬프트 → JSON 추출 → 역직렬화 → 재시도) + 2단 폴백 +
  실제 응답 모델명 기록(`messages.model`). 문의 1 회신로 인증·규격 확정 —
  회신 전에는 인터페이스만 동결하고 구현은 OpenAI 호환 가정.
- **검증**: 골든 `10`~`30`(결재 전체 흐름 — 생성→3단 결재→작업 3건
  draft/submit/approve→finalize→조회 5종) 비교 통과. LLM 산출 텍스트는 비교
  대상이 아니다(골든 캡처 제외 항목) — 구조만 계약 테스트로.

## 단계 5 — 산출물 (회신 불요)

*끝난 모습: PPTX가 떨어지고 검증 결과가 표시된다.*

- **Task 5.1 — PDF 텍스트 추출**: PDFBox 2.0.x. **골든
  `artifacts/suwon_rfp_text.txt`와 대조** — pdfplumber와 줄바꿈·공백이 다를
  수 있으므로, 차이가 배점표 구조화 입력에 영향을 주는지를 기준으로 수용/보정
  판단(단순 공백 차이는 수용, 표 붕괴 양상이 달라지면 보정).
- **Task 5.2 — PPTX 생성**: POI 5.2.x(XSLF). **골든
  `artifacts/pptx_slides.json`(슬라이드 텍스트)과 비교** — 서식 재현은 육안
  검증 1회.
- **Task 5.3 — 검증·일관성**: `scoring_consistency`(레벨 그룹별 합산 —
  2026-08-10 스키마 계층 반영분 기준) + `backend/consistency.py` 규칙 이식.

## 순서와 의존

```
[문의서 발송] ──회신──▶ (3단계 착수 가능 / 4.4 세부 확정)
단계 1 ─▶ 단계 2 ─▶ 단계 4 ─▶ 단계 5
                └─▶ 단계 3 (회신 후, 2·4와 병행 가능)
```

- 설계 §8은 3(검색)→4(오케스트레이터) 순이지만, 3이 회신 대기이므로 **회신이
  늦으면 4를 먼저** 진행한다 — 둘은 서로 의존이 없다(검색은 지식 탭, 오케스트
  레이터는 워크플로 탭).
- 각 단계 완료 = 해당 골든 비교 통과 + "끝난 모습" 화면 확인. 둘 다 기록.
