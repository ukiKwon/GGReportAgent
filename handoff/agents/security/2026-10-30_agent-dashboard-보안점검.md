# security — agent-dashboard 보안 점검 (2026-10-30)

## 지시
대상: `agent-dashboard/serve.js`·`serve.py`·`hook.js`, `.claude/settings.json` 훅 4개. 로컬(127.0.0.1:8090) 전용 개발 보조 도구. 읽기 전용 점검, 코드 읽기 기반(서버 실행 재현 없음).

## 결과 (에이전트 보고서 요약 — 심각도·위치·확신도)
| # | 심각도 | 위치 | 내용 | 확신도 |
|---|---|---|---|---|
| 1 | 중 | `serve.js` merge | `__proto__` 키로 서버 프로세스 `Object.prototype` 오염 (재시작 전까지 유지) | 확인 |
| 2 | 중 | `serve.js` 정적 서빙 | 잘못된 퍼센트 인코딩 `GET /%E0%A4%A` → `decodeURIComponent` 예외로 서버 종료(DoS) | 확인 |
| 3 | 중 | `serve.js`·`serve.py` POST | 인증·Origin·Content-Type 검사 없음 → 다른 웹페이지가 no-cors text/plain POST로 상태 오염(#1·#2 유발 가능) | 확인 |
| 4 | 중 | 두 서버 | Host 헤더 검증 없음 → DNS rebinding으로 `state.json` 읽기 가능 | 추정 |
| 5 | 하 | 두 서버 | 요청 본문 크기 제한 없음(serve.py는 `Content-Length: -1`로 블로킹) | 확인 |
| 6 | 하 | 정적 서빙 | 경로 이동은 막혀 있음(정규화 후 `startsWith` 검사). 폴더 내 `hook.js`·`state.json.lock` 등은 읽힘(비밀 없음) | 확인 |
| 7 | 중 | `hook.js` | 프롬프트 앞 40자가 평문 `state.json`에 저장되고 GET으로 공개. git 추적은 안 됨(`.gitignore`) — 단 미추적 `GGReportAgent/`·zip·백업에 섞일 수 있음 | 확인 |
| 8 | 하 | hook ↔ 서버 | 서버 POST는 락을 안 써서 훅과 read-modify-write 경쟁, 비원자적 쓰기 | 확인 |
| 9 | 하 | `serve.py` | 디렉터리 목록 노출·폴더 내 파일 전부 서빙 | 확인 |
| 10–12 | 정보 | `app.js` | `fillText`만 사용해 XSS 낮음 / `innerHTML`은 상수값만(667–670) / Python merge는 `__proto__` 영향 없음 | 확인 |

훅 명령은 `$CLAUDE_PROJECT_DIR`를 따옴표로 감싸 명령 주입 여지 없음. 훅 입력은 `MAP` 화이트리스트로만 사용.

## 권장 조치 순서
1. `decodeURIComponent` try/catch(400) — 가장 값쌈
2. `merge`에서 `__proto__`·`constructor`·`prototype` 키 건너뛰기
3. POST에 Content-Type(JSON)·Host(localhost/127.0.0.1:포트) 검사 + 본문 16KB 상한
4. `hook.js` 프롬프트 기록 유지 여부 결정(마스킹·고정 문구·삭제)
5. 서버 쓰기에도 락·원자적 쓰기(임시 파일→rename)

## 이관 메모
- [이관: 백엔드] `serve.js` 1–3번 조치 반영(+`serve.py` 본문 상한·음수 `Content-Length` 거부) — 기다리는 것: 사용자 승인 — 근거 #1~#5
- [이관: 기획] 프롬프트 앞 40자 전광판 표시 기능 유지 여부(마스킹/고정 문구/삭제) — 기다리는 것: 사용자 결정 — 근거 #7, `hook.js:39`
- [이관: 프런트] 조치 불필요. 향후 `app.js:667-670` innerHTML에 `state.json` 유래 값을 넣지 말 것

## 열린 질문
- 전광판에 메인 작업 문구(프롬프트 앞 40자)를 계속 보여줄까? 보여 주면 비밀값을 프롬프트 첫머리에 쓰지 않도록 주의 필요.
