# Institution Intelligence Agent Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the BidCase/Task/Message layer from
`docs/superpowers/specs/2026-07-28-institution-intelligence-agent-design.md` on top of the
existing `backend/` (FastAPI + SQLite, sub-project 0, already merged) and `agent/` (5
LangGraph nodes, partially implemented) code — a 3-tier participation-decision approval
chain per bid case, 3 parallel per-team (영업/IT/예산) Tasks with a 2-tier (본인→팀장)
approval chain each, an SSE streaming chat endpoint backed by a new agent adapter that
routes each team to its own corpus, and a finalize endpoint that hands off to the existing
`institutions.stage` field.

**Architecture:** Two new repository modules (`backend/bidcase_repository.py`,
`backend/task_repository.py`) hold pure DB CRUD; two new routers
(`backend/routers/bidcases.py`, `backend/routers/tasks.py`) own HTTP status codes and the
identity/claim rules the spec left as implementation detail (see Global Constraints). A new
`backend/agent_adapter.py` wraps `agent/llm.py:get_llm()` with a team→corpus routing table
mirroring the E2E spec §⑤ table, reusing the corpus-loading pattern from
`agent/nodes/content_writer.py:_load_spec_content`.

**Tech Stack:** FastAPI, SQLite (stdlib `sqlite3`, no ORM), Pydantic, LangChain
(`langchain_openai.ChatOpenAI` via `agent/llm.py`), pytest, httpx (FastAPI TestClient).

## Global Constraints

- SQLite only, no ORM — same as `backend/db.py`. New tables: `bid_cases`, `tasks`,
  `messages`.
- New IDs use the existing project convention (`secrets.token_hex(4)` → 8 hex chars) with a
  type prefix: `bc-<8hex>` for bid cases, `task-<8hex>` for tasks, `msg-<8hex>` for messages.
- `team` is always one of exactly `"영업"`, `"IT"`, `"예산"` (Python constant
  `TEAMS = ["영업", "IT", "예산"]` in `backend/bidcase_repository.py`) — this fixed order is
  the order the 3 Tasks are created in.
- **Identity**: this repo has no auth/RBAC system (confirmed absent in sub-project 0 too).
  Per the spec's §④ assumption, every task/bidcase-mutating endpoint requires an
  `X-User-Id` header (FastAPI `Header(...)`, i.e. required, missing header → 422) and
  compares it as a plain string — no User table, no session.
- **Assignee/approver claim rule (plan-level decision — the spec left this open)**: a Task
  is created with `assignee=NULL`, `approver=NULL`. The **first** `POST
  /tasks/{id}/messages` caller becomes `assignee` (claim-on-first-message); a later caller
  with a different `X-User-Id` gets 403. The **first** `POST /tasks/{id}/approve` caller
  becomes `approver` the same way. `POST /tasks/{id}/submit` requires the caller to already
  equal `assignee` (i.e. at least one message must exist) — 403 on mismatch.
- `POST /bidcases/{id}/finalize` with `approved=true` sets `institutions.stage = 7` for the
  bid case's institution (reuses the existing `stage` column from sub-project 0 — no new
  "finalized" column). `approved=false` resets all 3 tasks under the bid case to
  `작성중`.
- SSE chat streaming: `backend/agent_adapter.py:stream_chat_reply()` calls
  `get_llm().stream(prompt)` (LangChain's token-streaming API) and yields `chunk.content`
  per chunk; the router wraps this generator in `fastapi.responses.StreamingResponse` with
  `media_type="text/event-stream"`. On stream completion the full concatenated reply is
  persisted as one `role="agent"` Message and written to `Task.draft_content` — a dropped
  connection mid-stream leaves the user's message saved but no partial agent reply persisted
  (per spec §⑥).
- All commands use `py -3` (Windows Store `python`/`pip` stubs). Run from repo root.
- Team corpus routing (mirrors E2E spec §⑤): 영업 → `{giganlist_dir}/spec/*.txt` +
  `{giganlist_dir}/bank_ideas_draft.txt`; IT → files in `{giganlist_dir}/plan/` whose
  filename starts with `"02_"`; 예산 → files in `{giganlist_dir}/plan/` whose filename
  starts with `"03_"` (matches this repo's existing `02_IT디지털기획...`/
  `03_금전적지원...` naming convention documented in `CLAUDE.md`).
- Every new repository/router file gets a matching test file under `backend/tests/`,
  following the existing `test_repository.py`/`test_api_institutions.py` pattern (real
  SQLite via `tmp_path`, `unittest.mock.patch` on `get_llm`, FastAPI `TestClient`).

---

### Task 1: DB schema — `bid_cases` / `tasks` / `messages` tables

**Files:**
- Modify: `backend/db.py`
- Test: `backend/tests/test_db.py`

**Interfaces:**
- Consumes: nothing new (extends existing `SCHEMA` string, `init_db`, `get_connection`).
- Produces: `bid_cases(bid_case_id, institution_id, schedule_confidence, expected_date,
  confirmed_date, last_synced_at, participation_status, participation_decision)`,
  `tasks(task_id, bid_case_id, team, status, progress_pct, draft_content, assignee,
  approver)` with `UNIQUE(bid_case_id, team)`, `messages(message_id, task_id, role, content,
  created_at)` — later tasks read/write these via raw SQL.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_db.py` (keep the existing `institutions`-table tests in that
file untouched, add these below them):

```python
def test_init_db_creates_bid_case_task_message_tables(tmp_path):
    db_path = str(tmp_path / "test.db")
    conn = init_db(db_path)

    conn.execute(
        """INSERT INTO institutions (institution_id, name_ko, stage)
           VALUES ('mapo', '마포구', 1)"""
    )
    conn.execute(
        """INSERT INTO bid_cases
           (bid_case_id, institution_id, schedule_confidence, participation_status,
            participation_decision, last_synced_at)
           VALUES ('bc-1', 'mapo', '예상', '검토중', '[]', '2026-07-28T00:00:00+00:00')"""
    )
    conn.execute(
        """INSERT INTO tasks (task_id, bid_case_id, team, status, progress_pct, draft_content)
           VALUES ('task-1', 'bc-1', '영업', '대기', 0, '')"""
    )
    conn.execute(
        """INSERT INTO messages (message_id, task_id, role, content, created_at)
           VALUES ('msg-1', 'task-1', 'user', '안녕', '2026-07-28T00:00:01+00:00')"""
    )
    conn.commit()

    bid_case = conn.execute("SELECT * FROM bid_cases WHERE bid_case_id = 'bc-1'").fetchone()
    task = conn.execute("SELECT * FROM tasks WHERE task_id = 'task-1'").fetchone()
    message = conn.execute("SELECT * FROM messages WHERE message_id = 'msg-1'").fetchone()

    assert bid_case["institution_id"] == "mapo"
    assert task["team"] == "영업"
    assert message["content"] == "안녕"
    conn.close()


def test_tasks_table_rejects_duplicate_team_per_bid_case(tmp_path):
    import sqlite3

    db_path = str(tmp_path / "test.db")
    conn = init_db(db_path)
    conn.execute(
        "INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('mapo', '마포구', 1)"
    )
    conn.execute(
        """INSERT INTO bid_cases (bid_case_id, institution_id, participation_decision)
           VALUES ('bc-1', 'mapo', '[]')"""
    )
    conn.execute(
        """INSERT INTO tasks (task_id, bid_case_id, team, status, progress_pct, draft_content)
           VALUES ('task-1', 'bc-1', '영업', '대기', 0, '')"""
    )
    conn.commit()

    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            """INSERT INTO tasks (task_id, bid_case_id, team, status, progress_pct, draft_content)
               VALUES ('task-2', 'bc-1', '영업', '대기', 0, '')"""
        )
    conn.close()
```

Make sure `backend/tests/test_db.py` has `import pytest` at the top (check first — it may
already be there from existing tests).

- [ ] **Step 2: Run test to verify it fails**

Run: `py -3 -m pytest backend/tests/test_db.py -v`
Expected: FAIL — `sqlite3.OperationalError: no such table: bid_cases`

- [ ] **Step 3: Extend the schema**

In `backend/db.py`, change the `SCHEMA` string to add the 3 new tables after the existing
`institutions` table (keep the `institutions` table definition exactly as-is):

```python
SCHEMA = """
CREATE TABLE IF NOT EXISTS institutions (
    institution_id TEXT PRIMARY KEY,
    name_ko        TEXT NOT NULL,
    region_code    TEXT,
    type           TEXT,
    contract_end   TEXT,
    last_bid       TEXT,
    term           INTEGER,
    stage          INTEGER NOT NULL DEFAULT 1,
    giganlist_dir  TEXT,
    rfp_path       TEXT,
    scoring_table  TEXT,
    pptx_path      TEXT
);

CREATE TABLE IF NOT EXISTS bid_cases (
    bid_case_id            TEXT PRIMARY KEY,
    institution_id         TEXT NOT NULL REFERENCES institutions(institution_id),
    schedule_confidence    TEXT NOT NULL DEFAULT '예상',
    expected_date          TEXT,
    confirmed_date          TEXT,
    last_synced_at         TEXT,
    participation_status   TEXT NOT NULL DEFAULT '검토중',
    participation_decision TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS tasks (
    task_id       TEXT PRIMARY KEY,
    bid_case_id   TEXT NOT NULL REFERENCES bid_cases(bid_case_id),
    team          TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT '대기',
    progress_pct  INTEGER NOT NULL DEFAULT 0,
    draft_content TEXT NOT NULL DEFAULT '',
    assignee      TEXT,
    approver      TEXT,
    UNIQUE(bid_case_id, team)
);

CREATE TABLE IF NOT EXISTS messages (
    message_id TEXT PRIMARY KEY,
    task_id    TEXT NOT NULL REFERENCES tasks(task_id),
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""
```

`get_connection` and `init_db` need no changes — `init_db` already runs the whole `SCHEMA`
string via `conn.execute(SCHEMA)` followed by `conn.commit()`, and `sqlite3.Connection.execute`
with a multi-statement script string runs every `CREATE TABLE` in it.

- [ ] **Step 4: Run test to verify it passes**

Run: `py -3 -m pytest backend/tests/test_db.py -v`
Expected: PASS (all tests in the file, old and new)

- [ ] **Step 5: Commit**

```bash
git add backend/db.py backend/tests/test_db.py
git commit -m "feat(backend): add bid_cases/tasks/messages schema"
```

---

### Task 2: Pydantic models for BidCase / Task / Message

**Files:**
- Modify: `backend/models.py`
- Test: none dedicated — these are pure data classes exercised by Task 3/4's tests. Add one
  quick smoke test to keep the TDD loop honest.
- Test: `backend/tests/test_models.py` (new file)

**Interfaces:**
- Consumes: nothing.
- Produces (used verbatim by every later task — these exact names and fields):
  `ParticipationDecisionIn(tier: int, role: str, by: str, choice: str, comment: str | None)`,
  `ParticipationDecisionEntry(tier, role, by, at: str, choice, comment)`,
  `BidCase(bid_case_id, institution_id, schedule_confidence, expected_date, confirmed_date,
  last_synced_at, participation_status, participation_decision:
  list[ParticipationDecisionEntry])`,
  `TaskSummary(task_id, team, status, progress_pct, assignee, approver)`,
  `BidCaseDetail(BidCase fields..., tasks: list[TaskSummary])`,
  `Task(task_id, bid_case_id, team, status, progress_pct, draft_content, assignee,
  approver)`, `Message(message_id, task_id, role, content, created_at)`,
  `TaskDetail(Task fields..., messages: list[Message])`, `TaskMessageIn(content: str)`,
  `TaskApprovalIn(approved: bool, comment: str | None)`,
  `BidCaseFinalizeIn(approved: bool, comment: str | None)`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_models.py`:

```python
from backend.models import (
    BidCase,
    BidCaseDetail,
    BidCaseFinalizeIn,
    Message,
    ParticipationDecisionEntry,
    ParticipationDecisionIn,
    Task,
    TaskApprovalIn,
    TaskDetail,
    TaskMessageIn,
    TaskSummary,
)


def test_bid_case_defaults():
    bid_case = BidCase(bid_case_id="bc-1", institution_id="mapo")
    assert bid_case.schedule_confidence == "예상"
    assert bid_case.participation_status == "검토중"
    assert bid_case.participation_decision == []


def test_bid_case_detail_carries_task_summaries():
    detail = BidCaseDetail(
        bid_case_id="bc-1",
        institution_id="mapo",
        tasks=[TaskSummary(task_id="task-1", team="영업", status="대기", progress_pct=0)],
    )
    assert detail.tasks[0].team == "영업"


def test_task_and_task_detail_defaults():
    task = Task(task_id="task-1", bid_case_id="bc-1", team="영업")
    assert task.status == "대기"
    assert task.progress_pct == 0
    detail = TaskDetail(**task.model_dump(), messages=[])
    assert detail.messages == []


def test_message_and_input_models():
    message = Message(
        message_id="msg-1", task_id="task-1", role="user", content="안녕",
        created_at="2026-07-28T00:00:00+00:00",
    )
    assert message.role == "user"
    assert TaskMessageIn(content="hi").content == "hi"
    assert TaskApprovalIn(approved=True).comment is None
    assert BidCaseFinalizeIn(approved=False).approved is False


def test_participation_decision_entry_and_input():
    decision_in = ParticipationDecisionIn(
        tier=1, role="실무자", by="alice", choice="참여"
    )
    assert decision_in.comment is None
    entry = ParticipationDecisionEntry(
        tier=1, role="실무자", by="alice", at="2026-07-28T00:00:00+00:00", choice="참여"
    )
    assert entry.tier == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `py -3 -m pytest backend/tests/test_models.py -v`
Expected: FAIL — `ImportError: cannot import name 'BidCase' from 'backend.models'`

- [ ] **Step 3: Add the models**

Append to `backend/models.py` (keep the existing `Institution`/`InstitutionImportRow`
classes untouched):

```python
class ParticipationDecisionIn(BaseModel):
    tier: int
    role: str
    by: str
    choice: str
    comment: str | None = None


class ParticipationDecisionEntry(BaseModel):
    tier: int
    role: str
    by: str
    at: str
    choice: str
    comment: str | None = None


class BidCase(BaseModel):
    bid_case_id: str
    institution_id: str
    schedule_confidence: str = "예상"
    expected_date: str | None = None
    confirmed_date: str | None = None
    last_synced_at: str | None = None
    participation_status: str = "검토중"
    participation_decision: list[ParticipationDecisionEntry] = []


class TaskSummary(BaseModel):
    task_id: str
    team: str
    status: str
    progress_pct: int
    assignee: str | None = None
    approver: str | None = None


class BidCaseDetail(BidCase):
    tasks: list[TaskSummary] = []


class Task(BaseModel):
    task_id: str
    bid_case_id: str
    team: str
    status: str = "대기"
    progress_pct: int = 0
    draft_content: str = ""
    assignee: str | None = None
    approver: str | None = None


class Message(BaseModel):
    message_id: str
    task_id: str
    role: str
    content: str
    created_at: str


class TaskDetail(Task):
    messages: list[Message] = []


class TaskMessageIn(BaseModel):
    content: str


class TaskApprovalIn(BaseModel):
    approved: bool
    comment: str | None = None


class BidCaseFinalizeIn(BaseModel):
    approved: bool
    comment: str | None = None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `py -3 -m pytest backend/tests/test_models.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/models.py backend/tests/test_models.py
git commit -m "feat(backend): add BidCase/Task/Message pydantic models"
```

---

### Task 3: BidCase repository + participation-decision chain + bidcases router

**Files:**
- Create: `backend/bidcase_repository.py`
- Create: `backend/routers/bidcases.py`
- Modify: `backend/main.py` (register the new router)
- Test: `backend/tests/test_bidcase_repository.py`
- Test: `backend/tests/test_api_bidcases.py`

**Interfaces:**
- Consumes: `backend.models.{BidCase, BidCaseDetail, ParticipationDecisionIn,
  ParticipationDecisionEntry, TaskSummary}` (Task 2), `backend.db.get_connection` (existing).
- Produces: `TEAMS = ["영업", "IT", "예산"]` (module constant, imported by Task 4/5/6),
  `ParticipationDecisionError(ValueError)`, `create_bid_case(conn, institution_id,
  schedule_confidence="예상", expected_date=None, confirmed_date=None) -> BidCase`,
  `get_bid_case(conn, bid_case_id) -> BidCase | None`, `list_task_summaries(conn,
  bid_case_id) -> list[TaskSummary]`, `list_bid_cases_for_assignee(conn, team, assignee) ->
  list[BidCase]`, `submit_participation_decision(conn, bid_case_id,
  decision: ParticipationDecisionIn) -> BidCase` (raises `ParticipationDecisionError` on tier
  mismatch or already-decided; creates the 3 Tasks as a side effect once tier 3 "참여" is
  recorded). Router mounts at prefix `/bidcases`.

- [ ] **Step 1: Write the failing repository test**

Create `backend/tests/test_bidcase_repository.py`:

```python
import pytest

from backend.bidcase_repository import (
    ParticipationDecisionError,
    TEAMS,
    create_bid_case,
    get_bid_case,
    list_bid_cases_for_assignee,
    list_task_summaries,
    submit_participation_decision,
)
from backend.db import init_db
from backend.models import ParticipationDecisionIn


@pytest.fixture
def conn(tmp_path):
    db_path = str(tmp_path / "test.db")
    connection = init_db(db_path)
    connection.execute(
        "INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('mapo', '마포구', 1)"
    )
    connection.commit()
    yield connection
    connection.close()


def test_create_and_get_bid_case(conn):
    bid_case = create_bid_case(conn, "mapo")
    assert bid_case.institution_id == "mapo"
    assert bid_case.participation_status == "검토중"
    assert get_bid_case(conn, bid_case.bid_case_id).bid_case_id == bid_case.bid_case_id


def test_get_bid_case_returns_none_when_missing(conn):
    assert get_bid_case(conn, "bc-missing") is None


def test_participation_decision_enforces_tier_order(conn):
    bid_case = create_bid_case(conn, "mapo")
    with pytest.raises(ParticipationDecisionError):
        submit_participation_decision(
            conn, bid_case.bid_case_id,
            ParticipationDecisionIn(tier=2, role="팀장", by="bob", choice="참여"),
        )


def test_participation_decision_non_participate_short_circuits(conn):
    bid_case = create_bid_case(conn, "mapo")
    result = submit_participation_decision(
        conn, bid_case.bid_case_id,
        ParticipationDecisionIn(tier=1, role="실무자", by="alice", choice="미참여"),
    )
    assert result.participation_status == "미참여확정"
    assert list_task_summaries(conn, bid_case.bid_case_id) == []

    with pytest.raises(ParticipationDecisionError):
        submit_participation_decision(
            conn, bid_case.bid_case_id,
            ParticipationDecisionIn(tier=2, role="팀장", by="bob", choice="참여"),
        )


def test_participation_decision_all_three_tiers_creates_tasks(conn):
    bid_case = create_bid_case(conn, "mapo")
    submit_participation_decision(
        conn, bid_case.bid_case_id,
        ParticipationDecisionIn(tier=1, role="실무자", by="alice", choice="참여"),
    )
    submit_participation_decision(
        conn, bid_case.bid_case_id,
        ParticipationDecisionIn(tier=2, role="팀장", by="bob", choice="참여"),
    )
    result = submit_participation_decision(
        conn, bid_case.bid_case_id,
        ParticipationDecisionIn(tier=3, role="부장", by="carol", choice="참여"),
    )

    assert result.participation_status == "참여확정"
    assert len(result.participation_decision) == 3
    summaries = list_task_summaries(conn, bid_case.bid_case_id)
    assert sorted(t.team for t in summaries) == sorted(TEAMS)
    assert all(t.status == "대기" for t in summaries)


def test_list_bid_cases_for_assignee_filters_by_team_and_user(conn):
    bid_case = create_bid_case(conn, "mapo")
    for tier, by in [(1, "alice"), (2, "bob"), (3, "carol")]:
        submit_participation_decision(
            conn, bid_case.bid_case_id,
            ParticipationDecisionIn(tier=tier, role="r", by=by, choice="참여"),
        )
    task = [t for t in list_task_summaries(conn, bid_case.bid_case_id) if t.team == "영업"][0]
    conn.execute("UPDATE tasks SET assignee = 'dave' WHERE task_id = ?", (task.task_id,))
    conn.commit()

    found = list_bid_cases_for_assignee(conn, "영업", "dave")
    assert [b.bid_case_id for b in found] == [bid_case.bid_case_id]
    assert list_bid_cases_for_assignee(conn, "영업", "nobody") == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `py -3 -m pytest backend/tests/test_bidcase_repository.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.bidcase_repository'`

- [ ] **Step 3: Implement `backend/bidcase_repository.py`**

```python
import json
import secrets
import sqlite3
from datetime import datetime, timezone

from backend.models import (
    BidCase,
    ParticipationDecisionEntry,
    ParticipationDecisionIn,
    TaskSummary,
)

TEAMS = ["영업", "IT", "예산"]


class ParticipationDecisionError(ValueError):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_bid_case(row: sqlite3.Row) -> BidCase:
    data = dict(row)
    data["participation_decision"] = json.loads(data["participation_decision"])
    return BidCase(**data)


def create_bid_case(
    conn: sqlite3.Connection,
    institution_id: str,
    schedule_confidence: str = "예상",
    expected_date: str | None = None,
    confirmed_date: str | None = None,
) -> BidCase:
    bid_case_id = f"bc-{secrets.token_hex(4)}"
    conn.execute(
        """INSERT INTO bid_cases
           (bid_case_id, institution_id, schedule_confidence, expected_date,
            confirmed_date, last_synced_at, participation_status, participation_decision)
           VALUES (?, ?, ?, ?, ?, ?, '검토중', '[]')""",
        (bid_case_id, institution_id, schedule_confidence, expected_date, confirmed_date, _now()),
    )
    conn.commit()
    return get_bid_case(conn, bid_case_id)


def get_bid_case(conn: sqlite3.Connection, bid_case_id: str) -> BidCase | None:
    cursor = conn.execute("SELECT * FROM bid_cases WHERE bid_case_id = ?", (bid_case_id,))
    row = cursor.fetchone()
    return _row_to_bid_case(row) if row else None


def list_task_summaries(conn: sqlite3.Connection, bid_case_id: str) -> list[TaskSummary]:
    cursor = conn.execute(
        """SELECT task_id, team, status, progress_pct, assignee, approver
           FROM tasks WHERE bid_case_id = ? ORDER BY team""",
        (bid_case_id,),
    )
    return [TaskSummary(**dict(row)) for row in cursor.fetchall()]


def list_bid_cases_for_assignee(
    conn: sqlite3.Connection, team: str, assignee: str
) -> list[BidCase]:
    cursor = conn.execute(
        """SELECT DISTINCT bc.* FROM bid_cases bc
           JOIN tasks t ON t.bid_case_id = bc.bid_case_id
           WHERE t.team = ? AND t.assignee = ?
           ORDER BY bc.bid_case_id""",
        (team, assignee),
    )
    return [_row_to_bid_case(row) for row in cursor.fetchall()]


def submit_participation_decision(
    conn: sqlite3.Connection, bid_case_id: str, decision: ParticipationDecisionIn
) -> BidCase:
    bid_case = get_bid_case(conn, bid_case_id)
    if bid_case is None:
        raise ParticipationDecisionError(f"bid case not found: {bid_case_id}")
    if bid_case.participation_status != "검토중":
        raise ParticipationDecisionError(
            f"participation already decided: {bid_case.participation_status}"
        )

    expected_tier = len(bid_case.participation_decision) + 1
    if decision.tier != expected_tier:
        raise ParticipationDecisionError(f"expected tier {expected_tier}, got {decision.tier}")

    entry = ParticipationDecisionEntry(
        tier=decision.tier, role=decision.role, by=decision.by, at=_now(),
        choice=decision.choice, comment=decision.comment,
    )
    decisions = bid_case.participation_decision + [entry]
    decisions_json = json.dumps([d.model_dump() for d in decisions], ensure_ascii=False)

    if decision.choice != "참여":
        new_status = "미참여확정" if decision.choice == "미참여" else "보류"
        conn.execute(
            "UPDATE bid_cases SET participation_decision = ?, participation_status = ? "
            "WHERE bid_case_id = ?",
            (decisions_json, new_status, bid_case_id),
        )
        conn.commit()
        return get_bid_case(conn, bid_case_id)

    if decision.tier < 3:
        conn.execute(
            "UPDATE bid_cases SET participation_decision = ? WHERE bid_case_id = ?",
            (decisions_json, bid_case_id),
        )
        conn.commit()
        return get_bid_case(conn, bid_case_id)

    conn.execute(
        "UPDATE bid_cases SET participation_decision = ?, participation_status = '참여확정' "
        "WHERE bid_case_id = ?",
        (decisions_json, bid_case_id),
    )
    for team in TEAMS:
        task_id = f"task-{secrets.token_hex(4)}"
        conn.execute(
            """INSERT INTO tasks (task_id, bid_case_id, team, status, progress_pct, draft_content)
               VALUES (?, ?, ?, '대기', 0, '')""",
            (task_id, bid_case_id, team),
        )
    conn.commit()
    return get_bid_case(conn, bid_case_id)
```

- [ ] **Step 4: Run repository test to verify it passes**

Run: `py -3 -m pytest backend/tests/test_bidcase_repository.py -v`
Expected: PASS

- [ ] **Step 5: Write the failing API test**

Create `backend/tests/test_api_bidcases.py`:

```python
import pytest
from fastapi.testclient import TestClient

from backend.main import create_app


@pytest.fixture
def client(tmp_path):
    db_path = str(tmp_path / "test.db")
    app = create_app(db_path)
    with TestClient(app) as test_client:
        conn = app.state.db_path
        yield test_client, db_path


def _seed_institution(db_path):
    from backend.db import get_connection

    conn = get_connection(db_path)
    conn.execute(
        "INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('mapo', '마포구', 1)"
    )
    conn.commit()
    conn.close()


def test_create_and_get_bid_case_via_api(client):
    test_client, db_path = client
    _seed_institution(db_path)

    create_resp = test_client.post("/bidcases", json={"institution_id": "mapo"})
    assert create_resp.status_code == 200
    bid_case_id = create_resp.json()["bid_case_id"]

    get_resp = test_client.get(f"/bidcases/{bid_case_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["institution_id"] == "mapo"
    assert get_resp.json()["tasks"] == []


def test_get_bid_case_404_when_missing(client):
    test_client, _ = client
    resp = test_client.get("/bidcases/bc-missing")
    assert resp.status_code == 404


def test_participation_decisions_full_chain_creates_tasks(client):
    test_client, db_path = client
    _seed_institution(db_path)
    bid_case_id = test_client.post("/bidcases", json={"institution_id": "mapo"}).json()["bid_case_id"]

    for tier, role, by in [(1, "실무자", "alice"), (2, "팀장", "bob"), (3, "부장", "carol")]:
        resp = test_client.post(
            f"/bidcases/{bid_case_id}/participation-decisions",
            json={"tier": tier, "role": role, "by": by, "choice": "참여"},
        )
        assert resp.status_code == 200

    detail = test_client.get(f"/bidcases/{bid_case_id}").json()
    assert detail["participation_status"] == "참여확정"
    assert len(detail["tasks"]) == 3


def test_participation_decision_tier_order_violation_is_400(client):
    test_client, db_path = client
    _seed_institution(db_path)
    bid_case_id = test_client.post("/bidcases", json={"institution_id": "mapo"}).json()["bid_case_id"]

    resp = test_client.post(
        f"/bidcases/{bid_case_id}/participation-decisions",
        json={"tier": 2, "role": "팀장", "by": "bob", "choice": "참여"},
    )
    assert resp.status_code == 400
```

- [ ] **Step 6: Run API test to verify it fails**

Run: `py -3 -m pytest backend/tests/test_api_bidcases.py -v`
Expected: FAIL — 404 on `POST /bidcases` (router not mounted yet)

- [ ] **Step 7: Implement `backend/routers/bidcases.py`**

```python
from fastapi import APIRouter, HTTPException, Request

from backend.bidcase_repository import (
    ParticipationDecisionError,
    create_bid_case,
    get_bid_case,
    list_bid_cases_for_assignee,
    list_task_summaries,
    submit_participation_decision,
)
from backend.db import get_connection
from backend.models import BidCaseDetail, ParticipationDecisionIn

router = APIRouter(prefix="/bidcases", tags=["bidcases"])


def _conn(request: Request):
    return get_connection(request.app.state.db_path)


@router.post("")
def post_bid_case(body: dict, request: Request) -> dict:
    conn = _conn(request)
    try:
        bid_case = create_bid_case(conn, body["institution_id"])
        return bid_case.model_dump()
    finally:
        conn.close()


@router.get("/{bid_case_id}", response_model=BidCaseDetail)
def get_bid_case_detail(bid_case_id: str, request: Request) -> BidCaseDetail:
    conn = _conn(request)
    try:
        bid_case = get_bid_case(conn, bid_case_id)
        if bid_case is None:
            raise HTTPException(status_code=404, detail="bid case not found")
        tasks = list_task_summaries(conn, bid_case_id)
    finally:
        conn.close()
    return BidCaseDetail(**bid_case.model_dump(), tasks=tasks)


@router.get("")
def get_bid_cases(team: str, assignee: str, request: Request) -> list[dict]:
    conn = _conn(request)
    try:
        bid_cases = list_bid_cases_for_assignee(conn, team, assignee)
    finally:
        conn.close()
    return [b.model_dump() for b in bid_cases]


@router.post("/{bid_case_id}/participation-decisions", response_model=BidCaseDetail)
def post_participation_decision(
    bid_case_id: str, body: ParticipationDecisionIn, request: Request
) -> BidCaseDetail:
    conn = _conn(request)
    try:
        try:
            bid_case = submit_participation_decision(conn, bid_case_id, body)
        except ParticipationDecisionError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        tasks = list_task_summaries(conn, bid_case_id)
    finally:
        conn.close()
    return BidCaseDetail(**bid_case.model_dump(), tasks=tasks)
```

`POST /bidcases` and `GET /bidcases` (list) are minimal helpers this task needs for its own
tests to set up fixtures through the real API — the spec's endpoint list names
`GET /bidcases/{id}` and `GET /bidcases?team=&assignee=` explicitly; `POST /bidcases` (plain
create) is an implementation-plan addition to make the other endpoints reachable in tests
without reaching into the DB directly, consistent with the spec's intent that a BidCase
exists before any participation decision can be submitted.

- [ ] **Step 8: Register the router in `backend/main.py`**

In `backend/main.py`, add the import and `include_router` call:

```python
import os

from fastapi import FastAPI

from backend.db import init_db
from backend.routers.bidcases import router as bidcases_router
from backend.routers.institutions import router as institutions_router


def create_app(db_path: str) -> FastAPI:
    app = FastAPI(title="입찰 워크플로우 레지스트리 API")
    app.state.db_path = db_path
    init_db(db_path).close()
    app.include_router(institutions_router)
    app.include_router(bidcases_router)
    return app


app = create_app(os.environ.get("REGISTRY_DB_PATH", "registry.db"))
```

- [ ] **Step 9: Run API test to verify it passes**

Run: `py -3 -m pytest backend/tests/test_api_bidcases.py -v`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add backend/bidcase_repository.py backend/routers/bidcases.py backend/main.py \
  backend/tests/test_bidcase_repository.py backend/tests/test_api_bidcases.py
git commit -m "feat(backend): add BidCase repository, participation-decision chain, bidcases router"
```

---

### Task 4: Task/Message repository + tasks router (submit/approve, no chat yet)

**Files:**
- Create: `backend/task_repository.py`
- Create: `backend/routers/tasks.py`
- Modify: `backend/main.py` (register the new router)
- Test: `backend/tests/test_task_repository.py`
- Test: `backend/tests/test_api_tasks.py`

**Interfaces:**
- Consumes: `backend.models.{Task, Message, TaskDetail, TaskApprovalIn}` (Task 2),
  `backend.bidcase_repository.{create_bid_case, submit_participation_decision, TEAMS}`
  (Task 3, used by tests to create real Tasks through the participation-decision chain).
- Produces: `get_task(conn, task_id) -> Task | None`, `list_messages(conn, task_id) ->
  list[Message]`, `add_message(conn, task_id, role, content) -> Message`,
  `claim_assignee_if_unset(conn, task_id, user_id) -> None`, `update_draft_content(conn,
  task_id, draft_content) -> None`, `submit_task(conn, task_id) -> None`,
  `claim_approver_if_unset(conn, task_id, user_id) -> None`, `approve_task(conn, task_id,
  approved: bool) -> None`. Router mounts at prefix `/tasks` with `GET /{id}`,
  `POST /{id}/submit`, `POST /{id}/approve` (this task does not add `POST /{id}/messages` —
  that is Task 5, once `backend/agent_adapter.py` exists).

- [ ] **Step 1: Write the failing repository test**

Create `backend/tests/test_task_repository.py`:

```python
import pytest

from backend.bidcase_repository import create_bid_case, submit_participation_decision
from backend.db import init_db
from backend.models import ParticipationDecisionIn
from backend.task_repository import (
    add_message,
    approve_task,
    claim_approver_if_unset,
    claim_assignee_if_unset,
    get_task,
    list_messages,
    submit_task,
    update_draft_content,
)


@pytest.fixture
def task_id(tmp_path):
    db_path = str(tmp_path / "test.db")
    conn = init_db(db_path)
    conn.execute(
        "INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('mapo', '마포구', 1)"
    )
    conn.commit()
    bid_case = create_bid_case(conn, "mapo")
    for tier, by in [(1, "alice"), (2, "bob"), (3, "carol")]:
        submit_participation_decision(
            conn, bid_case.bid_case_id,
            ParticipationDecisionIn(tier=tier, role="r", by=by, choice="참여"),
        )
    task = conn.execute(
        "SELECT task_id FROM tasks WHERE bid_case_id = ? AND team = '영업'",
        (bid_case.bid_case_id,),
    ).fetchone()
    yield conn, task["task_id"]
    conn.close()


def test_get_task_returns_task(task_id):
    conn, tid = task_id
    task = get_task(conn, tid)
    assert task.team == "영업"
    assert task.status == "대기"


def test_get_task_returns_none_when_missing(task_id):
    conn, _ = task_id
    assert get_task(conn, "task-missing") is None


def test_claim_assignee_only_claims_when_unset(task_id):
    conn, tid = task_id
    claim_assignee_if_unset(conn, tid, "dave")
    claim_assignee_if_unset(conn, tid, "eve")
    task = get_task(conn, tid)
    assert task.assignee == "dave"
    assert task.status == "작성중"


def test_add_message_and_list_messages(task_id):
    conn, tid = task_id
    add_message(conn, tid, "user", "안녕")
    add_message(conn, tid, "agent", "네 도와드릴게요")
    messages = list_messages(conn, tid)
    assert [m.role for m in messages] == ["user", "agent"]
    assert messages[0].content == "안녕"


def test_update_draft_content(task_id):
    conn, tid = task_id
    update_draft_content(conn, tid, "새 초안")
    assert get_task(conn, tid).draft_content == "새 초안"


def test_submit_and_approve_task(task_id):
    conn, tid = task_id
    submit_task(conn, tid)
    assert get_task(conn, tid).status == "1차완료"

    claim_approver_if_unset(conn, tid, "boss")
    approve_task(conn, tid, approved=True)
    task = get_task(conn, tid)
    assert task.approver == "boss"
    assert task.status == "2차완료"


def test_approve_task_rejected_returns_to_작성중(task_id):
    conn, tid = task_id
    submit_task(conn, tid)
    claim_approver_if_unset(conn, tid, "boss")
    approve_task(conn, tid, approved=False)
    assert get_task(conn, tid).status == "작성중"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `py -3 -m pytest backend/tests/test_task_repository.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.task_repository'`

- [ ] **Step 3: Implement `backend/task_repository.py`**

```python
import secrets
import sqlite3
from datetime import datetime, timezone

from backend.models import Message, Task


def _row_to_task(row: sqlite3.Row) -> Task:
    return Task(**dict(row))


def get_task(conn: sqlite3.Connection, task_id: str) -> Task | None:
    cursor = conn.execute("SELECT * FROM tasks WHERE task_id = ?", (task_id,))
    row = cursor.fetchone()
    return _row_to_task(row) if row else None


def list_messages(conn: sqlite3.Connection, task_id: str) -> list[Message]:
    cursor = conn.execute(
        "SELECT * FROM messages WHERE task_id = ? ORDER BY created_at", (task_id,)
    )
    return [Message(**dict(row)) for row in cursor.fetchall()]


def add_message(conn: sqlite3.Connection, task_id: str, role: str, content: str) -> Message:
    message_id = f"msg-{secrets.token_hex(4)}"
    created_at = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO messages (message_id, task_id, role, content, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (message_id, task_id, role, content, created_at),
    )
    conn.commit()
    return Message(
        message_id=message_id, task_id=task_id, role=role, content=content, created_at=created_at
    )


def claim_assignee_if_unset(conn: sqlite3.Connection, task_id: str, user_id: str) -> None:
    conn.execute(
        """UPDATE tasks
           SET assignee = ?, status = CASE WHEN status = '대기' THEN '작성중' ELSE status END
           WHERE task_id = ? AND assignee IS NULL""",
        (user_id, task_id),
    )
    conn.commit()


def update_draft_content(conn: sqlite3.Connection, task_id: str, draft_content: str) -> None:
    conn.execute("UPDATE tasks SET draft_content = ? WHERE task_id = ?", (draft_content, task_id))
    conn.commit()


def submit_task(conn: sqlite3.Connection, task_id: str) -> None:
    conn.execute("UPDATE tasks SET status = '1차완료' WHERE task_id = ?", (task_id,))
    conn.commit()


def claim_approver_if_unset(conn: sqlite3.Connection, task_id: str, user_id: str) -> None:
    conn.execute(
        "UPDATE tasks SET approver = ? WHERE task_id = ? AND approver IS NULL",
        (user_id, task_id),
    )
    conn.commit()


def approve_task(conn: sqlite3.Connection, task_id: str, approved: bool) -> None:
    new_status = "2차완료" if approved else "작성중"
    conn.execute("UPDATE tasks SET status = ? WHERE task_id = ?", (new_status, task_id))
    conn.commit()
```

- [ ] **Step 4: Run repository test to verify it passes**

Run: `py -3 -m pytest backend/tests/test_task_repository.py -v`
Expected: PASS

- [ ] **Step 5: Write the failing API test**

Create `backend/tests/test_api_tasks.py`:

```python
import pytest
from fastapi.testclient import TestClient

from backend.db import get_connection
from backend.main import create_app


@pytest.fixture
def client_and_task(tmp_path):
    db_path = str(tmp_path / "test.db")
    app = create_app(db_path)
    conn = get_connection(db_path)
    conn.execute(
        "INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('mapo', '마포구', 1)"
    )
    conn.commit()
    conn.close()

    with TestClient(app) as test_client:
        bid_case_id = test_client.post("/bidcases", json={"institution_id": "mapo"}).json()[
            "bid_case_id"
        ]
        for tier, by in [(1, "alice"), (2, "bob"), (3, "carol")]:
            test_client.post(
                f"/bidcases/{bid_case_id}/participation-decisions",
                json={"tier": tier, "role": "r", "by": by, "choice": "참여"},
            )
        detail = test_client.get(f"/bidcases/{bid_case_id}").json()
        task_id = [t for t in detail["tasks"] if t["team"] == "영업"][0]["task_id"]
        yield test_client, task_id


def test_get_task_detail(client_and_task):
    test_client, task_id = client_and_task
    resp = test_client.get(f"/tasks/{task_id}")
    assert resp.status_code == 200
    assert resp.json()["team"] == "영업"
    assert resp.json()["messages"] == []


def test_submit_requires_matching_assignee(client_and_task):
    test_client, task_id = client_and_task
    resp = test_client.post(f"/tasks/{task_id}/submit", headers={"X-User-Id": "dave"})
    assert resp.status_code == 403


def test_submit_and_approve_flow(client_and_task):
    test_client, task_id = client_and_task

    from backend.db import get_connection
    from backend.task_repository import claim_assignee_if_unset

    db_path = test_client.app.state.db_path
    conn = get_connection(db_path)
    claim_assignee_if_unset(conn, task_id, "dave")
    conn.close()

    submit_resp = test_client.post(f"/tasks/{task_id}/submit", headers={"X-User-Id": "dave"})
    assert submit_resp.status_code == 200
    assert submit_resp.json()["status"] == "1차완료"

    approve_resp = test_client.post(
        f"/tasks/{task_id}/approve", json={"approved": True}, headers={"X-User-Id": "boss"}
    )
    assert approve_resp.status_code == 200
    assert approve_resp.json()["status"] == "2차완료"
    assert approve_resp.json()["approver"] == "boss"
```

- [ ] **Step 6: Run API test to verify it fails**

Run: `py -3 -m pytest backend/tests/test_api_tasks.py -v`
Expected: FAIL — 404 (router not mounted)

- [ ] **Step 7: Implement `backend/routers/tasks.py`**

```python
from fastapi import APIRouter, Header, HTTPException, Request

from backend.db import get_connection
from backend.models import Task, TaskApprovalIn, TaskDetail
from backend.task_repository import (
    approve_task,
    claim_approver_if_unset,
    get_task,
    list_messages,
    submit_task,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _conn(request: Request):
    return get_connection(request.app.state.db_path)


@router.get("/{task_id}", response_model=TaskDetail)
def get_task_detail(task_id: str, request: Request) -> TaskDetail:
    conn = _conn(request)
    try:
        task = get_task(conn, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="task not found")
        messages = list_messages(conn, task_id)
    finally:
        conn.close()
    return TaskDetail(**task.model_dump(), messages=messages)


@router.post("/{task_id}/submit", response_model=Task)
def post_task_submit(task_id: str, request: Request, x_user_id: str = Header(...)) -> Task:
    conn = _conn(request)
    try:
        task = get_task(conn, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="task not found")
        if task.assignee != x_user_id:
            raise HTTPException(status_code=403, detail="only the assignee can submit")
        submit_task(conn, task_id)
        return get_task(conn, task_id)
    finally:
        conn.close()


@router.post("/{task_id}/approve", response_model=Task)
def post_task_approve(
    task_id: str, body: TaskApprovalIn, request: Request, x_user_id: str = Header(...)
) -> Task:
    conn = _conn(request)
    try:
        task = get_task(conn, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="task not found")
        if task.approver is not None and task.approver != x_user_id:
            raise HTTPException(status_code=403, detail="only the approver can approve")
        if task.status != "1차완료":
            raise HTTPException(status_code=409, detail="task not submitted yet")
        claim_approver_if_unset(conn, task_id, x_user_id)
        approve_task(conn, task_id, body.approved)
        return get_task(conn, task_id)
    finally:
        conn.close()
```

- [ ] **Step 8: Register the router in `backend/main.py`**

Add the import and `include_router` call alongside the ones from Task 3:

```python
from backend.routers.tasks import router as tasks_router
# ...
app.include_router(tasks_router)
```

- [ ] **Step 9: Run API test to verify it passes**

Run: `py -3 -m pytest backend/tests/test_api_tasks.py -v`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add backend/task_repository.py backend/routers/tasks.py backend/main.py \
  backend/tests/test_task_repository.py backend/tests/test_api_tasks.py
git commit -m "feat(backend): add Task/Message repository, submit/approve endpoints"
```

---

### Task 5: Agent adapter (team corpus routing) + SSE chat endpoint

**Files:**
- Create: `backend/agent_adapter.py`
- Modify: `backend/routers/tasks.py` (add `POST /{id}/messages`)
- Test: `backend/tests/test_agent_adapter.py`
- Test: `backend/tests/test_api_tasks.py` (append chat tests to the file from Task 4)

**Interfaces:**
- Consumes: `agent.llm.get_llm` (existing), `backend.task_repository.{get_task, add_message,
  list_messages, claim_assignee_if_unset, update_draft_content}` (Task 4), `backend.
  repository.get_institution` (existing, sub-project 0 — for `giganlist_dir` lookup).
- Produces: `stream_chat_reply(team: str, giganlist_dir: str | None, history: list[dict],
  user_message: str) -> Iterator[str]` — later tasks/tests do not depend on anything else
  from this module.

- [ ] **Step 1: Write the failing adapter test**

Create `backend/tests/test_agent_adapter.py`:

```python
from unittest.mock import MagicMock, patch

from backend.agent_adapter import stream_chat_reply


@patch("backend.agent_adapter.get_llm")
def test_stream_chat_reply_yields_chunks_from_llm(mock_get_llm, tmp_path):
    giganlist_dir = tmp_path / "mapo"
    (giganlist_dir / "spec").mkdir(parents=True)
    (giganlist_dir / "spec" / "01_개요.txt").write_text("마포구 개요", encoding="utf-8")

    mock_chunk_1 = MagicMock(content="안녕")
    mock_chunk_2 = MagicMock(content="하세요")
    mock_llm = MagicMock()
    mock_llm.stream.return_value = [mock_chunk_1, mock_chunk_2]
    mock_get_llm.return_value = mock_llm

    chunks = list(
        stream_chat_reply("영업", str(giganlist_dir), history=[], user_message="소개해줘")
    )

    assert chunks == ["안녕", "하세요"]
    prompt = mock_llm.stream.call_args[0][0]
    assert "마포구 개요" in prompt
    assert "소개해줘" in prompt


@patch("backend.agent_adapter.get_llm")
def test_stream_chat_reply_it_team_reads_plan_02_files_only(mock_get_llm, tmp_path):
    giganlist_dir = tmp_path / "mapo"
    plan_dir = giganlist_dir / "plan"
    plan_dir.mkdir(parents=True)
    (plan_dir / "02_IT디지털 기획 사업 제안.txt").write_text("IT 계획 내용", encoding="utf-8")
    (plan_dir / "03_금전적 지원 사업 제안.txt").write_text("예산 계획 내용", encoding="utf-8")

    mock_llm = MagicMock()
    mock_llm.stream.return_value = [MagicMock(content="ok")]
    mock_get_llm.return_value = mock_llm

    list(stream_chat_reply("IT", str(giganlist_dir), history=[], user_message="정리해줘"))

    prompt = mock_llm.stream.call_args[0][0]
    assert "IT 계획 내용" in prompt
    assert "예산 계획 내용" not in prompt


@patch("backend.agent_adapter.get_llm")
def test_stream_chat_reply_handles_missing_giganlist_dir(mock_get_llm):
    mock_llm = MagicMock()
    mock_llm.stream.return_value = [MagicMock(content="ok")]
    mock_get_llm.return_value = mock_llm

    chunks = list(stream_chat_reply("예산", None, history=[], user_message="시작해줘"))
    assert chunks == ["ok"]
    prompt = mock_llm.stream.call_args[0][0]
    assert "자료 없음" in prompt
```

- [ ] **Step 2: Run test to verify it fails**

Run: `py -3 -m pytest backend/tests/test_agent_adapter.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.agent_adapter'`

- [ ] **Step 3: Implement `backend/agent_adapter.py`**

```python
import os

from agent.llm import get_llm

CHAT_PROMPT = """당신은 {team}팀의 제안서 작성을 돕는 "기관 인텔리전스 에이전트"입니다.
아래 근거 자료를 참고해 사용자 요청에 맞춰 제안서 초안 문장을 다듬어 답하세요. 자유롭게
지어내지 말고, 근거 자료에 있는 내용만 사용하세요.

근거 자료:
{corpus}

이전 대화:
{history}

사용자 요청:
{user_message}
"""


def _load_team_corpus(giganlist_dir: str | None, team: str) -> str:
    if not giganlist_dir or not os.path.isdir(giganlist_dir):
        return "(자료 없음 — 신규 기관, 조사 결과 미제공)"

    parts = []
    if team == "영업":
        spec_dir = os.path.join(giganlist_dir, "spec")
        if os.path.isdir(spec_dir):
            for fname in sorted(os.listdir(spec_dir)):
                if fname.endswith(".txt"):
                    with open(os.path.join(spec_dir, fname), encoding="utf-8") as f:
                        parts.append(f"[spec/{fname}]\n{f.read()}")
        bank_ideas_path = os.path.join(giganlist_dir, "bank_ideas_draft.txt")
        if os.path.isfile(bank_ideas_path):
            with open(bank_ideas_path, encoding="utf-8") as f:
                parts.append(f"[bank_ideas_draft.txt]\n{f.read()}")
    else:
        prefix = "02_" if team == "IT" else "03_"
        plan_dir = os.path.join(giganlist_dir, "plan")
        if os.path.isdir(plan_dir):
            for fname in sorted(os.listdir(plan_dir)):
                if fname.startswith(prefix) and fname.endswith(".txt"):
                    with open(os.path.join(plan_dir, fname), encoding="utf-8") as f:
                        parts.append(f"[plan/{fname}]\n{f.read()}")

    return "\n\n".join(parts) if parts else "(자료 없음 — 해당 팀 코퍼스 파일 없음)"


def stream_chat_reply(
    team: str, giganlist_dir: str | None, history: list[dict], user_message: str
):
    corpus = _load_team_corpus(giganlist_dir, team)
    history_text = "\n".join(f"{m['role']}: {m['content']}" for m in history) or "(없음)"
    prompt = CHAT_PROMPT.format(
        team=team, corpus=corpus, history=history_text, user_message=user_message
    )
    llm = get_llm()
    for chunk in llm.stream(prompt):
        if chunk.content:
            yield chunk.content
```

- [ ] **Step 4: Run adapter test to verify it passes**

Run: `py -3 -m pytest backend/tests/test_agent_adapter.py -v`
Expected: PASS

- [ ] **Step 5: Write the failing chat-endpoint API test**

Append to `backend/tests/test_api_tasks.py` (same fixture `client_and_task` from Task 4):

```python
from unittest.mock import MagicMock, patch


@patch("backend.routers.tasks.stream_chat_reply")
def test_post_message_streams_and_persists_reply(mock_stream, client_and_task):
    test_client, task_id = client_and_task
    mock_stream.return_value = iter(["안녕", "하세요"])

    resp = test_client.post(
        f"/tasks/{task_id}/messages",
        json={"content": "소개 부탁해요"},
        headers={"X-User-Id": "dave"},
    )
    assert resp.status_code == 200
    assert resp.text == "안녕하세요"

    detail = test_client.get(f"/tasks/{task_id}").json()
    assert detail["assignee"] == "dave"
    assert detail["status"] == "작성중"
    assert [m["role"] for m in detail["messages"]] == ["user", "agent"]
    assert detail["draft_content"] == "안녕하세요"


@patch("backend.routers.tasks.stream_chat_reply")
def test_post_message_rejects_second_assignee(mock_stream, client_and_task):
    test_client, task_id = client_and_task
    mock_stream.return_value = iter(["ok"])
    test_client.post(
        f"/tasks/{task_id}/messages", json={"content": "hi"}, headers={"X-User-Id": "dave"}
    )

    resp = test_client.post(
        f"/tasks/{task_id}/messages", json={"content": "hi again"}, headers={"X-User-Id": "eve"}
    )
    assert resp.status_code == 403
```

- [ ] **Step 6: Run test to verify it fails**

Run: `py -3 -m pytest backend/tests/test_api_tasks.py -v`
Expected: FAIL — 404 on `POST /tasks/{id}/messages`

- [ ] **Step 7: Add the chat endpoint to `backend/routers/tasks.py`**

Add these imports to the top of `backend/routers/tasks.py` (alongside the existing ones):

```python
from fastapi.responses import StreamingResponse

from backend.agent_adapter import stream_chat_reply
from backend.models import TaskMessageIn
from backend.repository import get_institution
from backend.task_repository import add_message, claim_assignee_if_unset, update_draft_content
```

Append the endpoint at the end of the file:

```python
@router.post("/{task_id}/messages")
def post_task_message(
    task_id: str, body: TaskMessageIn, request: Request, x_user_id: str = Header(...)
) -> StreamingResponse:
    conn = _conn(request)
    task = get_task(conn, task_id)
    if task is None:
        conn.close()
        raise HTTPException(status_code=404, detail="task not found")
    if task.assignee is not None and task.assignee != x_user_id:
        conn.close()
        raise HTTPException(status_code=403, detail="task already claimed by another assignee")

    claim_assignee_if_unset(conn, task_id, x_user_id)
    add_message(conn, task_id, "user", body.content)
    history = [m.model_dump() for m in list_messages(conn, task_id)]

    bid_case_row = conn.execute(
        "SELECT institution_id FROM bid_cases WHERE bid_case_id = ?", (task.bid_case_id,)
    ).fetchone()
    institution = get_institution(conn, bid_case_row["institution_id"]) if bid_case_row else None
    giganlist_dir = institution.giganlist_dir if institution else None
    db_path = request.app.state.db_path
    conn.close()

    def event_stream():
        reply_parts = []
        for chunk in stream_chat_reply(task.team, giganlist_dir, history, body.content):
            reply_parts.append(chunk)
            yield chunk
        full_reply = "".join(reply_parts)
        write_conn = get_connection(db_path)
        try:
            add_message(write_conn, task_id, "agent", full_reply)
            update_draft_content(write_conn, task_id, full_reply)
        finally:
            write_conn.close()

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

- [ ] **Step 8: Run test to verify it passes**

Run: `py -3 -m pytest backend/tests/test_api_tasks.py -v`
Expected: PASS (all tests in the file)

- [ ] **Step 9: Commit**

```bash
git add backend/agent_adapter.py backend/routers/tasks.py \
  backend/tests/test_agent_adapter.py backend/tests/test_api_tasks.py
git commit -m "feat(backend): add agent chat adapter and SSE messages endpoint"
```

---

### Task 6: Finalize endpoint

**Files:**
- Modify: `backend/routers/bidcases.py`
- Test: `backend/tests/test_api_bidcases.py` (append)

**Interfaces:**
- Consumes: `backend.models.BidCaseFinalizeIn` (Task 2), `backend.bidcase_repository.
  {get_bid_case, list_task_summaries}` (Task 3), `backend.task_repository.approve_task`
  (Task 4, reused to reset a Task back to `작성중`), `backend.repository.get_institution`
  (existing).
- Produces: `POST /bidcases/{id}/finalize` — no new Python interface consumed elsewhere.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_api_bidcases.py`:

```python
def _fully_approve_all_tasks(test_client, bid_case_id):
    detail = test_client.get(f"/bidcases/{bid_case_id}").json()
    for task in detail["tasks"]:
        task_id = task["task_id"]
        with patch("backend.routers.tasks.stream_chat_reply", return_value=iter(["ok"])):
            test_client.post(
                f"/tasks/{task_id}/messages", json={"content": "hi"},
                headers={"X-User-Id": "dave"},
            )
        test_client.post(f"/tasks/{task_id}/submit", headers={"X-User-Id": "dave"})
        test_client.post(
            f"/tasks/{task_id}/approve", json={"approved": True}, headers={"X-User-Id": "boss"}
        )


def test_finalize_requires_all_tasks_2차완료(client):
    test_client, db_path = client
    _seed_institution(db_path)
    bid_case_id = test_client.post("/bidcases", json={"institution_id": "mapo"}).json()["bid_case_id"]
    for tier, by in [(1, "alice"), (2, "bob"), (3, "carol")]:
        test_client.post(
            f"/bidcases/{bid_case_id}/participation-decisions",
            json={"tier": tier, "role": "r", "by": by, "choice": "참여"},
        )

    resp = test_client.post(f"/bidcases/{bid_case_id}/finalize", json={"approved": True})
    assert resp.status_code == 409


def test_finalize_approved_sets_institution_stage_7(client):
    test_client, db_path = client
    _seed_institution(db_path)
    bid_case_id = test_client.post("/bidcases", json={"institution_id": "mapo"}).json()["bid_case_id"]
    for tier, by in [(1, "alice"), (2, "bob"), (3, "carol")]:
        test_client.post(
            f"/bidcases/{bid_case_id}/participation-decisions",
            json={"tier": tier, "role": "r", "by": by, "choice": "참여"},
        )
    _fully_approve_all_tasks(test_client, bid_case_id)

    resp = test_client.post(f"/bidcases/{bid_case_id}/finalize", json={"approved": True})
    assert resp.status_code == 200

    institution = test_client.get("/institutions/mapo").json()
    assert institution["stage"] == 7


def test_finalize_rejected_resets_tasks_to_작성중(client):
    test_client, db_path = client
    _seed_institution(db_path)
    bid_case_id = test_client.post("/bidcases", json={"institution_id": "mapo"}).json()["bid_case_id"]
    for tier, by in [(1, "alice"), (2, "bob"), (3, "carol")]:
        test_client.post(
            f"/bidcases/{bid_case_id}/participation-decisions",
            json={"tier": tier, "role": "r", "by": by, "choice": "참여"},
        )
    _fully_approve_all_tasks(test_client, bid_case_id)

    resp = test_client.post(f"/bidcases/{bid_case_id}/finalize", json={"approved": False})
    assert resp.status_code == 200

    detail = test_client.get(f"/bidcases/{bid_case_id}").json()
    assert all(t["status"] == "작성중" for t in detail["tasks"])
```

Add `from unittest.mock import patch` to the top of `backend/tests/test_api_bidcases.py` if
not already present (Task 3 didn't need it).

- [ ] **Step 2: Run test to verify it fails**

Run: `py -3 -m pytest backend/tests/test_api_bidcases.py -v`
Expected: FAIL — 404 on `POST /bidcases/{id}/finalize`

- [ ] **Step 3: Implement the endpoint**

Add these imports to the top of `backend/routers/bidcases.py`:

```python
from backend.models import BidCaseFinalizeIn
from backend.repository import get_institution
from backend.task_repository import approve_task
```

Append to the end of `backend/routers/bidcases.py`:

```python
@router.post("/{bid_case_id}/finalize", response_model=BidCaseDetail)
def post_bid_case_finalize(
    bid_case_id: str, body: BidCaseFinalizeIn, request: Request
) -> BidCaseDetail:
    conn = _conn(request)
    try:
        bid_case = get_bid_case(conn, bid_case_id)
        if bid_case is None:
            raise HTTPException(status_code=404, detail="bid case not found")
        tasks = list_task_summaries(conn, bid_case_id)
        if len(tasks) != 3 or any(t.status != "2차완료" for t in tasks):
            raise HTTPException(status_code=409, detail="not all tasks are 2차완료")

        if body.approved:
            institution = get_institution(conn, bid_case.institution_id)
            conn.execute(
                "UPDATE institutions SET stage = 7 WHERE institution_id = ?",
                (institution.institution_id,),
            )
            conn.commit()
        else:
            for task in tasks:
                approve_task(conn, task.task_id, approved=False)

        bid_case = get_bid_case(conn, bid_case_id)
        tasks = list_task_summaries(conn, bid_case_id)
    finally:
        conn.close()
    return BidCaseDetail(**bid_case.model_dump(), tasks=tasks)
```

`approve_task(conn, task.task_id, approved=False)` reuses Task 4's status-reset logic (it
sets `status = '작성중'`) — a rejected finalize is modeled as "reject every task", matching
the spec's "지정된 Task만(또는 전체) 작성중으로 되돌림" with "전체" as this plan's concrete
choice.

- [ ] **Step 4: Run test to verify it passes**

Run: `py -3 -m pytest backend/tests/test_api_bidcases.py -v`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add backend/routers/bidcases.py backend/tests/test_api_bidcases.py
git commit -m "feat(backend): add bidcase finalize endpoint"
```

---

### Task 7: Full suite run + manual smoke test

**Files:**
- None created/modified — verification only.

**Interfaces:**
- Consumes: everything from Tasks 1-6.
- Produces: nothing new; confirms the whole layer works together.

- [ ] **Step 1: Run the full backend suite**

Run: `py -3 -m pytest backend/tests -v`
Expected: PASS — every test from Tasks 1-6 plus the pre-existing sub-project 0 tests (24
existing + this plan's new tests).

- [ ] **Step 2: Manual smoke test against a running server**

```bash
py -3 -m backend.seed
py -3 -m uvicorn backend.main:app --reload
```

In another terminal, walk one full bid case through the API by hand:

```bash
curl -s -X POST http://127.0.0.1:8000/bidcases -H "Content-Type: application/json" \
  -d '{"institution_id": "mapo"}'
# copy bid_case_id from the response, then:
BID=<bid_case_id>
curl -s -X POST "http://127.0.0.1:8000/bidcases/$BID/participation-decisions" \
  -H "Content-Type: application/json" \
  -d '{"tier":1,"role":"실무자","by":"alice","choice":"참여"}'
curl -s -X POST "http://127.0.0.1:8000/bidcases/$BID/participation-decisions" \
  -H "Content-Type: application/json" \
  -d '{"tier":2,"role":"팀장","by":"bob","choice":"참여"}'
curl -s -X POST "http://127.0.0.1:8000/bidcases/$BID/participation-decisions" \
  -H "Content-Type: application/json" \
  -d '{"tier":3,"role":"부장","by":"carol","choice":"참여"}'
curl -s "http://127.0.0.1:8000/bidcases/$BID"
# expect: participation_status="참여확정", tasks=[3 entries, status=대기]
```

Expected: `GET /bidcases/$BID` returns 3 tasks. The chat endpoint
(`POST /tasks/{id}/messages`) will fail at this point unless `OPENAI_API_KEY` (or the
`LLM_BASE_URL` adapter from the E2E spec §⑥, not yet implemented) is set, since it calls a
real LLM — that's expected; confirming the 3-task creation and the participation-decision
chain work end-to-end is this step's goal, not exercising the live LLM call.

- [ ] **Step 3: Stop the server, no commit**

This task verifies; it does not change files, so there is nothing to commit.

---

## Self-Review Notes

- **Spec coverage**: §② trigger flow → Tasks 3 (participation chain), 4/5 (task
  chat/submit/approve). §③ data model → Task 1 (schema), Task 2 (models). §④ API contract →
  every endpoint listed in the spec has a matching router function (Task 3: participation-
  decisions, bidcase get/list; Task 4: task get/submit/approve; Task 5: messages; Task 6:
  finalize). §⑤ agent connection → Task 5's `agent_adapter.py` team-routing table. §⑥ error
  handling → tier-order 400, assignee/approver-mismatch 403, unsubmitted-approve 409,
  finalize-before-ready 409 all have tests. §⑦ relationship table → Task 6's finalize sets
  `institutions.stage = 7`, matching "7 취합 진입 트리거".
- **Not covered by this plan (explicitly out of the spec's scope, §①)**: the DMZ
  auto-detection/batch-sync job that creates BidCases with `schedule_confidence="예상"` —
  this plan's `create_bid_case` is called directly (via `POST /bidcases`, Task 3's plan-level
  addition) since the crawling/batch trigger itself is a separate sub-project. Likewise,
  `spec_research_node` background integration for brand-new institutions (spec §⑤) is not
  wired into this plan — creating a BidCase for an `institution_id` that doesn't exist in
  `institutions` will currently fail the foreign-key-less `institution_id` lookup at
  finalize time (`get_institution` returns `None`); that gap is real but belongs to the
  spec_research_node integration, out of scope here per the spec's own §① boundary.
- **Placeholder scan**: no TBD/TODO; every step has literal code.
- **Type consistency checked**: `Task.status` values (`대기`/`작성중`/`1차완료`/`2차완료`)
  match across Tasks 1 (schema default), 2 (model default), 3 (creation), 4 (submit/approve
  transitions), 5 (claim-on-first-message transition), 6 (finalize-reject transition).
  `BidCase.participation_status` values match across Tasks 1, 2, 3, 6.
  `TEAMS = ["영업", "IT", "예산"]` (Task 3) is the single source used by Task 5's
  `_load_team_corpus` team-branching and by every test that iterates teams.
