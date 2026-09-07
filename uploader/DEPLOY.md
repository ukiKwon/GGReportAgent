# uploader — 내부망 WebLogic 반입·기동 체크리스트

내부망에서 이 문서만 보고 끝낼 수 있게 정리했습니다. 배경·설계 근거는
[`README.md`](README.md) §7(환경별 설정) · §10(운영 배포) · §12(DB 구조)에 있습니다.

> ⚠️ **순서가 중요합니다.** DataSource를 먼저 만들지 않으면 **앱이 기동 자체를
> 실패합니다**(운영 설정이 JNDI 조회로 DB를 잡기 때문입니다). 배포는 3번이 아니라
> **4번**입니다.

---

## 0. 무엇을 반입하나 — 소스가 아니라 WAR

```bash
# 외부망에서 (JDK 1.8 + Maven 3)
cd uploader
mvn -o clean package -DskipTests=false
# → target/uploader-1.0.0.war  (약 54MB)
```

**소스 폴더째 들고 들어가지 마십시오.** 내부망에 Maven 의존성 저장소(`.m2`)가 없으면
빌드가 안 됩니다. 반입물은 아래 3개면 충분합니다.

| 반입물 | 어디서 | 용도 |
|---|---|---|
| `target/uploader-1.0.0.war` | 외부망 빌드 산출물 | 배포 |
| `src/main/resources/schema-oracle.sql` | 리포 | DBA가 적용 (WAR 안에도 들어 있습니다) |
| `config-envs/prod/application.properties` | 리포 | `config/application.properties`로 복사 |

> ⚠️ **`config/application.properties`는 `.gitignore` 대상입니다.** 리포를 그대로
> 복사해도 **딸려오지 않습니다.** `config-envs/prod/`에서 직접 복사하십시오.

---

## 1. DB 스키마 적용 (DBA)

`schema-oracle.sql`을 적용합니다. **자동 실행되지 않습니다** — `spring.sql.init` 설정은
테스트(H2)에만 있습니다.

만들어지는 것: 테이블 `UPLOADED_FILE` · `INSTITUTION`, **시퀀스 `UPLOADED_FILE_SEQ` ·
`INSTITUTION_SEQ`**.

> ⚠️ **시퀀스를 빠뜨리지 마십시오.** Mapper의 `oracle` 분기가 `..._SEQ.NEXTVAL`을
> 직접 부릅니다. 테이블만 만들면 조회는 되는데 **업로드·기관등록만 실패**합니다.
>
> ⚠️ `CREATE TABLE IF NOT EXISTS`가 Oracle에 없어 **재실행하면 `ORA-00955`로
> 실패합니다.** 다시 깔려면 파일 끝의 DROP 문단을 먼저 돌리십시오.

### 1-B. 기관 마스터 시드 — 잊기 쉬운 항목

`INSTITUTION` 테이블이 비어 있으면 **자동 분류가 한 건도 일어나지 않습니다.**
분류 카테고리의 출처가 파일명이 아니라 이 표이기 때문입니다(`ClassificationService`).
업로드는 되지만 전부 `UNCLASSIFIED`로 쌓입니다.

기관 등록은 화면(`/institutions`)에서 하거나, 같은 화면의 **JSON/XLSX 가져오기**를
쓰면 됩니다(`KGI13400` / `KGI13410`).

---

## 2. DataSource 등록 — `jdbc/uploaderDS`

WebLogic 콘솔: **Services → Data Sources → New → Generic Data Source**

| 항목 | 값 |
|---|---|
| Name | 자유 (예: `uploaderDS`) |
| **JNDI Name** | **`jdbc/uploaderDS`** ← 이 이름이어야 합니다 |
| Database Type | Oracle |
| Driver | Oracle Thin (XA 아님 — 이 앱은 분산 트랜잭션을 쓰지 않습니다) |
| Targets | uploader를 배포할 서버 |

**이름의 근거**: `config-envs/prod/application.properties`의
`spring.datasource.jndi-name=java:comp/env/jdbc/uploaderDS` + `WEB-INF/web.xml`의
`resource-ref`. 셋이 같아야 합니다. 다른 이름을 쓰려면 **세 곳을 같이** 바꾸십시오.

> ✅ 등록 후 콘솔의 **Test Data Source**로 접속을 먼저 확인하십시오. 여기서 실패하면
> 앱 기동도 실패합니다.

---

## 3. 배치(스케줄) 리소스 등록 — `timer/uploaderTM`

미분류 파일 재분류를 **5분마다**(`reclassification.cron`) 돌리는 자리입니다.

**왜 컨테이너 자원인가**: 앱이 스레드를 직접 만들면 WAS가 그 스레드를 모릅니다 —
재배포해도 안 죽어 옛 클래스로더가 안 풀리고(메모리 누수), 트랜잭션·보안 컨텍스트·JNDI가
안 실리며, 콘솔 모니터링·스레드 덤프에 안 잡힙니다. 그래서 CommonJ로 옮겼습니다.

> ⚠️ **`commonj.work.WorkManager`가 아니라 `commonj.timers.TimerManager`입니다.**
> 전자는 "지금 한 번 실행", 후자가 "주기 실행"입니다. `web.xml`의 `res-type`도
> `commonj.timers.TimerManager`로 적혀 있습니다.

**JNDI 이름**: `timer/uploaderTM` (앱이 찾는 전체 이름은
`java:comp/env/timer/uploaderTM`)

**이름을 바꾸려면** `uploader.timer-manager-jndi` 설정과 `web.xml`의 `res-ref-name`을
같이 바꾸십시오.

### WebLogic 12c에서 붙이는 법 — A → B → C 순서로 시도

12c는 CommonJ TimerManager를 **Work Manager가 뒷받침하는 형태**로 제공합니다.
그래서 "타이머"라는 별도 자원을 만드는 게 아니라 **Work Manager를 만들고 그것을
타이머 참조에 연결**하는 모양이 됩니다.

**A. Work Manager를 `uploaderTM` 이름으로 만든다 (먼저 이것만 해 보십시오)**

콘솔: **Environment → Work Managers → New → Work Manager**

| 항목 | 값 |
|---|---|
| **Name** | **`uploaderTM`** ← `web.xml`의 `timer/uploaderTM`과 뒷부분이 같아야 합니다 |
| Targets | uploader를 배포할 서버 |

WebLogic은 `java:comp/env/{wm,timer}/<이름>` 참조를 **같은 이름의 Work Manager로
해석**합니다. 이름을 맞추면 추가 선언 없이 잡히는 경우가 많습니다.
→ 배포 후 6번의 로그 한 줄로 성공 여부가 바로 갈립니다.

**B. A로 안 되면 — 설정만 바꿔 재시도 (⭐ 재빌드 불필요)**

`java:comp/env/…`는 컴포넌트 지역 이름이라 `web.xml`의 `resource-ref`를 거칩니다.
그 경로가 막히면 **전역 JNDI 이름을 직접** 보게 하면 됩니다.
`config/application.properties`에 한 줄 추가하십시오:

```properties
# 콘솔의 JNDI 트리에서 실제로 보이는 이름으로 바꿉니다
uploader.timer-manager-jndi=uploaderTM
```

> ⭐ **JNDI 이름은 설정값이라 WAR를 다시 만들지 않아도 됩니다.** 현장에서 이름을
> 바꿔 가며 시도할 수 있는 유일한 손잡이입니다. 콘솔의 **Server → View JNDI Tree**로
> 실제 바인딩된 이름을 확인한 뒤 그 값을 넣으십시오.

**C. 그래도 안 되면 — `weblogic.xml` 매핑이 필요합니다 (재빌드)**

현재 `weblogic.xml`에는 `<resource-description>` 매핑이 **없습니다.** 12c가 이
매핑을 요구하는 구성이면 아래를 추가하고 WAR를 다시 만들어야 합니다.

```xml
<resource-description>
  <res-ref-name>timer/uploaderTM</res-ref-name>
  <jndi-name>uploaderTM</jndi-name>
</resource-description>
```

**이 경우 외부망에 알려주십시오** — 콘솔에서 본 실제 JNDI 이름과 오류 메시지를 함께
주시면 매핑을 넣어 다시 빌드합니다.

> 💡 **`res-sharing-scope`도 확인 대상입니다.** 현재 `web.xml`은 `Shareable`인데,
> CommonJ 규격 예제는 TimerManager에 **`Unshareable`**을 씁니다. C단계로 가게 되면
> 이것도 같이 바꿔 보는 것이 좋습니다(역시 재빌드가 필요합니다).

> 💡 **이 단계를 건너뛰어도 앱은 기동합니다.** 로컬 스케줄러로 폴백하고 WARN을
> 남깁니다(6번 참조). 즉 **DataSource → 배포 → 기동 확인**까지 먼저 하고, 타이머는
> 로그를 보면서 A → B → C로 붙이는 편이 진행이 빠릅니다.

---

## 4. 설정 파일 배치

```
config-envs/prod/application.properties  →  config/application.properties
```

`config/`는 **WebLogic 서버의 실행 디렉터리 기준**입니다(Spring Boot가 `./config/`를
기본 설정 위치로 읽습니다). 도메인 디렉터리 등 실제 기동 위치에 맞춰 두십시오.

> ⚠️ **`--spring.profiles.active=prod`는 이 프로젝트에서 동작하지 않습니다.**
> `application-prod.properties` 같은 프로파일 파일이 없습니다. 5개 환경은 전부 파일명이
> `application.properties`이고 **디렉터리로만** 구분됩니다(README §7-1).

`prod` 설정에 든 것: JNDI 이름 · `upload.base-dir=/app/uploader` · `mybatis.*` 3줄 ·
`reclassification.cron`.

### 파일 저장 디렉터리

`upload.base-dir` = **`/app/uploader`** — 이 경로가 **존재하고 WebLogic 프로세스
계정이 쓸 수 있어야** 합니다. 하위에 `unclassified/`, `classified/`가 자동 생성됩니다.

---

## 5. 배포

대상: **WebLogic Server 12c**

WebLogic 콘솔: **Deployments → Install** → `uploader-1.0.0.war` → 대상 서버 선택 →
Finish → **Start (Servicing all requests)**

### ⚠️ ojdbc 충돌 가능성

WAR 안에 **`ojdbc8-21.7.0.0.jar`가 들어 있습니다.** WebLogic도 자체 Oracle 드라이버를
갖고 있습니다. 현재 `weblogic.xml`의 `prefer-application-packages`에 `oracle.*`이
**없어서** 컨테이너 드라이버가 우선되지만, 드라이버 관련 오류(`ClassCastException`,
버전 불일치 등)가 나면 이 jar가 원인일 가능성이 높습니다 — 그때는 `pom.xml`에서
`ojdbc8`을 `provided` 스코프로 바꿔 다시 빌드하는 것이 정석입니다.

> `commonj`는 WAR에 없습니다(컨테이너가 줍니다). `weblogic.xml`의
> `prefer-application-packages`에 **`commonj`를 넣지 마십시오** — 넣으면 앱이 못 찾는
> 빈 자리를 우선하게 되어 타이머가 안 붙습니다.

---

## 6. 기동 확인 — 로그에서 이 줄들을 보십시오

| 무엇 | 정상 | 잘못됐을 때 |
|---|---|---|
| **방언** | (조용함) | `지원하지 않는 DB 다: …` → 기동 실패. DataSource가 Oracle이 아닙니다 |
| **배치** | `반복 작업 실행: CommonJ TimerManager (java:comp/env/timer/uploaderTM)` | `TimerManager(…)를 못 찾아 **로컬 스케줄러로 돈다**` → 3번이 안 된 것 |
| **cron** | `자동 재분류: cron='0 */5 * * * *' · 실행 방식=CommonJ TimerManager (…)` | `reclassification.cron 이 비어 있다` → 설정 파일이 안 읽혔습니다 |

### 화면·API로 확인

| 확인 | 경로 | 기대 |
|---|---|---|
| 화면 | `GET /` | 대시보드가 뜨고 통계가 0으로 표시 |
| 기관 등록 | `GET /institutions` → 등록 | **시퀀스가 없으면 여기서 실패**합니다 |
| 업로드 | `POST /upload` (파일 1건) | 200 + 결과 화면. `/app/uploader/unclassified/`에 파일 생성 |
| 검색 API | `GET /api/files/search` | `{"items":[…]}` — **빈 배열이 아니어야** 정상 |
| 자동 분류 | 업로드 후 최대 5분 | 파일이 `classified/{카테고리}/{연도}/{기관}/`로 이동 |

> ⚠️ **검색 API가 빈 배열만 돌려주면** Oracle의 빈 문자열↔NULL 처리 문제일 수
> 있습니다. 이 결함은 2026-08-31에 고쳤지만(`IS NULL`로 분기), **Oracle 실기에서
> 처음 검증되는 자리**입니다. 재현되면 외부망에 알려주십시오.

---

## 7. 문제 해결

| 증상 | 원인 | 조치 |
|---|---|---|
| 기동 실패, JNDI 관련 예외 | DataSource 미등록/이름 불일치 | 2번. 세 곳(`config`·`web.xml`·콘솔)의 이름을 대조 |
| 기동 실패, `지원하지 않는 DB 다` | DataSource가 Oracle이 아님 | 2번 |
| 기동 실패, `reclassification.cron 을 해석하지 못했다` | cron 표기 오류 | 4번. 6필드 Spring cron입니다 |
| 화면은 뜨는데 목록·등록이 SQL 오류 | 스키마 미적용 / **시퀀스 누락** | 1번 |
| 업로드는 되는데 계속 `UNCLASSIFIED` | **기관 마스터가 비어 있음** | 1-B |
| 로그에 `로컬 스케줄러로 돈다` WARN | TimerManager 미등록/이름 불일치 | 3번의 A → B → C |
| `NameNotFoundException: timer/uploaderTM` | 참조가 Work Manager로 해석되지 않음 | 3번 B(설정으로 전역 이름 지정, 재빌드 불필요) |
| `Invalid bound statement` | 방언 분기가 안 잡힘 | `mybatis.*` 3줄이 `config/application.properties`에 있는지 |

---

## 8. 알려진 미검증 — 여기서 처음 실행되는 것들

외부망에서는 원리상 검증할 수 없어, **내부망 첫 기동이 최초 실행**인 부분입니다.

| 무엇 | 왜 검증 못 했나 |
|---|---|
| **Oracle SQL 실행** | 외부망 테스트는 H2(`MODE=MySQL`)입니다. 검증한 것은 "XML이 파싱되어 어떤 SQL 문자열이 만들어지는가"까지입니다 |
| **`TimerManagerScheduler`** | JNDI 조회가 반드시 실패해 **코드가 아예 안 돕니다.** `src/test/java/commonj/timers/`의 규격 스텁으로 리플렉션 규약만 밟았고, **스텁이 진짜 JSR 규격과 같다는 전제** 위에 있습니다 |
| **WebLogic 배포 자체** | 외부망은 내장 Tomcat입니다 |

외부망에서 확인된 것: `mvn test` 62건 통과, `mvn package` WAR 생성,
WAR 안에 `web.xml`·`weblogic.xml`·`schema-oracle.sql` 포함.

---

## 부록 — 로컬 WebLogic으로 연습할 때

`config-envs/local`은 **JNDI를 쓰지 않습니다.** JNDI 자동설정을 끄고
`jdbc:oracle:thin:@//localhost:1521/ORCL`로 **앱이 직접 접속**하는 설정입니다.

즉 로컬 WebLogic에 DataSource를 등록해도 **`local` 설정으로 띄우면 그 DataSource를
쓰지 않습니다.** 콘솔 등록 절차(2·3번)를 실제로 연습하려면 **`prod` 설정을 그대로
쓰고**, JNDI 이름만 로컬에 만든 것과 맞추십시오.
