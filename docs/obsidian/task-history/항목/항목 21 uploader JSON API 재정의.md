---
tags: [item, open]
원본: NEXT.md
번호: 21
---

> 원본: `handoff/NEXT.md` (파생본)

### 21. uploader JSON API 재정의 — **정의 미완(4건), 구현 미착수** (2026-08-27)

- **출처**: 2026-08-27 세션. 분석 문서 **`docs/uploader_json_api_재정의_gap분석.md`**.
- **무엇인가**: 사용자가 uploader 의 **JSON API 2개를 8개로 재정의**했다(화면 14개는
  그대로 둔다). CloudDisk 파일 저장소를 다루는 RPC 스타일 API +
  HMAC 서명 헤더 4개 + `{"event":"CHUNK","content":"<JSON 문자열>"}` 봉투.
- **확정된 것 5건**: ⓐ 엔드포인트 `POST /v1/{env}-kgi-ggreport/{api명}`(env 는 설정값)
  ⓑ 전부 Java 구현 ⓒ `parseDoc` 은 `FileContentService` 재사용 ⓓ 화면(DB)과
  API(파일시스템)는 **의도적으로 분리** — `clouddisk.base-dir` 별도 프로퍼티
  ⓔ 추출 실패 시 `.md` 를 만들지 않고 `parsed_md: null`(항목 19가 여기서 닫혔다).
- ⏳ **아직 정해지지 않은 4건** — 이것이 구현 착수를 막는다:
  1. 각 API 의 **성공 응답 필드 스키마**(`content` 안 JSON 의 모양)
  2. **오류 응답 규약**(`event` 가 `ERROR` 가 되는지, HTTP 상태코드)
  3. **`event:"CHUNK"` 의 의미** — 이름이 스트리밍을 시사한다. 단건도 항상 하나인지
  4. **`fileList` ↔ `shell` 의 차이** — 둘 다 디렉터리 목록이다. 합쳐도 되는지
- ⚠️ **구현 전에 반드시 볼 것 2가지**(문서 §4):
  - `X-KB-Client-Hash` 는 **Body 원문 바이트**로 HMAC 을 계산한다. 컨트롤러에서 DTO 를
    다시 직렬화해 해시하면 **거의 확실히 불일치한다** — 필터에서 raw bytes 를 잡을 것.
  - `filepath` 계열 인자에 **경로 탈출 방어가 명세에 없다.** `fileDelete` 는 실제로
    파일을 지운다. `clouddisk.base-dir` 하위인지 정규화 후 확인할 것.
- **미착수**: 코드 변경은 `FileContentService` 의 null 반환(항목 19) 하나뿐이고,
  8개 API 는 **아직 한 줄도 없다.**

