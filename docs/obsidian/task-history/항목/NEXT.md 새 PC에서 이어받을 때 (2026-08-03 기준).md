---
tags: [section, open]
원본: NEXT.md
---

> 원본: `handoff/NEXT.md` (파생본)

## 새 PC에서 이어받을 때 (2026-08-03 기준)

`data/`는 통째로 `.gitignore` 대상이라 **DB·인덱스·산출물은 git에 없다.** 코드만 받고
아래로 다시 만든다(전부 재생성 가능한 것들이라 잃는 정보는 없다).

```bash
git pull
py -3 -m pip install -r requirements.txt   # langgraph 등 포함

py -3 -m server.seed                       # 기관 25건 → data/registry.db

ollama pull bge-m3                         # 의미 검색용 임베딩 모델(약 1.2GB)
py -3 -m agent.retrieval build             # 지식 탭 검색용 → data/corpus_index.db
                                           #   (없으면 지식 탭이 503 빌드 안내를 띄운다)
                                           #   ⚠️ 임베딩 포함이라 CPU에서 약 1시간.
                                           #   급하면 --no-embed로 FTS만(수 초),
                                           #   나중에 reindex로 벡터를 채우면 된다.
py -3 -m server.demo                       # 데모 환경 + 서버 (data/demo.db, 운영과 별개)
#   → http://localhost:8000/
```

- ⚠️ **파이썬이 여러 개면 `py -3`가 패키지 없는 버전을 가리킬 수 있다.** 2026-08-03을
  돌린 PC는 `py -3`=3.15에 의존성이 없어 **`py -3.14`** 를 썼다. `py -0`로 목록을 보고,
  `server.demo`는 이 경우 traceback 대신 해결 방법을 안내하고 멈춘다.
- 화면 사용법은 실행가이드 `docs/실행가이드_server-agent.md` §9(워크플로)·§10(대화·쪽지함·
  지식)·§11(입찰상황판·참여 결정)·§12(정합성)에 있다.
- 병합되지 않은 채 남아 있는 원격 브랜치가 4개 있다(`agent-retrieval-fts`·
  `dmz-collector-service`·`local-2026-07-30`·`worktree-corpus-validation`). 전부 과거
  작업분이고 main에 반영된 것으로 보이나 **확인 전 삭제하지 말 것** — 정리는 별도 건.

---
