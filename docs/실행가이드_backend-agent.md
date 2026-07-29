# backend / agent 실행 가이드

- **작성일**: 2026-07-27
- **대상**: `backend/`(레지스트리 API, sub-project 0)와 `agent/`(RFP 자동화 파이프라인, 부분 구현)를
  로컬에서 기동/시험해보려는 사람.
- **범위 밖**: `corpus/reports/`(정적 오프라인 HTML)는 서버 기동이 필요 없음 — 브라우저에서 파일을 직접 열면 됨.

---

## 1. 레지스트리 API (`backend/`) — 바로 기동 가능

5개 Task 모두 구현·리뷰·병합 완료(commit `d3533cb`), 테스트 20개 통과 상태.

```bash
# 저장소 루트에서
py -3 -m pip install -r requirements.txt

# 1회성: giganlist/ 의 각 구청 폴더를 data/registry.db에 시딩
py -3 -m backend.seed
# 기대 출력: seeded <N> institutions: [...]

# 서버 기동 (기본 포트 8000)
py -3 -m uvicorn backend.main:app --reload

# 다른 터미널에서 동작 확인
curl http://127.0.0.1:8000/institutions
curl http://127.0.0.1:8000/institutions/dobong
```

- `REGISTRY_DB_PATH` 환경변수로 DB 파일 위치를 바꿀 수 있음(기본값:
  `data/registry.db` — 재구성 스펙 §⑦-2에 따라 시스템 생성물은 `data/`에 모이며,
  `data/`는 통째로 `.gitignore`에 등록됨).
- 엔드포인트 4개: `GET /institutions`, `GET /institutions/{id}`,
  `POST /institutions/import` (CSV 업로드), `GET /institutions/{id}/artifacts`.
- 테스트만 먼저 확인하고 싶다면: `py -3 -m pytest backend/tests -v`

## 2. 에이전트 파이프라인 (`agent/`) — 완성 전, 함수 호출로만 시험 가능

`handoff/NEXT.md` 열린 항목에 따르면 Task 1·2만 구현되었고 Task 3(`spec_research_node`)부터는
방향 결정(폐쇄망용 재구현 vs E2E sub-project 3로 재설계) 대기 중이다. `agent/pipeline.py`에
`run_pipeline()` 함수는 있지만 **CLI 진입점이 없고**, 의존성(`langchain_openai`, `python-pptx`)도
`requirements.txt`에 선언돼 있지 않다. 그대로는 "서비스 기동"이 아니라 Python 함수 호출/테스트로만
검증 가능한 상태.

```bash
# 누락된 의존성 우선 설치 (requirements.txt에 없음)
py -3 -m pip install langchain-openai python-pptx

# 단위 테스트로 각 노드가 동작하는지 확인 (LLM 모킹 여부는 각 테스트 파일 확인 필요)
py -3 -m pytest agent/tests -v
```

파이프라인 자체를 끝까지 돌리려면 Python에서 직접 호출해야 한다:

```python
import os
os.environ["OPENAI_API_KEY"] = "..."  # 없으면 실행 시 getpass로 물어봄

from agent.pipeline import run_pipeline
result = run_pipeline(institution_name="도봉구")
```

단, `institution_match_node` 이후 흐름(신규 기관 spec/plan 자동 생성 등)이 Task 3+ 미구현이라
`giganlist/`에 이미 있는 기존 구청 이름으로만 의미 있게 동작할 가능성이 높다 — 신규 기관명을 넣으면
Task 3 이후 로직이 없어 막힐 수 있다. **정식으로 "기동"하려면 먼저 `NEXT.md` 열린 항목의 방향
결정(재구현 vs 재설계)을 내리고 나머지 Task를 마저 구현하는 별도 세션이 필요하다.**

## 확인 방법

- `backend/`: 위 curl 두 개가 200과 JSON을 반환하면 정상.
- `agent/`: `pytest agent/tests -v` 통과 여부로 개별 노드 건전성만 확인 가능;
  end-to-end 실행은 위 제약 때문에 완전한 검증이 아님.
