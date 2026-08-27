# kgi-ggreport-web

입찰 워크플로우 지원 시스템의 **Java 이관 모듈**. 현재 Python(FastAPI + LangGraph)으로
도는 시스템을 당행 표준 플랫폼(WebLogic + Oracle + JDK 8)으로 옮긴 것이다.

- **설계(정본)**: `docs/superpowers/specs/2026-08-05-weblogic-java-migration-design.md`
- **구현계획**: `docs/superpowers/plans/2026-08-10-weblogic-java-migration.md`
- **검증 기준**: `golden/` — "같은 입력 → 같은 출력" 비교가 이관 검증의 전부다.
  화면이 안 바뀌므로 이 비교가 통과하면 화면도 통과한다.

## 진행 상태 (2026-08-27)

| 단계 | 상태 |
|---|---|
| 0 · 골든 파일 | ✅ 완료 — `golden/` |
| **1 · 골격** | ✅ **완료** — 이 모듈. 대시보드가 WAR에서 뜨고 데이터는 비어 있다 |
| **2 · 조회 REST** | 🔶 **Task 2.1·2.2 완료**(POJO+Mapper §7-2, 컨트롤러 §7-3). **2.3(기관 25건 시드) 남음** |
| 3 · 검색 | ⛔ **문의 2·3 회신 전 착수 금지** (임베딩 엔드포인트 / Oracle Text 가용 여부) |
| 4 · 오케스트레이터 | ⬜ 미착수 — `ORCH_RUN`/`ORCH_STEP` 설계도 이때 한다 |
| 5 · 산출물 | ⬜ 미착수 |
| 6 · uploader 붙이기 | ⬜ 이관 완료 후 |

## 1. 좌표

| 항목 | 값 |
|---|---|
| Maven `groupId` | `com.kbstar` |
| Maven `artifactId` | `kgi-ggreport-web` |
| Java 패키지 | `com.kbstar.kgi.ggreport.web` |
| 산출물 | `target/kgi-ggreport-web.war` |
| JDK | 1.8 |
| Spring Boot | 2.7.18 (JDK 8을 지원하는 마지막 계열) |

> Java 패키지명에는 하이픈을 쓸 수 없어 `kgi-ggreport-web` → `kgi.ggreport.web`으로
> 옮겼다. artifactId·폴더명은 하이픈 표기를 그대로 쓴다.

## 2. 기술 스택

| 구성 요소 | 선택 | 근거 |
|---|---|---|
| 영속화 | **MyBatis** | 설계 §2. 현재 SQL이 원시 SQL이라 이식성이 좋다 |
| 화면 | **정적 HTML/JS 그대로** | 설계 §3. 브라우저가 크롬/엣지 최신이라 재작성 불필요. **템플릿 엔진 없음**(uploader와 갈리는 지점) |
| LLM 호출 | HttpClient 4.5 + Jackson **직접** | 설계 §6-C. LangChain4j가 주는 것 중 실제로 쓰는 건 구조화 출력·2단 폴백뿐이다 |
| 전문검색 | Oracle Text 또는 Java 인메모리 색인 | 설계 §6-A. **문의 3 회신에 따라 갈린다** |
| 벡터 검색 | Oracle BLOB + Java `float[]` 브루트포스 | 코퍼스 5.6MB라 벡터DB는 순수 낭비 |
| 백그라운드 실행 | **CommonJ WorkManager** | WAS에서 앱이 스레드를 직접 만들면 안 된다(설계 §2·§4) |

## 3. 환경별 설정 — 5축

`config-envs/{환경}/application.properties` 중 하나를 **`config/application.properties`로
복사**해서 쓴다. Spring Boot가 실행 디렉터리의 `./config/`를 기본 설정 위치로 읽는다.
**Spring 프로파일이 아니다** — `--spring.profiles.active=local` 같은 인자는 동작하지 않는다.

| 망 | 디렉터리 | DB | 접속 |
|---|---|---|---|
| 내부망 로컬 | `config-envs/local/` | **Oracle** | `jdbc:oracle:thin:@//localhost:1521/ORCL` |
| 내부망 개발 | `config-envs/dev/` | **Oracle** | thin (`<DEV-DB-HOST>`) |
| 내부망 스테이징 | `config-envs/stg/` | **Oracle** | thin (`<STG-DB-HOST>`) |
| 내부망 운영 | `config-envs/prod/` | **Oracle** | **JNDI** `java:comp/env/jdbc/ggreportDS` |
| **외부망 로컬** | `config-envs/out-local/` | **MySQL** | `jdbc:mysql://localhost:3306/ggreportdb` |

- `config/application.properties`는 **`.gitignore` 대상**이다 — 각자의 DB 자격증명이
  들어가는 작업 사본이라서다. 공유하는 템플릿은 `config-envs/` 쪽이고 전부
  `<PLACEHOLDER>`다.
- **`prod`에는 DB 비밀번호가 없다.** WebLogic 콘솔에서 DataSource를 만들 때 넣고 앱은
  이름만 참조한다 — 설정 파일 유출로 자격증명이 새는 경로가 원천적으로 없다.
- ⚠️ **`out-local`(MySQL) 통과는 Oracle 정합성의 근거가 되지 않는다.** H2를 금지한 것과
  같은 이유다(설계 §5의 빈 문자열→NULL, CLOB 정렬 제약이 MySQL에서는 드러나지 않는다).
  외부망 로컬은 로직·REST 계약을 빨리 돌려 보는 자리이지 DB 계층의 합격 판정 자리가 아니다.

## 4. 화면은 복사하지 않고 빌드할 때 가져온다

`pom.xml`의 `<resources>`가 리포 루트의 **`frontend/`를 `static/`으로 직접 읽는다.**
복사본을 두면 원본과 갈라지는데, 이관 검증이 "같은 입력 → 같은 출력"이라 화면이 두
벌이 되는 순간 무엇과 비교하는지가 흐려진다. 빌드 시 취득이면 원본이 언제나 하나다.

제외 대상은 `index_*.html`(디자인 실험본 6개), `README.md`, `test/`다.
진짜 진입점은 `index.html` 하나다. 실험본이 배포물에 들어가지 않는 것은 실기동에서
`/index_2.0_impec.html` → **404**로 확인했다.

## 5. 로컬 기동 (외부망 / MySQL)

```bash
# 1) DB 준비 — 스키마 DDL은 src/main/resources/db/ 에 있다(§9 참조).
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS ggreportdb DEFAULT CHARSET utf8mb4;"
mysql -u root -p -e "CREATE USER IF NOT EXISTS 'ggreport'@'localhost' IDENTIFIED BY '<원하는-비밀번호>'; \
                     GRANT ALL PRIVILEGES ON ggreportdb.* TO 'ggreport'@'localhost'; FLUSH PRIVILEGES;"
mysql -u root -p ggreportdb < src/main/resources/db/mysql/001_schema.sql

# 2) 환경 선택 — 설정 파일을 복사한다(프로파일 인자가 아니다, §3)
cd kgi-ggreport-web
cp config-envs/out-local/application.properties config/application.properties
#    → config/application.properties 의 <OUT-LOCAL-DB-PASSWORD> 를 채운다

# 3) 빌드 + 기동
mvn clean package
java -jar target/kgi-ggreport-web.war
```

| 확인 | URL | 기대 |
|---|---|---|
| 대시보드 | http://localhost:8080/ | 200 (`static/index.html`) |
| 스크립트 | http://localhost:8080/js/app.js | 200 |
| 지도 데이터 | http://localhost:8080/geo/seoul.js | 200 |
| 실험본 | http://localhost:8080/index_2.0_impec.html | **404** |

> 사전 요건: JDK 8 · Maven 3.6+ · MySQL(외부망) 또는 Oracle(내부망).
> `spring-boot-starter-tomcat`이 `provided`여도 `spring-boot-maven-plugin`이 다시
> 포장하므로 `java -jar`로 뜬다.

### 5-1. IntelliJ에서 실행하기 (외부망 로컬의 표준 경로)

1. **프로젝트 열기** — `kgi-ggreport-web/pom.xml`을 *Open as Project*로 연다.
   (리포 루트를 열었다면 Maven 툴창의 `+`로 이 `pom.xml`을 모듈로 추가한다.)
2. **SDK 지정** — *Project Structure → Project SDK* 를 **JDK 1.8**로.
   Language level도 8이어야 한다. Boot 2.7은 JDK 8 상한이 전제다.
3. **설정 파일 준비** — `config-envs/out-local/application.properties`를
   `config/application.properties`로 복사하고 DB 계정·비밀번호를 채운다.
4. **실행 구성** — `GgReportWebApplication`의 `main`을 실행한다.
   ⚠️ **Working directory를 반드시 `kgi-ggreport-web`(모듈 폴더)으로 둘 것.**
   IntelliJ가 리포 루트를 기본값으로 잡으면 `./config/application.properties`도,
   `file:../frontend/`도 못 찾는다. 화면이 404가 나거나 DB 설정이 통째로 무시된다.
5. http://localhost:8080/ 접속.

**화면은 `frontend/`에서 직접 서빙된다** — `config-envs/out-local`에
`spring.web.resources.static-locations=file:../frontend/,classpath:/static/`이 들어 있다.
두 가지를 해결한다:

- **IntelliJ 자체 빌드는 `pom.xml`의 `../frontend` 리소스를 복사하지 못할 수 있다**
  (모듈 content root 밖의 경로라서). 그 경우에도 화면이 뜬다.
- **`frontend/`를 고치면 재빌드 없이 새로고침만으로 반영된다.**

> ⚠️ 이 모드에서는 `index_*.html`(디자인 실험본)도 열린다 — 빌드 시 제외는 classpath
> 쪽에만 적용되기 때문이다. 실측으로 확인한 차이다(`java -jar` + out-local 설정에서
> `/index_2.0_impec.html` → **200**, 설정 없이 WAR classpath만 쓰면 **404**).
> **배포물(prod)에는 여전히 들어가지 않는다.**

> IntelliJ 빌드가 미덥지 않으면 *Settings → Build Tools → Maven → Runner* 에서
> **Delegate IDE build/run actions to Maven**을 켜면 `mvn`과 같은 결과가 된다.

## 6. WebLogic 배포

```bash
cp config-envs/prod/application.properties config/application.properties
mvn clean package
# → target/kgi-ggreport-web.war
```

WebLogic 콘솔에서 두 리소스를 먼저 만든다 — 이름은 `WEB-INF/web.xml`의
`resource-ref`와 같아야 한다.

| 종류 | JNDI 이름 | 용도 |
|---|---|---|
| DataSource | `jdbc/ggreportDS` | Oracle 접속 (비밀번호를 여기 넣는다) |
| Work Manager | `wm/ggreportWM` | 오케스트레이터 백그라운드 실행 (단계 4) |

- `weblogic.xml`의 `prefer-application-packages`가 Spring·MyBatis·Jackson·HttpClient·
  PDFBox·POI를 WAS 기본 라이브러리보다 우선시킨다. **`org.hibernate.*`는 넣지 않는다** —
  이 프로젝트는 MyBatis를 쓴다.
- ⚠️ `web.xml`의 `metadata-complete`는 **반드시 `false`**여야 한다. `true`면 컨테이너가
  애너테이션 스캔을 건너뛰어 `SpringBootServletInitializer`가 아예 돌지 않는다.
- ⚠️ `web.xml`에 필터를 다시 선언하지 않는다. Boot가 프로그램적으로 등록하며
  `asyncSupported` 기본값이 이미 `true`다. 또 선언하면 필터가 두 번 돈다.
  **새 필터를 직접 추가할 때는 `FilterRegistrationBean`으로 등록하고
  `setAsyncSupported(true)`를 유지할 것** — SSE(대화 탭 스트리밍)가 여기 걸린다.

### 6-1. WAR 안의 배치 (2026-08-27 실측)

이 모듈은 **WAR로 WebLogic에 올라간다.** 새 파일을 넣을 때 아래 배치를 벗어나면
클래스패스에서 안 잡히거나 배포물에 안 실린다. `mvn -o package` 산출물을 열어 확인한 값:

```
kgi-ggreport-web.war
├─ WEB-INF/web.xml, weblogic.xml          ← src/main/webapp/WEB-INF/
├─ WEB-INF/classes/com/kbstar/kgi/…       ← src/main/java/
├─ WEB-INF/classes/mapper/*.xml           ← src/main/resources/mapper/  (7건)
├─ WEB-INF/classes/db/{oracle,mysql}/*.sql← src/main/resources/db/
├─ WEB-INF/classes/static/…               ← 빌드 시 ../frontend 에서 가져온다(§4)
├─ WEB-INF/lib/…                          ← 런타임 의존성
└─ WEB-INF/lib-provided/tomcat-embed-*    ← WebLogic에서는 안 쓰인다(§2)
```

- `mybatis.mapper-locations=classpath:mapper/*.xml`이 WAR 안에서도 그대로 해석된다 —
  `WEB-INF/classes`가 곧 클래스패스 루트다. **`src/main/resources/mapper/` 밖에 두면
  안 잡힌다.**
- 설정(`config/application.properties`)은 **WAR 밖**이다(§3) — 기동 디렉터리에서 읽는다.
- 테스트 클래스는 실리지 않는다(확인함). `org/springframework/boot/loader/…`가 보이는 것은
  `java -jar`로도 뜨게 하는 Boot 런처이고 WebLogic 배포에는 관여하지 않는다.

## 7. 테스트

```bash
mvn test
```

현재 **93건**(2026-08-27 실측, `mvn -o test` `BUILD SUCCESS`) — 골격 스모크 2건 +
골든 비교 하네스 29건 + **Task 2.1의 도메인·Mapper 55건**(§7-2) +
**Task 2.2의 조회 API 7건**(§7-3).

⚠️ `mvn`·`JAVA_HOME`이 셸에 안 잡혀 있을 수 있다. 그러면 `mvn`이 JRE를 잡아
`No compiler is provided`로 죽는다:

```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk1.8.0_202"
$env:PATH = "C:\Users\superuser\tools\apache-maven-3.9.16\bin;" + $env:PATH
```

- 테스트 설정은 `src/test/resources/**`application.properties**`(H2)다.
  `application-test.properties`라는 이름을 **쓰지 않는다** — 프로파일 파일이라 켜는 것을
  잊으면 조용히 무시되고 테스트가 개발용 DB를 잡는다(uploader에서 실제로 그랬다).
- ⚠️ **[2026-08-27 수정] 그 H2 설정이 그동안 안 먹고 있었다.** Boot의 설정 탐색은
  `classpath:/` → `file:./config/` 순이고 **뒤가 이긴다.** surefire 작업 디렉터리가
  모듈 폴더라 §3의 `config/application.properties`(gitignored)가 H2를 덮어,
  **테스트가 로컬 MySQL에 붙고 있었다.** 이 PC엔 MySQL이 떠 있어 그냥 통과했지만
  개발자마다 결과가 갈리고, `databaseId`(§7-2)까지 그 접속의 벤더를 따라간다.
  → pom의 surefire에 `spring.config.location=optional:classpath:/`를 박아 `file:`
  위치를 아예 안 보게 했다. `TestConfigIsolationTest`가 이걸 고정한다.
- ⚠️ **Oracle 의존 테스트를 H2로 대체하지 않는다**(설계 §8). Mapper·DDL 정합성과
  Oracle Text는 내부망 Oracle에서만 판정한다.
- ⚠️ **통합 테스트는 `@SpringBootTest`를 직접 쓰지 말고 `@AppTest`를 쓴다.** 테스트
  스키마는 Oracle 정본 DDL(`001`·`002`)을 그대로 돌리는데 그건 **멱등하지 않고**, H2가
  `DB_CLOSE_DELAY=-1`이라 컨텍스트가 죽어도 DB는 살아 있다. 그래서 스프링 컨텍스트가
  **두 벌** 뜨면 같은 DB에 `001`이 두 번 돌아 `Table "INSTITUTIONS" already exists`로
  죽는다(2026-08-27 실제로 겪음 — `@AutoConfigureMockMvc` 하나가 컨텍스트를 갈랐다).
  애노테이션 조합을 `AppTest` 한 곳에 모아 갈라지지 않게 했다.

### 7-1. 골든 비교 하네스 (Task 1.4)

`src/test/java/.../golden/` — 이관 검증의 **유일한 성공 기준**인 "같은 입력 → 같은 출력"을
집행하는 도구다. 비교 대상은 리포 루트의 `golden/api/*.json` 34건이다.

| 클래스 | 역할 |
|---|---|
| `GoldenNormalizer` | 실행마다 달라지는 값을 지운다 — **`golden/capture.py`의 `_normalize`와 1:1** |
| `GoldenSnapshot` | `{request, status, body}` 로더. `golden/api/` 전체를 **파일명 순서**로 읽는다 |
| `GoldenComparator` | 사람이 읽을 수 있는 차이(JSON 포인터 경로 + 양쪽 값) |
| `GoldenRunner` | 스냅샷을 MockMvc로 재생하고 대조 |

**단계 2에서 쓰는 법**

```java
GoldenRunner runner = new GoldenRunner(mockMvc);
GoldenRunner.Result r = runner.run(snapshot);
if (!r.passed()) fail(r.failure());
```

**정한 것 3가지 (근거는 각 파일 주석에)**

1. **배열 순서는 비교하고, 객체 키 순서는 비교하지 않는다.** 목록 정렬은 화면에 그대로
   보이는 계약이지만, JSON 객체 키 순서는 브라우저가 의존하지 않는다. Python(pydantic
   필드 순서)과 Java(POJO 필드 순서)가 다르다는 이유로 실패시키면 **잡아야 할 진짜
   차이가 소음에 묻힌다.**
2. **`Accept` 헤더를 강제하지 않는다.** `capture.py`가 지정하지 않았기 때문이다.
   `application/json`을 강요하면 JSON이 아닌 응답을 내는 엔드포인트가 실제 동작과
   무관하게 406을 받는다 — 골든과 다른 조건으로 재생하는 셈이다.
3. **러너는 예외를 던지지 않고 `Result`를 돌려준다.** 여러 건을 돌리며 실패를 모아 한
   번에 보고할 수 있어야 해서다.

> ⚠️ **`X-User-Id` 헤더를 반드시 실어야 한다.** 골든 34건 중 **10건**(결재 시나리오
> 15~24번)이 이 헤더로 행위자를 정한다(dave가 임시저장·제출, boss가 승인). 빠지면
> 요청은 성공하지만 **다른 사람이 한 것으로 기록돼** `assignee`/`approver`가 어긋난다 —
> 원인을 찾기 어려운 종류의 실패다. 로더·러너가 이를 처리하고, 회귀 테스트로 고정했다.

하네스 자신도 **스텁 컨트롤러로 검증**했다(통과시켜야 할 것을 통과시키는지, 잡아야 할
것을 잡는지). 이 검증이 없으면 단계 2에서 *"테스트가 통과했다"* 와 *"러너가 아무것도
안 봤다"* 가 구분되지 않는다.

### 7-2. 도메인 + Mapper (Task 2.1)

DB가 없어도 항상 도는 테스트만 둔다(사용자 확정 2026-08-26). **Mapper·DDL의 실검증은
내부망 Oracle의 몫**이고, MySQL 통과는 Oracle 합격의 근거가 되지 않는다.

| 테스트 | 무엇을 고정하나 |
|---|---|
| `DomainJsonContractTest` | POJO 직렬화 **키 집합 == 골든 JSON 키 집합**. snake_case·null 포함도 함께 본다 |
| `MapperStatementBindingTest` | Mapper 메서드 ↔ XML statement **양방향 1:1**, 그리고 **두 방언 모두**에서 바인딩되는지 |
| `DynamicSqlTest` | `getBoundSql()`로 **생성된 SQL 문자열**을 본다 — OGNL 오타·분기·**방언별 SQL 대조** |
| `DomainCopyConstructorTest` | 복사 생성자가 필드를 빠뜨리지 않는지(리플렉션) |
| `InstitutionUpdateInTest` | "안 보냄 ≠ null" 규칙(역직렬화 경로로 확인) |
| `ParticipationDecisionTypeHandlerTest` | CLOB JSON ↔ `List` — NULL/`""`/`[]` 셋 다 빈 목록 |
| `TestConfigIsolationTest` | 테스트가 개발용 DB가 아니라 H2를 잡는지(§7의 2026-08-27 수정) |

#### 방언 분기 — MySQL·Oracle을 **둘 다** 기입한다

`config/MyBatisConfig`가 접속한 DB의 제품명을 읽어 `oracle`/`mysql`을 정하고, Mapper XML의
`databaseId` 속성이 그 값을 본다. **두 문장이 모두 살아 있고 맞는 쪽만 로드된다** — 배포할
때 사람이 주석을 풀 일이 없고, 안 쓰는 쪽이 낡지도 않는다.

⚠️ 이건 2026-08-26의 *"databaseIdProvider 불필요"* 판단을 **뒤집은 것**이다(사용자 확정
2026-08-27). 그때 근거였던 "`SEQ_NO` 덕분에 INSERT가 양쪽 동일"은 지금도 유효하다 —
갈리는 건 **조회** 쪽이다.

| 원본(SQLite) | MySQL 분기 | Oracle 분기 | 왜 갈리나 |
|---|---|---|---|
| `LIMIT ?` | `LIMIT ?` (원본 그대로) | `FETCH FIRST ? ROWS ONLY` | `LIMIT`은 Oracle에 없고 `FETCH FIRST`는 MySQL에 없다 |
| `SELECT DISTINCT bc.* JOIN` | 원본 그대로 | `IN` 서브쿼리(준결합) | Oracle은 **CLOB에 `DISTINCT` 불가**(ORA-00932) |

**갈리지 않는 것**(한 벌로 유지 — `DynamicSqlTest`가 "두 방언이 같다"를 검사한다):

| 원본(SQLite) | 여기 | 왜 한 벌인가 |
|---|---|---|
| `rowid`로 최신 공고 | **`SEQ_NO`** | Oracle `ROWID`는 삽입 순서가 아니라 물리 주소다. 예외 없이 틀린 답이 나오고 **골든도 못 잡는다**(기관당 공고 1건). `IDENTITY`↔`AUTO_INCREMENT`라 INSERT도 한 벌 |
| `ON CONFLICT DO UPDATE` | **UPDATE→0행이면 INSERT** | 여기만 `databaseId`를 못 쓴다 — 방언에 따라 **문장 수가 1↔2로 달라져** 서비스 코드 경로까지 갈린다. 네이티브 형태(`MERGE`/`ON DUPLICATE KEY`)는 XML 주석에 적어 뒀다 |

⚠️ **`databaseId` 분기는 한 쌍이다 — 한쪽만 고치면 다른 DB에 배포할 때까지 아무도 모른다.**
그래서 테스트는 스프링이 띄운 설정 하나만 보지 않고, `MapperConfigurations`가 XML을
**방언별로 각각 파싱**해 양쪽을 같은 무게로 검사한다.

⚠️ 테스트 H2는 `MODE=Oracle`이라 **`oracle` 분기를 로드한다.** 어느 분기를 파싱할지
정하는 것일 뿐 **H2가 Oracle을 검증한다는 뜻이 아니다**(설계 §8).

**되돌리지 말아야 할 계약 3가지**

1. `TaskSummary.final_approver`는 **키로는 있고 값은 언제나 null**이다 — 원본 SELECT에
   컬럼이 없어서 그렇고 골든 `14`가 계약으로 고정했다. Mapper가 친절하게 뽑으면 깨진다.
2. `Task.draft_content`는 **절대 null로 안 나간다**. Oracle이 `''`를 NULL로 바꾸므로
   `Task` 세터가 `null → ""`로 정규화한다. **MySQL에서는 이 결함이 안 드러난다.**
3. JSON은 **snake_case + null 포함**. 이 설정은 `config/JacksonConfig.java`(빈)에 둔다 —
   properties에 두면 기동 디렉터리의 `config/`가 덮거나 테스트 클래스패스의
   `application.properties`가 main 쪽을 통째로 가릴 수 있다.

**아직 없는 것**: Bean Validation. 로컬 `.m2`에 4건(`spring-boot-starter-validation`·
`hibernate-validator`·`jakarta.validation-api`·`jakarta.el`)이 전부 없어 지금 넣으면
`mvn -o`가 깨지고, 내부망 반입 목록도 4건 늘어난다. **골든 34건에 422가 하나도 없어
단계 2 통과에는 불필요**하다 — 실제로 검증이 필요한 입력이 생기면 그때 넣는다.

### 7-3. 조회 REST (Task 2.2)

컨트롤러 8개 / 서비스 10개 / DTO 15개. **읽기만** 있고 쓰기(생성·결재·업로드)는 단계 3~4다.

| 엔드포인트 | 골든 |
|---|---|
| `GET /institutions`, `/{id}`, `/{id}/artifacts`, `/{id}/coverage-map` | `00`·`01`·`02`·`09`·`08` |
| `GET /accounts`, `/menus` | `03`·`04`·`05` |
| `GET /documents?path=` | `06` |
| `GET /consistency` | `07`·`28` |
| `GET /bidcases`, `/bidcases/latest`, `/bidcases/{id}` | `25`·`14` |
| `GET /tasks`, `GET /notifications` | `26`·`27` |

**지금 실제로 대조되는 골든은 6건**(`02`~`07`, `GoldenReadApiTest`)이다. 고른 기준은
하나 — **빈 DB로 답이 정해지는가**. 나머지는 아직 못 본다:

- `00`·`01`·`08`·`09` → 기관 25건 **시드(Task 2.3)** 가 있어야 한다.
- `25`·`26`·`27` → 골든 본문이 결재 시나리오(`10`~`24`) 이후 상태다. 지금은
  `EmptyStateApiTest`가 **빈 상태 계약**(500이 아닌 **200**, `null`이 아닌 **`[]`**)만
  본다. 화면 목록이 `null`을 받으면 그 자리에서 깨지기 때문이다. 겸사겸사 이 테스트가
  방언 분기 SQL을 **실제로 실행하는** 유일한 곳이기도 하다(§7-2의 바인딩 테스트는
  파싱까지만 본다).

**여기서 잡은 것 3가지**

1. **골든 URL은 이미 퍼센트 인코딩돼 있다.** `GoldenRunner`가 문자열을 넘기면 MockMvc가
   그걸 **URI 템플릿**으로 보고 한 번 더 인코딩해서 `%EC`가 `%25EC`가 된다 → 서블릿이
   한 번 디코드하면 컨트롤러엔 `%EC…`라는 글자가 그대로 들어온다. 증상이 인코딩 오류가
   아니라 **"그런 파일 없음 404"** 라 원인을 컨트롤러에서 찾게 된다. `URI.create()`로
   넘겨 고정했다(골든 `06`이 이걸 잡았다).
2. **원문은 개행을 `\n`으로 통일해서 내보낸다.** 코퍼스 `.txt`는 CRLF인데 골든 `06`
   본문엔 CR이 하나도 없다(실측: 파일 CRLF 44개 → 골든 LF 44개). Python이 텍스트 모드로
   읽으며 변환한 결과이므로 `DocumentService.readText`가 같은 변환을 한다.
3. **`list_tasks`에 `ORDER BY`가 없었다.** SQLite는 사실상 삽입 순서로 돌려주지만
   Oracle은 아무 순서도 보장하지 않는다 → `ORDER BY T.SEQ_NO`를 넣었다. §7-2의
   `rowid` 문제와 같은 종류인데 그 목록엔 없던 8+1번째다. 골든 `26`은 행이 1건이라
   **못 잡는다.**

**오류 본문은 `{"detail": …}`** 로 맞춘다(`ApiExceptionHandler`). 스프링 기본 본문
(`timestamp/status/error/path`)이 나가면 골든 `02`가 깨지고, 화면이 읽는 `detail` 키가
없어 오류 문구가 빈칸이 된다 — **상태 코드만 같다고 되는 게 아니다.**

**아직 없는 것**: `.pptx` 원문 열람(단계 3.1 전까지 415), 검색·오케스트레이터 경로.

## 8. 스키마 DDL

`src/main/resources/db/` — **`oracle/`이 정본**, `mysql/`은 외부망 로컬 미러다.
11테이블(registry 7 + 검색 4). 번호 순서대로 **한 번씩** 적용한다(둘 다 멱등하지 않다):

| 스크립트 | 내용 | 검증 |
|---|---|---|
| `001_schema.sql` | 11테이블 + 인덱스 9 | MySQL 미러 2회 연속 적용 성공 / Oracle은 문법만(H2) |
| `002_seq_no.sql` | `BID_CASES`·`TASKS`에 삽입순서 `SEQ_NO` | **MySQL 미러 적용 + 최신공고 질의 실측(2026-08-27)** / Oracle 미검증 |

`002`는 SQLite `rowid` 의존 SQL 8곳을 대체하려고 넣었다(§7-2 표). Oracle
`GENERATED BY DEFAULT AS IDENTITY` ↔ MySQL `AUTO_INCREMENT`라 **INSERT 문이 양쪽
동일**해서 Mapper XML이 한 벌로 끝난다. ⚠️ **Oracle 12c 이상 전제** — 11g면 시퀀스+
트리거로 대체한다(폴백을 파일 끝에 주석으로 적어 뒀다).

상세는 `db/README.md`에 있다:
타입 대응표, 설계 §5-(A)를 조정한 이유(`DRAFT_CONTENT`를 `NOT NULL`로 둘 수 없다),
예약어 때문에 바꾼 컬럼명 3건, SQLite와 달리 외래키가 실제로 강제된다는 점.

아직 없는 것 둘: **Oracle Text `CONTEXT` 인덱스**(문의 3 회신 대기)와
**`ORCH_RUN`/`ORCH_STEP`**(단계 4에서 설계).

⚠️ **Oracle 정본은 아직 문법만 확인됐다**(H2 `MODE=Oracle`). 실검증은 내부망 Oracle에서
처음 이뤄진다 — H2 통과는 이 파일이 다루는 쟁점(`''`→NULL·CLOB·예약어)을 검증하지 못한다.

## 9. 폐쇄망 의존성 반입

`dependencies.txt`가 반입 명세다 — 손으로 적은 목록이 아니라 `mvn dependency:list`
산출물을 떠 놓은 것이다(손 목록은 추이 의존성을 반드시 놓친다).

**합격 기준은 `mvn -o`(오프라인) 통과**다. 온라인 빌드 성공은 반입 완전성의 증명이
되지 않는다. `mysql-connector-j`는 외부망 로컬 전용이라 반입 대상에서 제외한다.
