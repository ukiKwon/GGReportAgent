# 계획 A2 — 대화 코어·업로드 검사·아카이브 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 에이전트↔사람 접점 층 — 참여검토 대화창(`POST/GET /institutions/{id}/chat`), 작성물 업로드+즉시검사(`POST /tasks/{id}/upload` + coverage_map.json), 완료 아카이브(`POST /institutions/{id}/complete`), A1 최종 리뷰 이월 픽스(F4~F10), 쪽지함 비활성 UI 스텁.

**Architecture:** 스펙 `docs/superpowers/specs/2026-07-31-multi-agent-collab-system-design.md` §④⑥, 승인된 A2 범위(플랜 파일). 대화는 기존 `backend/agent_adapter.stream_chat_reply` 패턴(FTS 검색→코퍼스 폴백→`get_llm().stream`) 재사용. 업로드 검사는 기존 `verification_node`+`scan_pii` 재사용(배정은 `role_router_node` 규칙 라우팅). **쪽지 기능은 사용자 지시로 연기** — notifications 행 기록(F7)만 하고 읽기 라우터·발송 UI는 만들지 않는다.

**Tech Stack:** Python 3.14, FastAPI, langchain(get_llm 경유), pytest. dashboard는 정적 HTML 한 곳만.

## Global Constraints

- LLM 접근은 `agent/llm.py`의 `get_llm`/`structured_llm`만. 테스트는 전부 LLM 목.
- **쪽지함 기능(notifications 읽기 라우터·발송 UI) 구현 금지** — 연기 확정. F7의 행 기록만 허용.
- backend→agent import는 허용(선례: `agent_adapter`), agent→backend는 금지.
- `X-User-Id` 헤더는 ASCII만 안전 — 한글 이름은 body 필드로(F10).
- 주석·프롬프트·커밋 한국어(끝에 Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>), UTF-8, `py -3` 런처, TDD 순서 엄수.
- 전체 `py -3 -m pytest agent backend collector -q` 기준선 **313 passed** 유지 + 신규 통과, `node --test dashboard/test/*.test.js` 36/36 유지.
- `rfp_scoring.json` 형태(기존): `{"rfp_title": str, "total_score": int, "criteria": [{category, item, score, description}]}` — `data/report_new/{기관명}/rfp_scoring.json`.

---

### Task 1: `chat_messages` 테이블 + 리포지토리

**Files:**
- Modify: `backend/db.py` (SCHEMA에 테이블 1개)
- Create: `backend/chat_repository.py`
- Modify: `backend/models.py` (모델 1개)
- Test: `backend/tests/test_chat_repository.py`

**Interfaces:**
- Produces: `ChatMessage(chat_message_id, institution_id, role, content, created_at)` 모델; `add_chat_message(conn, institution_id, role, content) -> ChatMessage`; `list_chat_messages(conn, institution_id) -> list[ChatMessage]` (created_at 오름차순). Task 3이 쓴다.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_chat_repository.py`:

```python
from backend.chat_repository import add_chat_message, list_chat_messages
from backend.db import init_db


def test_add_and_list_in_order(tmp_path):
    conn = init_db(str(tmp_path / "registry.db"))
    add_chat_message(conn, "dobong", "user", "올해 도봉구청 입찰 어떻게 생각해?")
    add_chat_message(conn, "dobong", "agent", "배점 상위는 협력사업…")
    add_chat_message(conn, "nowon", "user", "노원은?")

    msgs = list_chat_messages(conn, "dobong")
    assert [m.role for m in msgs] == ["user", "agent"]
    assert msgs[0].content.startswith("올해")
    assert msgs[0].created_at  # ISO 문자열


def test_list_empty_institution(tmp_path):
    conn = init_db(str(tmp_path / "registry.db"))
    assert list_chat_messages(conn, "ghost") == []
```

- [ ] **Step 2: Run to verify fail** — `py -3 -m pytest backend/tests/test_chat_repository.py -v` → ModuleNotFoundError.

- [ ] **Step 3: Implement**

`backend/db.py` SCHEMA 끝(notifications 뒤)에:

```sql
CREATE TABLE IF NOT EXISTS chat_messages (
    chat_message_id TEXT PRIMARY KEY,
    institution_id  TEXT NOT NULL,
    role            TEXT NOT NULL,          -- user/agent
    content         TEXT NOT NULL,
    created_at      TEXT NOT NULL
);
```

`backend/models.py`:

```python
class ChatMessage(BaseModel):
    chat_message_id: str
    institution_id: str
    role: str
    content: str
    created_at: str
```

`backend/chat_repository.py` — `backend/task_repository.add_message`와 같은 관행(secrets 접두사 `chat-`, UTC ISO, 자체 commit):

```python
import secrets
import sqlite3
from datetime import datetime, timezone

from backend.models import ChatMessage


def add_chat_message(
    conn: sqlite3.Connection, institution_id: str, role: str, content: str
) -> ChatMessage:
    chat_message_id = f"chat-{secrets.token_hex(4)}"
    created_at = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO chat_messages (chat_message_id, institution_id, role, content, created_at)"
        " VALUES (?, ?, ?, ?, ?)",
        (chat_message_id, institution_id, role, content, created_at),
    )
    conn.commit()
    return ChatMessage(
        chat_message_id=chat_message_id, institution_id=institution_id,
        role=role, content=content, created_at=created_at,
    )


def list_chat_messages(conn: sqlite3.Connection, institution_id: str) -> list[ChatMessage]:
    rows = conn.execute(
        "SELECT * FROM chat_messages WHERE institution_id = ? ORDER BY created_at",
        (institution_id,),
    ).fetchall()
    return [ChatMessage(**dict(r)) for r in rows]
```

- [ ] **Step 4: Run to verify pass** — 2 passed + `py -3 -m pytest backend -q` 무회귀.
- [ ] **Step 5: Commit** — `feat(backend): chat_messages 테이블·리포지토리 — 기관 단위 대화 저장 (A2 Task 1)`

---

### Task 2: 참여검토 어댑터 — `stream_consult_reply`

**Files:**
- Modify: `backend/agent_adapter.py`
- Test: `backend/tests/test_agent_adapter_consult.py`

**Interfaces:**
- Consumes: 기존 `_search_team_corpus`/`_load_team_corpus`(그대로), `agent.llm.get_llm`.
- Produces: `stream_consult_reply(institution_name, giganlist_dir, rfp_text_path, history, user_message, index_db_path=DEFAULT_INDEX_DB_PATH)` — 텍스트 청크 제너레이터. Task 3의 라우터가 쓴다.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_agent_adapter_consult.py`:

```python
from unittest.mock import MagicMock, patch

from backend.agent_adapter import stream_consult_reply


def _collect(gen):
    return "".join(gen)


@patch("backend.agent_adapter.get_llm")
def test_consult_prompt_carries_three_perspectives_and_corpus(mock_get_llm, tmp_path):
    inst = tmp_path / "dobong"
    (inst / "spec").mkdir(parents=True)
    (inst / "spec" / "01_개요.txt").write_text("도봉구 개요", encoding="utf-8")

    chunk = MagicMock(); chunk.content = "답변"
    mock_get_llm.return_value.stream.return_value = [chunk]

    out = _collect(stream_consult_reply(
        institution_name="도봉구",
        giganlist_dir=str(inst),
        rfp_text_path=None,
        history=[],
        user_message="올해 도봉구청 입찰에 대해 어떻게 생각해?",
        index_db_path=str(tmp_path / "no-index.db"),
    ))

    assert out == "답변"
    prompt = mock_get_llm.return_value.stream.call_args[0][0]
    for word in ("영업", "전산", "예산", "도봉구 개요", "도봉구"):
        assert word in prompt
    assert "지어내지" in prompt  # 할루시네이션 금지 문구


@patch("backend.agent_adapter.get_llm")
def test_consult_includes_rfp_text_when_present(mock_get_llm, tmp_path):
    rfp = tmp_path / "rfp_text.txt"
    rfp.write_text("공고 원문: 협력사업 25점", encoding="utf-8")
    chunk = MagicMock(); chunk.content = "ok"
    mock_get_llm.return_value.stream.return_value = [chunk]

    _collect(stream_consult_reply(
        institution_name="수원시", giganlist_dir=None, rfp_text_path=str(rfp),
        history=[{"role": "user", "content": "이전 질문"}],
        user_message="참여할까?", index_db_path=str(tmp_path / "no.db"),
    ))

    prompt = mock_get_llm.return_value.stream.call_args[0][0]
    assert "협력사업 25점" in prompt
    assert "이전 질문" in prompt


@patch("backend.agent_adapter.get_llm")
def test_consult_without_any_source_says_so(mock_get_llm, tmp_path):
    chunk = MagicMock(); chunk.content = "ok"
    mock_get_llm.return_value.stream.return_value = [chunk]
    _collect(stream_consult_reply(
        institution_name="신규기관", giganlist_dir=None, rfp_text_path=None,
        history=[], user_message="어때?", index_db_path=str(tmp_path / "no.db"),
    ))
    prompt = mock_get_llm.return_value.stream.call_args[0][0]
    assert "자료 없음" in prompt
```

- [ ] **Step 2: Run to verify fail** — ImportError(stream_consult_reply).

- [ ] **Step 3: Implement** — `backend/agent_adapter.py`에 추가:

```python
CONSULT_PROMPT = """당신은 "기관인텔리"의 참여검토 분석가입니다. 아래 근거 자료만 사용해
이 기관 입찰 참여 여부에 대한 분석을 답하세요. 반드시 **영업 / 전산 / 예산** 세 관점을
각각 짚고, 마지막에 강점·리스크를 요약하세요. 근거 자료에 없는 내용은 지어내지 말고,
모르면 모른다고 하세요. 인용은 [파일명] 형태로 표시하세요.

기관: {institution_name}

근거 자료:
{corpus}

이전 대화:
{history}

질문:
{user_message}
"""


def _load_consult_corpus(
    giganlist_dir: str | None, rfp_text_path: str | None, user_message: str, index_db_path: str
) -> str:
    parts = []
    # 기관 코퍼스: 검색 우선(영업 필터가 spec+bank_ideas로 가장 넓다) → 통째 읽기 폴백
    searched = _search_team_corpus(giganlist_dir, "영업", user_message, index_db_path)
    corpus = searched if searched is not None else _load_team_corpus(giganlist_dir, "영업")
    if corpus and "자료 없음" not in corpus:
        parts.append(corpus)
    if rfp_text_path and os.path.isfile(rfp_text_path):
        with open(rfp_text_path, encoding="utf-8") as f:
            parts.append(f"[rfp_text.txt]\n{f.read()}")
    return "\n\n".join(parts) if parts else "(자료 없음 — 반입된 공고·조사 자료가 아직 없음)"


def stream_consult_reply(
    institution_name: str,
    giganlist_dir: str | None,
    rfp_text_path: str | None,
    history: list[dict],
    user_message: str,
    index_db_path: str = DEFAULT_INDEX_DB_PATH,
):
    corpus = _load_consult_corpus(giganlist_dir, rfp_text_path, user_message, index_db_path)
    history_text = "\n".join(f"{m['role']}: {m['content']}" for m in history) or "(없음)"
    prompt = CONSULT_PROMPT.format(
        institution_name=institution_name, corpus=corpus,
        history=history_text, user_message=user_message,
    )
    llm = get_llm()
    for chunk in llm.stream(prompt):
        if chunk.content:
            yield chunk.content
```

주의: `_search_team_corpus`의 giganlist_dir 인자는 `corpus/institutions/{id}` 형태를 기대(접두사 검사) — 테스트의 tmp 경로에서는 None을 반환해 폴백을 타는 것이 정상 경로다.

- [ ] **Step 4: Run to verify pass** — 3 passed.
- [ ] **Step 5: Commit** — `feat(backend): 참여검토 어댑터 stream_consult_reply — 3관점 분석 (A2 Task 2)`

---

### Task 3: 대화 라우터 — `POST/GET /institutions/{id}/chat`

**Files:**
- Create: `backend/routers/chat.py`
- Modify: `backend/main.py` (라우터 등록)
- Test: `backend/tests/test_api_chat.py`

**Interfaces:**
- Consumes: Task 1의 chat_repository, Task 2의 `stream_consult_reply`, 기존 `get_institution`·`app.state.output_root`.
- Produces: `POST /institutions/{id}/chat` body `{"content": str}` → `text/event-stream` 스트리밍(끝나면 user·agent 메시지 저장, `backend/routers/tasks.py:105`의 event_stream 패턴 그대로). 404(기관 없음). `GET /institutions/{id}/chat` → `list[ChatMessage]`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_api_chat.py`:

```python
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.db import get_connection
from backend.main import create_app


def _app(tmp_path):
    app = create_app(str(tmp_path / "registry.db"), output_root=str(tmp_path / "out"),
                     graph_db_path=str(tmp_path / "graph.db"))
    conn = get_connection(str(tmp_path / "registry.db"))
    conn.execute(
        "INSERT INTO institutions (institution_id, name_ko, giganlist_dir, stage)"
        " VALUES ('dobong', '도봉구', 'corpus/institutions/dobong', 2)"
    )
    conn.commit(); conn.close()
    return app


@patch("backend.routers.chat.stream_consult_reply")
def test_chat_streams_and_persists_both_sides(mock_stream, tmp_path):
    mock_stream.return_value = iter(["참여 ", "권장"])
    client = TestClient(_app(tmp_path))

    r = client.post("/institutions/dobong/chat", json={"content": "어떻게 생각해?"})
    assert r.status_code == 200
    assert r.text == "참여 권장"

    history = client.get("/institutions/dobong/chat").json()
    assert [(m["role"], m["content"]) for m in history] == [
        ("user", "어떻게 생각해?"), ("agent", "참여 권장"),
    ]
    # 어댑터에 기관명·질문이 전달됐는지
    kwargs = mock_stream.call_args
    assert kwargs.kwargs.get("institution_name") or kwargs.args[0] == "도봉구"


def test_chat_unknown_institution_404(tmp_path):
    client = TestClient(_app(tmp_path))
    assert client.post("/institutions/ghost/chat", json={"content": "hi"}).status_code == 404
    assert client.get("/institutions/ghost/chat").status_code == 404


@patch("backend.routers.chat.stream_consult_reply")
def test_second_question_carries_history(mock_stream, tmp_path):
    mock_stream.side_effect = [iter(["첫 답"]), iter(["둘째 답"])]
    client = TestClient(_app(tmp_path))
    client.post("/institutions/dobong/chat", json={"content": "질문1"})
    client.post("/institutions/dobong/chat", json={"content": "질문2"})

    second_call = mock_stream.call_args_list[1]
    history_arg = second_call.kwargs.get("history") or second_call.args[3]
    assert [(m["role"], m["content"]) for m in history_arg] == [
        ("user", "질문1"), ("agent", "첫 답"),
    ]
```

- [ ] **Step 2: Run to verify fail** — 404/ImportError.

- [ ] **Step 3: Implement** — `backend/routers/chat.py`:

```python
import os

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.agent_adapter import stream_consult_reply
from backend.chat_repository import add_chat_message, list_chat_messages
from backend.db import get_connection
from backend.models import ChatMessage
from backend.repository import get_institution

router = APIRouter(prefix="/institutions", tags=["chat"])


class ChatIn(BaseModel):
    content: str


@router.get("/{institution_id}/chat", response_model=list[ChatMessage])
def get_chat(institution_id: str, request: Request) -> list[ChatMessage]:
    conn = get_connection(request.app.state.db_path)
    try:
        if get_institution(conn, institution_id) is None:
            raise HTTPException(status_code=404, detail="institution not found")
        return list_chat_messages(conn, institution_id)
    finally:
        conn.close()


@router.post("/{institution_id}/chat")
def post_chat(institution_id: str, body: ChatIn, request: Request) -> StreamingResponse:
    db_path = request.app.state.db_path
    conn = get_connection(db_path)
    inst = get_institution(conn, institution_id)
    if inst is None:
        conn.close()
        raise HTTPException(status_code=404, detail="institution not found")
    history = [
        {"role": m.role, "content": m.content} for m in list_chat_messages(conn, institution_id)
    ]
    add_chat_message(conn, institution_id, "user", body.content)
    conn.close()

    # 반입된 공고 원문이 있으면 근거에 포함 (stage 3 산출물)
    rfp_text_path = os.path.join(request.app.state.output_root, inst.name_ko, "rfp_text.txt")
    index_db_path = request.app.state.index_db_path

    def event_stream():
        reply_parts = []
        for chunk in stream_consult_reply(
            institution_name=inst.name_ko,
            giganlist_dir=inst.giganlist_dir,
            rfp_text_path=rfp_text_path if os.path.isfile(rfp_text_path) else None,
            history=history,
            user_message=body.content,
            index_db_path=index_db_path,
        ):
            reply_parts.append(chunk)
            yield chunk
        write_conn = get_connection(db_path)
        try:
            add_chat_message(write_conn, institution_id, "agent", "".join(reply_parts))
        finally:
            write_conn.close()

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

`backend/main.py`: `from backend.routers.chat import router as chat_router` + `app.include_router(chat_router)`.

- [ ] **Step 4: Run to verify pass** — 3 passed + backend 전체 무회귀.
- [ ] **Step 5: Commit** — `feat(backend): 기관 대화 API — 참여검토 스트리밍 + 이력 (A2 Task 3)`

---

### Task 4: 업로드 + 즉시검사 — `POST /tasks/{id}/upload` + coverage_map.json

**Files:**
- Create: `backend/upload_check.py`
- Modify: `backend/routers/tasks.py` (엔드포인트 1개 추가)
- Test: `backend/tests/test_upload_check.py`, `backend/tests/test_api_upload.py`

**Interfaces:**
- Consumes: `agent.nodes.verification.verification_node`(scoring_table+sections→coverage_report), `agent.nodes.role_router.role_router_node`, `agent.orchestrator.pii.scan_pii`, 기존 `update_draft_content`/`add_message`/`get_task`.
- Produces:
  - `check_upload(scoring_path, team, content) -> dict` — `{"coverage": [{scoring_item, covered, gap_note}], "pii": [...], "skipped": str | None}`. `scoring_path`(rfp_scoring.json) 없으면 coverage 생략(`skipped` 사유), PII는 항상 수행. **PII는 content 전체 검사**(F8 취지 — 업로드는 단일 텍스트라 title/sources 구분 없음).
  - `write_coverage_map(out_dir, team, coverage, pii_count)` — `coverage_map.json`을 읽어 항목별 `{team, covered, gap_note, pii_count}` 병합 저장.
  - API: `POST /tasks/{task_id}/upload` body `{"content": str}` + `X-User-Id`(assignee만, 아니면 403; task 없으면 404) → draft_content 갱신, 검사 실행, 결과를 task messages에 "agent" 역할로 기록, 응답 `{"coverage": ..., "pii_count": int, "skipped": ...}`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_upload_check.py`:

```python
import json
from unittest.mock import MagicMock, patch

from backend.upload_check import check_upload, write_coverage_map


def _scoring(tmp_path):
    p = tmp_path / "rfp_scoring.json"
    p.write_text(json.dumps({
        "rfp_title": "공고", "total_score": 100,
        "criteria": [
            {"category": "사업", "item": "전산 시스템 구축", "score": 20, "description": None},
            {"category": "기타", "item": "지역 기여", "score": 10, "description": None},
        ],
    }, ensure_ascii=False), encoding="utf-8")
    return str(p)


@patch("backend.upload_check.verification_node")
def test_checks_only_items_routed_to_team(mock_verify, tmp_path):
    mock_verify.return_value = {"coverage_report": [
        {"scoring_item": "전산 시스템 구축", "covered": True, "gap_note": None},
    ]}
    result = check_upload(_scoring(tmp_path), "전산", "IT 구축 방안 본문")

    assert result["skipped"] is None
    assert [c["scoring_item"] for c in result["coverage"]] == ["전산 시스템 구축"]
    # verification_node에 전산 배정 항목만 들어갔는지
    state = mock_verify.call_args[0][0]
    assert [e["item"] for e in state["scoring_table"]] == ["전산 시스템 구축"]
    assert state["sections"][0]["content"] == "IT 구축 방안 본문"


def test_missing_scoring_skips_coverage_but_scans_pii(tmp_path):
    result = check_upload(str(tmp_path / "none.json"), "예산", "연락처 010-1234-5678")
    assert result["coverage"] == []
    assert result["skipped"] is not None
    assert result["pii"][0]["kind"] == "휴대폰"


def test_write_coverage_map_merges_by_item(tmp_path):
    out = tmp_path / "out"
    write_coverage_map(str(out), "전산", [
        {"scoring_item": "전산 시스템 구축", "covered": True, "gap_note": None},
    ], pii_count=0)
    write_coverage_map(str(out), "예산", [
        {"scoring_item": "비용 적정성", "covered": False, "gap_note": "근거 부족"},
    ], pii_count=1)

    data = json.loads((out / "coverage_map.json").read_text(encoding="utf-8"))
    assert data["전산 시스템 구축"]["team"] == "전산"
    assert data["비용 적정성"]["pii_count"] == 1
```

`backend/tests/test_api_upload.py`:

```python
import json
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.db import get_connection
from backend.main import create_app


def _app(tmp_path):
    app = create_app(str(tmp_path / "registry.db"), output_root=str(tmp_path / "out"),
                     graph_db_path=str(tmp_path / "graph.db"))
    conn = get_connection(str(tmp_path / "registry.db"))
    conn.execute("INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('nowon','노원구',6)")
    conn.execute("INSERT INTO bid_cases (bid_case_id, institution_id) VALUES ('bc-1','nowon')")
    conn.execute("INSERT INTO tasks (task_id, bid_case_id, team, assignee) VALUES ('task-1','bc-1','전산','it-user')")
    conn.commit(); conn.close()
    return app


@patch("backend.routers.tasks.check_upload")
def test_upload_updates_draft_and_records_check(mock_check, tmp_path):
    mock_check.return_value = {"coverage": [{"scoring_item": "전산 시스템 구축", "covered": True, "gap_note": None}],
                               "pii": [], "skipped": None}
    client = TestClient(_app(tmp_path))
    r = client.post("/tasks/task-1/upload", json={"content": "IT 본문"},
                    headers={"X-User-Id": "it-user"})
    assert r.status_code == 200
    assert r.json()["pii_count"] == 0

    conn = get_connection(str(tmp_path / "registry.db"))
    assert conn.execute("SELECT draft_content FROM tasks WHERE task_id='task-1'").fetchone()[0] == "IT 본문"
    msgs = conn.execute("SELECT role, content FROM messages WHERE task_id='task-1'").fetchall()
    assert len(msgs) == 1 and msgs[0]["role"] == "agent" and "검사" in msgs[0]["content"]


def test_upload_wrong_user_403_and_missing_404(tmp_path):
    client = TestClient(_app(tmp_path))
    assert client.post("/tasks/task-1/upload", json={"content": "x"},
                       headers={"X-User-Id": "someone-else"}).status_code == 403
    assert client.post("/tasks/nope/upload", json={"content": "x"},
                       headers={"X-User-Id": "u"}).status_code == 404
```

- [ ] **Step 2: Run to verify fail.**

- [ ] **Step 3: Implement**

`backend/upload_check.py`:

```python
"""업로드 즉시검사 — 검증가의 단건 실행 (스펙 §④ 검증가: 6단계 업로드마다 즉시).

배정은 role_router_node 규칙 라우팅으로 재현한다(그래프 state를 벗어난 API 경로라
role_assignments가 없다). coverage는 팀 배정 항목만, PII는 업로드 본문 전체.
"""

import json
import os

from agent.nodes.role_router import role_router_node
from agent.nodes.verification import verification_node
from agent.orchestrator.pii import scan_pii


def check_upload(scoring_path: str, team: str, content: str) -> dict:
    pii = scan_pii(content)
    if not os.path.isfile(scoring_path):
        return {"coverage": [], "pii": pii,
                "skipped": "배점표 미추출(rfp_scoring.json 없음) — coverage 검사 생략"}

    with open(scoring_path, encoding="utf-8") as f:
        criteria = json.load(f).get("criteria", [])
    assignments = role_router_node({"scoring_table": criteria})["role_assignments"]
    assigned = {a["scoring_item"] for a in assignments if a["role"] == team}
    team_table = [c for c in criteria if c["item"] in assigned]
    if not team_table:
        return {"coverage": [], "pii": pii,
                "skipped": f"{team}팀 배정 항목 없음 — coverage 검사 생략"}

    sections = [
        {"scoring_item": c["item"], "title": f"{team}팀 작성물", "content": content, "sources": []}
        for c in team_table
    ]
    report = verification_node({"scoring_table": team_table, "sections": sections})
    return {"coverage": report["coverage_report"], "pii": pii, "skipped": None}


def write_coverage_map(out_dir: str, team: str, coverage: list[dict], pii_count: int) -> None:
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "coverage_map.json")
    data = {}
    if os.path.isfile(path):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    for c in coverage:
        data[c["scoring_item"]] = {
            "team": team, "covered": c["covered"],
            "gap_note": c["gap_note"], "pii_count": pii_count,
        }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
```

`backend/routers/tasks.py`에 추가(기존 import에 `check_upload`·`write_coverage_map`·`os` 추가):

```python
class TaskUploadIn(TaskMessageIn):
    pass  # {"content": str} — 동일 형태지만 의미가 달라 별명으로 둔다


@router.post("/{task_id}/upload")
def post_task_upload(
    task_id: str, body: TaskUploadIn, request: Request, x_user_id: str = Header(...)
):
    conn = _conn(request)
    try:
        task = get_task(conn, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="task not found")
        if task.assignee != x_user_id:
            raise HTTPException(status_code=403, detail="only the assignee can upload")
        update_draft_content(conn, task_id, body.content)

        row = conn.execute(
            "SELECT i.name_ko FROM bid_cases b JOIN institutions i ON i.institution_id = b.institution_id"
            " WHERE b.bid_case_id = ?", (task.bid_case_id,)
        ).fetchone()
        out_dir = os.path.join(request.app.state.output_root, row["name_ko"]) if row else None
        scoring_path = os.path.join(out_dir, "rfp_scoring.json") if out_dir else ""

        result = check_upload(scoring_path, task.team, body.content)
        uncovered = [c for c in result["coverage"] if not c["covered"]]
        summary = (
            f"업로드 즉시검사 — 담당 {len(result['coverage'])}항목 중 미달 {len(uncovered)}건,"
            f" PII {len(result['pii'])}건"
            + (f" ({result['skipped']})" if result["skipped"] else "")
        )
        add_message(conn, task_id, "agent", summary)
        if out_dir and result["coverage"]:
            write_coverage_map(out_dir, task.team, result["coverage"], len(result["pii"]))
        return {"coverage": result["coverage"], "pii_count": len(result["pii"]),
                "skipped": result["skipped"]}
    finally:
        conn.close()
```

- [ ] **Step 4: Run to verify pass** — 신규 5 passed + backend 전체 무회귀.
- [ ] **Step 5: Commit** — `feat(backend): 작성물 업로드 + 검증가 즉시검사 + coverage_map (A2 Task 4)`

---

### Task 5: 완료 아카이브 — `POST /institutions/{id}/complete`

**Files:**
- Create: `backend/archive.py`
- Modify: `backend/routers/workflow.py` (엔드포인트 1개)
- Test: `backend/tests/test_archive.py`, `backend/tests/test_api_complete.py`

**Interfaces:**
- Consumes: `data/report_new/{기관명}/`의 산출물, tasks/messages 테이블.
- Produces: `archive_institution(conn, institution, output_root, archive_root) -> str(아카이브 경로)` — `{archive_root}/{기관명}/{YYYY-MM-DD}/`에 산출물 파일 복사 + `tasks_dump.json`(팀별 status·draft_content·messages) + `manifest.json`(파일 목록·archived_at·by는 라우터가 채움). API: stage 9가 아니면 409, 완료 시 `bid_cases.participation_status='제출완료'` 갱신 + 200 `{"archive_dir": ...}`. `create_app`에 `archive_root: str = "data/report_archive"` 파라미터 추가.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_archive.py`:

```python
import json

from backend.archive import archive_institution
from backend.db import get_connection, init_db


def test_archives_artifacts_and_dumps_tasks(tmp_path):
    db = init_db(str(tmp_path / "r.db"))
    db.execute("INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('nowon','노원구',9)")
    db.execute("INSERT INTO bid_cases (bid_case_id, institution_id) VALUES ('bc-1','nowon')")
    db.execute("INSERT INTO tasks (task_id, bid_case_id, team, status, draft_content)"
               " VALUES ('task-1','bc-1','전산','2차완료','IT 본문')")
    db.execute("INSERT INTO messages (message_id, task_id, role, content, created_at)"
               " VALUES ('msg-1','task-1','agent','검사 완료','2026-07-31T00:00:00')")
    db.commit()

    out = tmp_path / "report_new" / "노원구"
    out.mkdir(parents=True)
    (out / "rfp_text.txt").write_text("원문", encoding="utf-8")
    (out / "coverage_map.json").write_text("{}", encoding="utf-8")

    from backend.repository import get_institution
    inst = get_institution(db, "nowon")
    dest = archive_institution(db, inst, str(tmp_path / "report_new"), str(tmp_path / "archive"))

    files = {p.name for p in __import__("pathlib").Path(dest).iterdir()}
    assert {"rfp_text.txt", "coverage_map.json", "tasks_dump.json", "manifest.json"} <= files
    dump = json.loads((__import__("pathlib").Path(dest) / "tasks_dump.json").read_text(encoding="utf-8"))
    assert dump[0]["team"] == "전산" and dump[0]["messages"][0]["content"] == "검사 완료"
    manifest = json.loads((__import__("pathlib").Path(dest) / "manifest.json").read_text(encoding="utf-8"))
    assert "rfp_text.txt" in manifest["files"] and manifest["institution_id"] == "nowon"
```

`backend/tests/test_api_complete.py`:

```python
from fastapi.testclient import TestClient

from backend.db import get_connection
from backend.main import create_app


def _app(tmp_path, stage):
    app = create_app(str(tmp_path / "r.db"), output_root=str(tmp_path / "out"),
                     graph_db_path=str(tmp_path / "g.db"), archive_root=str(tmp_path / "arch"))
    conn = get_connection(str(tmp_path / "r.db"))
    conn.execute("INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('nowon','노원구',?)", (stage,))
    conn.execute("INSERT INTO bid_cases (bid_case_id, institution_id) VALUES ('bc-1','nowon')")
    conn.commit(); conn.close()
    return app


def test_complete_archives_and_marks(tmp_path):
    (tmp_path / "out" / "노원구").mkdir(parents=True)
    (tmp_path / "out" / "노원구" / "rfp_text.txt").write_text("원문", encoding="utf-8")
    client = TestClient(_app(tmp_path, stage=9))

    r = client.post("/institutions/nowon/complete", headers={"X-User-Id": "sales-team"})
    assert r.status_code == 200
    assert "arch" in r.json()["archive_dir"]

    conn = get_connection(str(tmp_path / "r.db"))
    assert conn.execute("SELECT participation_status FROM bid_cases WHERE bid_case_id='bc-1'").fetchone()[0] == "제출완료"


def test_complete_before_stage9_409(tmp_path):
    client = TestClient(_app(tmp_path, stage=6))
    assert client.post("/institutions/nowon/complete", headers={"X-User-Id": "u"}).status_code == 409
```

- [ ] **Step 2: Run to verify fail.**

- [ ] **Step 3: Implement**

`backend/archive.py`:

```python
"""완료 아카이브 — 스펙 §② 17. 최종 승인 후 작업물 일체를 내부 저장소에 남긴다.

FTS 색인 확장은 지식시스템 탭(계획 C)과 함께 — 여기서는 실물 보존과 manifest까지.
"""

import json
import os
import shutil
import sqlite3
from datetime import datetime, timezone

from backend.models import Institution

ARTIFACT_NAMES = ("rfp_text.txt", "rfp_scoring.json", "coverage_map.json")


def archive_institution(
    conn: sqlite3.Connection, institution: Institution, output_root: str, archive_root: str
) -> str:
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    dest = os.path.join(archive_root, institution.name_ko, day)
    os.makedirs(dest, exist_ok=True)

    src_dir = os.path.join(output_root, institution.name_ko)
    copied = []
    if os.path.isdir(src_dir):
        for name in os.listdir(src_dir):
            if name in ARTIFACT_NAMES or name.endswith(".pptx"):
                shutil.copy2(os.path.join(src_dir, name), os.path.join(dest, name))
                copied.append(name)

    tasks = []
    for t in conn.execute(
        """SELECT t.* FROM tasks t JOIN bid_cases b ON b.bid_case_id = t.bid_case_id
           WHERE b.institution_id = ?""", (institution.institution_id,)
    ).fetchall():
        messages = [dict(m) for m in conn.execute(
            "SELECT role, content, created_at FROM messages WHERE task_id = ? ORDER BY created_at",
            (t["task_id"],),
        ).fetchall()]
        tasks.append({**dict(t), "messages": messages})
    with open(os.path.join(dest, "tasks_dump.json"), "w", encoding="utf-8") as f:
        json.dump(tasks, f, ensure_ascii=False, indent=2)

    manifest = {
        "institution_id": institution.institution_id,
        "name_ko": institution.name_ko,
        "archived_at": datetime.now(timezone.utc).isoformat(),
        "files": copied + ["tasks_dump.json"],
    }
    with open(os.path.join(dest, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    return dest
```

`backend/routers/workflow.py`에 추가:

```python
@router.post("/{institution_id}/complete")
def post_complete(institution_id: str, request: Request, x_user_id: str = Header(...)):
    conn = get_connection(request.app.state.db_path)
    try:
        inst = get_institution(conn, institution_id)
        if inst is None:
            raise HTTPException(status_code=404, detail="institution not found")
        if inst.stage != 9:
            raise HTTPException(status_code=409, detail="stage 9(제출 대기)에서만 완료할 수 있다")
        dest = archive_institution(
            conn, inst, request.app.state.output_root, request.app.state.archive_root
        )
        conn.execute(
            "UPDATE bid_cases SET participation_status = '제출완료' WHERE institution_id = ?",
            (institution_id,),
        )
        conn.commit()
        return {"archive_dir": dest, "completed_by": x_user_id}
    finally:
        conn.close()
```

`backend/main.py`: `create_app`에 `archive_root: str = "data/report_archive"` → `app.state.archive_root`.

- [ ] **Step 4: Run to verify pass** — 신규 3 passed + 전체 무회귀.
- [ ] **Step 5: Commit** — `feat(backend): 완료 아카이브 — 산출물·작업기록 보존 + 제출완료 마킹 (A2 Task 5)`

---

### Task 6: A1 이월 픽스 묶음 (F5·F6·F7·F9·F10)

**Files:**
- Modify: `backend/routers/workflow.py` (F5·F10), `backend/orchestrator_service.py` (F9·F10 경유), `agent/orchestrator/state.py`+`graph.py` (F6·F7), `backend/orchestrator_recorder.py` 무변경
- Test: 기존 `backend/tests/test_api_workflow.py`·`agent/tests/test_orchestrator_graph.py` 확장

**Interfaces:**
- Produces: `run` 400 조건 완화(F5), `OrchestratorState.archive_dir`(F6), 게이트 도달 시 `notify(역할, "결재요청", …)`(F7 — **행 기록만**, 읽기 라우터 금지), `resume` 주석(F9), `CheckpointIn.by: str | None`(F10 — 있으면 messages 기록에 by 사용, 없으면 X-User-Id).

- [ ] **Step 1: 각 픽스의 실패 테스트 추가** (하나의 커밋으로 묶되 테스트 먼저)

`backend/tests/test_api_workflow.py`에:

```python
def test_run_allows_manual_artifacts_without_rfp_path(tmp_path):
    """F5: rfp_path가 없어도 사람이 rfp-locate로 만든 산출물이 있으면 실행 가능."""
    app = _app(tmp_path)
    conn = get_connection(str(tmp_path / "registry.db"))
    conn.execute("UPDATE institutions SET rfp_path = NULL WHERE institution_id='nowon'")
    conn.commit(); conn.close()
    out = tmp_path / "report_new" / "노원구"
    out.mkdir(parents=True)
    (out / "rfp_scoring.json").write_text("{}", encoding="utf-8")
    (out / "rfp_text.txt").write_text("수기 반입", encoding="utf-8")

    client = TestClient(app)
    assert client.post("/institutions/nowon/run").status_code == 202
```

(주의: `_app`의 output_root는 `tmp_path/"report_new"`로 맞춘다 — 기존 `_app`이 다르면 이 테스트만 별도 앱 생성.)

`agent/tests/test_orchestrator_graph.py`에 (기존 mock 배선 재사용):

```python
def test_gates_send_approval_request_notifications(...):
    """F7: 게이트 도달 시 결재요청 알림 행이 기록된다."""
    recorder = MagicMock()
    graph = build_workflow_graph(recorder, MemorySaver())
    graph.invoke(BASE_INPUT, CFG)   # 기획승인 게이트 도달
    kinds = [c.args[1] for c in recorder.notify.call_args_list]
    assert "결재요청" in kinds
```

F10 테스트: checkpoint에 `{"approved": true, "comment": null, "by": "김영업"}`을 보내면 messages에 "김영업"이 기록되는지 — API 흐름 테스트에 단언 추가.

- [ ] **Step 2: Implement**

- F5 (`workflow.py post_run`): `if not inst.rfp_path and not artifacts_exist(request.app.state.output_root, inst.name_ko): raise 400` (`from agent.pipeline import artifacts_exist`).
- F6 (`state.py`): `archive_dir: str` 채널 추가 + `post_run`의 run_input에 `"archive_dir": "report_archive"` — 아니, 실존 경로 `data/report_archive`(Task 5의 archive_root와 통일)로 배선. `rfi_agent`는 이미 `{**state}`를 노드에 넘기므로 `institution_match_node`가 `archive_dir`를 읽게 된다.
- F7 (`graph.py` 게이트들): `interrupt(...)` **이전이 아니라, 게이트 진입을 알리는 별도 지점**이 필요 — interrupt 재실행 시 중복 기록되므로, 게이트 직전 노드(draft 완료 후/verifier 완료 후)의 끝에서 notify하거나, 게이트 노드에서 "이미 보냈는지"를 상태 플래그로 확인. **간단한 선택**: `draft` 합류 후 통과 노드 없이 — `_gate_plan`에서 interrupt 전에 notify하되 중복 무해로 두는 것은 금지(전 태스크 리뷰 원칙). 구현: `rfi`/`packager`/`verifier`처럼 게이트 직전에 실행되는 노드의 마지막에 `recorder.notify("영업팀"/"영업팀"/"인사권자", "결재요청", ...)` 추가 — draft는 팬아웃이라 3회 중복되므로 기획승인 알림은 **draft가 아니라 `_gate_plan` 진입 전용 통과 노드 `announce_plan`**을 추가해 1회만 보낸다(노드 이름 계약에 추가되는 것을 보고서에 기록).
- F9 (`orchestrator_service.py`): resume의 `pending_gate` 호출 위 주석 — "Lock 비재진입: pending_gate에 락을 추가하면 데드락".
- F10 (`workflow.py`): `class CheckpointIn(BaseModel): approved: bool; comment: str | None = None; by: str | None = None` → `svc.resume(..., by=body.by or x_user_id, ...)`.

- [ ] **Step 3: Run** — 관련 테스트 + 전체 `py -3 -m pytest agent backend collector -q` 통과.
- [ ] **Step 4: Commit** — `fix: A1 이월 픽스 — run 조건·archive_dir·결재요청 알림·checkpoint by (A2 Task 6)`

---

### Task 7: 실물 통합 테스트(F4) + 쪽지함 비활성 스텁 + 실행가이드 §7

**Files:**
- Test: `agent/tests/test_orchestrator_integration.py` (신규)
- Modify: `dashboard/index.html` (스텁), `docs/실행가이드_backend-agent.md` (§7)

**Interfaces:**
- Consumes: 전 태스크. 실물 `draft_team`+`content_writer_node`(LLM만 목), 실물 그래프.

- [ ] **Step 1: 통합 테스트 작성** — `agent/tests/test_orchestrator_integration.py`:

```python
"""F4 회귀망 — 실물 subagent 1개를 그래프로 통과시켜 state 채널 유실을 잡는다.

langgraph는 OrchestratorState에 없는 키를 조용히 버린다(A1 최종 리뷰 실측).
draft_team→content_writer 실물 경로가 그래프 채널을 실제로 오가는지 최소 1회 검증.
"""

from unittest.mock import MagicMock, patch

from langgraph.checkpoint.memory import MemorySaver

from agent.orchestrator.graph import build_workflow_graph
from agent.orchestrator.ports import NullRecorder


@patch("agent.nodes.content_writer.structured_llm")
@patch("agent.orchestrator.graph.verifier")
@patch("agent.orchestrator.graph.packager")
@patch("agent.orchestrator.graph.rfi_agent")
def test_real_draft_team_flows_through_graph(mock_rfi, mock_pack, mock_verify, mock_llm, tmp_path):
    # rfi만 목 — draft_team은 실물(content_writer 포함, LLM만 목)
    mock_rfi.side_effect = lambda s, r: {
        "scoring_table": [
            {"category": "기타", "item": "지역 기여", "score": 10, "description": None}],
        "requirements": [],
        "role_assignments": [{"scoring_item": "지역 기여", "role": "영업"}],
        "institution_spec_dir": None,
        "stage": 4,
    }
    section = MagicMock(); section.title = "1. 지역 기여"; section.content = "본문"; section.sources = []
    mock_llm.return_value.invoke.return_value = section
    mock_pack.side_effect = lambda s, r: {"pptx_path": "x.pptx"}
    mock_verify.side_effect = lambda s, r: {
        "coverage_report": [{"scoring_item": "지역 기여", "covered": True, "gap_note": None}],
        "pii_findings": [],
    }

    graph = build_workflow_graph(NullRecorder(), MemorySaver())
    cfg = {"configurable": {"thread_id": "t"}}
    graph.invoke({"institution_id": "t", "institution_name": "테스트구",
                  "giganlist_dir": str(tmp_path), "report_new_dir": str(tmp_path),
                  "rfp_path": None, "stage": 2, "sections": []}, cfg)

    state = graph.get_state(cfg)
    # 실물 draft_team이 만든 section이 그래프 채널에 실제로 실렸다
    assert state.values["sections"][0]["scoring_item"] == "지역 기여"
    assert state.values["sections"][0]["content"] == "본문"
```

- [ ] **Step 2: 쪽지함 비활성 스텁** — `dashboard/index.html`의 사이드바/헤더 영역(기존 마크업 관찰 후 같은 스타일)에:

```html
<!-- 쪽지함 — 기능은 연기(사용자 결정 2026-07-31), UI 자리만 비활성으로 잡아둔다 -->
<button class="notify-stub" disabled title="쪽지함 — 준비 중" aria-disabled="true">✉ 쪽지함</button>
```

스타일은 기존 버튼 클래스에 `opacity:.45; cursor:not-allowed;` 인라인 또는 기존 disabled 관행을 따른다. `node --test dashboard/test/*.test.js` 36/36 무영향 확인.

- [ ] **Step 3: 실행가이드 §7** — chat(POST/GET, 스트리밍)·upload(즉시검사 응답 형태·coverage_map.json 위치)·complete(stage 9 전용, 아카이브 경로) curl 예시 + "쪽지함은 연기 — notifications 행은 쌓이고 있음(결재요청·되물음·이관)" 명시.

- [ ] **Step 4: Run** — 통합 1 passed, 전체 pytest + node 36/36.
- [ ] **Step 5: Commit** — `test+docs: 실물 draft 통합 회귀망 + 쪽지함 비활성 스텁 + 가이드 §7 (A2 Task 7)`

---

## Self-Review 결과

- **Spec/승인범위 coverage**: 대화창=T1~3(체크리스트 2·3·4·18), 업로드 검사=T4(10·11·12), 아카이브=T5(17), 이월 픽스=T6(F5·6·7·9·10), F4+스텁+가이드=T7. 쪽지 연기 준수 — notifications 읽기 라우터 없음(F7은 행 기록만).
- **Placeholder scan**: 없음. T6의 announce_plan 노드 추가는 선택지가 아니라 지시로 명시.
- **Type consistency**: `check_upload` 반환 dict(T4 정의=라우터 사용), `archive_institution(conn, institution, output_root, archive_root)`(T5 정의=라우터 사용), `create_app(archive_root=...)`(T5), `CheckpointIn.by`(T6) — 상호 일치 확인.
