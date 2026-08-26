# kgi-ggreport-web

입찰 워크플로우 지원 시스템의 **Java 이관 모듈**. 현재 Python(FastAPI + LangGraph)으로
도는 시스템을 당행 표준 플랫폼(WebLogic + Oracle + JDK 8)으로 옮긴 것이다.

- **설계(정본)**: `docs/superpowers/specs/2026-08-05-weblogic-java-migration-design.md`
- **구현계획**: `docs/superpowers/plans/2026-08-10-weblogic-java-migration.md`
- **검증 기준**: `golden/` — "같은 입력 → 같은 출력" 비교가 이관 검증의 전부다.
  화면이 안 바뀌므로 이 비교가 통과하면 화면도 통과한다.

## 진행 상태 (2026-08-26)

| 단계 | 상태 |
|---|---|
| 0 · 골든 파일 | ✅ 완료 — `golden/` |
| **1 · 골격** | ✅ **완료** — 이 모듈. 대시보드가 WAR에서 뜨고 데이터는 비어 있다 |
| 2 · 조회 REST | ⬜ 미착수 |
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
# 1) DB 준비 — 스키마 DDL은 Task 1.3 산출물이다(아직 없다).
#    지금은 빈 스키마만 있으면 골격이 뜬다.
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS ggreportdb DEFAULT CHARSET utf8mb4;"
mysql -u root -p -e "CREATE USER IF NOT EXISTS 'ggreport'@'localhost' IDENTIFIED BY '<원하는-비밀번호>'; \
                     GRANT ALL PRIVILEGES ON ggreportdb.* TO 'ggreport'@'localhost'; FLUSH PRIVILEGES;"

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

## 7. 테스트

```bash
mvn test
```

현재는 골격 스모크 테스트뿐이다(컨텍스트가 뜨는가 · DataSource가 구성되는가).
단계 2부터 `golden/api/*.json`과의 비교 테스트로 범위를 넓힌다.

- 테스트 설정은 `src/test/resources/**`application.properties**`(H2)다.
  `application-test.properties`라는 이름을 **쓰지 않는다** — 프로파일 파일이라 켜는 것을
  잊으면 조용히 무시되고 테스트가 개발용 DB를 잡는다(uploader에서 실제로 그랬다).
- ⚠️ **Oracle 의존 테스트를 H2로 대체하지 않는다**(설계 §8). Mapper·DDL 정합성과
  Oracle Text는 내부망 Oracle에서만 판정한다.

## 8. 폐쇄망 의존성 반입

`dependencies.txt`가 반입 명세다 — 손으로 적은 목록이 아니라 `mvn dependency:list`
산출물을 떠 놓은 것이다(손 목록은 추이 의존성을 반드시 놓친다).

**합격 기준은 `mvn -o`(오프라인) 통과**다. 온라인 빌드 성공은 반입 완전성의 증명이
되지 않는다. `mysql-connector-j`는 외부망 로컬 전용이라 반입 대상에서 제외한다.
