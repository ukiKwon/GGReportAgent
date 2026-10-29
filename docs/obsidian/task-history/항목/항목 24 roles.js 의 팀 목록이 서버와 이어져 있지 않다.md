---
tags: [item, done]
원본: done.md
번호: 24
---

> 원본: `handoff/done.md` (파생본)

### 24. ~~`roles.js` 의 팀 목록이 서버와 이어져 있지 않다~~ — **완료** (2026-08-28)

- **출처**: `[[2026-08-28|2026-08-28_summary.md]]` `## Session 16:10`(발견) → `## Session 15:54`(해소,
  커밋 `62cab63`).
- **무엇이었나**: `roles.approverOf` 가 `['영업','전산','예산']` 를 손으로 갖고 있었다.
  이름은 맞아서 동작에는 문제가 없었지만, 서버의 `AUTHORING_TEAMS` 가 바뀌면 **화면만
  조용히 옛 목록을 쓴다.** 그러면 그 팀의 결재자가 `null` 이 되어(설계상 "모르면
  지어내지 않는다") **오류 없이 결재 버튼만 안 뜬다.**
- **고친 것(ⓑ 안 채택)**: ① `approverOf` 의 리터럴을 없애고 `roles.TEAMS`
  (`AFFILIATIONS` 파생)를 쓰게 해 **파일 안에서 손으로 적는 팀 목록을 하나로** 줄였다.
  ② `server/tests/test_roles_js_matches_server_teams.py` 신설 — `roles.js` 를 읽어
  `AFFILIATIONS`·`DESIGNER`·`FINAL_APPROVER`·직책 3종을 서버와 대조하고,
  `approverOf` 에 팀 이름 리터럴이 **다시 생기면 실패**한다.
- **런타임 결합(ⓐ 안)은 만들지 않았다** — 목적은 드리프트를 잡는 것이지 기동 시점
  의존을 늘리는 것이 아니다. 파일을 읽어 대조만 한다.
- **검증**: `AFFILIATIONS` 를 `'IT팀'` 으로 바꿔 실제로 실패하는 것을 확인했다.
  pytest 761 → **769**, node **262 pass**.

