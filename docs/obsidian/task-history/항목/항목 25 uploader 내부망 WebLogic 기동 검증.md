---
tags: [item, open]
원본: NEXT.md
번호: 25
---

> 원본: `handoff/NEXT.md` (파생본)

### 25. uploader 내부망 WebLogic 기동 검증 — **기동은 성공, 후속 9건** (2026-09-07)

- **출처**: `[[2026-09-07|2026-09-07_summary.md]]` `## Session 18:32`. 브랜치 `weblogic-java-migration`
  (리포 변경은 없다 — 요약·NEXT 갱신뿐).
- **무엇이 끝났나**: 외부망 `uploader/`를 **내부망 Eclipse Photon 4.8.0 +
  WebLogic 12.2.1.4**에서 기동시키는 데 성공했다. 화면이 `ORA-00942`(테이블 없음)로
  끝나는 지점까지 갔고, 그것은 **Servlet API · JNDI DataSource · MyBatis Oracle 방언
  판정 · Spring MVC가 전부 살아 있다**는 증명이다. 남은 것은 DBA의 테이블 생성뿐.
- **반입물**: `dist/uploader-wtp-20260907.zip`(43.7MB, `main` 기준, 테스트 62건 통과).
  ⚠️ `dist/`는 gitignore 대상이 아니라 `git status`에 뜬다 — **커밋하지 말 것**(아래 ⑨).
- **DBA 요청서**: https://claude.ai/code/artifact/e9ee3490-52c5-4de1-a3bf-06818e4c4de9
  (빈칸 3곳만 채우면 발송 가능 — 대상 계정 · 인스턴스 · 담당자 연락처)

**후속 9건**

| # | 무엇 | 메모 |
|---|---|---|
| ① | ~~`main` → `weblogic-java-migration` 머지~~ → **uploader만 가져옴(2026-09-08 완료).** ✅ **브랜치 통합도 2026-10-21 완료** — `weblogic-java-migration` → `main` 머지(충돌 53건: 49건 브랜치 쪽, `md2pdf.py`만 main 쪽, `NEXT.md`·`[[2026-08-31\|2026-08-31_summary.md]]` 수동) | ✅ `git checkout main -- uploader/`(26파일, 테스트 62건 통과) → **항목 18 종결.** ⛔ **전체 머지는 하지 않기로 했다** — 시도해 보니 충돌 **23건**이고 전부 `add/add`(두 브랜치가 같은 파일을 독립적으로 추가, 공통 조상 없음). 특히 **`kgi-ggreport-web/` 16건은 방향이 정반대**다: `main`은 `bb4547c`(PR #2) 한 번만 건드린 초기 스냅샷(216파일)이고 **이 브랜치가 merge-base 이후 30커밋으로 앞선다**(242파일, `InstitutionController` 230 vs 126줄). `main` 쪽을 받으면 **단계 5-B가 통째로 되돌아간다.** 나중에 통합할 때의 규칙: `kgi-ggreport-web/`→**ours(이 브랜치)**, `uploader/`→theirs, `handoff/NEXT.md`·`[[2026-08-31\|2026-08-31_summary.md]]`→**수동**(append-only 규약), `docs/tools/md2pdf.py`·`docs/이관문의서_WebLogic_확인사항.md`→개별 확인(`main`에 개선 `b88be6d` 있음) |
| ② | **자동 재분류 복원** | 지금 `reclassification.cron=` 로 꺼 뒀고 `web.xml`의 `timer/uploaderTM` `resource-ref`도 임시 주석 상태. 되살리려면 주석 해제 + 콘솔 **Environment → Work Managers → New**로 이름 **`uploaderTM`** 생성. 실패 시 `DEPLOY.md` §3의 A→B→C |
| ③ | ~~스키마 2벌에 새 컬럼 순서 + `NUMBER(18)` 반영~~ — ✅ **완료(2026-09-08), 범위가 훨씬 커졌다** | 사내 DB 표준을 받아 **테이블·컬럼·타입을 전면 재정의**했다(TSKGIAF01/02 · 한글 컬럼 · 인포타입). 표준과 자바가 부딪히는 두 곳(문자열 시각 · 5자리 코드값)은 **TypeHandler 3개**로 흡수해 도메인·화면·테스트를 지켰다. 미러 규칙대로 `schema-mysql.sql` 도 같은 커밋에서 고쳤다. 커밋 `5745ea4`·`05a48f2`·`a52e878` |
| ④ | **`config-envs/prod`의 `upload.base-dir`** | 지금 `/app/uploader`(Linux)라 re-export하면 Windows 값이 되돌아간다. 내부망 실제값(`C:/uploader-local`)과의 관계를 정리할 것 |
| ⑤ | **WAR에서 `mysql-connector-j` 제거** | 외부망 로컬 테스트용인데 운영 WAR에 실린다. `pom.xml`에서 스코프 조정 |
| ⑥ | ~~폐쇄망 XML 검증 함정 문서화~~ — ✅ **완료(2026-09-08)** | 스키마 URL을 못 받아와 `Publish was cancelled`가 난다. 조치는 프로젝트 **Properties → Validation → `XML Validator`·`XML Schema Validator` 해제** |
| ⑦ | ~~`config-envs/local` vs `config/`(prod) 혼동 경고~~ — ✅ **완료(2026-09-08)** | 이번에 `local`을 도메인 config로 복사해 30분 이상 헤맸다. `local`의 `spring.autoconfigure.exclude=...JndiDataSourceAutoConfiguration` 이 **JNDI를 꺼 버린다** |
| ⑧ | ~~진단 순서 문서화~~ — ✅ **완료(2026-09-08)** | *"`java:comp/env` 조회 실패 시 앱 서술자보다 **JNDI 트리와 DataSource Targets를 먼저** 보라"* — 이번 세션에서 가장 오래 돈 지점이다. `web.xml`·`weblogic.xml`·`application.properties`를 다 의심했지만 셋 다 정상이었고, 원인은 DataSource가 서버에 배포되지 않아 트리에 `jdbc` 폴더 자체가 없던 것 |
| ⑨ | ~~현 브랜치 `.gitignore`에 `dist/` 추가~~ — ✅ **완료(2026-09-08)** | `main`에는 있고 이 브랜치에는 없다. 43MB zip이 실수로 커밋될 수 있다 |
| ⑩ | **분류완료 목록 화면(KGI12400)에 페이징이 없다** | `findByStatus('CLASSIFIED')` 가 **전량을 메모리로** 가져온다. 분류된 파일은 계속 쌓이므로(삭제도 소프트 삭제라 안 줄어든다) **이 화면이 가장 먼저 무너진다.** 2026-09-08 인덱스 재설계 중 발견. 고치려면 화면·컨트롤러·매퍼가 함께 바뀌어 그날 최우선(내부망 기동)을 밀어내므로 미뤘다. 참고: `findByInstitutionNameContaining` 에 이미 ROWNUM 2단 중첩 페이징 구현이 있으니 그것을 본뜨면 된다 |
| ⑪ | **기관 입력을 드롭다운으로** | 지금 기관명이 자유 입력 텍스트(`upload.html:30`)라 ⓐ 오타 한 글자에 파일이 조용히 미분류로 남고 ⓑ 조회가 `LIKE '%…%'` 라 인덱스 `IX_TSKGIAF01_기관명일시` 를 **못 쓴다**. `TSKGIAF02` 를 드롭다운 소스로 쓰면 셋 다 해결된다. **기관이 주 조회 축이라 체감 개선이 가장 큰 항목** (사용자 확인 2026-09-08: "A 기관 자료 들어왔나?" 가 주 용도) |
| ⑫ | **`기관구분` CHECK 제약** | 코드값 5종이 확정됐지만 CHECK 는 안 걸었다. 지금은 `InstitutionCategoryTypeHandler` 가 자바 쪽에서 막고 있어 잘못된 값이 들어갈 길이 없다 — DB 차원의 이중 방어를 원하면 `CHECK (기관구분 IN ('01','02','03','04','05'))` 를 추가하면 된다 |

**2026-09-08 추가 — 스키마가 사내 표준으로 확정됐다.** 테이블 `TSKGIAF01`·`TSKGIAF02`,
컬럼은 한글, 타입은 인포타입(`일시20`=CHARACTER `YYYYMMDDHH24MISS` · `구분코드2` ·
`일련번호16`=DECIMAL · `명250/260` · `내용800` · `년4`). 표준과 자바가 부딪히는 두 곳
(문자열 시각 · 5자리 코드값)은 **TypeHandler 3개로 흡수**해 도메인·화면·테스트를 지켰다.
DBA 제출용 엑셀은 `uploader/docs/DBA제출_컬럼정의_2026-09-08.xlsx`, 생성기는
`uploader/tools/gen_column_excel.py` — **스키마가 바뀌면 그 스크립트의 ROWS 도 같은
커밋에서 고칠 것**(자동 파싱하지 않는다).

| ⑬ | 🔴 **스키마 접두어가 문서에만 있고 리포 소스에는 없다** | 사내 표준이 `FROM INST1.TSKGIAF01` 을 요구해 **내부망 가이드(문서 ①②·DBA 요청서)에만** 접두어를 붙였다(사용자 확정 2026-09-08). 리포의 매퍼·`schema-oracle.sql` 에는 없다 — 붙이면 외부망 테스트(H2)가 깨지기 때문이다. ⚠️ **그래서 내부망 파일과 리포 파일이 갈려 있다.** `import_wtp.py` 로 되돌리면 접두어가 리포로 들어와 **62건이 전부 깨진다.** 정리 방법 셋: ⓐ 미러(`schema-mysql.sql`)에도 `CREATE SCHEMA INST1` 을 넣어 리포까지 접두어를 붙인다 ⓑ DataSource **Init SQL** 에 `ALTER SESSION SET CURRENT_SCHEMA=INST1` 을 넣어 SQL 에서 접두어를 뺀다(표준과 어긋남) ⓒ MyBatis `${schema}` 치환으로 환경별로 준다. 🟢 **dev·stg·prod 스키마명이 전부 `INST1` 로 같음이 확인돼**(사용자 2026-09-08) 환경별 분기는 필요 없다 — ⓐ 가 가장 단순하다 |

**막고 있는 것**: DBA의 테이블 생성(사용자가 요청 예정). 그 전까지 화면은 `ORA-00942`가 정상이다.
