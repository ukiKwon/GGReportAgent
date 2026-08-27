# uploader JSON API 재정의 — gap 분석 (2026-08-27)

사용자가 `uploader/`의 **JSON API만** 재정의했다(화면 14개는 그대로 둔다).
이 문서는 as-is와 to-be를 대조해 **무엇이 신규/삭제/변경인지**와 **정해지지 않은 것**을
정리한다.

- as-is 근거: `uploader/src/main/java/com/kb/uploader/controller/` 실측(2026-08-27)
- to-be 근거: 사용자 정의(2026-08-27 대화)

---

## 0. 한 줄 요약

**같은 API의 개정이 아니라 성격이 다른 API로의 교체다.** as-is는 *DB에 적재된 업로드
파일의 메타데이터*를 다루고, to-be는 *CloudDisk라는 파일 저장소의 경로*를 다룬다.
겹치는 개념이 사실상 없다.

---

## 1. as-is (실측)

JSON을 반환하는 것은 **2개**뿐이다. 나머지 14개는 Thymeleaf 뷰 이름 또는 `redirect:`를
반환하는 화면용이다(재정의 대상 아님).

| 경로 | 인자 | 응답 |
|---|---|---|
| `GET /api/files/search` | `institution`, `year`, `keyword` (전부 선택, 기본 `""`) | `{files:[{id, originalName, institution, year, category, status, uploadedAt, content}]}` |
| `GET /api/files/{id}/download` | `id` (DB PK, `Long`) | `{id, fileName, mimeType, fileSize, fileData}` |

전제 세 가지:

- **DB 중심.** `UPLOADED_FILE` 테이블(`id`·`originalName`·`storedPath`·`year`·
  `institutionName`·`category`·`status`·`uploadedAt`·`classifiedAt`)이 진실이고,
  파일은 `upload.base-dir` 밑에 저장된다.
- **인증이 없다.** Spring Security 의존성도, 인증 필터도 없다(실측).
- **응답은 평범한 JSON 객체.** 봉투(envelope)가 없다.

## 2. to-be (사용자 정의)

**전송**: HTTP. Body는 길이 제한 없는 JSON.

**Header 4개(전부 필수)**

| 헤더 | 값 |
|---|---|
| `Authorization` | `Bearer` + 공백 + 토큰 |
| `X-KB-REQUEST-ID` | 거래 추적용 유일값(요청 클라이언트가 생성) |
| `X-KB-Client-Request-Date` | `YYYYMMDDHHMISSsss` |
| `X-KB-Client-Hash` | `Base64(HMAC(BodyData(JSON), Client-Secret + X-KB-Client-Request-Date))` |

**API 8개**

| # | 이름 | args | 하는 일 |
|---|---|---|---|
| 1 | `fileList` | `subpath` | `CloudDisk/subpath` 하위 파일·폴더 목록 |
| 2 | `fileSearch` | `pattern` | glob 검색 (`전처리/RFP/*.md`) |
| 3 | `fileDownload` | `filepath` | base64 (`file_data`) |
| 4 | `fileUpload` | `encoded_file`, `subpath`, `filename` | `CloudDisk/subpath/filename` 저장. **대상 디렉터리가 미리 있어야 함** |
| 5 | `userFileRequest` | `data`, `savepath`, `filename` | 텍스트 저장(JSON이면 pretty-print) |
| 6 | `fileDelete` | `filepath` | 파일 삭제(디렉터리 삭제 불가) |
| 7 | `shell` | `filepath` | `os.listdir` 결과(디렉터리 내 파일명) |
| 8 | `parseDoc` (MODE=local 전용) | `encoded_file`, `saved_dir_origin`, `parsed_dir`, `filename` | 원본 저장 → `run_single_parsing` 실행 → `.md` 경로(`parsed_md`) 반환, 없으면 null |

**응답 봉투(전 API 공통)**

```json
{"event": "CHUNK", "content": "<JSON 문자열>"}
```

결과 객체를 **문자열로 한 번 더 감싼다**(이중 직렬화).

---

## 3. Gap — 요청하신 4분류

### ① 신규 (6)

`fileList` · `fileUpload` · `userFileRequest` · `fileDelete` · `shell` · `parseDoc`

as-is에 대응물이 전혀 없다. 특히 **쓰기 3종**(`fileUpload`·`userFileRequest`·
`fileDelete`)은 지금까지 JSON API로 열려 있지 않던 동작이다 — 업로드는 화면 폼
(`POST /upload`)만 있었고 삭제는 DB 상태 변경(`/file-status/{id}/delete`)이었다.

### ② 삭제 (1)

`GET /api/files/search`의 **현재 의미**가 사라진다.

이름이 비슷한 `fileSearch`가 있지만 **다른 것이다**:

| | as-is `search` | to-be `fileSearch` |
|---|---|---|
| 검색 대상 | DB 행 | 파일 경로 |
| 조건 | 기관·연도·키워드 | glob 패턴 |
| 결과 | 메타데이터 + **본문 전문**(`content`) | (미정 — 경로 목록 추정) |

→ **"시그니처 변경"이 아니라 삭제 + 신규로 다뤄야 한다.** 기관/연도/분류/상태로
거르는 기능은 to-be 목록에 **없다**.

### ③ 시그니처 변경 (1)

`fileDownload`

| | as-is | to-be |
|---|---|---|
| 식별자 | `id` (DB PK `Long`) | `filepath` (경로 문자열) |
| 응답 | `{id, fileName, mimeType, fileSize, fileData}` | `file_data` 중심(나머지 필드 미정) |

**DB를 거치지 않게 되는 것이 본질**이다. `id`를 아는 경로(=검색 API)가 사라지므로
식별자 교체는 필연이다.

### ④ 경로·이름만 변경

**없음.**

---

## 4. 4분류에 안 들어가지만 더 큰 변화 3가지

### (가) DB 세계와 파일시스템 세계가 갈라진다 — ✅ **의도된 분리(2026-08-27 사용자 확정)**

화면 14개는 그대로 두므로 `/file-status`·`/institutions`·분류·반려는 계속
`UPLOADED_FILE` 테이블 위에서 돈다. to-be JSON API는 **DB를 전혀 건드리지 않는다.**

**결정: 분리를 유지한다(ⓑ안).** 근거는 *"fileUpload로 들어오는 내용이 (화면으로 올리는
것과) 서로 다르다"* — 사람이 분류·반려하는 업무 파일과 API가 주고받는 파일은 성격이
다른 별개 영역이다. 따라서:

- `fileUpload`로 들어온 파일은 `/file-status` 화면에 **안 보이는 것이 정상**이다.
  DB 행을 만들지 않고, 분류·반려·`ReclassificationJob` 대상도 아니다.
- `fileDelete`도 DB를 보지 않는다.

⚠️ **그래서 저장 뿌리를 갈라야 한다.** 두 영역이 같은 폴더를 쓰면 API가 올린 파일이
`ReclassificationJob`의 스캔 범위에 들어가 결국 화면에 나타난다 — 분리가 의도라면
`CloudDisk`는 `upload.base-dir`와 **다른 뿌리**여야 한다(§5 항목 7).

### (나) 인증·서명 계층이 통째로 신규다

현재 uploader에는 인증이 **0**이다. 헤더 4개는 전부 새로 만들어야 하고, 특히
`X-KB-Client-Hash` 검증에는 함정이 있다:

> HMAC은 **Body 원문 바이트**에 대해 계산된다. Spring이 JSON을 파싱한 뒤에는 원문을
> 복원할 수 없다(키 순서·공백이 달라진다). 따라서 **필터 단계에서
> `ContentCachingRequestWrapper` 등으로 raw bytes를 잡아 두고** 검증해야 한다.
> 컨트롤러에서 DTO를 다시 직렬화해 해시하면 **거의 확실히 불일치한다.**

`Client-Secret`의 보관 위치도 정해야 한다(`config/application.properties`는 이미
gitignore 대상이지만, 평문 비밀번호 사고 전례가 있다 — `NEXT.md` 항목 20).

### (다) 경로 탈출 방어가 명세에 없다

`filepath`가 "절대/상대 경로"이고 `fileDelete`는 실제로 파일을 지운다. `../`를 막지
않으면 **CloudDisk 밖의 파일을 읽고 지울 수 있다.** 같은 리포의
`kgi-ggreport-web`의 `DocumentService`가 이미 이 방어를 갖고 있으니 규칙을 맞추는 편이
좋다(경로를 정규화한 뒤 루트 하위인지 확인).

`shell`이라는 이름도 재고 대상이다 — 실제 동작은 `os.listdir`인데 이름은 명령 실행으로
읽힌다. 보안 검토에서 불필요한 질문을 부른다.

---

## 5. 정해지지 않아 물어야 하는 것

| # | 항목 | 왜 필요한가 |
|---|---|---|
| ~~1~~ | ~~엔드포인트 모양~~ | ✅ **확정**: `POST /v1/{env}-kgi-ggreport/{api명}`. `env`는 환경마다 바뀐다(`dev`·`stg`·`prod`) → **설정값으로 뽑아야 한다**(§6) |
| 2 | **각 API의 성공 응답 필드** | `content` 안 JSON의 스키마. `fileList`가 이름만인지 크기·수정시각도 주는지 등 |
| 3 | **오류 응답 규약** | `event`가 `ERROR`가 되는지, HTTP 상태코드는 무엇인지. 지금 미정 |
| 4 | **`event: "CHUNK"`의 의미** | 이름이 스트리밍(여러 조각)을 시사한다. 단건도 항상 `CHUNK` 하나인지, 여러 개가 올 수 있는지 |
| 5 | **`fileList` ↔ `shell` 차이** | 둘 다 디렉터리 목록이다. 하나로 합쳐도 되는지 |
| ~~6~~ | ~~`parseDoc`의 구현 주체~~ | ✅ **확정**: 전부 Java. `parser_helper`는 이 리포에 없으므로(검색 0건) **`FileContentService`를 재사용**한다(§6) |
| ~~7~~ | ~~CloudDisk = `upload.base-dir`인가~~ | ✅ **확정**: 별개 뿌리. 새 프로퍼티 **`clouddisk.base-dir`** 로 둔다(§6-3) |
| 8 | **as-is 2개의 처분** | 즉시 제거인지, 한동안 병행인지(화면은 이 API를 안 쓰므로 제거해도 화면은 안 깨진다 — 외부 소비자가 있는지가 관건) |
| ~~9~~ | ~~`NEXT.md` 항목 19~~ | ✅ **닫을 수 있다**: `extractText()` 의 유일한 소비자가 삭제되는 `search` 라, 실패 시 `null` 반환으로 바꾸면 안내 문구·경로 노출이 함께 사라진다(§6-2) |

---

## 6. 확정된 3건이 구현에 남기는 것 (2026-08-27)

### (1) 엔드포인트의 `env`는 설정값이다

`POST /v1/dev-kgi-ggreport/{api명}` 의 `dev`가 `stg`·`prod`로 바뀐다. 경로에 박으면
환경마다 코드가 갈리므로 **`@RequestMapping("${api.base-path}")`** 같은 프로퍼티로
빼고, 이미 있는 5축 설정(`config-envs/{local,dev,stg,prod,out-local}/`)에 각각 넣는다.

⚠️ **내부망 로컬과 외부망 로컬의 접두사가 미정이다** — `local-kgi-ggreport`인지
`dev-…`를 그대로 쓰는지 정해야 한다.

### (2) `parseDoc` = `FileContentService` 재사용 — 그런데 **항목 19가 여기로 옮겨온다**

`FileContentService.extractText()`는 실패 시 `null`이 아니라 **대괄호 안내 문자열**을
돌려준다(실측):

| 확장자 | 반환 |
|---|---|
| `.md` `.txt` | UTF-8 원문 |
| `.pdf` | PDFBox 추출 |
| `.xlsx` `.xls` | 시트별 탭 구분 텍스트 |
| `.hwpx` | 추출 |
| **`.hwp`** | **`"[HWP 바이너리 형식 - 텍스트 추출 미지원]"`** |
| 예외 | **`"[텍스트 추출 실패: " + e.getMessage() + "]"`** (서버 경로가 담긴다) |
| 그 외 확장자 | `null` |

`parseDoc`이 이 결과를 그대로 `.md`로 쓰면 **`.hwp` 하나당 안내 문구 한 줄짜리 `.md`가
생산된다.** 그 `.md`가 다음 단계(색인·RAG)로 흘러가면 본문 대신 그 문구가 색인된다.

✅ **결정(2026-08-27 사용자 확정): 추출 실패 시 `.md`를 만들지 않고 `parsed_md: null`**
을 돌려준다. 사용자 정의의 *"존재하지 않으면 null"* 과도 그대로 맞는다.

**그러면 `parseDoc`은 "실패했다"를 알 수 있어야 한다.** 지금은 실패도 성공도 똑같이
`String` 이라, 대괄호 접두사를 문자열로 맞춰 보는 수밖에 없다 — 문구를 한 글자만 고쳐도
조용히 깨지는 방식이다.

🎯 **그래서 `NEXT.md` 항목 19를 여기서 실제로 닫을 수 있다.**
`extractText()` 의 **운영 소비자는 `FileSearchApiController` 하나뿐**이고(실측: 다른
호출부 0건), 그건 이번 재정의에서 **삭제되는 API**다(§3-②). 즉 대괄호 문자열을 계약으로
쓰는 곳이 **사라진다.**

✅ **적용 완료(2026-08-27 사용자 승인).** `extractText()` 가 실패 시 `null` 을 돌려준다.

| | 지금 | 바꾼 뒤 |
|---|---|---|
| `.hwp` | `"[HWP 바이너리 형식 - 텍스트 추출 미지원]"` | `null` |
| 예외 | `"[텍스트 추출 실패: <서버 경로>]"` | `null` (경로 유출도 함께 사라진다) |

- 얻는 것: `parseDoc` 이 `null` 하나로 판정한다(문자열 대조 불필요).
  **서버 경로 노출**(항목 19의 두 번째 지적)도 같이 없어졌다.
- 함께 고친 것: `FileContentServiceTest` — 대괄호 문자열을 계약으로 고정하고 있었다.
- 실패 사유는 **로그에만** 남긴다(`log.warn` / `log.debug`) — 응답·파일에는 싣지 않는다.
- 검증: `uploader` 모듈 `mvn -o test` **38건 통과**(2026-08-27).

### (3) 분리 유지 → 저장 뿌리를 가른다 ✅ **확정**

`CloudDisk` 는 `upload.base-dir` 와 **별개 뿌리**이고, 새 프로퍼티
**`clouddisk.base-dir`** 로 둔다(사용자 확정 2026-08-27).

- 5축 설정(`config-envs/{local,dev,stg,prod,out-local}/`) 각각에 값을 넣는다 —
  `upload.base-dir` 가 이미 그 5곳에 있으므로 같은 자리에 나란히 둔다.
- 이 한 줄이 §4-(가)의 분리를 **물리적으로** 보장한다. 같은 폴더를 쓰면
  `ReclassificationJob` 스캔에 걸려 분리가 저절로 무너진다.
- 8개 API 의 `subpath`·`filepath`·`savepath`·`parsed_dir` 는 **전부 이 뿌리 기준**이며,
  정규화 후 뿌리 하위인지 확인한다(§4-다의 경로 탈출 방어와 같은 자리).

---

## 7. 남은 미정 4건

§5의 2·3·4·5 — **응답 필드 스키마 · 오류 응답 규약 · `event:"CHUNK"` 의 의미 ·
`fileList`↔`shell` 차이**. 이 넷이 정해지면 구현 착수에 필요한 정의는 모두 갖춰진다.
