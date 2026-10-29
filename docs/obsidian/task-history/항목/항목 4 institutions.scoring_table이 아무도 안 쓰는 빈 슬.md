---
tags: [item, done]
원본: done.md
번호: 4
---

> 원본: `handoff/done.md` (파생본)

### 4. ~~`institutions.scoring_table`이 아무도 안 쓰는 빈 슬롯~~ — **완료(제거)** (2026-08-06)

- **출처**: `[[2026-07-30|2026-07-30_summary.md]]` → `[[2026-08-06|2026-08-06_summary.md]]` `## Session 13:xx`.
- **결정(사용자 확정)**: 채우지 않고 **지웠다.** 이 항목은 원래 "rfp_extract가 만든
  배점표를 DB에도 넣자"였는데, 조사해 보니 **이미 서빙되고 있었다** —
  `GET /institutions/{id}/coverage-map`이 `rfp_scoring.json`을 읽어 내려준다.
  DB에도 두면 **파일과 DB 중 어느 게 진실인지** 문제가 새로 생긴다.
  - 원래 고민이던 "agent/backend 중 어느 층이 쓰나"도 같은 이유로 사라졌다. 참고로
    답은 backend였을 것이다 — `rfp_scoring.json`은 `rfp-locate` 스킬(사람 손)도
    만들어서, agent 노드가 DB에 쓰면 **사람 경로만 조용히 빠진다.**
- **한 일**: `backend/db.py` SCHEMA · `backend/models.py`의 `Institution` 필드 ·
  `repository._row_to_institution`의 JSON 역직렬화(그리고 쓸모없어진 `json` import) 제거.
- **기존 DB의 컬럼은 지우지 않는다** — SQLite의 컬럼 삭제는 테이블 재작성이라
  반입된 실데이터를 건드리는 위험이 이득보다 크고, 남아 있어도 무해하다
  (`SELECT *`가 실어 와도 pydantic이 모델에 없는 키를 무시한다).
  회귀 테스트로 그 경로를 고정했고, 실제 `data/registry.db`(컬럼 있음)로 25건
  정상 조회를 실측했다.
- 테스트: pytest 730 → **731**.
