# WebLogic/Java 이관 구현계획 — 설계 §8의 5단계 전개

- **작성일**: 2026-08-10 · **개정 2026-08-25** · **개정 2026-08-26** · **상태**: **잠정 확정**
  — 3단계(검색)와 LLM 어댑터 세부만 회신 대기, 나머지는 회신 없이 착수 가능.
- **2026-08-26 개정 요지**: 실행 환경이 **5축으로 확정**됐다(설계 문서 상단 2026-08-26
  주석의 표). **내부망은 로컬까지 전 구간 Oracle**이고 **외부망 로컬(`out-local`)만
  MySQL**이며, **Maven 중앙 저장소 접근은 불가**(수동 반입), JDK 1.8은 공통이다.
  이 계획에서 바뀐 것은 3곳 — Task 1.1의 "MySQL을 갈아치운다"가 **"Oracle 정본 +
  MySQL 미러 유지"** 로, `dependencies.txt`가 목록에서 **오프라인 리포지토리 반입
  절차**로, Task 1.3이 **DDL 2벌** 산출로 바뀌었다.
- **2026-08-25 개정 요지**: eGovFrame 제약 폐기(설계 문서 상단 주석) → Task 1.1의
  출발점이 "표준 템플릿"에서 **`uploader/` 실물 골격**으로 바뀌었고, 공통 규칙의
  프레임워크가 Spring Boot 2.7.x가 됐다. 경유지+OAuth 확정으로 문의 6이 교체되고
  Task 4.3·4.4에 프록시·토큰 항목이 붙었다. 문의서·설계 §7과 **번호를 통일**했다.
- **설계(정본)**: `docs/superpowers/specs/2026-08-05-weblogic-java-migration-design.md`.
  이 계획은 그 §8의 단계 분할을 실행 단위로 풀어놓은 것이다. 설계와 이 계획이
  어긋나면 설계가 이긴다.
- **문의서**: `docs/이관문의서_WebLogic_확인사항.md` (발송·회신은 사용자 몫).
  *2026-08-25 개명 — 종전 `기관문의서_WebLogic이관_확인사항7건.md`. 수신처가 당행
  내부 부서라 "기관"을 뺐고, 문항이 7→9로 늘어 건수도 이름에서 뺐다.*
- **선행 완료 — 단계 0(골든 파일)**: `golden/` (2026-08-10, main `221e3b9`).
  API 34개 스냅샷 + 산출물 2종, 정규화 규칙과 캡처 제외 근거는 `golden/README.md`.
  **이 계획의 모든 단계 검증이 이 골든과의 비교다.**

## 잠정 지점과 확정 조건 (문의서 회신 ↔ 계획 매핑)

✅ **2026-08-25 — 번호가 통일됐다.** 종전에는 이 표(문의서 번호)와 설계 §7이 4·5·6에서
어긋나 2026-08-19 점검 때 실제 매핑 오류가 나왔었다. 설계 §7을 문의서 순서에 맞춰
재배열해 **문의서 · 설계 §7 · 이 표의 번호가 전부 같아졌다.** 변환은 이제 필요 없다.

| # | 회신이 확정하는 것 | 회신 전 기본 가정 |
|---|---|---|
| 1 (LLM 규격) | Task 4.4 어댑터의 요청/응답 계층 | OpenAI 호환·Bearer 인증으로 가정하고 어댑터 인터페이스만 동결 |
| 2 (임베딩) | Task 3.3 벡터 검색 포함 여부 | **포함**으로 가정. 없다고 회신 오면 Task 3.3 삭제 + 검색 품질 저하 합의 기록 |
| 3 (Oracle Text) | Task 3.2의 **A/B 분기** | 분기 양쪽을 계획에 둔다(아래). 회신 전 3단계 착수 금지 |
| 4 (Oracle 버전) | Task 1.3 DDL 문법 | 19c 가정 — 11g로 회신 오면 DDL 리뷰 1회 추가 |
| 5 (WebLogic 버전) | Task 1.2 `weblogic.xml` 설정값 | 12.2.1.x(Servlet 3.1) 가정 — 14.1.1이어도 구조 불변 |
| 6 (**신설** — 경유지 OAuth) | Task 4.4 어댑터의 **토큰 계층**, 그리고 인증 구현 필요 여부 | 게이트웨이가 인증을 완결한다고 가정(뒤쪽 재검증 없음). **재검증이 필요하다는 회신이 오면 신규 Task가 생긴다** |
| 7 (**개정** — 경유지 버퍼링·타임아웃) | Task 4.3 프록시 설정 요청 목록 | 경유지 존재는 **확정**. 버퍼링 켜짐·타임아웃 60초로 **보수적 가정**하고 조정 요청을 Task에 포함 |

**1·2·4·5·7은 가정으로 진행해도 재작업이 국소적**이다(설정값·Task 하나 수준).
**3만 구조가 갈리므로** 3단계는 회신 전 착수하지 않는다 — 단계 순서상 1·2단계를
끝낼 때쯤 회신이 와 있는 것이 이상적이다.
**6은 답에 따라 범위가 늘 수 있는 유일한 신규 항목**이다(인증 구현 신설 가능성) —
다만 어댑터 한 층에 갇혀 있어 다른 단계를 막지는 않는다.

**삭제된 항목**: 종전 6번(eGovFrame 표준 템플릿의 `async-supported`). eGovFrame 제약
폐기로 `web.xml`을 우리가 소유하게 되어 물을 필요가 없어졌다 — Task 1.2에서 직접
`async-supported=true`를 명시한다. 근거는 설계 문서 상단 2026-08-25 개정 주석.

## 공통 규칙 (모든 Task에 적용)

- **동작 동일이 유일한 성공 기준**(설계 §9) — 개선은 이관에 섞지 않는다.
  응답 JSON의 키·형태·순서는 `golden/api/`가 계약이다.
- 검증 하네스: Java 쪽에 `golden/README.md`의 정규화 규칙(타임스탬프→`<TS>`,
  랜덤 id→`<ID>`, 경로 치환)을 그대로 구현한 비교 테스트를 **1단계에서 먼저**
  만들고, 이후 단계마다 통과 범위를 넓힌다.
- JDK 1.8 상한 준수: **Spring Boot 2.7.x(WAR)** · MyBatis 3.5.x · HttpClient 4.5 ·
  Jackson 2.x · PDFBox 2.0.x · POI 5.2.x · JUnit 4.13 (설계 §4 표).
  *2026-08-25 — eGovFrame 폐기로 "Spring 5.x MVC 단독"에서 Spring Boot 2.7.x로
  바뀌었다. `uploader/`가 이미 이 조합으로 돌고 있다.*
- 폐쇄망: 의존성은 전량 사전 반입 목록으로 관리(1단계 산출물).
  *2026-08-26 — **Maven 중앙 저장소 접근 불가가 확정**이다. 빌드 중에 의존성이 새로
  내려오지 않으므로 라이브러리 추가에는 반입 절차가 따른다. 다만 **그 절차는 이미
  마련돼 있고 까다롭지 않다**(사용자 확인) — 차단 요인이 아니라 절차상 사실이다.
  Task 1.1 참조.*
- 테스트는 pytest 1:1 이식이 아니라 **REST 계약(MockMvc) + Mapper +
  상태전이**에 집중, H2 대체 금지·개발용 Oracle 전제(설계 §8).
  *2026-08-26 — "개발용 Oracle 전제"는 이제 가정이 아니라 사실이다. **내부망은
  `local` 프로파일부터 이미 Oracle이다**(더 이상 조달 과제가 아니다).*
- **어디서 검증하는가**(2026-08-26 신설, 설계 §8 개정판 표와 같은 내용):
  REST 계약·골든 비교·상태전이는 **외부망 로컬(`out-local`, MySQL)** 에서 돌려도 되지만,
  **Mapper·DDL 정합성과 Oracle Text는 내부망(`local`/`dev`/`stg`, Oracle)에서만 유효**하다.
  ⚠️ **MySQL 통과를 Oracle 합격으로 세지 말 것** — H2를 금지한 것과 같은 이유다
  (§5의 빈 문자열→NULL, CLOB 정렬 제약이 MySQL에서는 드러나지 않는다).

---

## 단계 1 — 골격 ✅ **완료 (2026-08-26)**

*끝난 모습: 대시보드가 WAR에서 뜨고 데이터는 비어 있다.*

> **산출물: `kgi-ggreport-web/`** — groupId `com.kbstar` / artifactId
> `kgi-ggreport-web` / 패키지 `com.kbstar.kgi.ggreport.web` (사용자 확정).
> Java 패키지명에 하이픈을 쓸 수 없어 artifactId·폴더명만 하이픈 표기를 유지했다.
>
> **실기동으로 "끝난 모습"을 확인했다** — `java -jar target/kgi-ggreport-web.war` 후
> `GET /` → 200(`static/index.html`), `js`·`geo`·`vendor` → 200,
> 디자인 실험본 `/index_2.0_impec.html` → 404(제외가 실제로 걸림).
> `mvn package` BUILD SUCCESS · 스모크 테스트 2건 통과.
>
> **계획과 다르게 한 것 3건** (근거는 각 파일 주석과 `kgi-ggreport-web/README.md`):
> 1. **화면을 복사하지 않는다.** `pom.xml`의 `<resources>`가 빌드할 때 `../frontend`를
>    `static/`으로 가져온다. 복사본을 두면 원본과 갈라지는데, 이관 검증이 "같은 입력 →
>    같은 출력"이라 화면이 두 벌이 되는 순간 무엇과 비교하는지가 흐려진다.
> 2. **`web.xml`에 필터를 선언하지 않는다.** Task 1.2가 "async-supported=true를 필터
>    체인 전부에 명시"라고 했으나, Boot는 필터를 프로그램적으로 등록하며
>    `asyncSupported` 기본값이 이미 `true`다 — 요구는 충족되고, 다시 선언하면 **필터가
>    두 번 돈다.** web.xml에는 `resource-ref` 2건만 둔다.
> 3. **Thymeleaf를 넣지 않는다.** uploader와 갈리는 지점 — 이 시스템의 화면은 순수
>    정적 HTML/JS라 템플릿 엔진이 필요 없다.
>
> **함께 배운 것을 반영했다**: uploader가 `dev`/`stg`/`prod`에 `mybatis.*`를 빠뜨린
> 결함(uploader README §13-①)을 알고 있으므로 5축 전부에 넣었다.

- **Task 1.1 — WAR 프로젝트 골격**: **`uploader/`의 골격을 출발점으로 재사용한다**
  (2026-08-25 개정 — 종전 "eGovFrame 4.x 표준 템플릿 기반"을 대체). 사용자가 외부에서
  만들어 온 `uploader/`가 **이 계획의 목표 스택과 정확히 같다** — Spring Boot 2.7.18 ·
  JDK 1.8 · `SpringBootServletInitializer` WAR · `weblogic.xml`(`prefer-application-packages`) ·
  provided 톰캣 · MyBatis · ojdbc8 · PDFBox 2.0.29 · POI 5.2.3. **빈 템플릿에서
  시작하지 않고 검증된 실물에서 시작한다**(테스트 9파일 동반).
  - 그대로 가져오는 것: `pom.xml` 의존성 축, `ServletInitializer`, `weblogic.xml`,
    프로파일 분리(`config-envs/`), MyBatis Mapper XML 배치 관례.
  - ⚠️ **~~반드시 갈아치우는 것: `schema-mysql.sql` + MySQL 드라이버 → Oracle DDL 정본~~**
    — **2026-08-26 정정. 갈아치우지 않는다.** MySQL은 uploader의 임시방편이 아니라
    **외부망 로컬(`out-local`)의 확정 축**이다(설계 상단 5축 표). 따라서:
    - **Oracle DDL이 정본**이고 `schema-mysql.sql`은 그로부터 파생된 **미러**로 남는다
      → **DDL 2벌 유지**(Task 1.3). 정본이 바뀌면 미러도 같은 커밋에서 바꾼다.
    - MySQL 드라이버(`mysql-connector-j`)도 `pom.xml`에 남는다. 다만 **`out-local`
      전용**임을 주석으로 못 박고, 내부망 반입 목록(`dependencies.txt`)에서는 뺀다.
    - **H2만 테스트 전용으로 축소**된다(설계 §8: Oracle 의존 테스트를 H2로 대체 금지).
    - uploader의 `config-envs/`(`local`·`dev`·`stg`·`prod`·`out-local`) 5축 구조는
      **그대로 가져온다** — 이 계획이 필요로 하는 모양과 정확히 같다.
  - `frontend/` 전체를 정적 리소스로 복사(무수정 — 유일한 변경은 API 베이스 `/api`
    프리픽스이며, 프런트 쪽 대응은 이관 마지막에 한 줄 설정으로).
  - **의존성 반입 — 목록이 아니라 절차다** (2026-08-26 격상). 종전에는 "`dependencies.txt`
    시작 — uploader의 `pom.xml`이 이미 그 목록의 절반"이라고만 적혀 있었으나, **폐쇄망
    빌드 머신은 Maven 중앙 저장소에 닿지 못한다**는 것이 확정됐다. 손으로 적은 목록은
    **추이 의존성(transitive)을 반드시 놓치므로** 목록 대신 리포지토리를 통째로 만든다:
    1. **외부망 로컬**에서 `mvn -f uploader/pom.xml dependency:go-offline` +
       `mvn clean package`로 `~/.m2/repository`를 채운다(추이 의존성·`.pom`·플러그인까지
       실제로 받아지는 것이 목록의 정본이다).
    2. 그 `repository`를 압축해 반입하고, 내부망에서 `settings.xml`의
       `<localRepository>`로 지정하거나 사내 Nexus에 일괄 업로드한다.
       빌드는 **`mvn -o`(오프라인)로 통과하는지**를 합격 기준으로 삼는다 — 오프라인에서
       한 번 통과해야 반입 누락이 없음이 증명된다.
    3. `dependencies.txt`는 `mvn dependency:list`(+`dependency:tree`) 출력을 **떠 놓은
       산출물**로 유지한다 — 사람이 관리하는 원장이 아니라 DBA·보안 검토에 낼 명세다.
    - ⚠️ **`mysql-connector-j`는 반입 목록에서 제외**한다(외부망 로컬 전용).
    - ✅ **반입 절차는 이미 있고 까다롭지 않다**(2026-08-26 사용자 확인). 따라서
      **단계 1에서 5단계 전체의 라이브러리를 미리 확정할 필요는 없다** — 단계마다
      필요한 것이 생기면 그때 반입하면 된다. 이 항목은 *일정 리스크*가 아니라
      **"빌드 중에 자동으로 내려오지 않는다"는 절차상 사실**로만 다룬다.
      - 그래도 단계 1에서 설계 §4 표 기준의 축(Spring Boot 2.7.x · MyBatis 3.5.x ·
        HttpClient 4.5 · Jackson 2.x · PDFBox 2.0.x · POI 5.2.x · JUnit 4.13 · ojdbc8)을
        **한 번에 받아 두는 편이 왕복을 줄인다** — 권장이지 전제조건은 아니다.
      - 남는 진짜 규칙은 하나다: **새 라이브러리를 추가한 커밋은 `mvn -o`가 통과하는지
        확인하기 전까지 내부망에서 빌드된다고 가정하지 않는다.**
  - ⚠️ **uploader의 `@Scheduled` 재분류 잡은 그대로 가져오지 말 것.** WAS에서 앱이
    스레드를 직접 만드는 것은 금지 사항이라(설계 §2·§4) Task 4.2의 CommonJ
    WorkManager 경로로 옮겨야 한다. uploader 자체를 WebLogic에 올릴 때도 같은 문제가
    있다 — 별도 확인 필요.
  - ✅ **~~uploader의 `README.md`가 실물과 다르다~~ — 교정 완료(2026-08-26).**
    JPA/Hibernate 오기 외에도 **6개 절이 실물과 달랐다**: 환경 설정 방식(프로파일이
    아니라 `config-envs/{env}/` → `config/` 파일 교체), DB(Oracle 전용이 아니라 5축),
    API 목록(REST `/api/files/*` 2개 + 화면 4개 누락), DDL(시퀀스가 아니라
    `AUTO_INCREMENT`), 로컬 기동(H2가 아니라 MySQL), 테스트(H2가 아니라 전부 Mock).
    README에 §13 "알려진 불일치"를 신설해 **코드/설정을 고쳐야 하는 3건**을 남겼다:
    ① `dev`/`stg`/`prod`에 `mybatis.*` 설정 누락 + Oracle DDL 부재
    ② `application-test.properties`가 프로파일 미활성으로 적용 안 됨
    ③ 전환 흔적 — `weblogic.xml`의 `org.hibernate.*`, 소스 폴더 안의 죽은
    `config/application.properties`(평문 비밀번호 포함).
    **①은 Task 1.3(DDL 2벌)이 흡수하고, ②③은 골격을 가져올 때 함께 정리한다.**
- **Task 1.2 — `web.xml`/`weblogic.xml`**: JNDI DataSource 조회, 인코딩 필터,
  **`async-supported=true`를 우리 필터 체인 전부에 명시**(2026-08-25 — eGovFrame
  폐기로 `web.xml`을 우리가 소유하므로 이제 문의 항목이 아니라 그냥 우리가 켜면
  되는 설정이다). CommonJ WorkManager 리소스 선언(4단계에서 사용).
- **Task 1.3 — 스키마 DDL (Oracle 정본 + MySQL 미러, 2벌)**: registry **7테이블**
  *(2026-08-26 정정 — 종전 "6테이블". `server/db.py`의 SCHEMA를 실측하니
  `institutions`·`bid_cases`·`tasks`·`messages`·`notifications`·`role_menus`·
  `chat_messages` **7개**다. 계획 I에서 뒤늦게 추가된 `role_menus`가 빠져 있었다.
  유니크 인덱스 `idx_bid_cases_notice`도 함께 옮겨야 한다.)* + 검색
  (CHUNK/VECTOR) + `ORCH_RUN`/`ORCH_STEP`. 설계 §5의 4개 결정을 그대로 반영 —
  ⓐ `NOT NULL DEFAULT ''` 금지(INSERT 명시값 + Mapper `null→""` 정규화)
  ⓑ 긴 텍스트 CLOB(+`jdbcType=CLOB`, ORDER BY 배제)
  ⓒ 시각 컬럼 `VARCHAR2` 유지(ISO 문자열)
  ⓓ 이후 변경은 번호 붙은 DDL 스크립트.
  - **2026-08-26 — 산출물이 2벌이다**(설계 상단 5축 표):
    **`schema-oracle.sql`(정본)** 과 **`schema-mysql.sql`(외부망 로컬 미러)**.
    번호 붙은 변경 스크립트(ⓓ)도 두 벌 모두에 대해 같은 번호로 낸다.
  - **미러가 지켜야 할 것은 "같은 DDL"이 아니라 "같은 앱 동작"이다.** 대응 규칙:
    | 정본(Oracle) | 미러(MySQL) | 주의 |
    |---|---|---|
    | `VARCHAR2(n)` | `VARCHAR(n)` | 길이 단위 — Oracle은 BYTE 기본이라 한글에서 갈린다. **정본을 `CHAR` 단위로 명시**(`VARCHAR2(n CHAR)`) |
    | `CLOB` | `LONGTEXT` | 양쪽 다 ORDER BY 대상에서 배제 |
    | `BLOB`(벡터) | `LONGBLOB` | 리틀엔디언 float32 바이트 포맷 동일 |
    | `NUMBER(n)` | `INT`/`BIGINT` | 앱 생성 PK라 시퀀스·AUTO_INCREMENT 모두 불필요 |
    | `''` → NULL 취급 | `''` ≠ NULL | ⚠️ **여기가 §5-(A)의 함정이다.** MySQL에서는 빈 문자열이 그대로 저장돼 **문제가 드러나지 않는다** — Mapper의 `null→""` 정규화는 **Oracle에서만 검증된다** |
  - ⚠️ **미러는 검증 대상이 아니라 편의 장치다.** MySQL에서 DDL이 통과했다는 사실은
    Oracle 정합성의 근거가 되지 않는다(공통 규칙 "어디서 검증하는가" 참조).
  - ✅ **완료 (2026-08-26)** — `kgi-ggreport-web/src/main/resources/db/`.
    `oracle/001_schema.sql`(정본) + `mysql/001_schema.sql`(미러), **11테이블**
    (registry 7 + 검색 4). 상세 근거는 같은 폴더의 `README.md`에 있다.
    - **`ORCH_RUN`/`ORCH_STEP`은 단계 4로 미뤘다**(사용자 확정). 설계 §6-B에 용도만
      있고 컬럼이 없어, 나머지 11개의 기계적 변환과 달리 **신규 설계**다.
    - **Oracle Text `CONTEXT` 인덱스는 넣지 않았다** — 문의 3 회신에 걸린다.
      테이블 구조는 1안/2안 어느 쪽이든 같아서 지금 만들 수 있었고, 인덱스만 `002_`로
      뒤에 붙인다. 단계 3의 착수 금지가 Task 1.3을 막지 않는 이유다.
    - ⚠️ **설계 §5-(A)를 그대로 쓸 수 없어 조정했다.** "`NOT NULL` 유지 + INSERT 시
      명시값"은 성립하지 않는다 — Oracle이 `''`를 NULL로 바꾸므로 빈 문자열을 명시해도
      제약에 걸리고, 작업은 "아직 안 쓴" 상태로 생성되므로 **최초 INSERT가 반드시
      실패한다.** `TASKS.DRAFT_CONTENT`를 NULL 허용으로 두고 Mapper가 `null → ""`로
      정규화한다(정규화는 설계가 이미 요구한 것이라 프런트 JSON은 동일).
    - ⚠️ **외래키가 실제로 강제된다.** `server/db.py`는 `PRAGMA foreign_keys`를 켜지
      않아 현재 SQLite에서는 선언만 돼 있고 강제되지 않는다. **단계 2 골든 비교에서
      지켜볼 것** — 고아 행이 나오면 제약을 빼는 게 아니라 왜 생기는지를 먼저 본다.
    - 예약어 회피로 컬럼명 3건 변경: `files.size`→`FILE_SIZE`(SIZE는 Oracle 예약어),
      `meta.key`/`value`→`META_KEY`/`META_VALUE`, `chunks.text`→`CHUNK_TEXT`.
    - ⚠️ **`messages.model`을 놓칠 뻔했다** — `server/db.py`의 `SCHEMA`가 아니라
      `MESSAGE_MIGRATIONS`에만 있는 컬럼이다. **실제 스키마는 SCHEMA + MIGRATIONS다.**
    - 검증: MySQL 미러는 `ggreportdb`에 **2회 연속 적용 성공**(테이블 11·인덱스 9,
      멱등 확인). **Oracle 정본은 문법만 확인**(H2 `MODE=Oracle` 통과) — 실검증은
      내부망 Oracle에서 처음 이뤄진다.
- **Task 1.4 — 골든 비교 하네스(Java)**: `golden/api/*.json`을 읽어 MockMvc
  응답과 비교하는 JUnit 러너 + 정규화 유틸. *이 단계에서는 하네스 자체의 단위
  테스트만 통과하면 된다.*
  - ✅ **완료 (2026-08-26)** — `kgi-ggreport-web/src/test/java/.../golden/`
    4클래스(`GoldenNormalizer`·`GoldenSnapshot`·`GoldenComparator`·`GoldenRunner`)
    + 자체 테스트 29건. 모듈 전체 **31건 통과**. 사용법은 모듈 README §7-1.
  - ⚠️ **작업 중 실제 결함을 하나 잡았다 — 골든 34건 중 10건이 `X-User-Id` 헤더를
    들고 있다**(결재 시나리오 15~24번: dave가 임시저장·제출, boss가 승인).
    처음 만든 로더가 `request.headers`를 무시하고 있었다. 그대로 뒀다면 단계 2 후반이
    **전부 틀린 행위자로 돌아** `assignee`/`approver`가 어긋났을 것이고, 원인을 찾기
    매우 어려웠을 것이다. 로더·러너에 헤더 지원을 넣고 회귀 테스트로 고정했다.
  - **정한 것 3가지**: ⓐ 배열 순서는 비교하고 **객체 키 순서는 비교하지 않는다**
    (pydantic 필드 순서 ↔ POJO 필드 순서 차이로 실패시키면 진짜 차이가 소음에 묻힌다)
    ⓑ **`Accept` 헤더를 강제하지 않는다** — `capture.py`가 지정하지 않았고, 강요하면
    JSON 아닌 응답을 내는 엔드포인트가 실제 동작과 무관하게 406을 받는다
    ⓒ 러너는 예외를 던지지 않고 `Result`를 돌려준다(실패를 모아 한 번에 보고).
  - **하네스 자신을 스텁 컨트롤러로 검증했다** — 이게 없으면 단계 2에서 "테스트가
    통과했다"와 "러너가 아무것도 안 봤다"가 구분되지 않는다.
  - ⚠️ **정규화 규칙은 `capture.py`와 한 쌍이다.** 한쪽만 고치면 정상 응답도 계속
    실패한다(골든 파일은 캡처 시점 규칙으로 저장돼 있다). `GoldenNormalizerTest`가
    그 회귀를 잡는다 — 이미 정규화된 골든을 다시 정규화해도 변하지 않는지(멱등)까지 본다.

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
- **Task 4.3 — SSE**: `AsyncContext` + `SseEmitter`. `async-supported=true`는
  Task 1.2에서 우리가 이미 켠다. **남은 위험은 전적으로 경유지 쪽**이다(문의 7) —
  버퍼링이 켜져 있으면 실시간 표시가 멈추고 유휴 타임아웃이 짧으면 진행 중 끊긴다.
  경유지 존재가 **확정**이므로 이 Task에는 **프록시 설정 조정 요청**이 산출물로
  포함된다(EC2 데모에서 실측한 값이 근거로 쓸 만하다 — `proxy_buffering off` +
  `proxy_read_timeout 300s`, 없으면 60초에 504).
- **Task 4.4 — LLM 어댑터**: HttpClient 4.5 + Jackson 직접 호출. 구조화
  출력(스키마 프롬프트 → JSON 추출 → 역직렬화 → 재시도) + 2단 폴백 +
  실제 응답 모델명 기록(`messages.model`). 문의 1 회신로 인증·규격 확정 —
  회신 전에는 인터페이스만 동결하고 구현은 OpenAI 호환 가정.
  - **[2026-08-25 신설] 토큰 계층** (설계 §6-C): 경유지 OAuth 토큰 획득·캐시·
    만료 전 선제 갱신 + 401 시 1회 재시도. 토큰은 메모리에만 두고 **로그·
    `messages` 기록·예외 메시지에 싣지 않는다.**
  - ⚠️ **폴백과 인증 실패를 구분한다**: 1순위 실패가 401/403(인증)이면 2순위로
    넘어가도 똑같이 실패하므로 **폴백을 태우지 말고 즉시 사람에게 알린다.**
    안 그러면 토큰 만료가 "모델 2개가 다 죽었다"로 보고된다. 404(모델 부재)일
    때만 폴백한다.
  - 규격은 문의 6 회신 대기 — 회신 전에는 **토큰 공급자 인터페이스만 두고 구현은
    비운다.**
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

## 단계 6 — uploader 붙이기 (⛔ **이관 완료 후에 한다**, 2026-08-25 사용자 확정)

*끝난 모습: IT담당자가 로그인하면 파일 업로드 상태를 탭에서 본다.*

**왜 마지막인가 (결정 근거).** 전제는 "Java로 간다"이고 `uploader/`는 **이미 Java**다.
아직 Python인 것은 기존 프로젝트뿐이므로, **기존 프로젝트를 먼저 변환하고 나면 붙이는
일은 사소해진다** — 둘 다 Spring Boot 2.7 WAR / JDK 8 / MyBatis / WebLogic이라 같은
컨테이너 안이고, 서버끼리 부르면 되므로 브라우저가 경유지·OAuth를 넘을 필요도 없다.

이관 전에 붙이면 **버릴 Python 중계 라우터**를 새로 써야 한다(브라우저에 서비스 토큰을
실을 수 없어 `server/`가 중계할 수밖에 없다). 그래서 순서를 뒤집지 않는다.

⚠️ 단, **`frontend/` 쪽 작업은 버려지지 않는다** — 설계 §3 원칙 1이 "화면은 손대지
않는다(WAR 정적 리소스로 그대로)"라 아래 조사 결과는 이관 후에도 그대로 유효하다.

### 2026-08-25 사전 조사 결과 (다시 조사하지 않아도 된다)

**ⓐ 역할 추가는 0건이다.** `server/menus.py`에 이미 있다 —
`out["전산팀"][ADMIN_MENU] = True  # 전산팀이 시스템 운영자를 겸한다(사용자 확정)`.
**`IT담당자` = `전산팀 팀원`/`전산팀장`** 으로 이미 존재한다(사용자 확정).
⚠️ **역할 체계는 건드리지 말 것** — `roles.js`·`server/teams.py` 양쪽에 "소속은 3그룹
뿐(영업·전산·예산)"이 사용자 확정으로 못 박혀 있고, 역할은 **합쳐진 문자열 하나**
(`전산팀`·`전산팀장`)로 저장된다. 새 소속을 끼우면 이미 쌓인 알림 수신자와 `role_menus`
키가 전부 갈라진다.

**ⓑ `RPA`는 역할 목록에 넣지 않는다.** `roles.ALL`은 권한관리 표의 행이 되고
`server/teams.py`의 `ROLES`와 같아야 하며, 그 목록이 **결재 라인**(`approverOf`·
`lead_of`)과 **알림 수신자**의 근거다. 프로그램을 넣으면 "RPA의 결재자는 누구인가"가
생긴다. RPA는 **파일을 올리는 쪽**(`POST /upload` 호출자)이고 화면을 보는 것은
IT담당자다.
→ ⚠️ **다만 `UPLOADED_FILE`에 업로드 주체 컬럼이 없다**(ORIGINAL_NAME / STORED_PATH /
FILE_YEAR / INSTITUTION_NAME / CATEGORY / STATUS / UPLOADED_AT / CLASSIFIED_AT).
지금 구조로는 화면에서 **사람이 올린 것과 RPA가 올린 것을 구분할 수 없다.** 구분이
필요하면 컬럼 추가가 선행된다. **사용자에게 확인받지 않은 항목이다.**

**ⓒ 탭 추가는 정형화돼 있다 — 6곳.**

| 파일 | 무엇을 |
|---|---|
| `server/menus.py`(→ Java 등가물) | `MENUS` 튜플에 1행 + 전산팀 기본값 on |
| `frontend/js/menu_rules.js` | `MENU_KEYS` · `SERVER_ONLY`에 키 추가 |
| `frontend/index.html` | 탭 버튼 1개 + `<section class="tab-view">` 1개 + `<script>` 1줄 |
| `frontend/js/app.js` | `onTabChange`의 mount/unmount 배열에 1행 |
| `frontend/js/uploads.js` | **신규** — 조회·표시. 가장 가까운 본보기는 `knowledge.js` |
| `frontend/test/` | 회귀 테스트 |

**권한관리 화면은 손댈 필요가 없다** — `admin.js`가 `GET /menus`가 주는 메뉴 목록을
그대로 그리므로 `MENUS`에 한 줄 넣으면 **열이 저절로 생긴다.**
⚠️ **함정**: 탭 key와 section id가 어긋난 전례가 있다(`tasks` 키인데 버튼은
`data-tab="designer"`, 섹션은 `tab-designer`). 새 탭은 **키와 id를 같게** 맞출 것.
또 기본값을 코드에 둬야 한다 — `server/menus.py` 주석대로 "DB에 행이 없다는 것은
'꺼짐'이 아니라 '아직 정하지 않음'"이라, 기본값이 없으면 새 메뉴를 **아무도 못 본다.**

**ⓓ 현재 API는 목록 화면용으로 무겁다.** `GET /api/files/search`가 **결과마다 파일
본문 전체 텍스트를 담는다**(`content` 필드 — `FileContentService.extractText`가 PDF를
전부 열어 파싱한다). **페이징도 없다**(`search` 쿼리에 LIMIT 없음). 목록용으로는
`content` 없는 응답이 필요하다 — **문의 6-2(API 표준 규격) 회신 때 함께 정리한다.**
쓸 수 있는 필드는 파일명 · 기관명 · 연도 · 카테고리 · 상태(`CLASSIFIED` /
`UNCLASSIFIED` / `DELETED` / `REJECTED`) · 업로드일시다.

## 순서와 의존

```
[문의서 발송] ──회신──▶ (3단계 착수 가능 / 4.4 세부 확정)
단계 1 ─▶ 단계 2 ─▶ 단계 4 ─▶ 단계 5 ─▶ 단계 6(uploader 붙이기)
                └─▶ 단계 3 (회신 후, 2·4와 병행 가능)
```

- 설계 §8은 3(검색)→4(오케스트레이터) 순이지만, 3이 회신 대기이므로 **회신이
  늦으면 4를 먼저** 진행한다 — 둘은 서로 의존이 없다(검색은 지식 탭, 오케스트
  레이터는 워크플로 탭).
- 각 단계 완료 = 해당 골든 비교 통과 + "끝난 모습" 화면 확인. 둘 다 기록.
