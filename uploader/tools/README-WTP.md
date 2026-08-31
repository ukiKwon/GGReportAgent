# uploader — Eclipse WTP 폴더 (내부망 작업용)

이 폴더는 **외부망 Maven 리포에서 자동 생성된 사본**입니다
(`uploader/tools/export_wtp.py`). Eclipse Dynamic Web Project 배치라
**Import → Existing Projects into Workspace** 로 바로 열립니다.

> ⚠️ **정본은 외부망 리포입니다.** 테스트 62건과 Maven 빌드가 거기 붙어 있고,
> 그것이 Oracle SQL·TimerManager처럼 **외부망에서 확인할 수 없는 것들을 잡아 주는
> 유일한 그물**입니다. 여기서 고친 것은 반드시 리포로 되돌리십시오(아래 4번).

---

## 1. 폴더 구조

```
.classpath · .project · .settings/   Eclipse 프로젝트 정의
WebContent/
└── WEB-INF/
    ├── classes/      ← 컴파일 출력 자리 (Eclipse가 여기에 씁니다)
    ├── lib/          ← 런타임 의존 jar
    ├── web.xml       ← resource-ref: timer/uploaderTM · jdbc/uploaderDS
    └── weblogic.xml
config/
└── application.properties     ← prod 사본. 실제 환경값으로 고쳐 쓰십시오
config-envs/                   ← 5개 환경 원본(참고용). 골라서 config/로 복사
src/                           ← 자바 + 리소스(mapper·schema·templates·static)
```

`src/`가 평면인 것이 Maven과 다른 점입니다. Eclipse가 `src/`의 **`.java`는 컴파일**해서,
**그 밖의 파일(mapper/*.xml, schema-*.sql, templates/, static/)은 그대로 복사**해서
`WebContent/WEB-INF/classes`에 넣습니다. 런타임에는 둘 다 클래스패스라 동작이 같습니다.

---

## 2. Eclipse에서 처음 열 때

1. **File → Import → General → Existing Projects into Workspace** → 이 폴더 선택
2. **프로젝트 우클릭 → Properties → Targeted Runtimes → WebLogic 12c 체크**

> ⚠️ **2번을 하기 전에는 컴파일 오류가 납니다.** `ServletInitializer`가 서블릿 API를
> 쓰는데, 그 jar는 **일부러 `WEB-INF/lib`에 넣지 않았습니다** — 넣으면 WebLogic의
> 서블릿 컨테이너와 두 벌이 되어 배포가 깨집니다. 서블릿 API는 **WAS 런타임이
> 제공하는 것을 쓰는 것이 정석**입니다.
>
> Targeted Runtime을 못 쓰는 상황이면, WebLogic 설치 폴더의 서블릿 API jar를
> **프로젝트 클래스패스에만**(WEB-INF/lib이 아니라) 추가하십시오.

인코딩은 `.settings/org.eclipse.core.resources.prefs`에서 **UTF-8로 고정**해
두었습니다. 한글 주석·문자열이 많아 이 설정이 없으면 cp949로 읽혀 깨집니다.

---

## 3. 배포 전에 할 것

**[`DEPLOY.md`](DEPLOY.md)가 정식 체크리스트입니다.** 요약하면:

| # | 무엇 | 안 하면 |
|---|---|---|
| 1 | `src/schema-oracle.sql` 적용 (테이블 2 + **시퀀스 2**) | 등록·업로드가 SQL 오류 |
| 2 | DataSource **`jdbc/uploaderDS`** 등록 | **기동 실패** |
| 3 | Timer Manager **`timer/uploaderTM`** 등록 | 기동은 되고 WARN + 로컬 스레드 폴백 |
| 4 | `config/application.properties`를 실제 환경값으로 | 설정을 못 읽음 |
| 5 | `INSTITUTION` 마스터 시드 | 자동 분류가 0건 |

기동 로그에서 이 줄을 확인하십시오:

```
반복 작업 실행: CommonJ TimerManager (java:comp/env/timer/uploaderTM)
```

`로컬 스케줄러로 돈다` WARN이 보이면 3번이 안 된 것입니다.

---

## 4. 여기서 고쳤으면 — 리포로 되돌리기

이 폴더를 **통째로** 외부망으로 가져간 뒤:

```bash
# 1) 무엇이 바뀌었는지 먼저 봅니다 (기본이 미리보기입니다)
py -3 uploader/tools/import_wtp.py <이 폴더 경로>

# 2) 확인했으면 반영
py -3 uploader/tools/import_wtp.py <이 폴더 경로> --apply

# 3) ⚠️ 반드시 검증 — 이게 이 왕복의 목적입니다
cd uploader && mvn -o clean test
```

되돌아가는 것은 **`src/`와 `WebContent/WEB-INF/*.xml`뿐**입니다.
`classes`·`lib`는 빌드 산출물이고, `config/application.properties`는 실제값이 든
작업 사본이라 **자동 반영하지 않습니다**(값이 리포로 새지 않게). 진짜 설정 변경이면
리포의 `config-envs/prod`를 직접 고치십시오 — `import_wtp.py`가 다른 키를 알려 줍니다.

> ⚠️ **`WebContent/WEB-INF/lib`의 jar를 늘리거나 바꿨다면 그건 되돌아가지 않습니다.**
> 의존성이 바뀐 것이므로 외부망 `pom.xml`을 고쳐야 합니다 — 무슨 jar를 왜 넣었는지
> 알려 주십시오.
