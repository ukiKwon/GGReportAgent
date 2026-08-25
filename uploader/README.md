# Uploader — 파일 업로드 & 분류 서비스

KB Financial AI 2 Center에서 운영하는 파일 수신·분류 서버입니다.  
외부 시스템(기관)으로부터 파일을 HTTP로 수신하고, 파일명 규칙에 따라 자동 분류한 뒤 지정 디렉터리에 보관합니다.

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

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **역할** | 외부 기관 파일 수신 + 자동/수동 분류 + 대시보드 조회 |
| **배포 형태** | WAR → Oracle WebLogic (운영), 내장 톰캣 (로컬) |
| **데이터베이스** | Oracle DB (운영, WebLogic JNDI), H2 in-memory (로컬·테스트) |
| **파일 저장** | 서버 로컬 파일시스템 (`upload.base-dir` 경로 하위) |

---

## 2. 기술 스택

| 구성 요소 | 버전 / 내용 |
|-----------|------------|
| Java | 1.8 |
| Spring Boot | 2.7.18 |
| Spring Data JPA | Hibernate ORM |
| 뷰 템플릿 | Thymeleaf 3 |
| Oracle JDBC | ojdbc8 21.7.0.0 |
| H2 Database | 로컬·테스트 전용 |
| Apache POI | 5.2.3 (XLSX 내보내기/가져오기) |
| 빌드 도구 | Maven 3 |
| WAS | Oracle WebLogic (운영), 내장 Tomcat (로컬) |

---

## 3. 아키텍처 요약

```
외부 기관 / 내부 시스템
        │  HTTP POST /upload (multipart)
        ▼
┌───────────────────────────────┐
│         Uploader Server        │
│                               │
│  UploadController             │
│    └─ FileUploadService       │
│         ├─ FileParserService  │  파일명 파싱
│         ├─ FileStorageService │  unclassified/ 저장
│         └─ ClassificationService │ 기관 매핑 → classified/ 이동
│                               │
│  스케줄러 (매 5분)              │
│    └─ ReclassificationJob     │  미분류 파일 재시도
│                               │
│  관리 화면 (Thymeleaf)         │
│    ├─ /            Dashboard  │
│    ├─ /upload      업로드 폼  │
│    ├─ /file-status 미분류 목록│
│    └─ /institutions 기관 관리 │
└───────────────────────────────┘
        │
        ▼
  파일시스템 (upload.base-dir)
  DB (Oracle / H2)
```

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
| 확장자 | `pdf`, `hwp`, `md` 만 허용 |

**예시**

```
2024_KB국민은행_분기보고서.pdf
2024_KB증권_리스크현황_Q1.hwp
```

규칙에 맞지 않거나 기관 마스터에 없는 경우 → `UNCLASSIFIED` 상태로 보관 후 수동 분류 가능.

---

## 5. 저장 디렉터리 구조

`upload.base-dir` (기본 운영: `/app/uploader`, 로컬: `/tmp/uploader-local`) 하위에 생성됩니다.

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

---

## 6. API 엔드포인트

### 파일 업로드 (외부 시스템에서 호출)

```
POST /upload
Content-Type: multipart/form-data

파라미터: files  (MultipartFile, 복수 가능)
```

**응답**: HTTP 200 + HTML 뷰 (업로드 결과 목록)

> 외부 시스템이 API로 파일을 전송할 때는 `multipart/form-data` 형식으로  
> `files` 파라미터에 파일을 첨부하여 POST 요청합니다.

**curl 예시**

```bash
curl -X POST http://{서버IP}:{포트}/upload \
  -F "files=@2024_KB국민은행_보고서.pdf" \
  -F "files=@2024_KB증권_현황.hwp"
```

### 관리 화면 (브라우저)

| URL | 설명 |
|-----|------|
| `GET /` | 대시보드 (전체 통계, 최근 업로드, 기관 검색) |
| `GET /upload` | 파일 업로드 폼 |
| `GET /file-status` | 미분류 파일 목록 + 수동 분류 |
| `POST /file-status/{id}/classify` | 수동 분류 처리 |
| `GET /institutions` | 기관 마스터 목록 |
| `POST /institutions` | 기관 등록 |
| `POST /institutions/{id}/delete` | 기관 삭제 |
| `GET /institutions/export/json` | 기관 목록 JSON 다운로드 |
| `GET /institutions/export/xlsx` | 기관 목록 XLSX 다운로드 |
| `POST /institutions/import/json` | 기관 목록 JSON 일괄 등록 |
| `POST /institutions/import/xlsx` | 기관 목록 XLSX 일괄 등록 |

---

## 7. 환경별 설정

### 프로파일 종류

| 프로파일 | 설정 파일 | DB | 기동 방법 |
|---------|----------|----|----------|
| (기본/운영) | `application.properties` | Oracle (WebLogic JNDI) | WebLogic에 WAR 배포 |
| `local` | `application-local.properties` | H2 in-memory | `--spring.profiles.active=local` |
| `test` | `application-test.properties` | H2 in-memory | Maven 테스트 시 자동 적용 |

### 운영 설정 (`application.properties`) 주요 항목

```properties
server.port=8080

# Oracle DataSource — WebLogic JNDI 이름
spring.datasource.jndi-name=java:comp/env/jdbc/uploaderDS

# 파일 저장 루트 경로
upload.base-dir=/app/uploader

# 재분류 스케줄 (매 5분)
reclassification.cron=0 */5 * * * *

# 파일 업로드 크기 제한
spring.servlet.multipart.max-file-size=100MB
spring.servlet.multipart.max-request-size=200MB
```

### 로컬 설정 (`application-local.properties`) 주요 항목

```properties
spring.datasource.url=jdbc:h2:mem:localdb;DB_CLOSE_DELAY=-1
spring.datasource.driver-class-name=org.h2.Driver

upload.base-dir=/tmp/uploader-local

# H2 콘솔 활성화 (브라우저에서 /h2-console 접근 가능)
spring.h2.console.enabled=true
spring.h2.console.path=/h2-console
```

---

## 8. 서버 주소·포트 설정 (외부 API 호출 대응)

외부 시스템이 이 서버의 특정 IP나 포트로 파일을 전송해야 할 때 아래 설정을 조정합니다.

### 8-1. 포트 변경

`application.properties` (또는 환경별 properties 파일):

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

JAR/WAR 기동 시 JVM 인자 또는 환경 변수로 덮어쓸 수 있습니다:

```bash
# JVM 인자
java -jar uploader.war --server.port=9090 --server.address=10.0.0.1

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
| `application.properties` | 로컬 내장 Tomcat |
| WebLogic Admin Console | 운영 WebLogic |
| `weblogic.xml` | 클래스로더 패키지 우선순위 (패키지 충돌 방지) |

---

## 9. 로컬 개발 환경 기동

### 사전 요건

- JDK 8 이상
- Maven 3.6 이상

### 빌드 및 기동

```bash
# 프로젝트 루트에서
cd uploader

# 컴파일 + 로컬 프로파일로 기동
mvn spring-boot:run -Dspring-boot.run.profiles=local
```

또는 JAR/WAR로 패키징 후 실행:

```bash
mvn clean package -DskipTests
java -jar target/uploader-1.0.0.war --spring.profiles.active=local
```

### 기동 확인

| 항목 | URL |
|------|-----|
| 대시보드 | http://localhost:8080/ |
| 업로드 화면 | http://localhost:8080/upload |
| 파일 상태 | http://localhost:8080/file-status |
| 기관 관리 | http://localhost:8080/institutions |
| H2 DB 콘솔 | http://localhost:8080/h2-console |

**H2 콘솔 접속 정보** (로컬 전용)

| 항목 | 값 |
|------|-----|
| JDBC URL | `jdbc:h2:mem:localdb` |
| User Name | `sa` |
| Password | (빈값) |

### 로컬 파일 저장 경로

업로드 파일은 `/tmp/uploader-local/` 하위에 저장됩니다.

```bash
# 저장된 파일 확인
ls /tmp/uploader-local/unclassified/
ls /tmp/uploader-local/classified/
```

---

## 10. 운영(WebLogic) 배포

### WAR 빌드

```bash
cd uploader
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

> `weblogic.xml`의 `prefer-application-packages` 설정으로  
> Spring, Hibernate, Jackson 등 애플리케이션 내장 라이브러리가 WebLogic 기본 라이브러리보다 우선 적용됩니다.

---

## 11. 테스트 실행

```bash
cd uploader
mvn test
```

- 테스트 시 `application-test.properties`가 자동 적용됩니다 (H2 in-memory).
- 파일 저장 경로: `/tmp/uploader-test/`

---

## 12. 데이터베이스 구조

### UPLOADED_FILE 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| ID | NUMBER (PK) | 시퀀스 채번 |
| ORIGINAL_NAME | VARCHAR2(500) | 원본 파일명 |
| STORED_PATH | VARCHAR2(1000) | 현재 저장 경로 |
| FILE_YEAR | VARCHAR2(4) | 파일명에서 파싱된 연도 |
| INSTITUTION_NAME | VARCHAR2(200) | 파일명에서 파싱된 기관명 |
| CATEGORY | VARCHAR2(50) | 분류 카테고리 |
| STATUS | VARCHAR2(20) | `CLASSIFIED` / `UNCLASSIFIED` |
| UPLOADED_AT | TIMESTAMP | 업로드 일시 |
| CLASSIFIED_AT | TIMESTAMP | 분류 완료 일시 |

### INSTITUTION 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| ID | NUMBER (PK) | 시퀀스 채번 |
| NAME | VARCHAR2(200) (UNIQUE) | 기관명 (파일명과 매핑 키) |
| CATEGORY | VARCHAR2(50) | 분류 카테고리 |
| MODIFIED_AT | TIMESTAMP | 최종 수정 일시 |
