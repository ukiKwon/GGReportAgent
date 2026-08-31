# Uploader — 파일 업로드 & 분류 서비스

KB Financial AI 2 Center에서 운영하는 파일 수신·분류 서버입니다.  
외부 시스템(기관)으로부터 파일을 HTTP로 수신하고, 파일명 규칙에 따라 자동 분류한 뒤 지정 디렉터리에 보관합니다.

> ⚠️ **2026-08-26 교정 — 이 문서는 실물 코드와 여러 곳이 달랐습니다.**
> WebLogic/Java 이관 구현계획(Task 1.1)이 이 프로젝트의 골격을 출발점으로 삼기 때문에,
> 인용 전에 `src/` · `pom.xml` · `config-envs/` 실물과 대조해 아래를 고쳤습니다.
>
> | 고친 곳 | 종전 기술 | 실물 |
> |---|---|---|
> | §2 기술 스택 | Spring Data JPA / Hibernate ORM | **MyBatis** (JPA 애너테이션 0개, Mapper XML 2개) |
> | §7 환경별 설정 | `application-local.properties` / H2 프로파일 3종 | **`config-envs/{env}/` → `config/` 복사 방식, 5축** |
> | §1·§12 DB | Oracle 전용, 시퀀스 채번 | **Oracle(내부망) / MySQL(외부망 로컬) / H2(테스트)**, `AUTO_INCREMENT` |
> | §6 API | 관리 화면 11개만 | **REST API `/api/files/*` 2개 누락**, 화면 4개 누락 |
> | §9 기동 | H2 인메모리, `/tmp/uploader-local` | **MySQL, `C:/uploader-out-local`**, H2 콘솔 미설정 |
> | §11 테스트 | H2로 `application-test.properties` 자동 적용 | **DB 없이 돈다** (Mapper 전부 `@MockBean`) |
>
> 함께 발견한 정리 대상 3건은 [§13 알려진 불일치](#13-알려진-불일치정리-대상)에 적었습니다.

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택](#2-기술-스택)
3. [아키텍처 요약](#3-아키텍처-요약)
4. [파일명 규칙](#4-파일명-규칙)
5. [저장 디렉터리 구조](#5-저장-디렉터리-구조)
6. [API 엔드포인트](#6-api-엔드포인트)
7. [환경별 설정](#7-환경별-설정)
8. [서버 주소·포트 설정 (외부 API 호출 대응)](#8-서버-주소포트-설정-외부-api-호출-대응)
9. [로컬 개발 환경 기동](#9-로컬-개발-환경-기동)
10. [운영(WebLogic) 배포](#10-운영weblogic-배포)
11. [테스트 실행](#11-테스트-실행)
12. [데이터베이스 구조](#12-데이터베이스-구조)
13. [알려진 불일치(정리 대상)](#13-알려진-불일치정리-대상)

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **역할** | 외부 기관 파일 수신 + 자동/수동 분류 + 대시보드 조회 + 파일 검색·다운로드 REST API |
| **배포 형태** | WAR → Oracle WebLogic (운영), 내장 톰캣 (로컬 개발) |
| **데이터베이스** | **Oracle** (내부망 `local`/`dev`/`stg`/`prod`) · **MySQL** (외부망 로컬 `out-local`) · **H2** (단위 테스트용 설정만 존재, §11 참조) |
| **영속화** | **MyBatis** (Mapper 인터페이스 + XML). JPA/Hibernate 아님 |
| **파일 저장** | 서버 로컬 파일시스템 (`upload.base-dir` 경로 하위) |

---

## 2. 기술 스택

| 구성 요소 | 버전 / 내용 |
|-----------|------------|
| Java | 1.8 |
| Spring Boot | 2.7.18 (JDK 8을 지원하는 마지막 계열) |
| **영속화** | **MyBatis** — `mybatis-spring-boot-starter` 2.3.2 |
| Spring Data Commons | `Page`/`Pageable`/`PageImpl` **타입만** 사용 (JPA 리포지토리 없음) |
| 뷰 템플릿 | Thymeleaf 3 (+ `thymeleaf-extras-java8time`, `#temporals`) |
| Oracle JDBC | ojdbc8 21.7.0.0 |
| MySQL JDBC | `mysql-connector-j` (**외부망 로컬 전용**) |
| H2 Database | `test` 스코프 |
| Apache PDFBox | 2.0.29 (PDF 텍스트 추출) |
| Apache POI | 5.2.3 (XLSX 내보내기/가져오기) |
| Jackson | `jackson-databind` (JSON import/export) |
| 테스트 | JUnit 4.13 + `junit-vintage-engine` (Boot 2.7 기본은 JUnit 5이므로 명시 추가) |
| 빌드 도구 | Maven 3 |
| WAS | Oracle WebLogic (운영) / 내장 Tomcat (로컬, `provided` 스코프) |

> ⚠️ **JPA/Hibernate 의존성은 `pom.xml`에 없습니다.** 도메인 클래스(`Institution`,
> `UploadedFile`)에 JPA 애너테이션이 하나도 없고, SQL은 전부
> `src/main/resources/mapper/*.xml`에 있습니다. 종전 README의 "Spring Data JPA /
> Hibernate ORM" 표기는 MyBatis 전환 전 흔적입니다(§13-③ 참조).

---

## 3. 아키텍처 요약

```
외부 기관 / 내부 시스템
        │  HTTP POST /upload (multipart)   ·   GET /api/files/* (REST)
        ▼
┌─────────────────────────────────────────────┐
│              Uploader Server                 │
│                                             │
│  화면 컨트롤러 (Thymeleaf) — KGI1xxxx 명명    │
│    ├─ KGI10000  /                 Dashboard │
│    ├─ KGI11000  /upload           업로드 폼 │
│    ├─ KGI11100  /upload (POST)    업로드    │
│    ├─ KGI12000  /file-status      미분류    │
│    ├─ KGI12100  …/{id}/classify   수동분류  │
│    ├─ KGI12200  …/{id}/delete     삭제      │
│    ├─ KGI12300  …/{id}/reject     반려      │
│    ├─ KGI12400  /file-status/classified     │
│    ├─ KGI12500  …/cleanup-dirs    빈 폴더   │
│    └─ KGI130xx  /institutions     기관 관리 │
│                                             │
│  REST 컨트롤러                                │
│    └─ FileSearchApiController  /api/files   │
│         ├─ GET /search        검색+본문추출 │
│         └─ GET /{id}/download Base64 반환   │
│                                             │
│  서비스                                      │
│    ├─ FileUploadService                     │
│    │    ├─ FileParserService     파일명 파싱 │
│    │    ├─ FileStorageService    unclassified/ │
│    │    └─ ClassificationService 기관→classified/ │
│    └─ FileContentService  PDFBox/POI 텍스트 추출 │
│                                             │
│  반복 작업 (reclassification.cron, 기본 5분)  │
│    ReclassificationTrigger                  │
│      └─▶ BackgroundScheduler                │
│           ├─ TimerManagerScheduler (WebLogic)│
│           └─ LocalScheduler  (로컬·테스트)   │
│      └─▶ ReclassificationJob 미분류 재시도   │
└─────────────────────────────────────────────┘
        │
        ▼
  파일시스템 (upload.base-dir)
  DB — MyBatis Mapper ─▶ Oracle(내부망) / MySQL(외부망 로컬)
```

> **컨트롤러 명명 규칙**: 파일·클래스명이 `KGI{화면ID}${역할}` 형태입니다
> (예: `KGI12100$FileStatusClassify`). 화면 하나에 컨트롤러 하나를 두는 구조라
> `@RequestMapping` 경로가 여러 클래스에 나뉘어 있습니다 — 경로로 코드를 찾을 때는
> 클래스명이 아니라 `@*Mapping` 값을 grep하는 편이 빠릅니다.

---

## 4. 파일명 규칙

업로드 파일은 아래 규칙을 따라야 자동 분류됩니다.

```
{연도}_{기관명}_{설명}.{확장자}
```

| 항목 | 규칙 |
|------|------|
| 연도 | 4자리 숫자 (예: `2024`) |
| 기관명 | 기관 마스터에 등록된 이름과 일치해야 자동 분류 |
| 설명 | 자유 텍스트, 내부 `_` 허용 |
| 확장자 | `pdf`, `hwp`, `md` 만 허용 (`FileParserService.ALLOWED_EXTENSIONS`) |

**예시**

```
2024_KB국민은행_분기보고서.pdf
2024_KB증권_리스크현황_Q1.hwp
```

규칙에 맞지 않거나 기관 마스터에 없는 경우 → `UNCLASSIFIED` 상태로 보관 후 수동 분류 가능.

> **참고**: 업로드 허용 확장자(`pdf`/`hwp`/`md`)와 **본문 텍스트 추출 지원 형식은
> 범위가 다릅니다.** `FileContentService`는 `md`·`txt`·`pdf`·`xlsx`·`xls`·`hwpx`·`hwp`를
> 다룹니다 — 이미 저장돼 있는 파일을 읽는 경로(검색 API)이기 때문입니다.

---

## 5. 저장 디렉터리 구조

`upload.base-dir` 하위에 생성됩니다. **환경별 실제 값은 §7 표를 보십시오**
(내부망 서버는 `/app/uploader`, 로컬은 `C:/uploader-local` 계열).

```
{upload.base-dir}/
├── unclassified/          # 업로드 직후 또는 분류 실패 파일
│   └── 2024_KB국민은행_보고서.pdf
└── classified/
    └── {카테고리}/
        └── {연도}/
            └── {기관명}/
                └── 2024_KB국민은행_보고서.pdf
```

카테고리는 파일명이 아니라 **기관 마스터(`INSTITUTION.CATEGORY`)에서 옵니다** —
기관을 찾지 못하면 분류가 일어나지 않습니다(`ClassificationService`).

---

## 6. API 엔드포인트

### 6-1. 파일 검색·다운로드 REST API (`/api/files`)

`FileSearchApiController` — **JSON을 반환하는 유일한 컨트롤러**입니다. 외부 시스템이
이 서버의 보관 파일을 조회할 때 쓰는 경로입니다.

```
GET /api/files/search?institution=&year=&keyword=
```

| 파라미터 | 기본값 | 설명 |
|---|---|---|
| `institution` | `""` | 기관명 |
| `year` | `""` | 연도 4자리 |
| `keyword` | `""` | 파일명 키워드 |

**응답**: `{ "items": [ { id, originalName, institutionName, year, category, status,
uploadedAt, content } ] }` — `content`는 `FileContentService`가 추출한 **본문
텍스트**입니다(PDFBox/POI). 매 호출마다 파일을 읽어 추출하므로 건수가 많으면 느립니다.

```
GET /api/files/{id}/download
```

**응답**: `{ id, fileName, mimeType, size, content }` — `content`는 **Base64 문자열**
입니다(바이너리 스트림이 아닙니다). MIME은 `pdf`/`hwp`/`hwpx`/`xlsx`/`xls`를 매핑하고
나머지는 `application/octet-stream`입니다.

**404 조건**: 레코드가 없거나 `status = DELETED`이거나, 디스크에 파일이 없을 때.
오류 응답은 `{ "error": "…" }` 형태입니다.

### 6-2. 파일 업로드 (외부 시스템에서 호출)

```
POST /upload
Content-Type: multipart/form-data

파라미터: files  (MultipartFile, 복수 가능)
```

**응답**: HTTP 200 + **HTML 뷰** (업로드 결과 목록) — JSON이 아닙니다.

**curl 예시**

```bash
curl -X POST http://{서버IP}:{포트}/upload \
  -F "files=@2024_KB국민은행_보고서.pdf" \
  -F "files=@2024_KB증권_현황.hwp"
```

### 6-3. 관리 화면 (브라우저)

| URL | 컨트롤러 | 설명 |
|-----|---|-----|
| `GET /` | `KGI10000` | 대시보드 (전체 통계, 최근 업로드, 기관 검색) |
| `GET /upload` | `KGI11000` | 파일 업로드 폼 |
| `POST /upload` | `KGI11100` | 업로드 처리 |
| `GET /file-status` | `KGI12000` | 미분류 파일 목록 + 수동 분류 |
| `POST /file-status/{id}/classify` | `KGI12100` | 수동 분류 처리 |
| `POST /file-status/{id}/delete` | `KGI12200` | 파일 삭제 (`status=DELETED`) |
| `POST /file-status/{id}/reject` | `KGI12300` | 파일 반려 (`status=REJECTED`) |
| `GET /file-status/classified` | `KGI12400` | 분류 완료 목록 |
| `POST /file-status/cleanup-dirs` | `KGI12500` | 빈 디렉터리 정리 |
| `GET /institutions` | `KGI13000` | 기관 마스터 목록 |
| `POST /institutions` | `KGI13100` | 기관 등록/수정 |
| `POST /institutions/{id}/delete` | `KGI13200` | 기관 삭제 |
| `GET /institutions/export/json` | `KGI13300` | 기관 목록 JSON 다운로드 |
| `GET /institutions/export/xlsx` | `KGI13310` | 기관 목록 XLSX 다운로드 |
| `POST /institutions/import/json` | `KGI13400` | 기관 목록 JSON 일괄 등록 |
| `POST /institutions/import/xlsx` | `KGI13410` | 기관 목록 XLSX 일괄 등록 |

---

## 7. 환경별 설정

### 7-1. 방식 — Spring 프로파일이 아니라 **설정 파일 교체**입니다

`config-envs/{환경}/application.properties` 중 하나를 **`config/application.properties`로
복사**해서 씁니다. Spring Boot가 실행 디렉터리의 `./config/`를 기본 설정 위치로
읽기 때문에 동작합니다.

```bash
# 예: 외부망 로컬로 기동하려면
cp config-envs/out-local/application.properties config/application.properties
```

> ⚠️ **`--spring.profiles.active=local` 은 이 프로젝트에서 동작하지 않습니다.**
> `application-local.properties` 같은 프로파일 파일이 존재하지 않기 때문입니다
> (종전 README의 설명은 사실과 다릅니다). 파일 5개는 전부 이름이
> `application.properties`이고 **디렉터리로만 구분**됩니다.

### 7-2. 환경 5축

| 망 | 디렉터리 | DB | 접속 | `upload.base-dir` |
|---|---|---|---|---|
| 내부망 로컬 | `config-envs/local/` | **Oracle** | `jdbc:oracle:thin:@//localhost:1521/ORCL` | `C:/uploader-local` |
| 내부망 개발 | `config-envs/dev/` | **Oracle** | thin (`<DEV-DB-HOST>`) | `/app/uploader` |
| 내부망 스테이징 | `config-envs/stg/` | **Oracle** | thin (`<STG-DB-HOST>`) | `/app/uploader` |
| 내부망 운영 | `config-envs/prod/` | **Oracle** | **JNDI** `java:comp/env/jdbc/uploaderDS` | `/app/uploader` |
| **외부망 로컬** | `config-envs/out-local/` | **MySQL** | `jdbc:mysql://localhost:3306/uploaderdb` | `C:/uploader-out-local` |

- `prod`를 뺀 4개는 `spring.autoconfigure.exclude=…JndiDataSourceAutoConfiguration`으로
  JNDI 자동설정을 끄고 직접 URL로 접속합니다. `prod`만 JNDI를 씁니다.
- **DB 계정·비밀번호는 `<PLACEHOLDER>`로 비워져 있습니다** — 사용할 때 채웁니다.

### 7-3. 운영(`prod`) 설정 전문

```properties
spring.datasource.jndi-name=java:comp/env/jdbc/uploaderDS
upload.base-dir=/app/uploader
reclassification.cron=0 */5 * * * *
```

> ⚠️ **`prod`·`dev`·`stg`에는 `mybatis.*` 설정이 없습니다.** `local`·`out-local`에만
> `mapper-locations`·`type-aliases-package`·`map-underscore-to-camel-case`가 들어
> 있습니다. 내부망 배포 전에 의도된 것인지 확인이 필요합니다(§13-①).

### 7-4. 업로드 크기 제한

`spring.servlet.multipart.max-file-size` / `max-request-size`는 **현재 어느 설정
파일에도 없습니다** — Spring Boot 기본값(1MB / 10MB)이 적용됩니다. 큰 파일을 받아야
하면 사용하는 `config/application.properties`에 직접 추가하십시오.

```properties
spring.servlet.multipart.max-file-size=100MB
spring.servlet.multipart.max-request-size=200MB
```

---

## 8. 서버 주소·포트 설정 (외부 API 호출 대응)

외부 시스템이 이 서버의 특정 IP나 포트로 파일을 전송해야 할 때 아래 설정을 조정합니다.

### 8-1. 포트 변경

`config/application.properties`:

```properties
server.port=9090
```

### 8-2. 특정 IP(네트워크 인터페이스)만 바인딩

기본은 모든 인터페이스(`0.0.0.0`) 바인딩입니다. 특정 IP만 허용하려면:

```properties
server.address=192.168.10.50
```

### 8-3. 컨텍스트 경로(context-path) 변경

WebLogic 배포 시 컨텍스트 경로가 `/uploader` 등으로 지정되는 경우:

```properties
server.servlet.context-path=/uploader
```

이후 업로드 엔드포인트는 `/uploader/upload`가 됩니다.

### 8-4. 환경 변수로 런타임 오버라이드

WAR 기동 시 JVM 인자 또는 환경 변수로 덮어쓸 수 있습니다:

```bash
# JVM 인자
java -jar target/uploader-1.0.0.war --server.port=9090 --server.address=10.0.0.1

# 환경 변수 (Spring Boot 규칙: 점(.) → 언더스코어(_), 대문자)
export SERVER_PORT=9090
export SERVER_ADDRESS=10.0.0.1
export UPLOAD_BASE_DIR=/data/uploader
```

### 8-5. WebLogic 배포 시 주의사항

운영 환경은 WebLogic이 포트와 네트워크 바인딩을 관리합니다.  
`server.port` / `server.address` 설정은 **내장 Tomcat 전용**이며 WebLogic에서는 무시됩니다.  
WebLogic의 리스닝 포트·채널 설정은 WebLogic 관리 콘솔에서 별도로 설정합니다.

| 설정 위치 | 적용 대상 |
|----------|----------|
| `config/application.properties` | 로컬 내장 Tomcat |
| WebLogic Admin Console | 운영 WebLogic |
| `weblogic.xml` | 클래스로더 패키지 우선순위 (패키지 충돌 방지) |

---

## 9. 로컬 개발 환경 기동

### 사전 요건

- JDK 8
- Maven 3.6 이상
- **DB** — 외부망이면 MySQL(`uploaderdb` 스키마), 내부망이면 Oracle.
  **인메모리 H2로는 기동되지 않습니다**(설정 파일에 H2 항목이 없습니다).

### DB 준비 (외부망 로컬 / MySQL)

```bash
# uploader/ 에서 실행. 스키마 생성 DDL은 두 곳에 있고 내용이 같다(끝 개행만 다름):
#   src/main/resources/schema-mysql.sql   ← 정본으로 쓸 것
#   "database_table 생성query.txt"         ← uploader/ 바로 아래의 사본
mysql -u root -p -e "CREATE DATABASE uploaderdb DEFAULT CHARSET utf8mb4;"
mysql -u root -p uploaderdb < src/main/resources/schema-mysql.sql

# 앱 전용 계정 생성 — 설정 파일에 root를 넣지 않기 위한 것이다.
# 파일이 유출돼도 피해가 uploaderdb 하나로 제한된다(실제로 한 번 유출됐다, §13).
mysql -u root -p -e "CREATE USER IF NOT EXISTS 'uploader'@'localhost' IDENTIFIED BY '<원하는-비밀번호>'; \
                     GRANT ALL PRIVILEGES ON uploaderdb.* TO 'uploader'@'localhost'; FLUSH PRIVILEGES;"
```

> `schema-mysql.sql`은 **자동 실행되지 않습니다** — `spring.sql.init.*` 설정이
> 운영·로컬 어느 파일에도 없습니다(테스트용 설정에만 있습니다). 위처럼 손으로 넣으십시오.

### 빌드 및 기동

```bash
cd uploader

# 1) 환경 선택 — 설정 파일을 복사한다 (프로파일 인자가 아니다, §7-1)
cp config-envs/out-local/application.properties config/application.properties
#    → config/application.properties 의 username/password 를 채운다

# 2) 기동
mvn spring-boot:run
```

또는 WAR로 패키징 후 실행:

```bash
mvn clean package -DskipTests
java -jar target/uploader-1.0.0.war
```

> `spring-boot-starter-tomcat`이 `provided` 스코프라도 `spring-boot-maven-plugin`이
> WAR를 실행 가능하게 다시 포장하므로 `java -jar`로 뜹니다.

### 기동 확인

| 항목 | URL |
|------|-----|
| 대시보드 | http://localhost:8080/ |
| 업로드 화면 | http://localhost:8080/upload |
| 파일 상태 | http://localhost:8080/file-status |
| 분류 완료 | http://localhost:8080/file-status/classified |
| 기관 관리 | http://localhost:8080/institutions |
| 검색 API | http://localhost:8080/api/files/search |

> **H2 콘솔(`/h2-console`)은 없습니다** — `spring.h2.console.enabled` 설정이 없고
> H2가 `test` 스코프라 런타임 클래스패스에 없습니다.

### 로컬 파일 저장 경로

`out-local` 기준으로 `C:/uploader-out-local/` 하위에 저장됩니다(§7-2 표).

```
C:/uploader-out-local/unclassified/
C:/uploader-out-local/classified/
```

---

## 10. 운영(WebLogic) 배포

### WAR 빌드

```bash
cd uploader
cp config-envs/prod/application.properties config/application.properties
mvn clean package -DskipTests
# → target/uploader-1.0.0.war 생성
```

### WebLogic JNDI DataSource 설정

WebLogic 관리 콘솔에서 JNDI 이름 `jdbc/uploaderDS` 로 Oracle DataSource를 등록합니다.

| 항목 | 값 |
|------|-----|
| JNDI Name | `jdbc/uploaderDS` |
| URL | `jdbc:oracle:thin:@{DB호스트}:{포트}/{서비스명}` |
| Driver | `oracle.jdbc.OracleDriver` |

### 배포

1. WebLogic Admin Console → 배포(Deployments) → `uploader-1.0.0.war` 업로드
2. 컨텍스트 루트 설정 (예: `/uploader` 또는 `/`)
3. 활성화(Activate)

> `weblogic.xml`의 `prefer-application-packages` 설정으로 Spring, MyBatis, Jackson,
> SLF4J/Logback, Commons 등 애플리케이션 내장 라이브러리가 WebLogic 기본
> 라이브러리보다 우선 적용됩니다.

### 스케줄러 — CommonJ TimerManager (2026-08-31 전환 완료)

> 종전 경고: *"`@Scheduled`가 자기 스레드를 만들어 WebLogic 배포 표준에 어긋난다"* —
> **해소됐습니다.** `@EnableScheduling`·`@Scheduled`를 걷어내고 컨테이너가 주는
> 스레드를 쓰도록 바꿨습니다.

**왜 바꿨나.** 앱이 직접 만든 스레드는 컨테이너가 모릅니다 — ⓐ 재배포해도 안 죽어
옛 클래스로더가 안 풀리고(메모리 누수) ⓑ 트랜잭션·보안 컨텍스트·JNDI 환경이 안 실리며
ⓒ WAS 콘솔 모니터링과 스레드 덤프에 안 잡혀 장애 추적이 안 됩니다.

**구조**

| 클래스 | 역할 |
|---|---|
| `job/BackgroundScheduler` | "지연 뒤 한 번 실행" 인터페이스 |
| `job/TimerManagerScheduler` | CommonJ **TimerManager** 경로 (WebLogic) |
| `job/LocalScheduler` | 자바 표준 스케줄러 폴백 (외부망 로컬·테스트 전용) |
| `job/ReclassificationTrigger` | cron으로 다음 시각을 계산해 **매번 다시 예약** |
| `job/ReclassificationJob` | 재분류 자체. **언제 도는지는 모릅니다** |

- ⚠️ 반복 실행이라 `commonj.work.WorkManager`(1회성 작업용, 본체 `kgi-ggreport-web`이
  쓰는 것)가 아니라 **`commonj.timers.TimerManager`** 입니다.
- **주기의 근거는 `reclassification.cron` 한 곳입니다.** TimerManager는 cron을 모르고
  고정 주기(ms)만 받으므로, 밀리초 주기를 따로 두면 두 벌이 되어 조용히 갈립니다.
  그래서 매 실행 뒤 다음 cron 시각까지의 지연을 계산해 1회성 예약을 다시 겁니다.
- **다음 예약은 `finally`에서 겁니다** — 한 번 실패했다고 반복이 멈추면 증상이
  "미분류가 계속 쌓인다"로만 나타나 원인을 찾기 어렵습니다.
- `commonj.*`는 **컴파일 의존성이 아닙니다**(오프라인 빌드가 합격 기준이고 `.m2`에
  없습니다). JNDI로 받은 객체에 리플렉션 + 동적 프록시로 붙습니다 — 본체
  `WorkManagerExecutor`와 같은 이유·같은 방식입니다.

**WebLogic 콘솔에서 할 일**: `timer/uploaderTM` 이름으로 Timer Manager를 만듭니다
(`WEB-INF/web.xml`의 `resource-ref`와 같아야 합니다). 이름을 바꾸려면
`uploader.timer-manager-jndi` 설정도 같이 바꿉니다(기본값
`java:comp/env/timer/uploaderTM`).

> ⚠️ **못 찾아도 앱은 뜹니다** — 로컬 스케줄러로 떨어지고 **WARN을 크게 남깁니다.**
> 운영 기동 로그에 `TimerManager(...)를 못 찾아 로컬 스케줄러로 돈다`가 보이면
> 설정이 잘못된 것입니다(앱이 컨테이너 몰래 스레드를 만드는 상태로 돌아간 것입니다).
>
> ⚠️ **`TimerManagerScheduler`는 WebLogic에서만 실검증됩니다.** 로컬·테스트에서는
> JNDI 조회가 실패해 이 코드가 아예 안 돕니다. 그 공백을 메우려고
> `src/test/java/commonj/timers/`에 규격 스텁을 두고 리플렉션 규약만 미리 밟습니다
> (`TimerManagerSchedulerTest`) — **스텁이 진짜 규격과 같다는 전제** 위에 있습니다.

---

## 11. 테스트 실행

```bash
cd uploader
mvn test
```

**DB가 없어도 돕니다.** 테스트 14개 파일 · **62건 전부 통과**
(2026-08-31 실측, Maven 3.9.16 + JDK 1.8.0_202, `BUILD SUCCESS`).

| 유형 | 파일 | 비고 |
|---|---|---|
| `@WebMvcTest` + MockMvc | `UploadControllerTest`, `FileSearchApiControllerTest` | Mapper·Service를 **전부 `@MockBean`** 으로 대체 |
| `@RunWith(MockitoJUnitRunner)` | `FileUploadServiceTest`, `ReclassificationJobTest` | |
| 순수 JUnit | `ClassificationServiceTest`, `FileContentServiceTest`, `FileParserServiceTest`, `FileStorageServiceTest`, `InstitutionServiceTest` | |
| Mapper XML 파싱 | `MapperDialectTest` | **DB·스프링 없이** oracle/mysql 두 방언을 각각 파싱(§13-①-C) |
| 설정 파일 대조 | `ConfigEnvsTest` | `config-envs/` 5개 환경의 키 누락을 막습니다(§13-①) |
| `@SpringBootTest` | `ApplicationContextTest` | **전체 기동 경로**를 실제로 밟습니다 — 나머지는 슬라이스라 안 밟습니다 |
| CommonJ 리플렉션 | `TimerManagerSchedulerTest` | `commonj.timers` 스텁으로 규약만 검증(§10) |
| 반복 규약 | `ReclassificationTriggerTest` | 실패해도 다음을 예약하는지 — 시계를 기다리지 않습니다 |

- 러너는 **JUnit 4**(`SpringRunner`/`MockitoJUnitRunner`)입니다 — `pom.xml`이
  `junit-vintage-engine`을 명시 추가한 이유입니다.
- 테스트 설정은 **`src/test/resources/application.properties`** (H2 인메모리 +
  `schema-mysql.sql` 자동 적재 + MyBatis)입니다. 테스트 클래스패스에만 있고 **WAR에는
  들어가지 않습니다.** 프로파일 스위치가 필요 없으므로 켜는 것을 잊을 수 없습니다.
  - *2026-08-26 개명 — 종전 이름 `application-test.properties`는 `test` 프로파일이
    켜져야 읽히는 파일인데 켜는 곳이 없어 한 번도 적용되지 않았습니다(§13-②).*
  - 현재 테스트는 Mapper를 전부 `@MockBean`으로 대체해 **이 DataSource를 쓰지
    않습니다.** 이 설정은 앞으로 Mapper 통합 테스트를 붙일 때를 위한 준비입니다.

---

## 12. 데이터베이스 구조

DDL은 **두 벌**입니다(2026-08-31).

| 파일 | 대상 | 쓰이는 곳 |
|------|------|-----------|
| `src/main/resources/schema-oracle.sql` | Oracle | 내부망 `local`·`dev`·`stg`·`prod` — DBA가 직접 적용 |
| `src/main/resources/schema-mysql.sql` | MySQL | 외부망 `out-local`, 그리고 테스트 H2(`spring.sql.init`) |

**한쪽이 바뀌면 같은 커밋에서 다른 쪽도 바꿉니다.** 아래 표의 타입은 MySQL 기준이며,
Oracle 쪽 대응과 바꾼 이유 5가지는 `schema-oracle.sql` 머리말에 적어 두었습니다.
(`uploader/database_table 생성query.txt`는 MySQL 판의 사본 — 끝 개행만 다릅니다.)

> ⚠️ 본체(`kgi-ggreport-web`)에도 `db/oracle/007_uploader.sql`이 있습니다. 그쪽은
> uploader 테이블을 **본체 스키마 안에 합칠 때**(단계 6)의 초안이라 시각을
> `VARCHAR2(40 CHAR)` ISO 문자열로 두고, 이쪽은 uploader **단독**이라 `TIMESTAMP`를
> 씁니다. **의도된 차이**이며 둘을 합칠지는 단계 6에서 정합니다.

### UPLOADED_FILE 테이블

| 컬럼 | 타입 (MySQL) | 설명 |
|------|------|------|
| ID | `BIGINT` PK **AUTO_INCREMENT** | 시퀀스 아님 |
| ORIGINAL_NAME | `VARCHAR(500)` NOT NULL | 원본 파일명 |
| STORED_PATH | `VARCHAR(1000)` NOT NULL | 현재 저장 경로 |
| FILE_YEAR | `VARCHAR(4)` | 파일명에서 파싱된 연도 |
| INSTITUTION_NAME | `VARCHAR(200)` | 파일명에서 파싱된 기관명 |
| CATEGORY | `VARCHAR(100)` | 분류 카테고리 (기관 마스터에서 복사) |
| STATUS | `VARCHAR(20)` NOT NULL DEFAULT `'UNCLASSIFIED'` | `UNCLASSIFIED` / `CLASSIFIED` / `REJECTED` / `DELETED` |
| UPLOADED_AT | `DATETIME` NOT NULL | 업로드 일시 |
| CLASSIFIED_AT | `DATETIME` | 분류 완료 일시 |

### INSTITUTION 테이블

| 컬럼 | 타입 (MySQL) | 설명 |
|------|------|------|
| ID | `BIGINT` PK **AUTO_INCREMENT** | 시퀀스 아님 |
| NAME | `VARCHAR(200)` NOT NULL, UNIQUE(`UK_INSTITUTION_NAME`) | 기관명 (파일명과 매핑 키) |
| CATEGORY | `VARCHAR(100)` NOT NULL | 분류 카테고리 |
| MODIFIED_AT | `DATETIME` NOT NULL | 최종 수정 일시 |

> **Oracle 판에서 달라지는 것**(`schema-oracle.sql`에 반영 완료):
> `AUTO_INCREMENT` → **시퀀스** `UPLOADED_FILE_SEQ`·`INSTITUTION_SEQ`(Mapper의
> `oracle` 분기가 이 이름을 부르므로 **바꾸면 안 됩니다**), `DATETIME` → `TIMESTAMP`,
> `VARCHAR(n)` → `VARCHAR2(n CHAR)`(단위를 명시하지 않으면 한글 기관명이 200자가
> 아니라 66자에서 잘립니다), `CREATE TABLE IF NOT EXISTS` → `CREATE TABLE`(재실행하면
> `ORA-00955`로 실패합니다 — 파일 끝 DROP 문단 참조).
>
> 그리고 **Oracle은 빈 문자열을 NULL로 바꿉니다.** 이 표에 `DEFAULT ''` 컬럼은
> 없지만, 조회 조건에서는 이미 걸립니다 — `search`의 `#{x} = ''`가 Oracle에서
> 항상 거짓이 되어 `IS NULL`로 갈라 두었습니다(§13-① 아래 방언 분기 참조).

---

## 13. 알려진 불일치(정리 대상)

2026-08-26 실물 대조에서 나온, **문서가 아니라 코드/설정을 고쳐야 하는** 항목입니다.
아직 손대지 않았습니다.

**① ~~`dev`/`stg`/`prod`에 MyBatis 설정이 없습니다~~ — ✅ 해소(2026-08-31).**
`mybatis.mapper-locations`·`type-aliases-package`·`map-underscore-to-camel-case`가
`local`·`out-local`에만 있었습니다. **의도가 아니라 누락**임을 확인하고(사용자 확인
2026-08-31) 세 파일에 같은 3줄을 채웠습니다. 이제 5개 환경이 모두 같은 키를 갖습니다.

재발 방지로 **`ConfigEnvsTest`** 를 추가했습니다 — 이 프로젝트는 Spring 프로파일이
아니라 **설정 파일 교체** 방식이라(§7-1) 키 하나를 늘릴 때 5개 파일을 각각 고쳐야 하고,
한 곳을 빠뜨리면 **그 환경에서만** 문제가 나는데 그 환경이 대개 내부망이라 늦게
발견됩니다. 테스트가 보는 것은 ⓐ 필수 키 5개가 5개 파일에 다 있는지 ⓑ DataSource를
JNDI든 URL이든 어떤 방식으로든 정하는지 ⓒ 환경 폴더가 정확히 5개인지입니다.

**①-B ~~Oracle용 DDL이 없습니다~~ — ✅ 해소(2026-08-31).**
`src/main/resources/schema-oracle.sql`을 추가했습니다(§12 참조). MySQL 판과 미러
관계이며, 시퀀스 2개를 함께 만듭니다.

**①-C ~~Oracle SQL이 주석으로만 있습니다~~ — ✅ 해소(2026-08-31).**
`config-envs`의 `local`·`dev`·`stg`는 이미 `oracle.jdbc.OracleDriver`를 보고
`prod`는 JNDI인데, Mapper의 Oracle 문장 6곳(`insert`×2, `findRecent`,
`findByInstitutionNameContaining`, `countByInstitutionNameContaining`, `search`)이
**주석 처리**돼 있어서 활성 SQL은 `LIMIT`·`CONCAT()`·`useGeneratedKeys` —
**내부망 4개 환경에서 그대로 깨지는 상태**였습니다.

MyBatis의 `databaseId` 분기로 바꿔 **두 문장을 모두 살렸습니다.** 접속한 DB의
제품명을 보고 `config/MyBatisConfig`가 방언을 정하므로 **배포 시 XML 수정 0건**입니다.
- 모르는 벤더면 `IllegalStateException`으로 **기동 때 죽습니다** — 조용히 `null`을
  돌려주는 `VendorDatabaseIdProvider`를 쓰지 않은 이유입니다(그 경우 증상이 기동
  성공 뒤 특정 화면의 `Invalid bound statement`라 원인 추적이 매우 어렵습니다).
- ⚠️ **테스트 H2는 `MODE=MySQL`이라 런타임 테스트는 `mysql` 분기만 실행합니다.**
  그 공백은 `MapperDialectTest`가 메웁니다 — DB 없이 두 방언을 각각 파싱해
  statement 목록이 같은지, Oracle 분기에 `LIMIT`/`CONCAT(`이 남지 않았는지 봅니다.
  (본체 `kgi-ggreport-web`은 테스트 H2가 `MODE=Oracle`이라 `resolve()`의 H2 처리가
  서로 다릅니다 — 유일한 차이점이며 코드에 주석으로 적어 두었습니다.)
- ✅ `mvn test` 62건 전부 통과(종전 38 + 방언 5 + 설정 3 + 스케줄러 16).

**② ~~`src/test/resources/application-test.properties`가 적용되지 않습니다~~ —
✅ 해소(2026-08-26).** `test` 프로파일을 켜는 곳이 없어 한 번도 읽히지 않던 파일을
**`application.properties`로 개명**했습니다. 이제 프로파일 스위치 없이 항상 읽히므로
켜는 것을 잊을 수 없습니다(`@ActiveProfiles`를 매번 붙이는 방식보다 안전해 이쪽을
택했습니다). 함께 `spring.autoconfigure.exclude`로 JNDI 자동설정을 껐습니다 —
`jndi-name`이 빈 값으로 있으면 자동설정이 빈 이름으로 JNDI 조회를 시도하기 때문이며,
`config-envs`의 비-`prod` 설정 4개가 같은 이유로 이미 끄고 있습니다.

✅ **`mvn test`로 검증 완료(2026-08-26)** — 38건 전부 통과. 개명 전후로 같은 테스트를
돌려 비교했고, 개명이 결과에 영향을 주지 않음을 확인했습니다.

**④ ~~테스트 4건 실패~~ — ✅ 수정 완료(2026-08-26).** 처음으로 `mvn test`를 돌려
드러난 기존 결함입니다. 개명(②)과 무관함은 개명 전 상태로 되돌려 재현해 확인했습니다.
- `UploadControllerTest` 2건 — `KGI11100$UploadAction`이 생성자 3번째 인자로 받는
  `InstitutionMapper`에 `@MockBean`이 없어 **컨텍스트 자체가 안 떴습니다.** 함께,
  `upload()`가 오버로드인데 스텁이 **1인자 버전**을 가리켜 컨트롤러가 부르는 4인자
  호출과 매칭되지 않던 것도 고쳤습니다.
- `FileContentServiceTest` 2건 — `extractText()`는 `null`이 아니라 **대괄호로 감싼
  안내 문자열**(`[HWP 바이너리 형식 - 텍스트 추출 미지원]`,`[텍스트 추출 실패: …]`)을
  돌려주는데 테스트가 옛 계약(`null`)을 기대하고 있었습니다. **서비스가 아니라 테스트를
  고쳤습니다** — 서비스를 `null`로 되돌리면 이미 나가고 있는 `/api/files/search`의
  `content` 의미가 바뀌기 때문입니다. 안내 문자열(추출 시도 후 실패)과 `null`(애초에
  다루지 않는 확장자)의 구분을 고정하는 테스트를 1건 추가했습니다(37 → 38건).

> ⚠️ **남는 설계 판단 2건**(고치지 않았습니다 — 동작 변경이라 별도 결정이 필요합니다):
> ⓐ 안내 문자열이 `/api/files/search`의 `content`에 그대로 실려 나가므로, 이 API를
> RAG/색인에 쓰면 **본문 아닌 문구가 색인됩니다.** ⓑ 추출 실패 메시지에 **서버의
> 파일 경로가 그대로 담깁니다**(`[텍스트 추출 실패: \nonexistent\path\file.md]`).

**③ ~~전환 흔적 2건~~ — ✅ 정리 완료(2026-08-26).**
- ~~`weblogic.xml`의 `prefer-application-packages`에 `org.hibernate.*`~~ → **제거**.
  Hibernate는 의존성에 없습니다. 같은 목록의 `org.mybatis.*`·`org.apache.ibatis.*`가
  그 자리를 대신합니다. 제거 근거는 파일 안에 주석으로 남겼습니다.
- ~~`src/main/java/com/kb/uploader/config/application.properties`~~ → **삭제**.
  소스 폴더 안의 설정 파일이라 `pom.xml`에 `<resources>` 지정이 없는 이 프로젝트에서는
  빌드 산출물에 포함되지 않는 **죽은 파일**이었고, 그런데도 DB 비밀번호가 평문으로
  들어 있었습니다. 코드 참조도 없음을 확인한 뒤 지웠습니다.

> **전환 흔적의 물증**: `target/uploader-1.0.0/WEB-INF/classes/application.properties`
> (gitignore 대상, 과거 빌드 잔재)에 `spring.jpa.database-platform=…Oracle12cDialect`·
> `spring.jpa.hibernate.ddl-auto=update`가 들어 있습니다. 이 프로젝트가 실제로
> JPA/Hibernate로 시작했다가 MyBatis로 옮겨 왔음을 보여줍니다 — 종전 README의
> 기술 스택 표기는 **그 시점에는 맞았던** 기술입니다. `mvn clean`으로 정리됩니다.

> ⚠️ 참고 — 리포지토리에 커밋된 **`config/application.properties`에도 실제 MySQL
> 비밀번호가 평문으로 들어 있습니다**(다른 5개 파일은 `<PLACEHOLDER>`). 이 파일은
> 환경별 파일을 복사해 덮어쓰는 **작업 사본**이므로 `.gitignore` 대상이 되어야
> 합니다. 별건으로 처리 예정.
